/**
 * Predizioni sulle partite di oggi e domani, con le giocate consigliate.
 *
 * E' lo strumento operativo: si lancia, guarda il calendario, stima il modello
 * su tutto l'archivio e produce le scommesse con valore atteso positivo.
 *
 * VINCOLO DI PROGETTO: usa esattamente lo stesso codice del backtest —
 * fitDixonColes e predict, con gli stessi parametri di default. E' il peccato
 * originale di questo repository: il backtest misurava un predittore e in
 * produzione ne girava un altro, quindi nessun numero misurato diceva niente su
 * quello che sarebbe successo davvero. Se si cambia il modello qui, il backtest
 * cambia con lui, e viceversa.
 *
 * Uso:
 *   npx tsx src/scripts/predict-today.ts
 *   npx tsx src/scripts/predict-today.ts --days 3 --min-edge 0.03
 *   npx tsx src/scripts/predict-today.ts --json predizioni.json
 */

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import { PrismaClient, FixtureStatus } from '@prisma/client';
import { getSportsmonksClient } from '../services/sportsmonks/client';
import { fitDixonColes, predict, DCMatch, DixonColesParams } from '../services/prediction/dixon-coles';
import { ALLOWED_LEAGUES } from '../config/supported-leagues';

const prisma = new PrismaClient();

const FULLTIME_MARKETS = new Set(['Fulltime Result', 'Match Winner', '3Way Result', 'Full Time Result']);
const SIDE_OF: Record<string, 0 | 1 | 2> = { Home: 0, Draw: 1, Away: 2 };
const DC_LABELS: Record<string, '1X' | '12' | 'X2'> = {
  'Home/Draw': '1X', 'Draw/Home': '1X',
  'Home/Away': '12', 'Away/Home': '12',
  'Draw/Away': 'X2', 'Away/Draw': 'X2',
};
const DAY_MS = 86_400_000;

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

interface Bet {
  market: string;
  pick: string;
  modelProb: number;
  marketProb: number;
  bestOdds: number;
  bestBook: string;
  consensusOdds: number;
  /** valore atteso di una puntata unitaria al prezzo migliore */
  ev: number;
  /** quanto il prezzo migliore si discosta dal consenso */
  vsConsensus: number;
  /**
   * 'anomalia' = il prezzo migliore e' molto sopra il consenso degli altri
   *   bookmaker. E' il segnale piu' affidabile perche' non dipende dal modello:
   *   e' il mercato che non e' d'accordo con se stesso.
   * 'modello'  = il prezzo e' in linea col consenso, l'EV nasce solo dal fatto
   *   che il modello dissente dal mercato. Sappiamo per misura che quando
   *   dissente ha torto piu' spesso del mercato, quindi vale poco.
   */
  kind: 'anomalia' | 'modello';
}

interface MatchPrediction {
  kickoff: string;
  league: string;
  home: string;
  away: string;
  lambdaHome: number;
  lambdaAway: number;
  probs: { '1': number; X: number; '2': number };
  unknownTeam: boolean;
  bets: Bet[];
}

/** Prezzi di un esito raccolti da tutti i bookmaker. */
type Quotes = { best: number; book: string; avg: number; n: number };

function summarize(values: Array<{ book: string; value: number }>): Quotes | null {
  if (!values.length) return null;
  const top = values.reduce((a, b) => (a.value >= b.value ? a : b));
  return {
    best: top.value,
    book: top.book,
    avg: values.reduce((s, v) => s + v.value, 0) / values.length,
    n: values.length,
  };
}

/** Estrae, per ogni esito di ogni mercato, l'ultima quota di ciascun bookmaker. */
function extractOdds(rows: any[]): Record<string, Quotes> {
  const latest = new Map<string, { value: number; ts: number; book: string }>();

  const keyOf = (row: any): string | null => {
    if (FULLTIME_MARKETS.has(row.market_description)) {
      const side = SIDE_OF[row.label];
      return side === undefined ? null : `1X2:${['1', 'X', '2'][side]}`;
    }
    if (row.market_id === 2) {
      const dc = DC_LABELS[row.label];
      return dc ? `DC:${dc}` : null;
    }
    if (row.market_id === 14 && (row.label === 'Yes' || row.label === 'No')) {
      return `GG:${row.label === 'Yes' ? 'GG' : 'NG'}`;
    }
    if (row.market_id === 80 && (row.label === 'Over' || row.label === 'Under')) {
      const t = parseFloat(String(row.total ?? '').replace(',', '.'));
      return ['1.5', '2.5', '3.5'].includes(String(t)) ? `OU${t}:${row.label}` : null;
    }
    return null;
  };

  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const ts = parseUpdate(row) ?? 0;
    const value = parseFloat(row.value ?? row.dp3 ?? '0');
    if (!(value > 1)) continue;
    const k = `${key}|${row.bookmaker_id}`;
    const prev = latest.get(k);
    if (!prev || ts > prev.ts) latest.set(k, { value, ts, book: String(row.bookmaker_id) });
  }

  const grouped: Record<string, Array<{ book: string; value: number }>> = {};
  for (const [k, v] of latest) {
    const key = k.split('|')[0];
    (grouped[key] = grouped[key] || []).push({ book: v.book, value: v.value });
  }

  const out: Record<string, Quotes> = {};
  for (const [key, values] of Object.entries(grouped)) {
    const q = summarize(values);
    if (q) out[key] = q;
  }
  return out;
}

async function main() {
  const days = parseInt(arg('--days', '2'), 10);
  const minEdge = parseFloat(arg('--min-edge', '0.02'));
  const jsonOut = arg('--json', '');

  /** oltre questo scarto dal consenso la quota e' considerata un errore del feed */
  const MAX_DEVIATION = parseFloat(arg('--max-deviation', '0.30'));
  /** da qui in su il prezzo e' un'anomalia sfruttabile, non un'opinione del modello */
  const ANOMALY_THRESHOLD = parseFloat(arg('--anomaly', '0.08'));
  const skippedOutliers: string[] = [];

  const now = new Date();
  const from = now.toISOString().slice(0, 10);
  const to = new Date(now.getTime() + (days - 1) * DAY_MS).toISOString().slice(0, 10);

  console.log('========================================================');
  console.log('PREDIZIONI  ' + from + (from === to ? '' : ' -> ' + to));
  console.log('========================================================\n');

  // 1. archivio: tutto quello che e' gia' stato giocato
  const history = await prisma.fixture.findMany({
    where: { status: FixtureStatus.FINISHED, homeGoals: { not: null }, awayGoals: { not: null } },
    select: {
      homeTeamId: true, awayTeamId: true, homeGoals: true, awayGoals: true,
      date: true, xg_home: true, xg_away: true,
    },
    orderBy: { date: 'asc' },
  });

  const matches: DCMatch[] = history.map(f => ({
    homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId,
    homeGoals: f.homeGoals!, awayGoals: f.awayGoals!,
    homeXg: f.xg_home, awayXg: f.xg_away,
    date: f.date,
  }));

  console.log(`Archivio: ${matches.length} partite fino al ${matches[matches.length - 1]?.date.toISOString().slice(0, 10)}`);

  // 2. stima, con gli stessi default del backtest
  // Stessi default del backtest: se cambiano li', cambiano qui.
  const params: DixonColesParams = fitDixonColes(matches, {
    xi: 0.002, iterations: 2500, target: 'blend', blendWeight: 0.35,
    teamRidge: 0.05, referenceDate: now,
  });
  console.log(`Modello: Dixon-Coles su ${params.teams} squadre  ` +
    `vantaggio casa x${Math.exp(params.gamma).toFixed(3)}  rho ${params.rho.toFixed(3)}\n`);

  // 3. partite in programma
  const client = getSportsmonksClient();
  const response: any = await client.get(`/fixtures/between/${from}/${to}`, {
    include: 'participants;league',
    per_page: '100',
  });
  const upcoming = (response?.data || []).filter((f: any) => ALLOWED_LEAGUES.includes(f.league_id));
  console.log(`Partite in calendario nelle leghe seguite: ${upcoming.length}\n`);
  if (!upcoming.length) { await prisma.$disconnect(); return; }

  // mappa apiId Sportmonks -> id interno, per usare le forze stimate
  const teams = await prisma.team.findMany({ select: { id: true, apiId: true, name: true } });
  const teamByApi = new Map(teams.map(t => [t.apiId, t]));

  const lastPlayed = new Map<number, Date>();
  for (const m of matches) {
    lastPlayed.set(m.homeTeamId, m.date);
    lastPlayed.set(m.awayTeamId, m.date);
  }

  const predictions: MatchPrediction[] = [];

  for (const fx of upcoming) {
    const home = (fx.participants || []).find((p: any) => p.meta?.location === 'home');
    const away = (fx.participants || []).find((p: any) => p.meta?.location === 'away');
    if (!home || !away) continue;

    const h = teamByApi.get(home.id);
    const a = teamByApi.get(away.id);
    const kickoff = new Date(String(fx.starting_at).replace(' ', 'T') + 'Z');

    const restOf = (id?: number) => {
      const prev = id ? lastPlayed.get(id) : undefined;
      return prev ? (kickoff.getTime() - prev.getTime()) / DAY_MS : null;
    };

    const p = h && a
      ? predict(params, h.id, a.id, 12, { home: restOf(h.id), away: restOf(a.id) })
      : null;
    if (!p) {
      console.log(`  (saltata: ${home.name} - ${away.name}, squadre non in archivio)`);
      continue;
    }

    // quote live
    let quotes: Record<string, Quotes> = {};
    try {
      const oddsResp: any = await client.get(`/fixtures/${fx.id}`, { include: 'odds' });
      quotes = extractOdds(oddsResp?.data?.odds || []);
    } catch {
      // senza quote la partita si predice comunque, ma non si consiglia niente
    }

    // tutti i lati giocabili, con la probabilita' del modello
    const candidates: Array<[string, string, number]> = [
      ['1X2', '1', p.prob1], ['1X2', 'X', p.probX], ['1X2', '2', p.prob2],
      ['DC', '1X', p.dc1X], ['DC', '12', p.dc12], ['DC', 'X2', p.dcX2],
      ['GG', 'GG', p.bttsYes], ['GG', 'NG', p.bttsNo],
      ['OU1.5', 'Over', p.over['1.5']], ['OU1.5', 'Under', p.under['1.5']],
      ['OU2.5', 'Over', p.over['2.5']], ['OU2.5', 'Under', p.under['2.5']],
      ['OU3.5', 'Over', p.over['3.5']], ['OU3.5', 'Under', p.under['3.5']],
    ];

    const bets: Bet[] = [];
    for (const [market, pick, modelProb] of candidates) {
      const q = quotes[`${market}:${pick}`];
      if (!q || q.n < 5) continue;

      const vsConsensus = q.best / q.avg - 1;

      // Un prezzo molto sopra il consenso di una decina di bookmaker non e' un
      // regalo, e' quasi sempre una riga sbagliata nel feed: quota riferita a
      // un altro mercato, valore non aggiornato, errore di battitura. Su
      // Gent-Club Brugge un book dava 3.60 dove gli altri davano 1.74, con
      // modello e mercato per una volta d'accordo: l'EV risultava +108% e
      // sarebbe stata una scommessa su un errore del feed.
      if (vsConsensus > MAX_DEVIATION) {
        skippedOutliers.push(`${home.name}-${away.name} ${market} ${pick}: ${q.best.toFixed(2)} contro consenso ${q.avg.toFixed(2)}`);
        continue;
      }

      const ev = modelProb * q.best - 1;
      if (ev < minEdge) continue;
      bets.push({
        market, pick, modelProb,
        marketProb: 1 / q.avg,
        bestOdds: q.best, bestBook: q.book,
        consensusOdds: q.avg,
        ev,
        vsConsensus,
        kind: vsConsensus >= ANOMALY_THRESHOLD ? 'anomalia' : 'modello',
      });
    }
    // Prima le anomalie di prezzo, che sono il segnale con evidenza dietro;
    // poi i disaccordi del modello, ordinati per valore atteso.
    bets.sort((x, y) => {
      if (x.kind !== y.kind) return x.kind === 'anomalia' ? -1 : 1;
      return y.ev - x.ev;
    });

    predictions.push({
      kickoff: kickoff.toISOString(),
      league: fx.league?.name || String(fx.league_id),
      home: home.name, away: away.name,
      lambdaHome: p.lambdaHome, lambdaAway: p.lambdaAway,
      probs: { '1': p.prob1, X: p.probX, '2': p.prob2 },
      unknownTeam: p.hasUnknownTeam,
      bets,
    });
  }

  // 4. stampa
  predictions.sort((x, y) => x.kickoff.localeCompare(y.kickoff));
  const pct = (v: number) => (v * 100).toFixed(1) + '%';

  for (const m of predictions) {
    const when = m.kickoff.slice(5, 10).split('-').reverse().join('/') + ' ' + m.kickoff.slice(11, 16);
    console.log(`${when}  ${m.league}`);
    console.log(`  ${m.home} - ${m.away}` + (m.unknownTeam ? '   [squadra senza storico: previsione debole]' : ''));
    console.log(`  gol attesi ${m.lambdaHome.toFixed(2)} - ${m.lambdaAway.toFixed(2)}   ` +
      `1 ${pct(m.probs['1'])}  X ${pct(m.probs.X)}  2 ${pct(m.probs['2'])}`);
    if (!m.bets.length) {
      console.log('  nessuna giocata con valore atteso sufficiente\n');
      continue;
    }
    for (const b of m.bets) {
      const tag = b.kind === 'anomalia' ? 'PREZZO' : 'modello';
      console.log(`  ${tag}  ${(b.market + ' ' + b.pick).padEnd(11)} ` +
        `${b.bestOdds.toFixed(2)} (book ${b.bestBook}, consenso ${b.consensusOdds.toFixed(2)}, ${(b.vsConsensus * 100).toFixed(1)}% sopra)   ` +
        `modello ${pct(b.modelProb)} vs mercato ${pct(b.marketProb)}   EV ${(b.ev >= 0 ? '+' : '') + (b.ev * 100).toFixed(1)}%`);
    }
    console.log('');
  }

  const all = predictions.flatMap(m => m.bets);
  const anomalies = all.filter(b => b.kind === 'anomalia');
  console.log('--------------------------------------------------------');
  console.log(`${predictions.length} partite analizzate, ${all.length} giocate con EV >= ${(minEdge * 100).toFixed(0)}%`);
  console.log(`  di cui ${anomalies.length} per anomalia di prezzo (PREZZO) e ${all.length - anomalies.length} per disaccordo del modello`);
  if (skippedOutliers.length) {
    console.log(`\n${skippedOutliers.length} quote scartate perche' oltre il ${(MAX_DEVIATION * 100).toFixed(0)}% sopra il consenso (probabile errore del feed):`);
    for (const o of skippedOutliers.slice(0, 8)) console.log('  ' + o);
    if (skippedOutliers.length > 8) console.log(`  ... e altre ${skippedOutliers.length - 8}`);
  }
  console.log('');
  console.log('COME LEGGERE QUESTE GIOCATE');
  console.log('  PREZZO   il bookmaker si discosta dal consenso degli altri. Non dipende dal');
  console.log('           modello: e\' il mercato che non e\' d\'accordo con se stesso.');
  console.log('  modello  il prezzo e\' in linea col mercato, l\'EV nasce solo dal fatto che il');
  console.log('           modello dissente. Misurato sulla stagione 2025-26, quando il modello');
  console.log('           dissente dal mercato sbaglia piu\' spesso di lui: log-loss 0.998');
  console.log('           contro 0.977, e a 15 punti di scarto azzecca il 38% contro il 49%.');
  console.log('           Sono le giocate meno affidabili, non le migliori.');

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify({ generatedAt: now.toISOString(), params: {
      mu: params.mu, gamma: params.gamma, rho: params.rho, teams: params.teams, matches: params.matches,
    }, predictions }, null, 2));
    console.log(`\nJSON scritto in ${jsonOut}`);
  }

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('Errore:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
