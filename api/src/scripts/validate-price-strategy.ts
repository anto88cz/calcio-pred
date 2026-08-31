/**
 * Valida la strategia PREZZO: scommettere dove un singolo bookmaker si discosta
 * dal consenso degli altri, senza usare nessun modello di calcio.
 *
 * L'ipotesi: il consenso di venti bookmaker e' una stima migliore della
 * probabilita' vera di quanto lo sia il prezzo di uno solo. Quando un book
 * resta indietro rispetto agli altri, la sua quota e' troppo alta rispetto al
 * rischio reale, e puntarci ha valore atteso positivo. Non serve prevedere la
 * partita: serve accorgersi di chi non ha aggiornato.
 *
 * Il consenso viene calcolato con la MEDIANA delle probabilita' de-viggate
 * degli ALTRI bookmaker, escludendo quello su cui si punta. La mediana perche'
 * e' robusta agli errori del feed, che ci sono; l'esclusione perche' altrimenti
 * il book anomalo si trascina dietro il proprio consenso e lo scarto risulta
 * piu' piccolo di quello che e'.
 *
 * Uso: npx tsx src/scripts/validate-price-strategy.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, FixtureStatus } from '@prisma/client';

const prisma = new PrismaClient();

/** [quota1, quotaX, quota2, oreDiRitardo] */
type BookQuotes = Record<string, [number, number, number, number]>;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface Bet {
  season: string;
  outcome: 0 | 1 | 2;
  odds: number;
  deviation: number;
  lag: number;
  won: boolean;
}

function stats(bets: Bet[]) {
  const n = bets.length;
  if (!n) return null;
  const ret = bets.map(b => (b.won ? b.odds - 1 : -1));
  const mean = ret.reduce((a, b) => a + b, 0) / n;
  const varr = ret.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1);
  const se = Math.sqrt(varr / n);
  return {
    n,
    roi: mean * 100,
    se: se * 100,
    t: mean / se,
    hit: (bets.filter(b => b.won).length / n) * 100,
    avgOdds: bets.reduce((s, b) => s + b.odds, 0) / n,
    avgDev: (bets.reduce((s, b) => s + b.deviation, 0) / n) * 100,
  };
}

async function main() {
  const file = path.resolve('data/book-odds.json');
  const store: Record<string, BookQuotes> = JSON.parse(fs.readFileSync(file, 'utf-8'));

  const fixtures = await prisma.fixture.findMany({
    where: { status: FixtureStatus.FINISHED },
    select: { id: true, date: true, homeGoals: true, awayGoals: true, leagueName: true },
  });
  const byId = new Map(fixtures.map(f => [f.id, f]));

  const MAX_DEVIATION = 0.30;
  const all: Bet[] = [];
  let pairs = 0;

  for (const [idStr, books] of Object.entries(store)) {
    const f = byId.get(Number(idStr));
    if (!f || f.homeGoals == null || f.awayGoals == null) continue;

    const outcome: 0 | 1 | 2 =
      f.homeGoals > f.awayGoals ? 0 : f.homeGoals === f.awayGoals ? 1 : 2;
    const season = f.date < new Date('2025-07-01') ? '2024-25' : '2025-26';

    const ids = Object.keys(books);
    if (ids.length < 8) continue;

    // probabilita' de-viggate di ogni bookmaker
    const probs: Record<string, [number, number, number]> = {};
    for (const b of ids) {
      const q = books[b];
      const raw = [1 / q[0], 1 / q[1], 1 / q[2]];
      const s = raw[0] + raw[1] + raw[2];
      probs[b] = [raw[0] / s, raw[1] / s, raw[2] / s];
    }

    for (const b of ids) {
      for (const side of [0, 1, 2] as const) {
        const others = ids.filter(o => o !== b).map(o => probs[o][side]);
        if (others.length < 6) continue;
        const consensus = median(others);
        if (!(consensus > 0.01)) continue;

        // quota equa secondo gli altri, contro la quota offerta da questo book
        const fairOdds = 1 / consensus;
        const offered = books[b][side];
        const deviation = offered / fairOdds - 1;
        pairs++;

        if (deviation > MAX_DEVIATION) continue; // errore del feed
        all.push({ season, outcome: side, odds: offered, deviation, lag: books[b][3], won: side === outcome });
      }
    }
  }

  console.log('========================================================');
  console.log('STRATEGIA PREZZO — scommettere dove un book si discosta');
  console.log('========================================================');
  console.log(`Partite: ${Object.keys(store).length}   combinazioni book x esito esaminate: ${pairs.toLocaleString('it-IT')}`);
  console.log('Consenso: mediana degli altri bookmaker, de-viggata, escluso quello su cui si punta.');
  console.log(`Scartate le quote oltre il ${(MAX_DEVIATION * 100).toFixed(0)}% sopra il consenso (errori del feed).\n`);

  const row = (label: string, s: ReturnType<typeof stats>) => {
    if (!s) { console.log('  ' + label.padEnd(22) + '  nessuna giocata'); return; }
    const sig = Math.abs(s.t) > 1.96 ? ' *' : '  ';
    console.log('  ' + label.padEnd(22) +
      String(s.n).padStart(7) + '   ' +
      s.hit.toFixed(1).padStart(5) + '%   ' +
      s.avgOdds.toFixed(2).padStart(5) + '   ' +
      s.avgDev.toFixed(1).padStart(5) + '%   ' +
      ((s.roi >= 0 ? '+' : '') + s.roi.toFixed(2) + '% ±' + s.se.toFixed(2)).padStart(16) + sig);
  };

  console.log('  soglia di scarto        giocate   vincenti   quota   scarto   ROI');
  console.log('  ' + '-'.repeat(78));
  for (const t of [0, 0.02, 0.04, 0.06, 0.08, 0.10, 0.15]) {
    row(t === 0 ? 'tutte le quote' : `>= ${(t * 100).toFixed(0)}% sopra`, stats(all.filter(b => b.deviation >= t)));
  }

  console.log('\n  per stagione, soglia 8%');
  console.log('  ' + '-'.repeat(78));
  for (const s of ['2024-25', '2025-26']) {
    row(s, stats(all.filter(b => b.deviation >= 0.08 && b.season === s)));
  }

  console.log('\n  per esito, soglia 8%');
  console.log('  ' + '-'.repeat(78));
  const names = ['1 (casa)', 'X (pareggio)', '2 (trasferta)'];
  for (const side of [0, 1, 2] as const) {
    row(names[side], stats(all.filter(b => b.deviation >= 0.08 && b.outcome === side)));
  }

  console.log('\n  per quanto la quota e\' vecchia, soglia 8%');
  console.log('  ' + '-'.repeat(78));
  for (const [lo, hi, label] of [[0, 6, 'aggiornata < 6h'], [6, 24, '6-24h prima'], [24, 1e9, 'piu\' di 24h']] as const) {
    row(label, stats(all.filter(b => b.deviation >= 0.08 && b.lag >= lo && b.lag < hi)));
  }

  // Lo scarto relativo piu' grande si trova quasi sempre sugli outsider, dove i
  // bookmaker sono naturalmente piu' in disaccordo ed e' concentrato il margine
  // (favourite-longshot bias). La teoria dice di guardare le quote basse.
  console.log('\n  per fascia di quota, soglia 4%');
  console.log('  ' + '-'.repeat(78));
  for (const [lo, hi, label] of [
    [1, 1.8, 'quota 1.00-1.80'], [1.8, 2.5, 'quota 1.80-2.50'],
    [2.5, 4, 'quota 2.50-4.00'], [4, 8, 'quota 4.00-8.00'], [8, 1e9, 'quota oltre 8'],
  ] as const) {
    row(label, stats(all.filter(b => b.deviation >= 0.04 && b.odds >= lo && b.odds < hi)));
  }

  console.log('\n  quote sotto 2.50 per stagione, soglia 4%');
  console.log('  ' + '-'.repeat(78));
  for (const season of ['2024-25', '2025-26']) {
    row(season, stats(all.filter(b => b.deviation >= 0.04 && b.odds < 2.5 && b.season === season)));
  }

  console.log('\n  * = distinguibile da zero (|t| > 1,96)');
  console.log('\nAvvertenza: ogni riga conta una giocata per ciascun bookmaker che si discosta,');
  console.log('quindi le giocate non sono indipendenti fra loro (piu\' book sulla stessa partita');
  console.log('vincono o perdono insieme). L\'errore standard qui sotto e\' percio\' ottimistico:');
  console.log('quello vero e\' piu\' grande.\n');

  await prisma.$disconnect();
}

main().catch(async e => { console.error('Errore:', e.message); await prisma.$disconnect(); process.exit(1); });
