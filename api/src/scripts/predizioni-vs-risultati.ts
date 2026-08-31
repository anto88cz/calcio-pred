/**
 * Le predizioni sulle partite, una per riga, contro il risultato vero.
 *
 * Non le giocate: le PREDIZIONI. Per ogni partita i gol attesi dal modello, la
 * sua probabilita' su 1/X/2, quella del mercato de-viggata, il punteggio
 * finale e chi dei due aveva indovinato.
 *
 * Gira sull'export di verifica-giornata --export, dove il modello era gia'
 * stato ristimato sulle sole partite precedenti a ciascuna giornata: le
 * probabilita' qui dentro sono quelle che il sistema avrebbe davvero prodotto
 * prima del fischio d'inizio.
 *
 * Uso:
 *   npx tsx src/scripts/predizioni-vs-risultati.ts data/giornate-2026-27.json
 *   npx tsx src/scripts/predizioni-vs-risultati.ts data/giornate.json --giorno 2026-08-30
 *   npx tsx src/scripts/predizioni-vs-risultati.ts data/giornate.json --lega "Serie A"
 *   npx tsx src/scripts/predizioni-vs-risultati.ts data/giornate.json --solo-sbagliate
 */

import * as fs from 'fs';
import { CandidateRow } from '../services/prediction/live-odds';

interface MatchExport {
  date: string; kickoff: string; league: string;
  home: string; away: string; hg: number; ag: number;
  lambdaHome: number; lambdaAway: number;
  candidates: CandidateRow[];
}

function arg(flag: string, def: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s).padEnd(n);
const pct = (x: number | null) => (x == null ? ' — ' : (x * 100).toFixed(0).padStart(3));

function main() {
  const file = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!file) { console.error('Serve il file esportato da verifica-giornata --export'); process.exit(1); }

  const giorno = arg('--giorno', '');
  const lega = arg('--lega', '');
  const soloSbagliate = process.argv.includes('--solo-sbagliate');

  let data: MatchExport[] = JSON.parse(fs.readFileSync(file, 'utf-8'));
  if (giorno) data = data.filter(m => m.date === giorno);
  if (lega) data = data.filter(m => m.league.toLowerCase().includes(lega.toLowerCase()));
  if (!data.length) { console.log('Nessuna partita con questi filtri.'); return; }

  data.sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  const prob = (m: MatchExport, key: string, field: 'modelProb' | 'consensusProb') =>
    m.candidates.find(c => c.key === key)?.[field] ?? null;

  let modelRight = 0, marketRight = 0, comparable = 0;
  let llModel = 0, llMarket = 0;
  const rows: string[] = [];

  for (const m of data) {
    const p = [prob(m, '1X2:1', 'modelProb'), prob(m, '1X2:X', 'modelProb'), prob(m, '1X2:2', 'modelProb')];
    const q = [prob(m, '1X2:1', 'consensusProb'), prob(m, '1X2:X', 'consensusProb'), prob(m, '1X2:2', 'consensusProb')];
    const outcome = m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2;
    const segno = ['1', 'X', '2'][outcome];

    const hasModel = p.every(x => x != null);
    const hasMarket = q.every(x => x != null);
    let modOk: boolean | null = null, mktOk: boolean | null = null;

    if (hasModel) {
      const pm = p as number[];
      modOk = pm.indexOf(Math.max(...pm)) === outcome;
    }
    if (hasMarket) {
      const qm = (q as number[]);
      const s = qm[0] + qm[1] + qm[2];
      const norm = qm.map(x => x / s);
      mktOk = norm.indexOf(Math.max(...norm)) === outcome;
      if (hasModel) {
        comparable++;
        if (modOk) modelRight++;
        if (mktOk) marketRight++;
        llModel -= Math.log(Math.max(1e-12, (p as number[])[outcome]));
        llMarket -= Math.log(Math.max(1e-12, norm[outcome]));
      }
    }

    if (soloSbagliate && modOk !== false) continue;

    rows.push(
      `  ${m.date.slice(8)}/${m.date.slice(5, 7)}  ${cut(m.league, 16)} ${cut(m.home, 20)} — ${cut(m.away, 20)}  ` +
      `${m.lambdaHome.toFixed(2)}-${m.lambdaAway.toFixed(2)}  ` +
      `mod ${pct(p[0])}/${pct(p[1])}/${pct(p[2])}  ` +
      `mkt ${pct(q[0])}/${pct(q[1])}/${pct(q[2])}  ` +
      `${m.hg}-${m.ag} (${segno})  ` +
      `${modOk == null ? ' ' : modOk ? '✓' : '✗'} ${mktOk == null ? ' ' : mktOk ? '✓' : '✗'}`);
  }

  console.log('='.repeat(150));
  console.log(`  PREDIZIONI CONTRO RISULTATI — ${data.length} partite` +
    (giorno ? `   ${giorno}` : '') + (lega ? `   ${lega}` : ''));
  console.log('='.repeat(150));
  console.log('  data  campionato       casa                 — trasferta             gol attesi  ' +
    'modello 1/X/2  mercato 1/X/2  finale   mod mkt');
  console.log('  ' + '-'.repeat(146));
  console.log(rows.join('\n'));

  if (comparable) {
    console.log('  ' + '-'.repeat(146));
    console.log(`\n  Su ${comparable} partite con entrambe le stime:`);
    console.log(`    segno azzeccato   modello ${((modelRight / comparable) * 100).toFixed(1)}%   mercato ${((marketRight / comparable) * 100).toFixed(1)}%`);
    console.log(`    log-loss          modello ${(llModel / comparable).toFixed(4)}   mercato ${(llMarket / comparable).toFixed(4)}`);
    console.log(`\n  Il log-loss e' il metro giusto: premia chi da' la probabilita' corretta,`);
    console.log(`  non chi indovina il segno. Piu' basso e' meglio.\n`);
  }
}

main();
