/**
 * Che cosa avrebbe giocato la schedina in una giornata gia' andata, e come e'
 * finita davvero.
 *
 * E' l'unica verifica che conti su una giornata singola, e vale solo se e'
 * onesta su due punti, che qui sono vincoli di codice e non buone intenzioni:
 *
 * 1. Il modello e' stimato SOLO sulle partite precedenti alla data. Non e' una
 *    cautela formale: con l'archivio intero il modello avrebbe visto i
 *    risultati che deve indovinare, ed e' esattamente il difetto che rendeva
 *    inutili i vecchi report di questo repository.
 * 2. Le quote sono quelle aggiornate PRIMA del fischio d'inizio. Le quote di
 *    una partita finita, prese senza filtro, contengono anche il live: a fine
 *    partita il risultato uscito e' quotato 1.01, e qualunque strategia
 *    sembrerebbe infallibile.
 *
 * Le giocate escono dagli stessi filtri di schedina.ts, quindi quello che si
 * legge qui e' la giocata che sarebbe stata proposta, non una scelta fatta col
 * senno di poi.
 *
 * Uso:
 *   npx tsx src/scripts/verifica-giornata.ts
 *   npx tsx src/scripts/verifica-giornata.ts 2026-08-30
 *   npx tsx src/scripts/verifica-giornata.ts 2026-08-30 --criterio ev --quota-min 1.5
 */

import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient, FixtureStatus } from '@prisma/client';
import { getSportsmonksClient } from '../services/sportsmonks/client';
import { fitDixonColes, predict, DCMatch } from '../services/prediction/dixon-coles';
import { extractOdds, candidatesFrom, consensusOf, Quote, Candidate, Consensus } from '../services/prediction/live-odds';
import { ALLOWED_LEAGUES } from '../config/supported-leagues';

const prisma = new PrismaClient();
const MARKETS = [1, 2, 14, 80];

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

interface Played {
  league: string; home: string; away: string; kickoff: Date;
  hg: number; ag: number;
  pick: Candidate; quote: Quote; consensus: Consensus;
  /** probabilita' del modello sui tre esiti, per il confronto col mercato */
  p1: number; pX: number; p2: number;
  c1: number | null; cX: number | null; c2: number | null;
}

/** Errore standard del ROI: senza, su poche decine di giocate non si legge niente. */
function roiStats(returns: number[]) {
  const n = returns.length;
  if (!n) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const varr = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1);
  return { n, roi: mean * 100, se: Math.sqrt(varr / n) * 100 };
}

async function main() {
  const dateArg = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const date = dateArg || new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const criterioArg = arg('--criterio', 'prezzo');
  const criterio = criterioArg === 'ev' ? 'ev' : criterioArg === 'prob' ? 'prob' : 'prezzo';
  const minOdds = parseFloat(arg('--quota-min', '1.4'));
  const maxOdds = parseFloat(arg('--quota-max', '8'));
  const maxDeviation = parseFloat(arg('--scarto-max', '0.15'));
  const minBooks = parseInt(arg('--min-book', '5'), 10);

  const dayStart = new Date(`${date}T00:00:00Z`);

  console.log('='.repeat(70));
  console.log(`  VERIFICA GIORNATA — ${date}`);
  console.log('='.repeat(70));

  // 1. Modello sulle sole partite PRECEDENTI alla data.
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
    xi: 0.002, iterations: 2500, target: 'blend', blendWeight: 0.35,
    teamRidge: 0.05, referenceDate: dayStart,
  });
  console.log(`  modello su ${matches.length} partite fino al ${new Date(dayStart.getTime() - 1).toISOString().slice(0, 10)}, ${params.teams} squadre`);
  console.log(`  criterio: ${criterio}   ·   quote da ${minOdds.toFixed(2)} a ${maxOdds.toFixed(2)}, scarto entro ${(maxDeviation * 100).toFixed(0)}%\n`);

  // 2. Le partite di quel giorno, con il risultato.
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
  let notFinished = 0, noTeams = 0;

  for (const fx of fixtures) {
    if (!ALLOWED_LEAGUES.includes(fx.league_id)) continue;
    const short = fx.state?.short_name;
    if (!['FT', 'AET', 'FT_PEN'].includes(short)) { notFinished++; continue; }

    const cur = (fx.scores || []).filter((s: any) => s.description === 'CURRENT');
    const hg = cur.find((s: any) => s.score?.participant === 'home')?.score?.goals;
    const ag = cur.find((s: any) => s.score?.participant === 'away')?.score?.goals;
    if (hg == null || ag == null) { notFinished++; continue; }

    const home = (fx.participants || []).find((p: any) => p.meta?.location === 'home');
    const away = (fx.participants || []).find((p: any) => p.meta?.location === 'away');
    const h = home && byApi.get(home.id);
    const a = away && byApi.get(away.id);
    if (!h || !a) { noTeams++; continue; }

    pending.push({ fx, kickoff: new Date(String(fx.starting_at).replace(' ', 'T') + 'Z'), h, a, hg, ag });
  }

  // 3. Quote in blocco, 25 partite per chiamata.
  const oddsByApiId = new Map<number, any[]>();
  for (let i = 0; i < pending.length; i += 25) {
    const chunk = pending.slice(i, i + 25);
    try {
      const r: any = await client.get(`/fixtures/multi/${chunk.map(x => x.fx.id).join(',')}`, {
        include: 'odds', filters: `markets:${MARKETS.join(',')}`,
      });
      for (const d of (r?.data || [])) oddsByApiId.set(d.id, d.odds || []);
    } catch (e: any) {
      console.error(`  blocco quote ${i}: ${e.message}`);
    }
  }

  // 4. La giocata che sarebbe stata proposta.
  const played: Played[] = [];
  let noOdds = 0, filtered = 0;

  for (const item of pending) {
    const rows = oddsByApiId.get(item.fx.id);
    if (!rows?.length) { noOdds++; continue; }
    // il filtro sul fischio d'inizio esclude il live
    const quotes = extractOdds(rows, item.kickoff);

    const restOf = (id: number) => {
      const prev = lastPlayed.get(id);
      return prev ? (item.kickoff.getTime() - prev.getTime()) / 86_400_000 : null;
    };
    const p = predict(params, item.h, item.a, 12, { home: restOf(item.h), away: restOf(item.a) });

    const withConsensus = candidatesFrom(p)
      .map(c => ({ c, q: quotes[c.key] }))
      .filter(x => x.q && x.q.books >= minBooks)
      .map(x => ({ ...x, k: consensusOf(quotes, x.c.key, x.q!.book) }))
      .filter((x): x is typeof x & { k: Consensus } => x.k !== null);
    if (!withConsensus.length) { noOdds++; continue; }

    const playable = withConsensus.filter(x =>
      x.k.deviation <= maxDeviation && x.q!.best >= minOdds && x.q!.best <= maxOdds);
    if (!playable.length) { filtered++; continue; }

    const value = (x: { c: Candidate; q: Quote | undefined; k: Consensus }) =>
      criterio === 'prob' ? x.c.modelProb
        : criterio === 'ev' ? x.c.modelProb * x.q!.best - 1
        : x.k.deviation;
    const best = playable.reduce((x, y) => (value(y) > value(x) ? y : x));

    const cons = (key: string) => consensusOf(quotes, key)?.prob ?? null;
    played.push({
      league: item.fx.league?.name || String(item.fx.league_id),
      home: (item.fx.participants || []).find((x: any) => x.meta?.location === 'home')?.name || '?',
      away: (item.fx.participants || []).find((x: any) => x.meta?.location === 'away')?.name || '?',
      kickoff: item.kickoff, hg: item.hg, ag: item.ag,
      pick: best.c, quote: best.q!, consensus: best.k,
      p1: p.prob1, pX: p.probX, p2: p.prob2,
      c1: cons('1X2:1'), cX: cons('1X2:X'), c2: cons('1X2:2'),
    });
  }

  console.log(`  partite: ${pending.length} concluse` +
    (notFinished ? `, ${notFinished} senza risultato utile` : '') +
    (noTeams ? `, ${noTeams} senza storico` : '') +
    (noOdds ? `, ${noOdds} senza quote pre-partita` : '') +
    (filtered ? `, ${filtered} fuori dai filtri` : '') +
    `  →  ${played.length} giocate\n`);

  if (!played.length) { await prisma.$disconnect(); return; }

  // 5. Come e' andata, partita per partita.
  console.log('-'.repeat(70));
  played.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
  for (const e of played) {
    const ok = won(e.pick.key, e.hg, e.ag);
    const ret = ok ? e.quote.best - 1 : -1;
    console.log(`  ${ok ? 'VINTA ' : 'PERSA '}  ${e.home} — ${e.away}  ${e.hg}-${e.ag}   (${e.league})`);
    console.log(`           ${e.pick.label} @ ${e.quote.best.toFixed(2)}   modello ${(e.pick.modelProb * 100).toFixed(1)}%  consenso ${(e.consensus.prob * 100).toFixed(1)}%   ${ret >= 0 ? '+' : ''}${ret.toFixed(2)} EUR`);
  }

  // 6. Il riepilogo.
  const returns = played.map(e => (won(e.pick.key, e.hg, e.ag) ? e.quote.best - 1 : -1));
  const s = roiStats(returns)!;
  const hits = returns.filter(r => r > 0).length;
  const avgOdds = played.reduce((a, e) => a + e.quote.best, 0) / played.length;

  console.log('\n' + '-'.repeat(70));
  console.log(`  Giocate: ${s.n}   vincenti: ${hits} (${((hits / s.n) * 100).toFixed(1)}%)   quota media: ${avgOdds.toFixed(2)}`);
  console.log(`  Flat 1 EUR:  ${(s.roi >= 0 ? '+' : '') + (s.roi * s.n / 100).toFixed(2)} EUR su ${s.n} EUR   ROI ${(s.roi >= 0 ? '+' : '') + s.roi.toFixed(2)}% ±${s.se.toFixed(2)}`);
  console.log(`  Atteso dal modello:  ${(played.reduce((a, e) => a + e.pick.modelProb, 0)).toFixed(1)} vincenti`);
  console.log(`  Atteso dal consenso: ${(played.reduce((a, e) => a + e.consensus.prob, 0)).toFixed(1)} vincenti`);

  // 7. Modello contro mercato sull'1X2, che e' il confronto che non dipende
  //    dalle giocate scelte: tutte le partite, non solo quelle proposte.
  const withMarket = played.filter(e => e.c1 != null && e.cX != null && e.c2 != null);
  if (withMarket.length) {
    const logloss = (probs: number[][], idx: number[]) =>
      probs.reduce((a, p, i) => a - Math.log(Math.max(1e-12, p[idx[i]])), 0) / probs.length;
    const idx = withMarket.map(e => (e.hg > e.ag ? 0 : e.hg === e.ag ? 1 : 2));
    const modelP = withMarket.map(e => [e.p1, e.pX, e.p2]);
    const marketP = withMarket.map(e => {
      const s = e.c1! + e.cX! + e.c2!;
      return [e.c1! / s, e.cX! / s, e.c2! / s];
    });
    console.log('\n  1X2 su ' + withMarket.length + ' partite (tutte, non solo le giocate):');
    console.log(`    log-loss modello ${logloss(modelP, idx).toFixed(4)}   mercato ${logloss(marketP, idx).toFixed(4)}`);
    const acc = (ps: number[][]) => ps.filter((p, i) => p.indexOf(Math.max(...p)) === idx[i]).length / ps.length * 100;
    console.log(`    azzeccate  modello ${acc(modelP).toFixed(1)}%   mercato ${acc(marketP).toFixed(1)}%`);
  }

  console.log('\n  Una giornata sola non decide niente: con qualche decina di giocate');
  console.log('  l\'errore standard del ROI e\' di decine di punti. Serve a vedere che le');
  console.log('  giocate proposte siano sensate, non a stabilire se il sistema guadagna.\n');

  await prisma.$disconnect();
}

main().catch(async e => { console.error('Errore:', e.message); await prisma.$disconnect(); process.exit(1); });
