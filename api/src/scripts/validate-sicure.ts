/**
 * La strategia "poche partite, quelle sicure", misurata senza modello su tutte
 * le partite disponibili.
 *
 * La regola: si guarda il consenso de-viggato dei bookmaker, si prende l'esito
 * che il mercato ritiene piu' probabile, e se supera una soglia lo si gioca al
 * miglior prezzo fra tutti i book. Nessuna previsione di calcio: solo il
 * prezzo. Serve a stabilire se la strategia funziona per conto suo, prima di
 * chiedersi se il modello ci aggiunge qualcosa.
 *
 * Il campione e' 3.501 partite invece delle 27 giornate della stagione in
 * corso. E' l'unico modo di distinguere un vantaggio dal rumore: a quota 1.45
 * un ROI del 3% si separa dallo zero solo dopo qualche migliaio di giocate.
 *
 * Il consenso su un esito esclude il bookmaker che offre il prezzo migliore su
 * quell'esito: e' quello su cui si punta, non puo' fare parte della giuria.
 *
 * Uso:
 *   npx tsx src/scripts/validate-sicure.ts
 *   npx tsx src/scripts/validate-sicure.ts --lag-max 24
 */

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, FixtureStatus } from '@prisma/client';

const prisma = new PrismaClient();

/** [quota1, quotaX, quota2, oreDiRitardo] */
type BookQuotes = Record<string, [number, number, number, number]>;

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface Bet {
  season: string;
  side: 0 | 1 | 2;
  consensus: number;
  best: number;
  avg: number;
  deviation: number;
  won: boolean;
}

/**
 * ROI ed errore standard sotto l'ipotesi nulla di quote eque, dove la varianza
 * di una puntata da 1 a quota o vale esattamente o - 1. Regge con quote diverse
 * fra loro e non degenera quando non si perde mai.
 */
function stats(bets: Bet[], price: (b: Bet) => number) {
  const n = bets.length;
  if (!n) return null;
  const profit = bets.reduce((a, b) => a + (b.won ? price(b) - 1 : -1), 0);
  const nullSe = Math.sqrt(bets.reduce((a, b) => a + (price(b) - 1), 0));
  return {
    n, profit,
    roi: (profit / n) * 100,
    se: (nullSe / n) * 100,
    z: nullSe > 0 ? profit / nullSe : 0,
    hit: (bets.filter(b => b.won).length / n) * 100,
    avgOdds: bets.reduce((a, b) => a + price(b), 0) / n,
  };
}

function row(label: string, s: ReturnType<typeof stats>) {
  if (!s) { console.log('  ' + label.padEnd(20) + '   nessuna giocata'); return; }
  console.log('  ' + label.padEnd(20) +
    String(s.n).padStart(7) + '   ' +
    s.hit.toFixed(1).padStart(5) + '%   ' +
    s.avgOdds.toFixed(2).padStart(5) + '   ' +
    ((s.roi >= 0 ? '+' : '') + s.roi.toFixed(2) + '% ±' + s.se.toFixed(2)).padStart(17) +
    '   z ' + s.z.toFixed(2).padStart(6) + (Math.abs(s.z) > 1.96 ? ' *' : ''));
}

async function main() {
  const store: Record<string, BookQuotes> = JSON.parse(
    fs.readFileSync(path.resolve('data/book-odds.json'), 'utf-8'));
  const maxLag = parseFloat(arg('--lag-max', '1e9'));
  const minBooks = parseInt(arg('--min-book', '8'), 10);

  const fixtures = await prisma.fixture.findMany({
    where: { status: FixtureStatus.FINISHED },
    select: { id: true, date: true, homeGoals: true, awayGoals: true },
  });
  const byId = new Map(fixtures.map(f => [f.id, f]));

  const all: Bet[] = [];

  for (const [idStr, books] of Object.entries(store)) {
    const f = byId.get(Number(idStr));
    if (!f || f.homeGoals == null || f.awayGoals == null) continue;
    const outcome: 0 | 1 | 2 = f.homeGoals > f.awayGoals ? 0 : f.homeGoals === f.awayGoals ? 1 : 2;
    const season = f.date < new Date('2025-07-01') ? '2024-25' : '2025-26';

    const ids = Object.keys(books).filter(b => books[b][3] <= maxLag);
    if (ids.length < minBooks) continue;

    // probabilita' de-viggate di ogni bookmaker
    const probs: Record<string, [number, number, number]> = {};
    for (const b of ids) {
      const q = books[b];
      const raw: [number, number, number] = [1 / q[0], 1 / q[1], 1 / q[2]];
      const s = raw[0] + raw[1] + raw[2];
      probs[b] = [raw[0] / s, raw[1] / s, raw[2] / s];
    }

    // per ogni esito: miglior prezzo, media, e consenso degli ALTRI book
    let pick: Bet | null = null;
    for (const side of [0, 1, 2] as const) {
      const prices = ids.map(b => books[b][side]);
      const bestIdx = prices.indexOf(Math.max(...prices));
      const bestBook = ids[bestIdx];
      const others = ids.filter(b => b !== bestBook).map(b => probs[b][side]);
      if (others.length < minBooks - 1) continue;
      const consensus = median(others);
      const best = prices[bestIdx];
      const avg = prices.reduce((a, c) => a + c, 0) / prices.length;
      const cand: Bet = {
        season, side, consensus, best, avg,
        deviation: best * consensus - 1,
        won: side === outcome,
      };
      if (!pick || cand.consensus > pick.consensus) pick = cand;
    }
    if (pick) all.push(pick);
  }

  console.log('='.repeat(78));
  console.log('  "POCHE PARTITE, QUELLE SICURE" — il favorito del mercato, al miglior prezzo');
  console.log('='.repeat(78));
  console.log(`  Partite con quote utilizzabili: ${all.length.toLocaleString('it-IT')}`);
  console.log('  Nessun modello: si gioca l\'esito che il consenso de-viggato ritiene piu');
  console.log('  probabile, quando supera la soglia. Prezzo: il migliore fra i bookmaker.\n');

  console.log('  soglia                giocate   vincenti   quota                ROI      z');
  console.log('  ' + '-'.repeat(76));
  for (const t of [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85]) {
    row(`consenso >= ${(t * 100).toFixed(0)}%`, stats(all.filter(b => b.consensus >= t), b => b.best));
  }

  console.log('\n  LO STESSO, ALLA QUOTA MEDIA invece che alla migliore');
  console.log('  ' + '-'.repeat(76));
  for (const t of [0.6, 0.7, 0.75, 0.8]) {
    row(`consenso >= ${(t * 100).toFixed(0)}%`, stats(all.filter(b => b.consensus >= t), b => b.avg));
  }

  console.log('\n  PER STAGIONE, soglia 70%');
  console.log('  ' + '-'.repeat(76));
  for (const s of ['2024-25', '2025-26']) {
    row(s, stats(all.filter(b => b.consensus >= 0.7 && b.season === s), b => b.best));
  }

  console.log('\n  PER ESITO, soglia 70%');
  console.log('  ' + '-'.repeat(76));
  const names = ['1 (casa)', 'X (pareggio)', '2 (trasferta)'];
  for (const side of [0, 1, 2] as const) {
    row(names[side], stats(all.filter(b => b.consensus >= 0.7 && b.side === side), b => b.best));
  }

  console.log('\n  soglia 70%, SOLO dove il prezzo migliore paga sopra il consenso');
  console.log('  ' + '-'.repeat(76));
  for (const d of [0, 0.01, 0.02, 0.03, 0.05]) {
    row(`scarto >= ${(d * 100).toFixed(0)}%`, stats(all.filter(b => b.consensus >= 0.7 && b.deviation >= d), b => b.best));
  }

  console.log('\n  * = distinguibile dallo zero. z e\' calcolato con la varianza esatta');
  console.log('  sotto l\'ipotesi di quote eque, non con quella campionaria.\n');

  await prisma.$disconnect();
}

main().catch(async e => { console.error('Errore:', e.message); await prisma.$disconnect(); process.exit(1); });
