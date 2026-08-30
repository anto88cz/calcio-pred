/**
 * Calibrazione: quanto le probabilita' del modello sono oneste, e quanta
 * informazione contengono davvero oltre a quella gia' nel mercato.
 *
 * Il log-loss si scompone in due parti: quanto le probabilita' sono calibrate
 * (se dice 60%, succede il 60% delle volte) e quanta informazione contengono
 * (quanto il modello sa separare le partite fra loro). La calibrazione e' una
 * trasformazione monotona: puo' sistemare la prima parte, non puo' creare la
 * seconda. Questo script misura le due cose separatamente, cosi' si sa se
 * conviene ricalibrare o se serve un modello diverso.
 *
 * Tutto viene stimato sulla prima meta' della stagione e valutato sulla
 * seconda. Una calibrazione tarata e valutata sugli stessi dati sembra sempre
 * ottima.
 *
 * Uso:
 *   npx tsx src/scripts/analyze-calibration.ts backtest-full-2025-26.json
 *   npx tsx src/scripts/analyze-calibration.ts report.json --out report-calibrato.json
 */

import * as fs from 'fs';
import * as path from 'path';

type Outcome = '1' | 'X' | '2';
const OUTCOMES: Outcome[] = ['1', 'X', '2'];

interface Row {
  date: string;
  probs: Record<Outcome, number>;
  market: Record<Outcome, number> | null;
  actual: Outcome;
}

function devig(o: { home: number; draw: number; away: number }): Record<Outcome, number> {
  const r: Record<Outcome, number> = { '1': 1 / o.home, 'X': 1 / o.draw, '2': 1 / o.away };
  const s = r['1'] + r['X'] + r['2'];
  return { '1': r['1'] / s, 'X': r['X'] / s, '2': r['2'] / s };
}

function logLoss(rows: Row[], probsOf: (r: Row) => Record<Outcome, number>): number {
  if (rows.length === 0) return NaN;
  let sum = 0;
  for (const r of rows) sum += -Math.log(Math.max(probsOf(r)[r.actual], 1e-15));
  return sum / rows.length;
}

function brier(rows: Row[], probsOf: (r: Row) => Record<Outcome, number>): number {
  if (rows.length === 0) return NaN;
  let sum = 0;
  for (const r of rows) {
    const p = probsOf(r);
    let s = 0;
    for (const o of OUTCOMES) s += Math.pow(p[o] - (o === r.actual ? 1 : 0), 2);
    sum += s / 3;
  }
  return sum / rows.length;
}

function accuracy(rows: Row[], probsOf: (r: Row) => Record<Outcome, number>): number {
  if (rows.length === 0) return NaN;
  let hits = 0;
  for (const r of rows) {
    const p = probsOf(r);
    const pick = OUTCOMES.reduce((a, b) => (p[a] >= p[b] ? a : b));
    if (pick === r.actual) hits++;
  }
  return (hits / rows.length) * 100;
}

function normalize(p: Record<Outcome, number>): Record<Outcome, number> {
  const s = p['1'] + p['X'] + p['2'];
  if (!(s > 0)) return { '1': 1 / 3, 'X': 1 / 3, '2': 1 / 3 };
  return { '1': p['1'] / s, 'X': p['X'] / s, '2': p['2'] / s };
}

/**
 * Temperature scaling: p^(1/T) rinormalizzato.
 *
 * Un solo parametro. T > 1 avvicina le probabilita' fra loro (il modello era
 * troppo sicuro), T < 1 le allontana. Non cambia mai l'ordine degli esiti,
 * quindi non puo' aggiungere informazione: e' esattamente il punto, isola
 * l'effetto della sola calibrazione.
 */
function applyTemperature(p: Record<Outcome, number>, T: number): Record<Outcome, number> {
  const out: Record<Outcome, number> = { '1': 0, 'X': 0, '2': 0 };
  for (const o of OUTCOMES) out[o] = Math.pow(Math.max(p[o], 1e-15), 1 / T);
  return normalize(out);
}

function fitTemperature(rows: Row[]): number {
  let best = 1, bestLoss = Infinity;
  for (let T = 0.30; T <= 4.0; T += 0.01) {
    const loss = logLoss(rows, r => applyTemperature(r.probs, T));
    if (loss < bestLoss) { bestLoss = loss; best = T; }
  }
  return parseFloat(best.toFixed(2));
}

/** p = w * modello + (1 - w) * mercato. w = 0 significa "il modello non serve". */
function shrink(p: Record<Outcome, number>, m: Record<Outcome, number>, w: number): Record<Outcome, number> {
  return normalize({
    '1': w * p['1'] + (1 - w) * m['1'],
    'X': w * p['X'] + (1 - w) * m['X'],
    '2': w * p['2'] + (1 - w) * m['2'],
  });
}

function fitShrinkage(rows: Row[], transform: (r: Row) => Record<Outcome, number>): number {
  const withMarket = rows.filter(r => r.market);
  let best = 0, bestLoss = Infinity;
  for (let w = 0; w <= 1.0001; w += 0.01) {
    const loss = logLoss(withMarket, r => shrink(transform(r), r.market!, w));
    if (loss < bestLoss) { bestLoss = loss; best = w; }
  }
  return parseFloat(best.toFixed(2));
}

/**
 * Isotonic regression (pool adjacent violators) uno-contro-tutti.
 *
 * A differenza della temperatura puo' deformare la curva liberamente, quindi il
 * suo risultato IN-SAMPLE e' il tetto massimo raggiungibile ricalibrando: se
 * nemmeno quel tetto scende sotto il log-loss del mercato, ricalibrare non
 * bastera' mai, perche' manca informazione e non onesta'.
 */
function fitIsotonic(xs: number[], ys: number[]): (x: number) => number {
  const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const sx = idx.map(i => xs[i]);
  const sy = idx.map(i => ys[i]);

  const value: number[] = [];
  const weight: number[] = [];
  const start: number[] = [];
  for (let i = 0; i < sy.length; i++) {
    value.push(sy[i]); weight.push(1); start.push(i);
    while (value.length > 1 && value[value.length - 2] > value[value.length - 1]) {
      const v2 = value.pop()!, w2 = weight.pop()!, s2 = start.pop()!;
      const v1 = value.pop()!, w1 = weight.pop()!, s1 = start.pop()!;
      value.push((v1 * w1 + v2 * w2) / (w1 + w2));
      weight.push(w1 + w2);
      start.push(Math.min(s1, s2));
    }
  }

  const knotX: number[] = [];
  const knotY: number[] = [];
  for (let b = 0; b < value.length; b++) {
    const from = start[b];
    const to = b + 1 < value.length ? start[b + 1] - 1 : sx.length - 1;
    knotX.push(sx[from]); knotY.push(value[b]);
    knotX.push(sx[to]); knotY.push(value[b]);
  }

  return (x: number) => {
    if (x <= knotX[0]) return knotY[0];
    if (x >= knotX[knotX.length - 1]) return knotY[knotY.length - 1];
    let lo = 0, hi = knotX.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (knotX[mid] <= x) lo = mid; else hi = mid;
    }
    const dx = knotX[hi] - knotX[lo];
    if (dx <= 0) return knotY[lo];
    return knotY[lo] + ((x - knotX[lo]) / dx) * (knotY[hi] - knotY[lo]);
  };
}

function isotonicCalibrator(rows: Row[]) {
  const fns = {} as Record<Outcome, (x: number) => number>;
  for (const o of OUTCOMES) {
    fns[o] = fitIsotonic(rows.map(r => r.probs[o]), rows.map(r => (r.actual === o ? 1 : 0)));
  }
  return (p: Record<Outcome, number>) =>
    normalize({ '1': fns['1'](p['1']), 'X': fns['X'](p['X']), '2': fns['2'](p['2']) });
}

function reliability(rows: Row[], probsOf: (r: Row) => Record<Outcome, number>, label: string) {
  console.log(`\n  ${label}`);
  console.log('  fascia      | dichiarata -> reale |    n | scarto');
  let totalGap = 0, totalN = 0;
  for (let b = 0; b < 10; b++) {
    const lo = b / 10, hi = (b + 1) / 10;
    let sumP = 0, hits = 0, n = 0;
    for (const r of rows) {
      const p = probsOf(r);
      for (const o of OUTCOMES) {
        if (p[o] >= lo && p[o] < hi) { sumP += p[o]; hits += r.actual === o ? 1 : 0; n++; }
      }
    }
    if (n < 10) continue;
    const pred = sumP / n, real = hits / n;
    totalGap += Math.abs(pred - real) * n; totalN += n;
    const gap = (real - pred) * 100;
    console.log(
      `  ${(lo * 100).toFixed(0).padStart(3)}-${(hi * 100).toFixed(0).padEnd(3)}%    |` +
      ` ${(pred * 100).toFixed(1).padStart(5)}% -> ${(real * 100).toFixed(1).padStart(5)}% |` +
      ` ${String(n).padStart(4)} | ${(gap >= 0 ? '+' : '') + gap.toFixed(1)}${Math.abs(gap) > 5 ? '  <--' : ''}`
    );
  }
  if (totalN > 0) console.log(`  errore medio di calibrazione: ${((totalGap / totalN) * 100).toFixed(2)} punti`);
}

function main() {
  const argv = process.argv.slice(2);
  const file = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'backtest-full-2025-26.json';
  const outIdx = argv.indexOf('--out');
  const outFile = outIdx >= 0 ? argv[outIdx + 1] : undefined;

  const full = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  const report = JSON.parse(fs.readFileSync(full, 'utf-8'));

  const rows: Row[] = report.results
    .map((r: any): Row => ({
      date: r.date,
      probs: { '1': r.prediction.prob1, 'X': r.prediction.probX, '2': r.prediction.prob2 },
      market: r.closingOdds ? devig(r.closingOdds) : null,
      actual: r.actualResult.outcome as Outcome,
    }))
    .sort((a: Row, b: Row) => a.date.localeCompare(b.date));

  const half = Math.floor(rows.length / 2);
  const train = rows.slice(0, half);
  const test = rows.slice(half);

  console.log('========================================');
  console.log('ANALISI DI CALIBRAZIONE');
  console.log('========================================');
  console.log(`Report:   ${path.basename(full)}  (${rows.length} partite)`);
  console.log(`Stima:    ${train.length} partite  ${train[0].date} -> ${train[train.length - 1].date}`);
  console.log(`Verifica: ${test.length} partite  ${test[0].date} -> ${test[test.length - 1].date}`);

  console.log('\n--- DIAGRAMMA DI AFFIDABILITA (meta di verifica) ---');
  reliability(test, r => r.probs, 'modello grezzo');

  const T = fitTemperature(train);
  const iso = isotonicCalibrator(train);
  const wRaw = fitShrinkage(train, r => r.probs);
  const wTemp = fitShrinkage(train, r => applyTemperature(r.probs, T));

  const testMkt = test.filter(r => r.market);

  const variants: Array<[string, (r: Row) => Record<Outcome, number>]> = [
    ['modello grezzo', r => r.probs],
    [`temperatura T=${T.toFixed(2)}`, r => applyTemperature(r.probs, T)],
    ['isotonica', r => iso(r.probs)],
    [`shrinkage w=${wRaw.toFixed(2)}`, r => (r.market ? shrink(r.probs, r.market, wRaw) : r.probs)],
    [`temperatura + shrinkage w=${wTemp.toFixed(2)}`, r => (r.market ? shrink(applyTemperature(r.probs, T), r.market, wTemp) : applyTemperature(r.probs, T))],
    ['solo mercato', r => (r.market ? r.market : r.probs)],
  ];

  console.log('\n--- FUORI CAMPIONE (meta di verifica, solo partite con quote) ---');
  console.log('  variante                          log-loss    Brier   accuracy');
  for (const [name, fn] of variants) {
    console.log(
      `  ${name.padEnd(33)} ${logLoss(testMkt, fn).toFixed(4).padStart(8)} ${brier(testMkt, fn).toFixed(4).padStart(8)} ${accuracy(testMkt, fn).toFixed(1).padStart(9)}%`
    );
  }

  const isoAll = isotonicCalibrator(rows);
  const rowsMkt = rows.filter(r => r.market);
  console.log('\n--- TETTO DELLA SOLA RICALIBRAZIONE ---');
  console.log(`  isotonica in-sample (irraggiungibile): ${logLoss(rowsMkt, r => isoAll(r.probs)).toFixed(4)}`);
  console.log(`  mercato sulle stesse partite:          ${logLoss(rowsMkt, r => r.market!).toFixed(4)}`);
  console.log('  Il primo numero e il meglio che si possa ottenere ricalibrando, misurato');
  console.log('  barando (stima e verifica sugli stessi dati). Se non scende sotto il');
  console.log('  secondo, nessuna calibrazione rendera il modello competitivo.');

  console.log('\n--- PESO OTTIMALE DEL MODELLO ---');
  console.log(`  senza calibrazione: w = ${wRaw.toFixed(2)}`);
  console.log(`  dopo temperatura:   w = ${wTemp.toFixed(2)}`);
  console.log('  w e quanto del risultato finale viene dal modello, il resto dal mercato.');
  console.log('  w vicino a 0 = il modello non aggiunge nulla a cio che le quote gia dicono.');

  if (outFile) {
    const out = JSON.parse(JSON.stringify(report));
    out.results = out.results.map((r: any) => {
      const p = { '1': r.prediction.prob1, 'X': r.prediction.probX, '2': r.prediction.prob2 } as Record<Outcome, number>;
      const m = r.closingOdds ? devig(r.closingOdds) : null;
      const t = applyTemperature(p, T);
      const c = m ? shrink(t, m, wTemp) : t;
      const pick = OUTCOMES.reduce((a, b) => (c[a] >= c[b] ? a : b));
      return {
        ...r,
        prediction: { ...r.prediction, prob1: c['1'], probX: c['X'], prob2: c['2'], predictedOutcome: pick },
        correct1X2: pick === r.actualResult.outcome,
      };
    });
    out.calibration_applied = {
      temperature: T,
      shrinkageWeight: wTemp,
      fittedOn: `${train[0].date}..${train[train.length - 1].date}`,
      validFrom: test[0].date,
    };
    fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
    console.log(`\nReport calibrato scritto in: ${outFile}`);
    console.log('I parametri sono stimati sulla prima meta e applicati a tutta la stagione.');
    console.log(`Per una simulazione onesta: --split ${test[0].date} e leggere solo il periodo B.`);
  }
  console.log('');
}

main();
