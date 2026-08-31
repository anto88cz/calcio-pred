/**
 * Report in stile backtest-month.mjs: per ogni partita le giocate consigliate,
 * con esito, quota, stelle e valore atteso, poi i riepiloghi.
 *
 * Differenza sostanziale rispetto all'originale: le predizioni arrivano da un
 * backtest walk-forward, dove il modello e' ristimato ogni settimana sulle sole
 * partite gia' giocate. L'originale chiamava /betting-recommendations senza
 * fixtureDate, quindi lo storico partiva da oggi e comprendeva il risultato da
 * indovinare; i suoi numeri misuravano il look-ahead, non il sistema.
 *
 * Le quote sono le migliori fra i ~20 bookmaker, non la media: nessuno incassa
 * la media.
 *
 * Uso:
 *   npx tsx src/scripts/backtest-report.ts backtest-2026-27.json
 *   npx tsx src/scripts/backtest-report.ts report.json --top 3 --min-ev 0.05 --matches 40
 */

import * as fs from 'fs';
import * as path from 'path';

type Kind = 'risultato' | 'doppia chance' | 'goal/nogoal' | 'over/under';

interface Pick {
  kind: Kind;
  name: string;
  prob: number;
  odds: number;
  ev: number;
  won: boolean;
  detail: string;
}

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

/** Stelle da valore atteso, come nel report originale. */
function stars(ev: number): number {
  if (ev >= 0.40) return 5;
  if (ev >= 0.25) return 4;
  if (ev >= 0.15) return 3;
  if (ev >= 0.05) return 2;
  return 1;
}

function picksFor(r: any): Pick[] {
  const o = r.closingOdds, m = r.markets, p = r.prediction;
  if (!o) return [];
  const best = o.best ?? o;
  const a = r.actualResult;
  const total = a.homeGoals + a.awayGoals;
  const score = `${a.homeGoals}-${a.awayGoals}`;
  const out: Pick[] = [];

  const add = (kind: Kind, name: string, prob: number, odds: number | null | undefined, won: boolean, detail: string) => {
    if (!odds || odds <= 1) return;
    out.push({ kind, name, prob, odds, ev: prob * odds - 1, won, detail });
  };

  add('risultato', '1 (casa)', p.prob1, best.home, a.outcome === '1', `Risultato ${score} (${a.outcome})`);
  add('risultato', 'X (pareggio)', p.probX, best.draw, a.outcome === 'X', `Risultato ${score} (${a.outcome})`);
  add('risultato', '2 (trasferta)', p.prob2, best.away, a.outcome === '2', `Risultato ${score} (${a.outcome})`);

  if (m?.dc && o.dc) {
    for (const k of ['1X', '12', 'X2'] as const) {
      add('doppia chance', `Doppia ${k}`, m.dc[k].prob, o.dc[k]?.best, m.dc[k].esito, `Risultato ${score} (${a.outcome})`);
    }
  }
  if (m?.btts && o.btts) {
    const yes = a.homeGoals > 0 && a.awayGoals > 0;
    add('goal/nogoal', 'Goal (GG)', m.btts.prob, o.btts.yes?.best, yes, `Entrambe segnano: ${yes ? 'si' : 'no'}`);
    add('goal/nogoal', 'No goal (NG)', 1 - m.btts.prob, o.btts.no?.best, !yes, `Entrambe segnano: ${yes ? 'si' : 'no'}`);
  }
  if (m?.ou && o.ou) {
    for (const t of ['1.5', '2.5', '3.5']) {
      if (!m.ou[t] || !o.ou[t]) continue;
      const over = total > parseFloat(t);
      add('over/under', `Over ${t}`, m.ou[t].prob, o.ou[t].over?.best, over, `Gol totali ${total}`);
      add('over/under', `Under ${t}`, 1 - m.ou[t].prob, o.ou[t].under?.best, !over, `Gol totali ${total}`);
    }
  }
  return out;
}

function main() {
  const file = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'backtest-2026-27.json';
  const top = parseInt(arg('--top', '3'), 10);
  const minEv = parseFloat(arg('--min-ev', '0.05'));
  const showMatches = parseInt(arg('--matches', '30'), 10);

  const full = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  const report = JSON.parse(fs.readFileSync(full, 'utf-8'));
  const results = [...report.results].sort((a: any, b: any) => a.date.localeCompare(b.date));

  const line = '='.repeat(78);
  console.log(line);
  console.log(`BACKTEST — ${report.summary.dateRange}`);
  console.log(line);
  console.log(`Modello ristimato ogni settimana solo sulle partite precedenti.`);
  console.log(`Giocate: le ${top} con valore atteso piu' alto per partita, EV >= ${(minEv * 100).toFixed(0)}%.`);
  console.log(`Quote: la migliore fra i bookmaker disponibili.\n`);

  const details: Array<{ league: string; kind: Kind; ev: number; odds: number; won: boolean; stars: number }> = [];
  let analysed = 0, skipped = 0, shown = 0;

  for (const r of results) {
    const all = picksFor(r).filter(p => p.ev >= minEv).sort((x, y) => y.ev - x.ev).slice(0, top);
    if (!all.length) { skipped++; continue; }
    analysed++;

    if (shown < showMatches) {
      shown++;
      const a = r.actualResult;
      console.log(`[${shown}] ${r.league}`);
      console.log(`    ${r.homeTeam} ${a.homeGoals}-${a.awayGoals} ${r.awayTeam}`);
      console.log(`    ${r.date} | Risultato: ${a.outcome}\n`);
      for (const p of all) {
        console.log(`    ${p.won ? 'VINTA ' : 'PERSA '} ${p.name}`);
        console.log(`       quota ${p.odds.toFixed(2)} | ${stars(p.ev)} stelle | modello ${(p.prob * 100).toFixed(1)}% | EV ${(p.ev * 100).toFixed(1)}%`);
        console.log(`       ${p.detail}\n`);
      }
    }

    for (const p of all) {
      details.push({ league: r.league, kind: p.kind, ev: p.ev, odds: p.odds, won: p.won, stars: stars(p.ev) });
    }
  }

  const wins = details.filter(d => d.won).length;
  const profit = details.reduce((s, d) => s + (d.won ? d.odds - 1 : -1), 0);
  const roi = details.length ? (profit / details.length) * 100 : 0;
  const ret = details.map(d => (d.won ? d.odds - 1 : -1));
  const mean = ret.reduce((a, b) => a + b, 0) / Math.max(1, ret.length);
  const varr = ret.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, ret.length - 1);
  const se = Math.sqrt(varr / Math.max(1, ret.length)) * 100;

  if (results.length > showMatches) console.log(`... altre ${analysed - shown} partite con giocate\n`);

  console.log(line);
  console.log('REPORT FINALE');
  console.log(line + '\n');
  console.log('STATISTICHE GENERALI');
  console.log(`   Partite nel periodo:      ${results.length}`);
  console.log(`   Partite con giocate:      ${analysed}`);
  console.log(`   Partite senza giocate:    ${skipped}   (nessun esito con EV >= ${(minEv * 100).toFixed(0)}%)`);
  console.log(`   Giocate testate:          ${details.length}`);
  console.log(`   Vincenti:                 ${wins} (${((wins / details.length) * 100).toFixed(1)}%)`);
  console.log(`   Perdenti:                 ${details.length - wins} (${(((details.length - wins) / details.length) * 100).toFixed(1)}%)`);

  console.log(`\nROI`);
  console.log(`   Profitto:  ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} unita' su ${details.length} giocate da 1`);
  console.log(`   ROI:       ${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%  con errore standard ±${se.toFixed(2)}%`);
  console.log(`   ${Math.abs(roi / se) > 1.96
    ? (roi > 0 ? 'Distinguibile da zero: profitto reale su questo campione.' : 'Distinguibile da zero: perdita reale.')
    : 'NON distinguibile da zero: con questo campione il risultato e\' compatibile col caso.'}`);

  const group = <T extends string>(key: (d: typeof details[0]) => T) => {
    const map = new Map<T, { n: number; w: number; profit: number }>();
    for (const d of details) {
      const k = key(d);
      const cur = map.get(k) || { n: 0, w: 0, profit: 0 };
      cur.n++; if (d.won) cur.w++;
      cur.profit += d.won ? d.odds - 1 : -1;
      map.set(k, cur);
    }
    return map;
  };

  const table = (title: string, map: Map<string, { n: number; w: number; profit: number }>, sortByName = false) => {
    console.log(`\n${title}`);
    const entries = [...map.entries()];
    entries.sort((a, b) => sortByName ? a[0].localeCompare(b[0]) : b[1].n - a[1].n);
    for (const [k, v] of entries) {
      const roiK = (v.profit / v.n) * 100;
      console.log(`   ${k.padEnd(20)} ${String(v.n).padStart(5)} giocate   ${((v.w / v.n) * 100).toFixed(1).padStart(5)}% vincenti   ROI ${(roiK >= 0 ? '+' : '') + roiK.toFixed(2).padStart(6)}%`);
    }
  };

  table('PER TIPO DI GIOCATA', group(d => d.kind));
  table('PER STELLE (valore atteso dichiarato dal modello)',
    group(d => `${d.stars} stelle`), true);
  table('PER FASCIA DI QUOTA', group(d =>
    d.odds < 1.5 ? 'fino a 1.50' : d.odds < 2 ? '1.50 - 2.00' : d.odds < 3 ? '2.00 - 3.00' : d.odds < 5 ? '3.00 - 5.00' : 'oltre 5.00'), true);
  table('PER CAMPIONATO', group(d => d.league));

  console.log('\nNOTA SULLE STELLE');
  console.log('   Le stelle vengono dal valore atteso, che il modello calcola con le proprie');
  console.log('   probabilita\'. Se piu\' stelle non corrispondono a un ROI piu\' alto, il modello');
  console.log('   non sta riconoscendo il valore: sta solo dissentendo dal mercato dove sbaglia.\n');
}

main();
