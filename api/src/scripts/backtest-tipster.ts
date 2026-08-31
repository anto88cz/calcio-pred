/**
 * Il metodo tipster misurato su due stagioni intere, fuori dal campione su cui
 * e' stato scelto.
 *
 * Il metodo non usa il modello: sceglie l'esito che il consenso de-viggato
 * ritiene piu' probabile fra quelli il cui miglior prezzo supera la quota equa,
 * dentro una fascia di quota. Non dovendo ristimare niente, il backtest puo'
 * coprire quindicimila partite invece delle 577 di un mese — ed e' l'unico modo
 * di rispondere: la configurazione e' stata scelta guardando la stagione
 * 2026-27, quindi rimisurarla li' restituirebbe lo stesso numero senza
 * dimostrare niente.
 *
 * Le quote sono sempre quelle aggiornate PRIMA del fischio d'inizio: senza quel
 * filtro le quote di una partita finita contengono il live, dove il risultato
 * uscito sta a 1.01.
 *
 * Due letture, che rispondono a due domande diverse:
 *
 *   REGOLA     flat 1 EUR su ogni giocata che passa i filtri. Misura se la
 *              regola di selezione ha un vantaggio.
 *   PRODOTTO   una scheda al giorno, quella con la crescita attesa piu' alta
 *              fra tutte le singole e tutte le coppie, puntata a un quarto di
 *              Kelly sulla cassa corrente. Misura quello che il tipster
 *              consegna davvero.
 *
 * Uso:
 *   npx tsx src/scripts/backtest-tipster.ts --da 2024-08-01 --a 2026-06-30
 *   npx tsx src/scripts/backtest-tipster.ts --cache data/odds-storico.json
 */

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import { PrismaClient, FixtureStatus } from '@prisma/client';
import { getSportsmonksClient } from '../services/sportsmonks/client';
import { extractOdds, buildCandidates, filterCandidates, score, CandidateRow } from '../services/prediction/live-odds';

const prisma = new PrismaClient();
const MARKETS = [1, 2, 14, 80];

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

interface MatchRow {
  date: string; league: string; home: string; away: string;
  hg: number; ag: number; candidates: CandidateRow[];
}

function won(key: string, hg: number, ag: number): boolean {
  const [market, side] = key.split(':');
  if (market === '1X2') return side === '1' ? hg > ag : side === 'X' ? hg === ag : hg < ag;
  if (market === 'DC') return side === '1X' ? hg >= ag : side === '12' ? hg !== ag : hg <= ag;
  if (market === 'GG') return side === 'GG' ? hg > 0 && ag > 0 : !(hg > 0 && ag > 0);
  if (market.startsWith('OU')) {
    const t = parseFloat(market.slice(2));
    return side === 'Over' ? hg + ag > t : hg + ag < t;
  }
  return false;
}

function marketOf(label: string): string {
  if (label.startsWith('Over') || label.startsWith('Under')) return label.split(' ').slice(0, 2).join(' ');
  if (label.startsWith('Doppia')) return 'Doppia chance';
  if (label === 'Goal' || label === 'No goal') return 'Goal/NoGoal';
  return `Segno ${label}`;
}

/**
 * ROI ed errore standard sotto l'ipotesi nulla di quote eque, dove la varianza
 * di una puntata da 1 a quota o vale esattamente o - 1: regge con quote diverse
 * fra loro e non degenera quando non si perde mai.
 */
function stats(ret: number[], odds: number[]) {
  const n = ret.length;
  if (!n) return null;
  const profit = ret.reduce((a, b) => a + b, 0);
  const se = Math.sqrt(odds.reduce((a, o) => a + (o - 1), 0));
  return { n, profit, roi: (profit / n) * 100, se: (se / n) * 100, z: se > 0 ? profit / se : 0,
    hit: (ret.filter(r => r > 0).length / n) * 100,
    avg: odds.reduce((a, b) => a + b, 0) / n };
}

const line = (label: string, s: ReturnType<typeof stats>) => {
  if (!s) return;
  console.log('  ' + label.padEnd(20) + String(s.n).padStart(6) + '   ' +
    s.hit.toFixed(1).padStart(5) + '%   ' + s.avg.toFixed(2).padStart(5) + '   ' +
    ((s.roi >= 0 ? '+' : '') + s.roi.toFixed(2) + '% ±' + s.se.toFixed(2)).padStart(17) +
    '   z ' + s.z.toFixed(2).padStart(6) + (Math.abs(s.z) > 1.96 ? ' *' : ''));
};

async function scarica(da: string, a: string, cache: string): Promise<MatchRow[]> {
  if (cache && fs.existsSync(cache)) {
    const rows: MatchRow[] = JSON.parse(fs.readFileSync(cache, 'utf-8'));
    console.log(`  cache: ${rows.length} partite da ${cache}\n`);
    return rows;
  }

  const fixtures = await prisma.fixture.findMany({
    where: {
      status: FixtureStatus.FINISHED,
      homeGoals: { not: null }, awayGoals: { not: null },
      date: { gte: new Date(`${da}T00:00:00Z`), lte: new Date(`${a}T23:59:59Z`) },
    },
    select: { apiId: true, date: true, homeGoals: true, awayGoals: true, leagueName: true,
      homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
    orderBy: { date: 'asc' },
  });
  console.log(`  ${fixtures.length} partite, ${Math.ceil(fixtures.length / 25)} chiamate (~${Math.round(fixtures.length / 25 * 1.6 / 60)} min)\n`);

  const client = getSportsmonksClient();
  const rows: MatchRow[] = [];

  for (let i = 0; i < fixtures.length; i += 25) {
    const chunk = fixtures.slice(i, i + 25);
    try {
      const r: any = await client.get(`/fixtures/multi/${chunk.map(f => f.apiId).join(',')}`,
        { include: 'odds', filters: `markets:${MARKETS.join(',')}` });
      const byApi = new Map<number, any>((r?.data || []).map((x: any) => [x.id, x]));
      for (const f of chunk) {
        const d = byApi.get(f.apiId);
        if (!d?.odds?.length) continue;
        const quotes = extractOdds(d.odds, f.date);   // esclude il live
        const candidates = buildCandidates(quotes, null, 5);
        if (!candidates.length) continue;
        rows.push({
          date: f.date.toISOString().slice(0, 10),
          league: f.leagueName || '?',
          home: f.homeTeam?.name || '?', away: f.awayTeam?.name || '?',
          hg: f.homeGoals!, ag: f.awayGoals!, candidates,
        });
      }
    } catch (e: any) {
      console.error(`  blocco ${i}: ${e.message}`);
    }
    const done = Math.min(i + 25, fixtures.length);
    if (done % 1000 < 25 || done === fixtures.length) console.log(`    ${done}/${fixtures.length}   risolte ${rows.length}`);
  }

  if (cache) { fs.writeFileSync(cache, JSON.stringify(rows)); console.log(`\n  cache scritta in ${cache}`); }
  return rows;
}

async function main() {
  const da = arg('--da', '2024-08-01');
  const a = arg('--a', '2026-06-30');
  const cache = arg('--cache', 'data/odds-storico.json');
  const filters = {
    minBooks: parseInt(arg('--min-book', '5'), 10),
    minOdds: parseFloat(arg('--quota-min', '1.15')),
    maxOdds: parseFloat(arg('--quota-max', '3.0')),
    minDeviation: parseFloat(arg('--scarto-min', '0.001')),
    maxDeviation: parseFloat(arg('--scarto-max', '0.15')),
    minProb: parseFloat(arg('--prob-min', '0')),
  };
  const capitale = parseFloat(arg('--capitale', '100'));

  console.log('='.repeat(78));
  console.log(`  BACKTEST METODO TIPSTER — ${da} → ${a}`);
  console.log('='.repeat(78));
  console.log(`  quote ${filters.minOdds}-${filters.maxOdds}   scarto ${(filters.minDeviation * 100).toFixed(1)}%-${(filters.maxDeviation * 100).toFixed(0)}%   ` +
    `scelta per probabilita' di mercato\n`);

  const rows = await scarica(da, a, cache);
  if (!rows.length) { console.log('Nessun dato.'); await prisma.$disconnect(); return; }

  // --- REGOLA: flat 1 EUR su ogni giocata selezionata ---
  interface Bet { row: MatchRow; pick: CandidateRow; won: boolean; ret: number }
  const bets: Bet[] = [];
  for (const row of rows) {
    const ok = filterCandidates(row.candidates, filters);
    if (!ok.length) continue;
    const pick = ok.reduce((x, y) => (score(y, 'sicure') > score(x, 'sicure') ? y : x));
    const w = won(pick.key, row.hg, row.ag);
    bets.push({ row, pick, won: w, ret: w ? pick.best - 1 : -1 });
  }

  const S = (b: Bet[]) => stats(b.map(x => x.ret), b.map(x => x.pick.best));
  console.log('\n  REGOLA — flat 1 EUR su ogni giocata');
  console.log('  ' + '-'.repeat(74));
  console.log('  ' + 'insieme'.padEnd(20) + 'giocate'.padStart(6) + '   vincenti   quota                ROI       z');
  line('tutte', S(bets));
  const stagione = (b: Bet) => (b.row.date < '2025-07-01' ? '2024-25' : b.row.date < '2026-07-01' ? '2025-26' : '2026-27');
  for (const s of ['2024-25', '2025-26', '2026-27']) line(s, S(bets.filter(b => stagione(b) === s)));

  console.log('\n  per fascia di quota');
  console.log('  ' + '-'.repeat(74));
  for (const [lo, hi, l] of [[1, 1.5, '1.00-1.50'], [1.5, 2, '1.50-2.00'], [2, 2.5, '2.00-2.50'], [2.5, 3.01, '2.50-3.00']] as const) {
    line(l, S(bets.filter(b => b.pick.best >= lo && b.pick.best < hi)));
  }

  console.log('\n  per mercato');
  console.log('  ' + '-'.repeat(74));
  const byM = new Map<string, Bet[]>();
  for (const b of bets) { const k = marketOf(b.pick.label); byM.set(k, [...(byM.get(k) || []), b]); }
  for (const [k, v] of [...byM.entries()].sort((x, y) => y[1].length - x[1].length)) line(k, S(v));

  console.log('\n  per scarto dal prezzo equo');
  console.log('  ' + '-'.repeat(74));
  for (const [lo, hi, l] of [[0, 0.01, '0-1%'], [0.01, 0.02, '1-2%'], [0.02, 0.04, '2-4%'], [0.04, 0.08, '4-8%'], [0.08, 1, 'oltre 8%']] as const) {
    line(l, S(bets.filter(b => b.pick.deviation >= lo && b.pick.deviation < hi)));
  }

  // --- PRODOTTO: una scheda al giorno, singola o coppia, quarto di Kelly ---
  const byDate = new Map<string, Bet[]>();
  for (const b of bets) byDate.set(b.row.date, [...(byDate.get(b.row.date) || []), b]);

  const crescita = (odds: number, p: number) => {
    const b = odds - 1;
    const k = b > 0 ? (b * p - (1 - p)) / b : 0;
    const f = Math.max(0, Math.min(0.05, k * 0.25));
    return { f, g: f > 0 ? p * Math.log(1 + f * b) + (1 - p) * Math.log(1 - f) : 0 };
  };

  let bank = capitale, peak = capitale, maxDD = 0, streak = 0, worst = 0;
  let schede = 0, vinte = 0, puntato = 0;
  const retSchede: number[] = [], oddsSchede: number[] = [];

  for (const date of [...byDate.keys()].sort()) {
    const day = byDate.get(date)!;
    let best: { legs: Bet[]; odds: number; p: number; f: number; g: number } | null = null;
    const consider = (legs: Bet[]) => {
      const odds = legs.reduce((s, l) => s * l.pick.best, 1);
      const p = legs.reduce((s, l) => s * l.pick.consensusProb, 1);
      const { f, g } = crescita(odds, p);
      if (g > 0 && (!best || g > best.g)) best = { legs, odds, p, f, g };
    };
    for (let i = 0; i < day.length; i++) {
      consider([day[i]]);
      for (let j = i + 1; j < day.length; j++) consider([day[i], day[j]]);
    }
    if (!best) continue;
    const b = best as { legs: Bet[]; odds: number; p: number; f: number; g: number };

    const stake = bank * b.f;
    const ok = b.legs.every(l => l.won);
    bank += ok ? stake * (b.odds - 1) : -stake;
    puntato += stake; schede++; if (ok) vinte++;
    retSchede.push(ok ? b.odds - 1 : -1); oddsSchede.push(b.odds);
    peak = Math.max(peak, bank); maxDD = Math.max(maxDD, (peak - bank) / peak);
    streak = ok ? 0 : streak + 1; worst = Math.max(worst, streak);
  }

  const sSchede = stats(retSchede, oddsSchede)!;
  console.log('\n  PRODOTTO — una scheda al giorno, quarto di Kelly composto');
  console.log('  ' + '-'.repeat(74));
  console.log(`    schede ${schede}   vinte ${vinte} (${((vinte / schede) * 100).toFixed(1)}%)   quota media ${sSchede.avg.toFixed(2)}`);
  console.log(`    ROI sulla scheda ${(sSchede.roi >= 0 ? '+' : '') + sSchede.roi.toFixed(2)}% ±${sSchede.se.toFixed(2)}   z ${sSchede.z.toFixed(2)}${Math.abs(sSchede.z) > 1.96 ? ' *' : ''}`);
  console.log(`    puntato ${puntato.toFixed(2)} EUR   cassa ${capitale.toFixed(2)} → ${bank.toFixed(2)} EUR (${((bank / capitale - 1) * 100 >= 0 ? '+' : '') + ((bank / capitale - 1) * 100).toFixed(1)}%)`);
  console.log(`    perdita massima dal picco ${(maxDD * 100).toFixed(1)}%   sconfitte di fila ${worst}`);

  console.log('\n  * = distinguibile dallo zero (|z| > 1,96)\n');
  await prisma.$disconnect();
}

main().catch(async e => { console.error('Errore:', e.message); await prisma.$disconnect(); process.exit(1); });
