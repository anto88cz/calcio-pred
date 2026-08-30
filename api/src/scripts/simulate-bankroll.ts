/**
 * Simulazione di un conto reale sui risultati di un backtest.
 *
 * Legge un report prodotto da run-backtest.ts e ci fa girare sopra una
 * strategia di puntata, partita per partita in ordine cronologico, partendo da
 * un capitale dato. Non ricalcola nessuna predizione: quelle sono gia' nel
 * report, con le quote di chiusura reali. Per questo si puo' lanciare quante
 * volte si vuole a costo zero e confrontare configurazioni diverse.
 *
 * Uso:
 *   npx tsx src/scripts/simulate-bankroll.ts backtest-full-2025-26.json
 *   npx tsx src/scripts/simulate-bankroll.ts report.json --stake kelly --kelly 0.25 --min-edge 0.05
 *   npx tsx src/scripts/simulate-bankroll.ts report.json --split 2026-01-01
 *
 * OPZIONI
 *   --mode <m>         singole | multipla     (default singole)
 *                      multipla replica la strategia di backtest-multiple.js:
 *                      una schedina al giorno, 1-N eventi, quota combinata
 *                      il piu' vicino possibile a --target-odds
 *   --target-odds <q>  quota combinata cercata, con multipla (default 1.4)
 *   --max-events <n>   eventi massimi per schedina, con multipla (default 3)
 *   --stake-base <b>   initial | current: se la puntata flat e' una % del
 *                      capitale iniziale o di quello corrente (default initial;
 *                      backtest-multiple.js usava current, che e' composto)
 *   --bankroll <n>     capitale iniziale in euro (default 100)
 *   --stake <tipo>     flat | kelly            (default flat)
 *   --flat <pct>       % del capitale INIZIALE per giocata, con flat (default 2)
 *   --kelly <f>        frazione di Kelly, con kelly (default 0.25)
 *   --max-stake <pct>  tetto per singola giocata, % del capitale (default 5)
 *   --min-edge <e>     EV minimo per puntare, es. 0.05 = +5% (default 0)
 *   --min-odds <q>     quota minima accettata (default 1.0)
 *   --max-odds <q>     quota massima accettata (default 100)
 *   --strength <s>     ALL | STRONG (GIOCALA+STRONG)   (default ALL)
 *   --odds <o>         avg | best  (default avg)
 *                      avg = media dei bookmaker, il consenso: nessuno incassa
 *                      quel prezzo. best = quota migliore disponibile, che e'
 *                      cio' che si ottiene facendo line shopping. Il margine
 *                      del banco passa dal 5.76% al -0.18% sul nostro campione,
 *                      quindi la differenza sul ROI e' enorme.
 *   --split <data>     divide in periodo A (<) e periodo B (>=) e riporta i due
 *                      separatamente: serve per non farsi ingannare da una
 *                      strategia tarata sullo stesso campione che la valuta
 *   --csv <file>       scrive la curva del capitale
 */

import * as fs from 'fs';
import * as path from 'path';

interface ReportResult {
  fixtureId: number;
  date: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  actualResult: { homeGoals: number; awayGoals: number; outcome: '1' | 'X' | '2' };
  prediction: {
    prob1: number; probX: number; prob2: number;
    predictedOutcome: '1' | 'X' | '2';
    confidence: number; strength: string;
  };
  closingOdds: {
    home: number; draw: number; away: number;
    bookmakers: number; overround: number;
    /** miglior prezzo per esito, presente se il report e' passato da refresh-odds.ts */
    best?: { home: number; draw: number; away: number };
    overroundBest?: number;
  } | null;
  correct1X2: boolean;
}

interface Args {
  file: string;
  mode: 'singole' | 'multipla';
  targetOdds: number;
  maxEvents: number;
  stakeBase: 'initial' | 'current';
  bankroll: number;
  stake: 'flat' | 'kelly';
  flatPct: number;
  kellyFraction: number;
  maxStakePct: number;
  minEdge: number;
  minOdds: number;
  maxOdds: number;
  strength: 'ALL' | 'STRONG';
  /**
   * Quale prezzo si incassa: 'avg' e' la media dei bookmaker, che e' il
   * consenso del mercato ma non un prezzo ottenibile; 'best' e' la quota
   * migliore disponibile, che e' quella a cui si scommette davvero.
   */
  odds: 'avg' | 'best';
  split?: string;
  csv?: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const a: Args = {
    file: argv[0] && !argv[0].startsWith('--') ? argv[0] : 'backtest-full-2025-26.json',
    mode: 'singole',
    targetOdds: 1.4,
    maxEvents: 3,
    stakeBase: 'initial',
    bankroll: 100,
    stake: 'flat',
    flatPct: 2,
    kellyFraction: 0.25,
    maxStakePct: 5,
    minEdge: 0,
    minOdds: 1.0,
    maxOdds: 100,
    strength: 'ALL',
    odds: 'avg',
  };
  const num = (i: number) => parseFloat(argv[i + 1]);
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--mode': a.mode = argv[i + 1] === 'multipla' ? 'multipla' : 'singole'; i++; break;
      case '--target-odds': a.targetOdds = num(i); i++; break;
      case '--max-events': a.maxEvents = Math.max(1, Math.round(num(i))); i++; break;
      case '--stake-base': a.stakeBase = argv[i + 1] === 'current' ? 'current' : 'initial'; i++; break;
      case '--bankroll': a.bankroll = num(i); i++; break;
      case '--stake': a.stake = argv[i + 1] === 'kelly' ? 'kelly' : 'flat'; i++; break;
      case '--flat': a.flatPct = num(i); i++; break;
      case '--kelly': a.kellyFraction = num(i); i++; break;
      case '--max-stake': a.maxStakePct = num(i); i++; break;
      case '--min-edge': a.minEdge = num(i); i++; break;
      case '--min-odds': a.minOdds = num(i); i++; break;
      case '--max-odds': a.maxOdds = num(i); i++; break;
      case '--strength': a.strength = argv[i + 1] === 'STRONG' ? 'STRONG' : 'ALL'; i++; break;
      case '--odds': a.odds = argv[i + 1] === 'best' ? 'best' : 'avg'; i++; break;
      case '--split': a.split = argv[i + 1]; i++; break;
      case '--csv': a.csv = argv[i + 1]; i++; break;
    }
  }
  return a;
}

/** Un evento singolo giocabile: l'esito scelto dal modello su una partita. */
interface Leg {
  date: string;
  match: string;
  league: string;
  pick: '1' | 'X' | '2';
  modelProb: number;
  marketProb: number;
  odds: number;
  won: boolean;
}

/** Una giocata: una gamba sola (singola) o piu' gambe (multipla). */
interface Bet {
  date: string;
  legs: Leg[];
  odds: number;
  modelProb: number;
  marketProb: number;
  edge: number;
  stake: number;
  won: boolean;
  profit: number;
  bankrollAfter: number;
}

/**
 * De-vig proporzionale, per sapere quanto il mercato dava davvero all'esito
 * scelto: l'edge va misurato contro la probabilita' del banco senza margine,
 * altrimenti si scambia il margine per valore.
 */
function devig(o: { home: number; draw: number; away: number }) {
  const r1 = 1 / o.home, rX = 1 / o.draw, r2 = 1 / o.away;
  const s = r1 + rX + r2;
  return { '1': r1 / s, 'X': rX / s, '2': r2 / s };
}

/** Trasforma una partita del report nell'evento giocabile scelto dal modello. */
function toLeg(r: ReportResult, a: Args): (Leg & { edge: number }) | null {
  if (!r.closingOdds) return null;
  if (a.strength === 'STRONG' && r.prediction.strength !== 'GIOCALA' && r.prediction.strength !== 'STRONG') return null;

  const pick = r.prediction.predictedOutcome;
  const priced = a.odds === 'best' && r.closingOdds.best ? r.closingOdds.best : r.closingOdds;
  const odds = pick === '1' ? priced.home : pick === 'X' ? priced.draw : priced.away;
  if (!odds || odds <= 1) return null;

  const modelProb = pick === '1' ? r.prediction.prob1 : pick === 'X' ? r.prediction.probX : r.prediction.prob2;
  const marketProb = devig(r.closingOdds)[pick];

  return {
    date: r.date,
    match: `${r.homeTeam} - ${r.awayTeam}`,
    league: r.league,
    pick,
    modelProb,
    marketProb,
    odds,
    won: r.correct1X2,
    edge: modelProb * odds - 1,
  };
}

/** Una schedina proposta, prima di sapere quanto ci si punta sopra. */
interface Slip {
  date: string;
  legs: Leg[];
  odds: number;
  modelProb: number;
  marketProb: number;
  edge: number;
}

function slipFromLegs(legs: Leg[]): Slip {
  // Quota e probabilita' combinate assumendo indipendenza fra gli eventi.
  // E' l'assunzione che fa il bookmaker e che faceva backtest-multiple.js, ma
  // e' falsa quando gli eventi sono correlati (stessa giornata, stessa lega,
  // meteo, motivazioni di classifica): la probabilita' combinata reale e'
  // diversa da questo prodotto, di solito piu' bassa per esiti simili.
  const odds = legs.reduce((p, l) => p * l.odds, 1);
  const modelProb = legs.reduce((p, l) => p * l.modelProb, 1);
  const marketProb = legs.reduce((p, l) => p * l.marketProb, 1);
  return {
    date: legs[0].date,
    legs,
    odds,
    modelProb,
    marketProb,
    edge: modelProb * odds - 1,
  };
}

/**
 * Costruisce le schedine secondo la modalita' scelta.
 *
 * singole:  una giocata per partita che supera i filtri.
 * multipla: una sola schedina al giorno, cercando la combinazione di 1..N
 *           eventi la cui quota totale e' piu' vicina a --target-odds e resta
 *           dentro [--min-odds, --max-odds]. E' la logica di
 *           backtest-multiple.js, con la differenza che qui gli eventi vengono
 *           da predizioni senza look-ahead e le quote sono quelle di chiusura.
 */
function buildSlips(results: ReportResult[], a: Args): Slip[] {
  const legs = results
    .map(r => toLeg(r, a))
    .filter((l): l is Leg & { edge: number } => l !== null);

  if (a.mode === 'singole') {
    return legs
      .filter(l => l.odds >= a.minOdds && l.odds <= a.maxOdds && l.edge >= a.minEdge)
      .sort((x, y) => x.date.localeCompare(y.date))
      .map(l => slipFromLegs([l]));
  }

  // multipla: raggruppa per giorno
  const byDay = new Map<string, (Leg & { edge: number })[]>();
  for (const l of legs) {
    const day = l.date.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(l);
  }

  const slips: Slip[] = [];

  for (const day of [...byDay.keys()].sort()) {
    // Ordinati per valore atteso decrescente, come faceva lo script originale.
    const candidates = byDay.get(day)!
      .filter(l => l.edge >= a.minEdge)
      .sort((x, y) => y.edge - x.edge)
      .slice(0, 15); // oltre i primi 15 la ricerca esplode senza aggiungere nulla

    let best: Slip | null = null;
    let bestDistance = Infinity;

    const consider = (combo: Leg[]) => {
      const slip = slipFromLegs(combo);
      if (slip.odds < a.minOdds || slip.odds > a.maxOdds) return;
      const distance = Math.abs(slip.odds - a.targetOdds);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = slip;
      }
    };

    for (let i = 0; i < candidates.length; i++) {
      consider([candidates[i]]);
      if (a.maxEvents < 2) continue;
      for (let j = i + 1; j < candidates.length; j++) {
        consider([candidates[i], candidates[j]]);
        if (a.maxEvents < 3) continue;
        for (let k = j + 1; k < candidates.length; k++) {
          consider([candidates[i], candidates[j], candidates[k]]);
        }
      }
    }

    if (best) slips.push(best);
  }

  return slips;
}

function simulate(results: ReportResult[], a: Args) {
  const slips = buildSlips(results, a);

  let bankroll = a.bankroll;
  let peak = a.bankroll;
  let maxDrawdown = 0;
  let totalStaked = 0;
  let wins = 0;
  let losingStreak = 0;
  let worstStreak = 0;
  let sumOdds = 0;
  let sumEdge = 0;
  let sumGap = 0;
  let legCount = 0;

  const bets: Bet[] = [];

  for (const slip of slips) {
    let stake: number;
    if (a.stake === 'flat') {
      const base = a.stakeBase === 'current' ? bankroll : a.bankroll;
      stake = base * (a.flatPct / 100);
    } else {
      const b = slip.odds - 1;
      const kelly = (b * slip.modelProb - (1 - slip.modelProb)) / b;
      if (kelly <= 0) continue;
      stake = bankroll * kelly * a.kellyFraction;
    }

    stake = Math.min(stake, bankroll * (a.maxStakePct / 100), bankroll);
    if (stake < 0.01) break; // conto esaurito: non si punta piu'

    const won = slip.legs.every(l => l.won);
    const profit = won ? stake * (slip.odds - 1) : -stake;

    bankroll += profit;
    totalStaked += stake;
    if (won) { wins++; losingStreak = 0; }
    else { losingStreak++; worstStreak = Math.max(worstStreak, losingStreak); }

    peak = Math.max(peak, bankroll);
    maxDrawdown = Math.max(maxDrawdown, (peak - bankroll) / peak);
    sumOdds += slip.odds;
    sumEdge += slip.edge;
    sumGap += slip.modelProb - slip.marketProb;
    legCount += slip.legs.length;

    bets.push({
      date: slip.date,
      legs: slip.legs,
      odds: slip.odds,
      modelProb: slip.modelProb,
      marketProb: slip.marketProb,
      edge: slip.edge,
      stake, won, profit,
      bankrollAfter: bankroll,
    });
  }

  const n = bets.length;
  return {
    bets,
    n,
    finalBankroll: bankroll,
    profit: bankroll - a.bankroll,
    totalStaked,
    roiOnTurnover: totalStaked > 0 ? ((bankroll - a.bankroll) / totalStaked) * 100 : 0,
    roiOnBankroll: ((bankroll - a.bankroll) / a.bankroll) * 100,
    hitRate: n > 0 ? (wins / n) * 100 : 0,
    avgOdds: n > 0 ? sumOdds / n : 0,
    avgEdge: n > 0 ? (sumEdge / n) * 100 : 0,
    avgProbGap: n > 0 ? (sumGap / n) * 100 : 0,
    avgLegs: n > 0 ? legCount / n : 0,
    maxDrawdown: maxDrawdown * 100,
    worstStreak,
    busted: bankroll < 0.01,
  };
}

function printBlock(title: string, s: ReturnType<typeof simulate>, a: Args) {
  console.log(`\n=== ${title} ===`);
  if (s.n === 0) {
    console.log('  Nessuna giocata: i filtri non lasciano passare niente.');
    return;
  }
  console.log(`  Giocate:            ${s.n}`);
  console.log(`  Capitale finale:    ${s.finalBankroll.toFixed(2)} EUR  (partenza ${a.bankroll.toFixed(2)})`);
  console.log(`  Profitto:           ${s.profit >= 0 ? '+' : ''}${s.profit.toFixed(2)} EUR`);
  console.log(`  Totale puntato:     ${s.totalStaked.toFixed(2)} EUR`);
  console.log(`  ROI sul giocato:    ${s.roiOnTurnover >= 0 ? '+' : ''}${s.roiOnTurnover.toFixed(2)}%   <- la metrica che conta`);
  console.log(`  Rendimento conto:   ${s.roiOnBankroll >= 0 ? '+' : ''}${s.roiOnBankroll.toFixed(2)}%`);
  console.log(`  Vincenti:           ${s.hitRate.toFixed(1)}%`);
  console.log(`  Quota media:        ${s.avgOdds.toFixed(2)}${a.mode === 'multipla' ? `  (${s.avgLegs.toFixed(1)} eventi per schedina)` : ''}`);
  console.log(`  EV medio dichiarato:${s.avgEdge >= 0 ? '+' : ''}${s.avgEdge.toFixed(2)}%`);
  console.log(`  Scarto dal mercato: ${s.avgProbGap >= 0 ? '+' : ''}${s.avgProbGap.toFixed(2)} punti di probabilita'`);
  console.log(`  Drawdown massimo:   -${s.maxDrawdown.toFixed(1)}%`);
  console.log(`  Serie nera:         ${s.worstStreak} perse di fila`);
  if (s.busted) console.log('  CONTO AZZERATO');
}

function main() {
  const a = parseArgs();
  const file = path.isAbsolute(a.file) ? a.file : path.join(process.cwd(), a.file);
  if (!fs.existsSync(file)) {
    console.error(`Report non trovato: ${file}`);
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const results: ReportResult[] = report.results;

  console.log('========================================');
  console.log('SIMULAZIONE CONTO');
  console.log('========================================');
  console.log(`Report:      ${path.basename(file)}  (${results.length} partite)`);
  console.log(`Periodo:     ${report.summary.dateRange}`);
  console.log(`Capitale:    ${a.bankroll} EUR`);
  console.log(`Modalita':   ${a.mode}${a.mode === 'multipla' ? `, 1-${a.maxEvents} eventi, quota obiettivo ${a.targetOdds}` : ''}`);
  console.log(`Staking:     ${a.stake === 'flat' ? `flat ${a.flatPct}% del capitale ${a.stakeBase === 'current' ? 'CORRENTE (composto)' : 'iniziale'}` : `Kelly x${a.kellyFraction}`} (tetto ${a.maxStakePct}%)`);
  console.log(`Filtri:      EV >= ${(a.minEdge * 100).toFixed(1)}%, quota ${a.minOdds}-${a.maxOdds}, strength ${a.strength}`);
  const sampleOdds = results.find(r => r.closingOdds)?.closingOdds;
  const hasBest = !!sampleOdds?.best;
  if (a.odds === 'best' && !hasBest) {
    console.log('\nATTENZIONE: il report non contiene le quote migliori.');
    console.log('Lanciare prima: npx tsx src/scripts/refresh-odds.ts <report>\n');
  }
  const marginRows = results.filter(r => r.closingOdds);
  const marginOf = (r: ReportResult) =>
    (a.odds === 'best' ? r.closingOdds!.overroundBest ?? r.closingOdds!.overround : r.closingOdds!.overround) - 1;
  const avgMargin = marginRows.length
    ? marginRows.reduce((s2, r) => s2 + marginOf(r), 0) / marginRows.length
    : 0;
  console.log(`Prezzo:      ${a.odds === 'best' ? 'quota MIGLIORE disponibile' : 'media dei bookmaker'}, margine medio ${(avgMargin * 100).toFixed(2)}%`);

  const full = simulate(results, a);
  printBlock('STAGIONE COMPLETA', full, a);

  if (a.split) {
    const before = results.filter(r => r.date < a.split!);
    const after = results.filter(r => r.date >= a.split!);
    printBlock(`PERIODO A  (< ${a.split})`, simulate(before, a), a);
    printBlock(`PERIODO B  (>= ${a.split})`, simulate(after, a), a);
    console.log('\n  Se A e B divergono molto, la strategia sta descrivendo il passato,');
    console.log('  non prevedendo il futuro.');
  }

  // Andamento mensile: dove si guadagna e dove si perde
  if (full.n > 0) {
    const byMonth: Record<string, { n: number; profit: number; staked: number }> = {};
    for (const b of full.bets) {
      const k = b.date.slice(0, 7);
      byMonth[k] = byMonth[k] || { n: 0, profit: 0, staked: 0 };
      byMonth[k].n++;
      byMonth[k].profit += b.profit;
      byMonth[k].staked += b.stake;
    }
    console.log('\n=== ANDAMENTO MENSILE ===');
    for (const k of Object.keys(byMonth).sort()) {
      const m = byMonth[k];
      const roi = m.staked > 0 ? (m.profit / m.staked) * 100 : 0;
      console.log(`  ${k}  giocate ${String(m.n).padStart(3)}  profitto ${(m.profit >= 0 ? '+' : '') + m.profit.toFixed(2).padStart(8)} EUR  ROI ${(roi >= 0 ? '+' : '') + roi.toFixed(1).padStart(6)}%`);
    }
  }

  if (a.csv && full.n > 0) {
    const csv = ['data,eventi,leghe,esiti,quota,prob_modello,prob_mercato,ev,puntata,vinta,profitto,capitale']
      .concat(full.bets.map(b => [
        b.date,
        `"${b.legs.map(l => `${l.match} [${l.pick}@${l.odds.toFixed(2)}]`).join(' + ')}"`,
        `"${[...new Set(b.legs.map(l => l.league))].join('/')}"`,
        b.legs.map(l => l.pick).join('+'),
        b.odds.toFixed(3),
        b.modelProb.toFixed(4), b.marketProb.toFixed(4), b.edge.toFixed(4),
        b.stake.toFixed(2), b.won ? 1 : 0, b.profit.toFixed(2), b.bankrollAfter.toFixed(2),
      ].join(',')))
      .join('\n');
    fs.writeFileSync(a.csv, csv);
    console.log(`\nCurva del capitale scritta in: ${a.csv}`);
  }

  console.log('\nNota: le quote sono le ultime pubblicate prima del fischio d\'inizio.');
  console.log('Sul nostro campione l\'ultimo aggiornamento mediano e\' 7.2 ore prima, quindi');
  console.log('non e\' una vera linea di chiusura ma una fotografia pre-partita.\n');
}

main();
