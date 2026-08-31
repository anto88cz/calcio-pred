/**
 * Scarica formazioni titolari e indisponibili di ogni partita in archivio.
 *
 * Perche' e' informazione legittima e non look-ahead: le formazioni ufficiali
 * escono circa un'ora prima del calcio d'inizio, quindi chi scommette dopo
 * l'annuncio le ha. E' esattamente il vantaggio che il mercato ha su di noi e
 * che il modello oggi non usa affatto.
 *
 * Nota sull'audit: `sidelined` sembrava non ricostruibile per una data passata,
 * perche' getTeamSidelined restituisce gli assenti DI OGGI. L'include a livello
 * di fixture invece e' agganciato al fixture_id: e' la lista corretta di quella
 * partita.
 *
 * Salva su file invece che in Postgres per non richiedere una migrazione dello
 * schema: e' materiale di ricerca, non dati di produzione.
 *
 * Uso:
 *   npx tsx src/scripts/import-lineups.ts
 *   npx tsx src/scripts/import-lineups.ts --out data/lineups.json --batch 25
 */

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, FixtureStatus } from '@prisma/client';
import { getSportsmonksClient } from '../services/sportsmonks/client';

const prisma = new PrismaClient();

/** type_id 11 = titolare, 12 = panchina (verificato sulla risposta) */
const STARTER_TYPE = 11;

interface FixtureLineup {
  /** player_id dei titolari, per squadra */
  starters: Record<string, number[]>;
  /** player_id degli indisponibili, per squadra */
  out: Record<string, number[]>;
  formation: Record<string, string>;
}

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

async function main() {
  const batchSize = parseInt(arg('--batch', '25'), 10);
  const outPath = path.resolve(arg('--out', 'data/lineups.json'));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const store: Record<string, FixtureLineup> = fs.existsSync(outPath)
    ? JSON.parse(fs.readFileSync(outPath, 'utf-8'))
    : {};

  const fixtures = await prisma.fixture.findMany({
    where: { status: FixtureStatus.FINISHED },
    select: { apiId: true },
    orderBy: { date: 'asc' },
  });

  const todo = fixtures.map(f => f.apiId).filter(id => !store[String(id)]);
  console.log(`Partite in archivio: ${fixtures.length}`);
  console.log(`Gia' scaricate:      ${fixtures.length - todo.length}`);
  console.log(`Da scaricare:        ${todo.length}  (${Math.ceil(todo.length / batchSize)} chiamate)\n`);
  if (todo.length === 0) { await prisma.$disconnect(); return; }

  const client = getSportsmonksClient();
  let saved = 0, empty = 0, failed = 0;

  for (let i = 0; i < todo.length; i += batchSize) {
    const chunk = todo.slice(i, i + batchSize);
    let arr: any[] = [];
    try {
      const response: any = await client.get(`/fixtures/multi/${chunk.join(',')}`, {
        include: 'lineups;sidelined;formations',
      });
      arr = Array.isArray(response?.data) ? response.data : [];
    } catch (error: any) {
      failed += chunk.length;
      console.error(`  blocco ${i}: ${error.message}`);
      continue;
    }

    for (const fx of arr) {
      const starters: Record<string, number[]> = {};
      const out: Record<string, number[]> = {};
      const formation: Record<string, string> = {};

      for (const row of fx.lineups || []) {
        if (row.type_id !== STARTER_TYPE) continue;
        const k = String(row.team_id);
        (starters[k] = starters[k] || []).push(row.player_id);
      }
      for (const row of fx.sidelined || []) {
        const k = String(row.participant_id);
        (out[k] = out[k] || []).push(row.player_id);
      }
      for (const row of fx.formations || []) {
        formation[String(row.participant_id)] = row.formation;
      }

      if (Object.keys(starters).length === 0) { empty++; continue; }
      store[String(fx.id)] = { starters, out, formation };
      saved++;
    }

    const done = Math.min(i + batchSize, todo.length);
    if (done % (batchSize * 20) === 0 || done === todo.length) {
      fs.writeFileSync(outPath, JSON.stringify(store));
      console.log(`  ${done}/${todo.length}  salvate ${saved}, senza formazione ${empty}, errori ${failed}`);
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(store));
  const withOut = Object.values(store).filter(v => Object.keys(v.out).length > 0).length;
  console.log(`\nSalvate ${saved} partite. File: ${outPath}`);
  console.log(`Copertura formazioni:   ${Object.keys(store).length}/${fixtures.length}`);
  console.log(`Con lista indisponibili: ${withOut}`);
  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('Errore:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
