/**
 * Salva le quote 1X2 di OGNI singolo bookmaker, non la media.
 *
 * Perche' serve: finora abbiamo confrontato il modello con il consenso del
 * mercato, e il consenso vince sempre. Ma il consenso non e' un prezzo
 * ottenibile: e' la media di una ventina di bookmaker che fra loro non sono
 * d'accordo. Sul nostro campione il margine sulla media e' 5.76%, sulla
 * migliore -0.18%: quella differenza e' dispersione, e la dispersione e'
 * l'inefficienza su cui si puo' lavorare senza sapere niente di calcio.
 *
 * L'idea da testare: stimare il prezzo equo dal consenso e scommettere dove un
 * singolo bookmaker se ne discosta oltre una soglia. Non serve prevedere la
 * partita meglio del mercato, serve accorgersi di chi e' rimasto indietro.
 *
 * Uso: npx tsx src/scripts/import-book-odds.ts [--out data/book-odds.json]
 */

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, FixtureStatus } from '@prisma/client';
import { getSportsmonksClient } from '../services/sportsmonks/client';

const prisma = new PrismaClient();

const FULLTIME_MARKETS = new Set(['Fulltime Result', 'Match Winner', '3Way Result', 'Full Time Result']);
const LABELS: Record<string, 0 | 1 | 2> = { Home: 0, Draw: 1, Away: 2 };

/** Per ogni bookmaker: [quota1, quotaX, quota2, oreDiRitardo] */
type BookQuotes = Record<string, [number, number, number, number]>;

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function parseUpdate(row: any): number | null {
  const raw = row?.latest_bookmaker_update || row?.created_at;
  if (!raw) return null;
  const ts = Date.parse(String(raw).replace(' ', 'T') + 'Z');
  return Number.isNaN(ts) ? null : ts;
}

async function main() {
  const batchSize = parseInt(arg('--batch', '25'), 10);
  const outPath = path.resolve(arg('--out', 'data/book-odds.json'));
  const leagues = arg('--leagues', '384,8,564,82,301').split(',').map(Number);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const store: Record<string, BookQuotes> = fs.existsSync(outPath)
    ? JSON.parse(fs.readFileSync(outPath, 'utf-8')) : {};

  const fixtures = await prisma.fixture.findMany({
    where: { status: FixtureStatus.FINISHED, leagueId: { in: leagues } },
    select: { id: true, apiId: true, date: true },
    orderBy: { date: 'asc' },
  });

  const todo = fixtures.filter(f => !store[String(f.id)]);
  console.log(`Partite: ${fixtures.length}, da scaricare ${todo.length} (${Math.ceil(todo.length / batchSize)} chiamate)\n`);
  if (!todo.length) { await prisma.$disconnect(); return; }

  const client = getSportsmonksClient();
  let saved = 0;

  for (let i = 0; i < todo.length; i += batchSize) {
    const chunk = todo.slice(i, i + batchSize);
    let arr: any[] = [];
    try {
      const response: any = await client.get(`/fixtures/multi/${chunk.map(f => f.apiId).join(',')}`,
        { include: 'odds', filters: 'markets:1' });
      arr = Array.isArray(response?.data) ? response.data : [];
    } catch (error: any) {
      console.error(`  blocco ${i}: ${error.message}`);
      continue;
    }
    const byApi = new Map<number, any>(arr.map(x => [x.id, x]));

    for (const f of chunk) {
      const data = byApi.get(f.apiId);
      if (!data) continue;
      const kickoff = f.date.getTime();

      // ultima riga pre-partita per bookmaker ed esito
      const latest = new Map<string, { value: number; ts: number }>();
      for (const row of data.odds || []) {
        if (!FULLTIME_MARKETS.has(row.market_description)) continue;
        const side = LABELS[row.label];
        if (side === undefined) continue;
        const ts = parseUpdate(row);
        if (ts === null || ts >= kickoff) continue;
        const value = parseFloat(row.value ?? row.dp3 ?? '0');
        if (!(value > 1)) continue;
        const k = `${row.bookmaker_id}:${side}`;
        const prev = latest.get(k);
        if (!prev || ts > prev.ts) latest.set(k, { value, ts });
      }

      const books: BookQuotes = {};
      for (const [k, v] of latest) {
        const [book, side] = k.split(':');
        const cur = books[book] || [0, 0, 0, 0];
        cur[Number(side) as 0 | 1 | 2] = v.value;
        cur[3] = Math.max(cur[3], (kickoff - v.ts) / 3_600_000);
        books[book] = cur;
      }
      // solo bookmaker con il mercato completo
      for (const b of Object.keys(books)) {
        const q = books[b];
        if (!(q[0] > 1 && q[1] > 1 && q[2] > 1)) delete books[b];
      }
      if (Object.keys(books).length < 3) continue;

      store[String(f.id)] = books;
      saved++;
    }

    const done = Math.min(i + batchSize, todo.length);
    if (done % (batchSize * 10) === 0 || done === todo.length) {
      fs.writeFileSync(outPath, JSON.stringify(store));
      console.log(`  ${done}/${todo.length}  salvate ${saved}`);
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(store));
  const counts = Object.values(store).map(b => Object.keys(b).length);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  console.log(`\nSalvate ${Object.keys(store).length} partite in ${outPath}`);
  console.log(`Bookmaker per partita: media ${mean.toFixed(1)}, minimo ${Math.min(...counts)}, massimo ${Math.max(...counts)}`);
  await prisma.$disconnect();
}

main().catch(async e => { console.error('Errore:', e.message); await prisma.$disconnect(); process.exit(1); });
