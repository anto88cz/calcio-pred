/**
 * Riepilogo per mercato: quanto il modello ci prende, quanto rende, e come si
 * confronta con il prezzo del bookmaker.
 *
 * Tutti i mercati escono dalla stessa matrice dei punteggi del Dixon-Coles,
 * quindi sono coerenti fra loro per costruzione: la doppia chance 1X e' la
 * somma esatta delle celle di vittoria casa e pareggio, non il prodotto di due
 * probabilita' come si fa nelle multiple.
 *
 * Ogni riga porta l'errore standard del ROI. Senza quello i numeri non si
 * possono leggere: su poche centinaia di scommesse un +3% e uno 0% sono
 * indistinguibili.
 *
 * Uso:
 *   npx tsx src/scripts/market-report.ts backtest-dc-blend.json
 *   npx tsx src/scripts/market-report.ts report.json --odds avg
 */

import * as fs from 'fs';
import * as path from 'path';

type Side = { label: string; prob: number; happened: boolean; odds: number | null };

interface Row {
  market: string;
  n: number;
  /** frequenza con cui l'esito scelto dal modello si e' verificato */
  accuracy: number;
  avgOdds: number;
  /** quota di pareggio: 100 / quota media */
  breakEven: number;
  roi: number;
  se: number;
  logLoss: number;
  marketLogLoss: number;
  margin: number;
}

function pickOdds(price: any, kind: 'avg' | 'best'): number | null {
  if (!price) return null;
  const v = kind === 'best' ? price.best : price.avg;
  return typeof v === 'number' && v > 1 ? v : null;
}

function main() {
  const argv = process.argv.slice(2);
  const file = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'backtest-dc-blend.json';
  const kindIdx = argv.indexOf('--odds');
  const kind: 'avg' | 'best' = kindIdx >= 0 && argv[kindIdx + 1] === 'avg' ? 'avg' : 'best';

  const full = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  const report = JSON.parse(fs.readFileSync(full, 'utf-8'));

  /**
   * Per ogni partita e per ogni mercato costruisce i lati giocabili. Il modello
   * "gioca" il lato a cui assegna la probabilita' piu' alta.
   */
  function sidesFor(r: any, market: string): Side[] | null {
    const m = r.markets, o = r.closingOdds;
    if (!m || !o) return null;

    if (market === '1X2') {
      const q = kind === 'best' && o.best ? o.best : o;
      return [
        { label: '1', prob: r.prediction.prob1, happened: r.actualResult.outcome === '1', odds: q.home },
        { label: 'X', prob: r.prediction.probX, happened: r.actualResult.outcome === 'X', odds: q.draw },
        { label: '2', prob: r.prediction.prob2, happened: r.actualResult.outcome === '2', odds: q.away },
      ];
    }
    if (market === 'Doppia chance') {
      if (!o.dc) return null;
      return (['1X', '12', 'X2'] as const).map(k => ({
        label: k, prob: m.dc[k].prob, happened: m.dc[k].esito, odds: pickOdds(o.dc[k], kind),
      }));
    }
    if (market === 'Goal / No goal') {
      if (!o.btts) return null;
      return [
        { label: 'GG', prob: m.btts.prob, happened: m.btts.esito, odds: pickOdds(o.btts.yes, kind) },
        { label: 'NG', prob: 1 - m.btts.prob, happened: !m.btts.esito, odds: pickOdds(o.btts.no, kind) },
      ];
    }
    const t = market.replace('Over/Under ', '');
    if (!o.ou?.[t] || !m.ou?.[t]) return null;
    return [
      { label: 'Over', prob: m.ou[t].prob, happened: m.ou[t].esito, odds: pickOdds(o.ou[t].over, kind) },
      { label: 'Under', prob: 1 - m.ou[t].prob, happened: !m.ou[t].esito, odds: pickOdds(o.ou[t].under, kind) },
    ];
  }

  const MARKETS = ['1X2', 'Doppia chance', 'Goal / No goal', 'Over/Under 1.5', 'Over/Under 2.5', 'Over/Under 3.5'];

  const rows: Row[] = [];
  for (const market of MARKETS) {
    const returns: number[] = [];
    let hits = 0, sumOdds = 0, sumLL = 0, sumMktLL = 0, sumMargin = 0, n = 0;

    for (const r of report.results) {
      const sides = sidesFor(r, market);
      if (!sides || sides.some(s => s.odds == null)) continue;

      // il modello gioca il lato piu' probabile
      const pick = sides.reduce((a, b) => (a.prob >= b.prob ? a : b));
      if (!sides.some(s => s.happened)) continue;

      // Quanto devono sommare le probabilita' dei lati offerti.
      //
      // Nei mercati a due esiti complementari (GG/NG, Over/Under) la somma e' 1.
      // Nella doppia chance no: 1X, 12 e X2 coprono ciascuna DUE dei tre esiti,
      // quindi in un mercato equo sommano a 2. Normalizzando a 1 il margine del
      // banco risultava del 105%, che non e' un margine ma questo errore.
      const total = market === 'Doppia chance' ? 2 : 1;

      const implied = sides.map(s => 1 / (s.odds as number));
      const overround = implied.reduce((a, b) => a + b, 0);
      const marketProbs = implied.map(p => (p / overround) * total);

      // Log-loss binaria, mediata sui lati: e' l'unica forma valida per la
      // doppia chance, dove i tre lati non si escludono a vicenda.
      const modelSum = sides.reduce((a, b) => a + b.prob, 0);
      const modelNorm = sides.map(s => (s.prob / modelSum) * total);

      const binary = (p: number, happened: boolean) =>
        -Math.log(Math.max(happened ? p : 1 - p, 1e-15));

      sumLL += sides.reduce((acc, s, i) => acc + binary(modelNorm[i], s.happened), 0) / sides.length;
      sumMktLL += sides.reduce((acc, s, i) => acc + binary(marketProbs[i], s.happened), 0) / sides.length;
      sumMargin += overround / total - 1;

      const ret = pick.happened ? (pick.odds as number) - 1 : -1;
      returns.push(ret);
      if (pick.happened) hits++;
      sumOdds += pick.odds as number;
      n++;
    }

    if (n === 0) continue;
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1);
    const avgOdds = sumOdds / n;

    rows.push({
      market, n,
      accuracy: (hits / n) * 100,
      avgOdds,
      breakEven: 100 / avgOdds,
      roi: mean * 100,
      se: Math.sqrt(variance / n) * 100,
      logLoss: sumLL / n,
      marketLogLoss: sumMktLL / n,
      margin: (sumMargin / n) * 100,
    });
  }

  console.log('========================================================');
  console.log('RIEPILOGO PER MERCATO');
  console.log('========================================================');
  console.log(`Report: ${path.basename(full)}   prezzo: ${kind === 'best' ? 'quota migliore' : 'media dei bookmaker'}`);
  console.log(`Il modello gioca sempre il lato a cui assegna probabilita' piu' alta.\n`);

  const pad = (s: string, n: number) => s.padEnd(n);
  const num = (v: number, d: number, n: number) => v.toFixed(d).padStart(n);

  console.log('  mercato           n     azzecc.  quota   pareggia a   ROI              margine');
  console.log('  ' + '-'.repeat(84));
  for (const r of rows) {
    const sig = Math.abs(r.roi / r.se) > 1.96 ? ' *' : '  ';
    console.log('  ' + pad(r.market, 17) + String(r.n).padStart(4) + '   ' +
      num(r.accuracy, 1, 5) + '%  ' + num(r.avgOdds, 2, 5) + '   ' +
      num(r.breakEven, 1, 5) + '%      ' +
      (r.roi >= 0 ? '+' : '') + r.roi.toFixed(2) + '% ±' + r.se.toFixed(2) + sig +
      '   ' + num(r.margin, 2, 5) + '%');
  }
  console.log('\n  * = statisticamente distinguibile da zero (|t| > 1,96)');

  console.log('\n  mercato           log-loss modello   log-loss mercato   differenza');
  console.log('  ' + '-'.repeat(66));
  for (const r of rows) {
    const d = r.logLoss - r.marketLogLoss;
    console.log('  ' + pad(r.market, 17) + num(r.logLoss, 4, 12) + '   ' +
      num(r.marketLogLoss, 4, 16) + '   ' + (d >= 0 ? '+' : '') + d.toFixed(4) +
      (d < 0 ? '   meglio del mercato' : ''));
  }
  console.log('');
}

main();
