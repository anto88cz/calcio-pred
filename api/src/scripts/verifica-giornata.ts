/**
 * Che cosa avrebbe giocato la schedina in giornate gia' andate, e come sono
 * finite davvero.
 *
 * Vale solo se e' onesta su due punti, che qui sono vincoli di codice e non
 * buone intenzioni:
 *
 * 1. Il modello e' ristimato ogni giorno SOLO sulle partite precedenti. Non e'
 *    una cautela formale: con l'archivio intero avrebbe visto i risultati che
 *    deve indovinare, ed e' esattamente il difetto che rendeva inutili i
 *    vecchi report di questo repository.
 * 2. Le quote sono quelle aggiornate PRIMA del fischio d'inizio. Le quote di
 *    una partita finita, prese senza filtro, contengono il live: a fine partita
 *    il risultato uscito e' quotato 1.01 e qualunque strategia sembra
 *    infallibile.
 *
 * Le giocate escono da selectPick, la stessa funzione che usa schedina.ts:
 * quello che si legge qui e' la giocata che sarebbe stata proposta.
 *
 * Uso:
 *   npx tsx src/scripts/verifica-giornata.ts
 *   npx tsx src/scripts/verifica-giornata.ts 2026-08-30 --giorni 30
 *   npx tsx src/scripts/verifica-giornata.ts --criterio sicure --prob-min 0.70
 *   npx tsx src/scripts/verifica-giornata.ts 2026-08-30 --giorni 38 --export data/giornate.json
 */

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import { PrismaClient, FixtureStatus } from '@prisma/client';
import { getSportsmonksClient } from '../services/sportsmonks/client';
import { fitDixonColes, predict, DCMatch } from '../services/prediction/dixon-coles';
import { extractOdds, buildCandidates, selectPick, consensusOf, CandidateRow, Criterio } from '../services/prediction/live-odds';
import { ALLOWED_LEAGUES } from '../config/supported-leagues';

const prisma = new PrismaClient();
const MARKETS = [1, 2, 14, 80];
const DAY_MS = 86_400_000;

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

/** L'esito si e' verificato, dato il punteggio finale. */
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

/** La famiglia di mercato, per il riepilogo. */
function marketOf(label: string): string {
  if (label.startsWith('Over') || label.startsWith('Under')) return label.split(' ').slice(0, 2).join(' ');
  if (label.startsWith('Doppia')) return 'Doppia chance';
  if (label === 'Goal' || label === 'No goal') return 'Goal/NoGoal';
  return `Segno ${label}`;
}

interface Bet {
  date: string;
  league: string; home: string; away: string;
  hg: number; ag: number;
  pick: CandidateRow;
  won: boolean;
  ret: number;
}

/** Una partita con il risultato, per il confronto 1X2 modello contro mercato. */
interface Match1X2 { model: [number, number, number]; market: [number, number, number]; outcome: 0 | 1 | 2 }

/**
 * ROI, e se sia distinguibile dallo zero.
 *
 * L'incertezza NON si prende dalla varianza campionaria dei ritorni. Con zero
 * sconfitte quella varianza e' quasi nulla, l'errore standard collassa e
 * qualunque serie di sole vittorie risulta "significativa": otto giocate vinte
 * su otto davano ±1.39 e un t sopra 30, che non vuol dire niente.
 *
 * E nemmeno da un intervallo binomiale sulla percentuale di vincenti
 * confrontata con 1 / quota media: il pareggio a quota media e' il pareggio
 * giusto solo se le quote sono tutte uguali. Con quote da 1.4 a 8 le vincenti
 * si concentrano sulle basse, e quel test dichiarava significativo un ROI
 * dell'1.38%.
 *
 * La varianza si ricava invece dall'ipotesi nulla, dove e' esatta. Se la quota
 * e' equa la scommessa vale (o - 1) con probabilita' 1/o e -1 altrimenti,
 * quindi ha media zero e varianza:
 *
 *   E[r^2] = (o-1)^2 / o + (1 - 1/o) = (o-1) * o / o = o - 1
 *
 * Il profitto totale ha percio' errore standard sqrt(somma di (o_i - 1)), che
 * regge con quote diverse fra loro e non degenera quando non si perde mai.
 */
function roiStats(returns: number[], odds: number[]) {
  const n = returns.length;
  if (!n) return null;
  const profit = returns.reduce((a, b) => a + b, 0);
  const nullVar = odds.reduce((a, o) => a + (o - 1), 0);
  const nullSe = Math.sqrt(nullVar);
  const z = nullSe > 0 ? profit / nullSe : 0;
  return {
    n,
    profit,
    roi: (profit / n) * 100,
    /** errore standard del ROI sotto l'ipotesi di quote eque */
    se: (nullSe / n) * 100,
    z,
    significant: Math.abs(z) > 1.96,
  };
}

/**
 * Una partita gia' giocata con TUTTE le sue giocate possibili.
 *
 * Si esporta per poter riprovare strategie diverse senza rifare il calcolo: il
 * costo di questa verifica non sono le quote, e' ristimare il modello ogni
 * giorno su quindicimila partite.
 */
export interface MatchExport {
  date: string; kickoff: string; league: string;
  home: string; away: string; hg: number; ag: number;
  lambdaHome: number; lambdaAway: number;
  candidates: CandidateRow[];
}

async function giornata(
  date: string, criterio: Criterio, filters: any, iterations: number,
): Promise<{ bets: Bet[]; matches: Match1X2[]; seen: number; exports: MatchExport[] }> {
  const dayStart = new Date(`${date}T00:00:00Z`);

  const history = await prisma.fixture.findMany({
    where: {
      status: FixtureStatus.FINISHED,
      homeGoals: { not: null }, awayGoals: { not: null },
      date: { lt: dayStart },
    },
    select: { homeTeamId: true, awayTeamId: true, homeGoals: true, awayGoals: true, date: true, xg_home: true, xg_away: true },
    orderBy: { date: 'asc' },
  });
  const matches: DCMatch[] = history.map(f => ({
    homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId,
    homeGoals: f.homeGoals!, awayGoals: f.awayGoals!,
    homeXg: f.xg_home, awayXg: f.xg_away, date: f.date,
  }));
  const params = fitDixonColes(matches, {
    xi: 0.002, iterations, target: 'blend', blendWeight: 0.35,
    teamRidge: 0.05, referenceDate: dayStart,
  });

  const client = getSportsmonksClient();
  const fixtures: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const r: any = await client.get(`/fixtures/between/${date}/${date}`, {
      include: 'participants;league;scores;state', per_page: '100', page: String(page),
    });
    fixtures.push(...(r?.data || []));
    if (!r?.pagination?.has_more) break;
  }

  const teams = await prisma.team.findMany({ select: { id: true, apiId: true } });
  const byApi = new Map(teams.map(t => [t.apiId, t.id]));
  const lastPlayed = new Map<number, Date>();
  for (const m of matches) { lastPlayed.set(m.homeTeamId, m.date); lastPlayed.set(m.awayTeamId, m.date); }

  interface Pending { fx: any; kickoff: Date; h: number; a: number; hg: number; ag: number }
  const pending: Pending[] = [];

  for (const fx of fixtures) {
    if (!ALLOWED_LEAGUES.includes(fx.league_id)) continue;
    if (!['FT', 'AET', 'FT_PEN'].includes(fx.state?.short_name)) continue;
    const cur = (fx.scores || []).filter((s: any) => s.description === 'CURRENT');
    const hg = cur.find((s: any) => s.score?.participant === 'home')?.score?.goals;
    const ag = cur.find((s: any) => s.score?.participant === 'away')?.score?.goals;
    if (hg == null || ag == null) continue;
    const home = (fx.participants || []).find((p: any) => p.meta?.location === 'home');
    const away = (fx.participants || []).find((p: any) => p.meta?.location === 'away');
    const h = home && byApi.get(home.id);
    const a = away && byApi.get(away.id);
    if (!h || !a) continue;
    pending.push({ fx, kickoff: new Date(String(fx.starting_at).replace(' ', 'T') + 'Z'), h, a, hg, ag });
  }

  const oddsByApiId = new Map<number, any[]>();
  for (let i = 0; i < pending.length; i += 25) {
    const chunk = pending.slice(i, i + 25);
    try {
      const r: any = await client.get(`/fixtures/multi/${chunk.map(x => x.fx.id).join(',')}`, {
        include: 'odds', filters: `markets:${MARKETS.join(',')}`,
      });
      for (const d of (r?.data || [])) oddsByApiId.set(d.id, d.odds || []);
    } catch (e: any) {
      console.error(`  ${date} blocco quote ${i}: ${e.message}`);
    }
  }

  const bets: Bet[] = [];
  const comparisons: Match1X2[] = [];
  const exports: MatchExport[] = [];

  for (const item of pending) {
    const rows = oddsByApiId.get(item.fx.id);
    if (!rows?.length) continue;
    const quotes = extractOdds(rows, item.kickoff);   // esclude il live

    const restOf = (id: number) => {
      const prev = lastPlayed.get(id);
      return prev ? (item.kickoff.getTime() - prev.getTime()) / DAY_MS : null;
    };
    const p = predict(params, item.h, item.a, 12, { home: restOf(item.h), away: restOf(item.a) });

    const c1 = consensusOf(quotes, '1X2:1')?.prob;
    const cX = consensusOf(quotes, '1X2:X')?.prob;
    const c2 = consensusOf(quotes, '1X2:2')?.prob;
    if (c1 && cX && c2) {
      const s = c1 + cX + c2;
      comparisons.push({
        model: [p.prob1, p.probX, p.prob2],
        market: [c1 / s, cX / s, c2 / s],
        outcome: item.hg > item.ag ? 0 : item.hg === item.ag ? 1 : 2,
      });
    }

    const candidates = buildCandidates(quotes, p, filters.minBooks);
    const homeName = (item.fx.participants || []).find((x: any) => x.meta?.location === 'home')?.name || '?';
    const awayName = (item.fx.participants || []).find((x: any) => x.meta?.location === 'away')?.name || '?';
    if (candidates.length) {
      exports.push({
        date, kickoff: item.kickoff.toISOString(),
        league: item.fx.league?.name || String(item.fx.league_id),
        home: homeName, away: awayName, hg: item.hg, ag: item.ag,
        lambdaHome: p.lambdaHome, lambdaAway: p.lambdaAway,
        candidates,
      });
    }

    const chosen = selectPick(candidates, criterio, filters);
    if (!chosen) continue;
    const ok = won(chosen.key, item.hg, item.ag);
    bets.push({
      date,
      league: item.fx.league?.name || String(item.fx.league_id),
      home: (item.fx.participants || []).find((x: any) => x.meta?.location === 'home')?.name || '?',
      away: (item.fx.participants || []).find((x: any) => x.meta?.location === 'away')?.name || '?',
      hg: item.hg, ag: item.ag,
      pick: chosen,
      won: ok, ret: ok ? chosen.best - 1 : -1,
    });
  }

  return { bets, matches: comparisons, seen: pending.length, exports };
}

async function main() {
  const dateArg = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const lastDate = dateArg || new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
  const days = Math.max(1, parseInt(arg('--giorni', '1'), 10));
  const criterioArg = arg('--criterio', 'prezzo');
  const criterio: Criterio =
    criterioArg === 'ev' ? 'ev' : criterioArg === 'prob' ? 'prob'
      : criterioArg === 'sicure' ? 'sicure' : 'prezzo';
  const iterations = parseInt(arg('--iterazioni', '2500'), 10);
  const filters = {
    minBooks: parseInt(arg('--min-book', '5'), 10),
    minOdds: parseFloat(arg('--quota-min', '1.4')),
    maxOdds: parseFloat(arg('--quota-max', '8')),
    minDeviation: parseFloat(arg('--scarto-min', '0')) || -Infinity,
    maxDeviation: parseFloat(arg('--scarto-max', '0.15')),
    minProb: parseFloat(arg('--prob-min', '0')),
  };

  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(new Date(Date.parse(`${lastDate}T00:00:00Z`) - i * DAY_MS).toISOString().slice(0, 10));
  }

  console.log('='.repeat(72));
  console.log(`  VERIFICA — ${dates[0]}${days > 1 ? ` → ${dates[dates.length - 1]}` : ''}`);
  console.log('='.repeat(72));
  console.log(`  criterio: ${criterio}   quote ${filters.minOdds.toFixed(2)}-${filters.maxOdds.toFixed(2)}` +
    (filters.minProb > 0 ? `   probabilita' di mercato >= ${(filters.minProb * 100).toFixed(0)}%` : '') +
    (filters.minDeviation > -Infinity ? `   scarto >= ${(filters.minDeviation * 100).toFixed(1)}%` : '') + '\n');

  const all: Bet[] = [];
  const comparisons: Match1X2[] = [];
  const exports: MatchExport[] = [];
  let seen = 0;

  for (const d of dates) {
    const r = await giornata(d, criterio, filters, iterations);
    all.push(...r.bets);
    comparisons.push(...r.matches);
    exports.push(...r.exports);
    seen += r.seen;
    const s = roiStats(r.bets.map(b => b.ret), r.bets.map(b => b.pick.best));
    const w = r.bets.filter(b => b.won).length;
    console.log(`  ${d}   ${String(r.seen).padStart(3)} partite   ${String(r.bets.length).padStart(3)} giocate   ` +
      `${String(w).padStart(3)} vinte   ${s ? ((s.roi * s.n / 100) >= 0 ? '+' : '') + (s.roi * s.n / 100).toFixed(2) : '0.00'} EUR`);
  }

  const exportPath = arg('--export', '');
  if (exportPath) {
    fs.writeFileSync(exportPath, JSON.stringify(exports, null, 0));
    console.log(`\n  Esportate ${exports.length} partite con tutte le giocate possibili in ${exportPath}`);
  }

  if (!all.length) { console.log('\n  Nessuna giocata con questi filtri.\n'); await prisma.$disconnect(); return; }

  if (days === 1) {
    console.log('\n' + '-'.repeat(72));
    for (const b of all.sort((x, y) => y.pick.consensusProb - x.pick.consensusProb)) {
      console.log(`  ${b.won ? 'VINTA ' : 'PERSA '}  ${b.home} — ${b.away}  ${b.hg}-${b.ag}   (${b.league})`);
      console.log(`           ${b.pick.label} @ ${b.pick.best.toFixed(2)}   mercato ${(b.pick.consensusProb * 100).toFixed(1)}%  modello ${(b.pick.modelProb * 100).toFixed(1)}%   ${b.ret >= 0 ? '+' : ''}${b.ret.toFixed(2)} EUR`);
    }
  }

  const s = roiStats(all.map(b => b.ret), all.map(b => b.pick.best))!;
  const wins = all.filter(b => b.won).length;
  const expModel = all.reduce((a, b) => a + b.pick.modelProb, 0);
  const expMarket = all.reduce((a, b) => a + b.pick.consensusProb, 0);
  const avgOdds = all.reduce((a, b) => a + b.pick.best, 0) / all.length;

  console.log('\n' + '-'.repeat(72));
  console.log(`  Partite viste: ${seen}   giocate: ${s.n} (${((s.n / seen) * 100).toFixed(1)}%)   quota media: ${avgOdds.toFixed(2)}`);
  console.log(`  Vincenti: ${wins} (${((wins / s.n) * 100).toFixed(1)}%)   attese dal mercato ${expMarket.toFixed(1)}   dal modello ${expModel.toFixed(1)}`);
  console.log(`  Flat 1 EUR: ${(s.roi * s.n / 100 >= 0 ? '+' : '') + (s.roi * s.n / 100).toFixed(2)} EUR su ${s.n}   ROI ${(s.roi >= 0 ? '+' : '') + s.roi.toFixed(2)}% ±${s.se.toFixed(2)}` +
    `   z = ${s.z.toFixed(2)}` + (s.significant ? '  *' : ''));

  // Per fascia di quota: e' li' che vive il favourite-longshot bias.
  console.log('\n  per fascia di quota');
  console.log('  ' + '-'.repeat(70));
  for (const [lo, hi, label] of [[1, 1.8, '1.00-1.80'], [1.8, 2.5, '1.80-2.50'], [2.5, 4, '2.50-4.00'], [4, 8, '4.00-8.00'], [8, 1e9, 'oltre 8']] as const) {
    const sel = all.filter(b => b.pick.best >= lo && b.pick.best < hi);
    const st = roiStats(sel.map(b => b.ret), sel.map(b => b.pick.best));
    if (!st) continue;
    console.log(`    ${label.padEnd(12)}${String(st.n).padStart(5)} giocate  ${String(sel.filter(b => b.won).length).padStart(4)} vinte  ` +
      `${((sel.filter(b => b.won).length / st.n) * 100).toFixed(1).padStart(5)}%   ROI ${((st.roi >= 0 ? '+' : '') + st.roi.toFixed(2)).padStart(7)}% ±${st.se.toFixed(2)}${st.significant ? ' *' : ''}`);
  }

  console.log('\n  per mercato');
  console.log('  ' + '-'.repeat(70));
  const byMarket = new Map<string, Bet[]>();
  for (const b of all) {
    const k = marketOf(b.pick.label);
    byMarket.set(k, [...(byMarket.get(k) || []), b]);
  }
  for (const [k, v] of [...byMarket.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const st = roiStats(v.map(b => b.ret), v.map(b => b.pick.best))!;
    console.log(`    ${k.padEnd(16)}${String(st.n).padStart(5)} giocate  ${String(v.filter(b => b.won).length).padStart(4)} vinte  ` +
      `attese ${v.reduce((a, b) => a + b.pick.consensusProb, 0).toFixed(1).padStart(5)}   ROI ${((st.roi >= 0 ? '+' : '') + st.roi.toFixed(2)).padStart(7)}% ±${st.se.toFixed(2)}${st.significant ? ' *' : ''}`);
  }

  // Il confronto che non dipende da quali giocate sono state scelte.
  if (comparisons.length) {
    const ll = (get: (m: Match1X2) => [number, number, number]) =>
      comparisons.reduce((a, m) => a - Math.log(Math.max(1e-12, get(m)[m.outcome])), 0) / comparisons.length;
    const acc = (get: (m: Match1X2) => [number, number, number]) =>
      comparisons.filter(m => { const p = get(m); return p.indexOf(Math.max(...p)) === m.outcome; }).length / comparisons.length * 100;
    console.log(`\n  1X2 su ${comparisons.length} partite (tutte, non solo le giocate)`);
    console.log('  ' + '-'.repeat(70));
    console.log(`    log-loss   modello ${ll(m => m.model).toFixed(4)}   mercato ${ll(m => m.market).toFixed(4)}`);
    console.log(`    azzeccate  modello ${acc(m => m.model).toFixed(1)}%      mercato ${acc(m => m.market).toFixed(1)}%`);
  }

  console.log(`\n  * = la percentuale di vincenti e' distinguibile dal pareggio (Wilson 95%).`);
  console.log(`  Senza asterisco il numero e' rumore: per distinguere un ROI del 3% dallo zero`);
  console.log(`  a quota ${avgOdds.toFixed(1)} servono migliaia di giocate.\n`);

  await prisma.$disconnect();
}

main().catch(async e => { console.error('Errore:', e.message); await prisma.$disconnect(); process.exit(1); });
