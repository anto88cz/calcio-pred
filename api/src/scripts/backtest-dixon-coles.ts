/**
 * Backtest walk-forward del Dixon-Coles.
 *
 * Per ogni settimana della stagione si ristima il modello sulle sole partite
 * concluse PRIMA di quella settimana, e con quei parametri si predicono le
 * partite della settimana. Nessun dato successivo entra mai nella stima: e' la
 * stessa condizione in cui si troverebbe il modello il venerdi' sera.
 *
 * Si ristima ogni settimana e non a ogni partita perche' attacco e difesa si
 * muovono lentamente: rifare la stima 1751 volte costerebbe molto e cambierebbe
 * i parametri di pochissimo.
 *
 * Le quote di chiusura vengono riprese da un report gia' prodotto da
 * run-backtest.ts, tramite l'id della partita: cosi' il confronto e' sulle
 * stesse quote e non serve nessuna chiamata all'API.
 *
 * Uso:
 *   npx tsx src/scripts/backtest-dixon-coles.ts
 *   npx tsx src/scripts/backtest-dixon-coles.ts --xi 0.005 --out backtest-dc.json
 *   npx tsx src/scripts/backtest-dixon-coles.ts --tune          (cerca xi)
 */

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, FixtureStatus } from '@prisma/client';
import { fitDixonColes, predict, DCMatch, DixonColesParams, FitTarget } from '../services/prediction/dixon-coles';

const prisma = new PrismaClient();

type Outcome = '1' | 'X' | '2';
const OUTCOMES: Outcome[] = ['1', 'X', '2'];
const DAY_MS = 24 * 60 * 60 * 1000;

interface Args {
  seasonStart: string;
  oddsFrom: string;
  out: string;
  xi: number;
  tune: boolean;
  iterations: number;
  target: FitTarget;
  blendWeight: number;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string, def: string) => {
    const i = a.indexOf(flag);
    return i >= 0 && a[i + 1] ? a[i + 1] : def;
  };
  return {
    seasonStart: get('--season-start', '2025-08-01'),
    oddsFrom: get('--odds-from', 'backtest-full-2025-26.json'),
    out: get('--out', 'backtest-dixon-coles.json'),
    // scelto con --tune sulla stagione 2025-26: emivita ~347 giorni.
    // La curva e' piatta fra 0 e 0.003 e peggiora nettamente sopra: pesare
    // molto le partite recenti, come faceva il vecchio motore, danneggia.
    xi: parseFloat(get('--xi', '0.002')),
    tune: a.includes('--tune'),
    iterations: parseInt(get('--iterations', '2500'), 10),
    // Default misurati sulla stagione 2025-26, log-loss walk-forward:
    // gol 1.0290, xG 1.0031, blend 0.15 -> 1.0013, blend 0.35 -> 1.0009,
    // blend 0.50 -> 1.0021. L'ottimo e' piatto attorno a 0.35.
    target: (get('--target', 'blend') as FitTarget),
    blendWeight: parseFloat(get('--blend-weight', '0.35')),
  };
}

function logLoss(p: Record<Outcome, number>, actual: Outcome): number {
  return -Math.log(Math.max(p[actual], 1e-15));
}

function brier(p: Record<Outcome, number>, actual: Outcome): number {
  let s = 0;
  for (const o of OUTCOMES) s += Math.pow(p[o] - (o === actual ? 1 : 0), 2);
  return s / 3;
}

function devig(o: { home: number; draw: number; away: number }): Record<Outcome, number> {
  const r = { '1': 1 / o.home, 'X': 1 / o.draw, '2': 1 / o.away } as Record<Outcome, number>;
  const s = r['1'] + r['X'] + r['2'];
  return { '1': r['1'] / s, 'X': r['X'] / s, '2': r['2'] / s };
}

/**
 * Etichetta di forza, per poter riusare i filtri del simulatore.
 * E' solo la probabilita' massima messa in fasce: non un giudizio del modello.
 */
function strengthOf(maxProb: number): string {
  if (maxProb >= 0.65) return 'STRONG';
  if (maxProb >= 0.45) return 'MEDIUM';
  return 'NEUTRAL';
}

async function main() {
  const args = parseArgs();

  const fixtures = await prisma.fixture.findMany({
    where: { status: FixtureStatus.FINISHED, homeGoals: { not: null }, awayGoals: { not: null } },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { date: 'asc' },
  });

  const all: (DCMatch & { row: any })[] = fixtures.map(f => ({
    homeTeamId: f.homeTeamId,
    awayTeamId: f.awayTeamId,
    homeGoals: f.homeGoals!,
    awayGoals: f.awayGoals!,
    homeXg: f.xg_home,
    awayXg: f.xg_away,
    date: f.date,
    row: f,
  }));

  const seasonStart = new Date(args.seasonStart);
  const target = all.filter(m => m.date >= seasonStart);
  const history = all.filter(m => m.date < seasonStart);

  console.log('========================================');
  console.log('BACKTEST WALK-FORWARD  Dixon-Coles MLE');
  console.log('========================================');
  console.log(`Partite in archivio:  ${all.length}`);
  console.log(`Storico pre-stagione: ${history.length}  (${history[0]?.date.toISOString().slice(0, 10)} -> ${history[history.length - 1]?.date.toISOString().slice(0, 10)})`);
  const xgCoverage = all.filter(m => m.homeXg != null && m.awayXg != null).length;
  console.log(`Stima su:             ${args.target}${args.target === 'blend' ? ` (gol ${args.blendWeight})` : ''}   xG disponibile su ${xgCoverage}/${all.length} partite`);
  console.log(`Da predire:           ${target.length}  (${target[0]?.date.toISOString().slice(0, 10)} -> ${target[target.length - 1]?.date.toISOString().slice(0, 10)})`);

  // quote di chiusura da un report esistente
  const oddsPath = path.isAbsolute(args.oddsFrom) ? args.oddsFrom : path.join(process.cwd(), args.oddsFrom);
  const oddsByFixture = new Map<number, any>();
  if (fs.existsSync(oddsPath)) {
    const prev = JSON.parse(fs.readFileSync(oddsPath, 'utf-8'));
    for (const r of prev.results) if (r.closingOdds) oddsByFixture.set(r.fixtureId, r.closingOdds);
    console.log(`Quote di chiusura:    ${oddsByFixture.size} partite (da ${path.basename(oddsPath)})`);
  } else {
    console.log(`Quote di chiusura:    nessuna (${args.oddsFrom} non trovato)`);
  }

  /** Un passaggio completo walk-forward con un dato xi. */
  const walkForward = (xi: number, verbose: boolean) => {
    const results: any[] = [];
    let fitted = 0;
    let params: DixonColesParams | null = null;

    // settimane a partire dall'inizio stagione
    const weeks = new Map<number, typeof target>();
    for (const m of target) {
      const w = Math.floor((m.date.getTime() - seasonStart.getTime()) / (7 * DAY_MS));
      if (!weeks.has(w)) weeks.set(w, []);
      weeks.get(w)!.push(m);
    }

    for (const w of [...weeks.keys()].sort((a, b) => a - b)) {
      const matchesOfWeek = weeks.get(w)!;
      const cutoff = new Date(seasonStart.getTime() + w * 7 * DAY_MS);

      const trainingSet = all.filter(m => m.date < cutoff);
      if (trainingSet.length < 200) continue;

      params = fitDixonColes(trainingSet, {
        xi,
        iterations: args.iterations,
        referenceDate: cutoff,
        target: args.target,
        blendWeight: args.blendWeight,
      });
      fitted++;
      if (verbose && fitted % 10 === 0) {
        console.log(`  settimana ${String(w).padStart(2)}  stima su ${String(trainingSet.length).padStart(4)} partite  gamma=${params.gamma.toFixed(3)} rho=${params.rho.toFixed(3)}`);
      }

      for (const m of matchesOfWeek) {
        const p = predict(params, m.homeTeamId, m.awayTeamId);
        const probs: Record<Outcome, number> = { '1': p.prob1, 'X': p.probX, '2': p.prob2 };
        const actual: Outcome = m.homeGoals > m.awayGoals ? '1' : m.homeGoals < m.awayGoals ? '2' : 'X';
        const pick = OUTCOMES.reduce((a, b) => (probs[a] >= probs[b] ? a : b));
        const maxProb = probs[pick];
        const totalGoals = m.homeGoals + m.awayGoals;

        results.push({
          fixtureId: m.row.id,
          date: m.date.toISOString().split('T')[0],
          homeTeam: m.row.homeTeam.name,
          awayTeam: m.row.awayTeam.name,
          league: m.row.leagueName,
          actualResult: { homeGoals: m.homeGoals, awayGoals: m.awayGoals, outcome: actual },
          prediction: {
            prob1: p.prob1, probX: p.probX, prob2: p.prob2,
            predictedOutcome: pick,
            confidence: maxProb,
            strength: strengthOf(maxProb),
            over25: p.over['2.5'],
            bttsYes: p.bttsYes,
            lambdaHome: p.lambdaHome,
            lambdaAway: p.lambdaAway,
            hasUnknownTeam: p.hasUnknownTeam,
          },
          closingOdds: oddsByFixture.get(m.row.id) ?? null,
          correct1X2: pick === actual,
          correctOver25: (p.over['2.5'] >= 0.5) === (totalGoals > 2.5),
          correctBtts: (p.bttsYes >= 0.5) === (m.homeGoals > 0 && m.awayGoals > 0),
          brierScore: brier(probs, actual),
        });
      }
    }
    return { results, fits: fitted, params };
  };

  let xi = args.xi;

  if (args.tune) {
    // xi si sceglie confrontando il log-loss fuori campione, non a occhio.
    console.log('\n--- RICERCA DEL DECADIMENTO TEMPORALE xi ---');
    console.log('  xi        emivita   log-loss   accuracy');
    let bestXi = 0, bestLoss = Infinity;
    for (const candidate of [0, 0.001, 0.002, 0.003, 0.005, 0.008, 0.012]) {
      const { results } = walkForward(candidate, false);
      const ll = results.reduce((s, r) => s + logLoss({ '1': r.prediction.prob1, 'X': r.prediction.probX, '2': r.prediction.prob2 }, r.actualResult.outcome), 0) / results.length;
      const acc = (results.filter(r => r.correct1X2).length / results.length) * 100;
      const halfLife = candidate > 0 ? Math.log(2) / candidate : Infinity;
      console.log(`  ${candidate.toFixed(4)}  ${(halfLife === Infinity ? 'nessuno' : halfLife.toFixed(0) + ' gg').padStart(8)}   ${ll.toFixed(4)}   ${acc.toFixed(1)}%`);
      if (ll < bestLoss) { bestLoss = ll; bestXi = candidate; }
    }
    xi = bestXi;
    console.log(`  scelto xi = ${xi}`);
  }

  console.log(`\n--- WALK-FORWARD  xi = ${xi} ---`);
  const { results, fits, params } = walkForward(xi, true);
  console.log(`  ${fits} ristime, ${results.length} partite predette`);

  // metriche
  const withOdds = results.filter(r => r.closingOdds);
  const probsOf = (r: any): Record<Outcome, number> => ({ '1': r.prediction.prob1, 'X': r.prediction.probX, '2': r.prediction.prob2 });

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const modelLL = mean(withOdds.map(r => logLoss(probsOf(r), r.actualResult.outcome)));
  const modelBrier = mean(withOdds.map(r => brier(probsOf(r), r.actualResult.outcome)));
  const modelAcc = (withOdds.filter(r => r.correct1X2).length / withOdds.length) * 100;
  const marketLL = mean(withOdds.map(r => logLoss(devig(r.closingOdds), r.actualResult.outcome)));
  const marketBrier = mean(withOdds.map(r => brier(devig(r.closingOdds), r.actualResult.outcome)));
  const marketAcc = (withOdds.filter(r => {
    const m = devig(r.closingOdds);
    return OUTCOMES.reduce((a, b) => (m[a] >= m[b] ? a : b)) === r.actualResult.outcome;
  }).length / withOdds.length) * 100;
  const avgMargin = mean(withOdds.map(r => r.closingOdds.overround - 1));

  console.log('\n--- MODELLO vs MERCATO (closing line de-viggata) ---');
  console.log(`  partite con quote: ${withOdds.length}   margine medio ${(avgMargin * 100).toFixed(2)}%`);
  console.log('                    modello   mercato    delta');
  console.log(`  Log-loss:         ${modelLL.toFixed(4)}    ${marketLL.toFixed(4)}    ${(modelLL - marketLL >= 0 ? '+' : '') + (modelLL - marketLL).toFixed(4)}`);
  console.log(`  Brier:            ${modelBrier.toFixed(4)}    ${marketBrier.toFixed(4)}    ${(modelBrier - marketBrier >= 0 ? '+' : '') + (modelBrier - marketBrier).toFixed(4)}`);
  console.log(`  Accuracy 1X2:     ${modelAcc.toFixed(2)}%    ${marketAcc.toFixed(2)}%`);
  console.log(modelLL < marketLL
    ? '  Il modello batte il mercato sul log-loss'
    : '  Il mercato e meglio sul log-loss: nessun edge dimostrato');

  console.log('\n--- ALTRI MERCATI ---');
  console.log(`  Over/Under 2.5:   ${((results.filter(r => r.correctOver25).length / results.length) * 100).toFixed(2)}%`);
  console.log(`  BTTS:             ${((results.filter(r => r.correctBtts).length / results.length) * 100).toFixed(2)}%`);

  if (params) {
    console.log('\n--- PARAMETRI DELL ULTIMA STIMA ---');
    console.log(`  stima su ${params.target}${params.matchesWithXg !== undefined ? `, ${params.matchesWithXg} partite con xG` : ''}`);
    console.log(`  mu    ${params.mu.toFixed(4)}   (gol medi ${Math.exp(params.mu).toFixed(2)} per squadra)`);
    console.log(`  gamma ${params.gamma.toFixed(4)}   (vantaggio casa x${Math.exp(params.gamma).toFixed(3)})`);
    console.log(`  rho   ${params.rho.toFixed(4)}`);
    const ranked = Object.entries(params.attack).sort((a, b) => b[1] - a[1]);
    const nameOf = (id: string) => fixtures.find(f => f.homeTeamId === Number(id))?.homeTeam.name
      ?? fixtures.find(f => f.awayTeamId === Number(id))?.awayTeam.name ?? id;
    console.log('  attacchi migliori: ' + ranked.slice(0, 5).map(([id, v]) => `${nameOf(id)} ${v.toFixed(2)}`).join(', '));
    console.log('  difese migliori:   ' + Object.entries(params.defence).sort((a, b) => a[1] - b[1]).slice(0, 5).map(([id, v]) => `${nameOf(id)} ${v.toFixed(2)}`).join(', '));
  }

  const byLeague: Record<string, any> = {};
  for (const r of results) {
    byLeague[r.league] = byLeague[r.league] || { matches: 0, hits: 0, brier: 0 };
    byLeague[r.league].matches++;
    byLeague[r.league].hits += r.correct1X2 ? 1 : 0;
    byLeague[r.league].brier += r.brierScore;
  }
  console.log('\n--- PER CAMPIONATO ---');
  for (const [league, v] of Object.entries<any>(byLeague)) {
    console.log(`  ${league.padEnd(18)} accuracy ${((v.hits / v.matches) * 100).toFixed(1)}%   Brier ${(v.brier / v.matches).toFixed(3)}   n=${v.matches}`);
  }

  const report = {
    config: { model: 'dixon-coles-mle', target: args.target, blendWeight: args.blendWeight, xi, iterations: args.iterations, refits: fits },
    summary: {
      totalMatches: results.length,
      dateRange: `${results[0]?.date} to ${results[results.length - 1]?.date}`,
      leagues: [...new Set(results.map(r => r.league))],
    },
    accuracy: {
      overall1X2: (results.filter(r => r.correct1X2).length / results.length) * 100,
      byStrength: {
        GIOCALA: 0,
        STRONG: pct(results.filter(r => r.prediction.strength === 'STRONG')),
        MEDIUM: pct(results.filter(r => r.prediction.strength === 'MEDIUM')),
        NEUTRAL: pct(results.filter(r => r.prediction.strength === 'NEUTRAL')),
      },
      overUnder25: (results.filter(r => r.correctOver25).length / results.length) * 100,
      btts: (results.filter(r => r.correctBtts).length / results.length) * 100,
    },
    brierScore: { overall: mean(results.map(r => r.brierScore)), by1X2: {} },
    marketComparison: {
      matchesWithOdds: withOdds.length,
      avgMargin,
      model: { brier: modelBrier, logLoss: modelLL, accuracy: modelAcc },
      market: { brier: marketBrier, logLoss: marketLL, accuracy: marketAcc },
      delta: { brier: modelBrier - marketBrier, logLoss: modelLL - marketLL },
      beatsMarket: modelLL < marketLL,
    },
    results,
    byLeague,
  };

  fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
  console.log(`\nReport scritto in: ${args.out}`);
  console.log('Utilizzabile da simulate-bankroll.ts e analyze-calibration.ts.\n');

  await prisma.$disconnect();
}

function pct(rows: any[]): number {
  if (rows.length === 0) return 0;
  return (rows.filter(r => r.correct1X2).length / rows.length) * 100;
}

main().catch(async e => {
  console.error('Errore:', e);
  await prisma.$disconnect();
  process.exit(1);
});
