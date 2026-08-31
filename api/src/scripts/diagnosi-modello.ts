/**
 * Dove sbaglia il modello, e quanto costa ogni difetto in log-loss.
 *
 * Non "il modello e' peggio del mercato", che si sapeva: dove esattamente, e
 * quale correzione recupererebbe quanto. Ogni riga di questa diagnosi punta a
 * un intervento diverso, e il numero accanto dice se vale la pena farlo.
 *
 * Gira sull'export di verifica-giornata --export: le probabilita' sono quelle
 * che il sistema avrebbe davvero prodotto, da un modello che aveva visto solo
 * le partite precedenti.
 *
 * Uso: npx tsx src/scripts/diagnosi-modello.ts data/giornate-2026-27.json
 */

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import { PrismaClient, FixtureStatus } from '@prisma/client';
import { CandidateRow } from '../services/prediction/live-odds';

const prisma = new PrismaClient();

interface MatchExport {
  date: string; kickoff: string; league: string;
  home: string; away: string; hg: number; ag: number;
  lambdaHome: number; lambdaAway: number;
  candidates: CandidateRow[];
}

interface Row {
  league: string; date: string;
  model: [number, number, number];
  market: [number, number, number];
  outcome: 0 | 1 | 2;
  lambda: number;
  goals: number;
  esperienza: number;   // partite in archivio della squadra con meno storia
}

const logloss = (rows: Row[], get: (r: Row) => [number, number, number]) =>
  rows.reduce((a, r) => a - Math.log(Math.max(1e-12, get(r)[r.outcome])), 0) / rows.length;

/** Riscala le probabilita' con una temperatura: T < 1 le rende piu' decise. */
function temper(p: [number, number, number], T: number): [number, number, number] {
  const q = p.map(x => Math.pow(Math.max(1e-12, x), 1 / T));
  const s = q[0] + q[1] + q[2];
  return [q[0] / s, q[1] / s, q[2] / s];
}

async function main() {
  const file = process.argv.slice(2).find(a => !a.startsWith('--')) || 'data/giornate-2026-27.json';
  const data: MatchExport[] = JSON.parse(fs.readFileSync(file, 'utf-8'));

  // Quante partite aveva in archivio ciascuna squadra prima di ogni giornata:
  // il sospetto e' che il modello sbagli soprattutto dove ha poca storia.
  const storico = await prisma.fixture.findMany({
    where: { status: FixtureStatus.FINISHED },
    select: { date: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
    orderBy: { date: 'asc' },
  });
  const partiteFino = (nome: string, data: string) =>
    storico.filter(f => f.date.toISOString().slice(0, 10) < data &&
      (f.homeTeam?.name === nome || f.awayTeam?.name === nome)).length;

  const conteggio = new Map<string, number>();
  const esperienzaDi = (nome: string, data: string) => {
    const k = `${nome}|${data}`;
    if (!conteggio.has(k)) conteggio.set(k, partiteFino(nome, data));
    return conteggio.get(k)!;
  };

  const rows: Row[] = [];
  for (const m of data) {
    const g = (key: string, f: 'modelProb' | 'consensusProb') =>
      m.candidates.find(c => c.key === key)?.[f] ?? null;
    const p = [g('1X2:1', 'modelProb'), g('1X2:X', 'modelProb'), g('1X2:2', 'modelProb')];
    const q = [g('1X2:1', 'consensusProb'), g('1X2:X', 'consensusProb'), g('1X2:2', 'consensusProb')];
    if (p.some(x => x == null) || q.some(x => x == null)) continue;
    const s = (q[0] as number) + (q[1] as number) + (q[2] as number);
    rows.push({
      league: m.league, date: m.date,
      model: p as [number, number, number],
      market: [(q[0] as number) / s, (q[1] as number) / s, (q[2] as number) / s],
      outcome: m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2,
      lambda: m.lambdaHome + m.lambdaAway,
      goals: m.hg + m.ag,
      esperienza: Math.min(esperienzaDi(m.home, m.date), esperienzaDi(m.away, m.date)),
    });
  }

  const llM = logloss(rows, r => r.model), llK = logloss(rows, r => r.market);
  console.log('='.repeat(76));
  console.log(`  DIAGNOSI DEL MODELLO — ${rows.length} partite`);
  console.log('='.repeat(76));
  console.log(`  log-loss   modello ${llM.toFixed(4)}   mercato ${llK.toFixed(4)}   divario ${(llM - llK).toFixed(4)}\n`);

  // 1. Ricalibrazione: quanta parte del divario e' solo eccesso di prudenza.
  console.log('  1. RICALIBRAZIONE (temperatura)');
  console.log('  ' + '-'.repeat(72));
  let bestT = 1, bestLL = llM;
  for (let T = 0.50; T <= 1.50; T += 0.01) {
    const ll = logloss(rows, r => temper(r.model, T));
    if (ll < bestLL) { bestLL = ll; bestT = T; }
  }
  console.log(`    temperatura ottima T = ${bestT.toFixed(2)}   log-loss ${bestLL.toFixed(4)} (da ${llM.toFixed(4)})`);
  console.log(`    recupera ${((llM - bestLL) / (llM - llK) * 100).toFixed(1)}% del divario col mercato`);
  console.log(`    ${bestT < 1 ? 'T < 1: il modello e\' TROPPO PRUDENTE, va reso piu\' deciso' : bestT > 1 ? 'T > 1: il modello e\' troppo sicuro' : 'gia\' calibrato'}\n`);

  // 2. Esperienza: dove il modello ha poca storia sulle squadre.
  console.log('  2. PARTITE IN ARCHIVIO DELLA SQUADRA MENO NOTA');
  console.log('  ' + '-'.repeat(72));
  console.log('    fascia            n    log-loss modello   mercato   divario');
  for (const [lo, hi, l] of [[0, 20, '0-19'], [20, 40, '20-39'], [40, 70, '40-69'], [70, 1e9, '70+']] as const) {
    const sel = rows.filter(r => r.esperienza >= lo && r.esperienza < hi);
    if (sel.length < 10) continue;
    const a = logloss(sel, r => r.model), b = logloss(sel, r => r.market);
    console.log(`    ${l.padEnd(12)}${String(sel.length).padStart(6)}${a.toFixed(4).padStart(16)}${b.toFixed(4).padStart(10)}${(a - b).toFixed(4).padStart(10)}`);
  }

  // 3. Gol attesi contro gol veri: il modello ne prevede troppi o troppo pochi?
  const lamMedio = rows.reduce((a, r) => a + r.lambda, 0) / rows.length;
  const golMedi = rows.reduce((a, r) => a + r.goals, 0) / rows.length;
  console.log(`\n  3. GOL ATTESI CONTRO GOL VERI`);
  console.log('  ' + '-'.repeat(72));
  console.log(`    media prevista ${lamMedio.toFixed(3)}   media reale ${golMedi.toFixed(3)}   scarto ${(lamMedio - golMedi >= 0 ? '+' : '') + (lamMedio - golMedi).toFixed(3)}`);
  console.log('    fascia di gol attesi     n    previsti   segnati   scarto');
  for (const [lo, hi] of [[0, 2], [2, 2.5], [2.5, 3], [3, 3.5], [3.5, 99]] as const) {
    const sel = rows.filter(r => r.lambda >= lo && r.lambda < hi);
    if (sel.length < 10) continue;
    const pr = sel.reduce((a, r) => a + r.lambda, 0) / sel.length;
    const re = sel.reduce((a, r) => a + r.goals, 0) / sel.length;
    console.log(`    ${(lo + '-' + (hi === 99 ? '' : hi)).padEnd(20)}${String(sel.length).padStart(6)}${pr.toFixed(2).padStart(11)}${re.toFixed(2).padStart(10)}${(pr - re >= 0 ? '+' : '') + (pr - re).toFixed(2).padStart(8)}`);
  }

  // 4. Per campionato: dove il modello regge e dove no.
  console.log('\n  4. PER CAMPIONATO');
  console.log('  ' + '-'.repeat(72));
  const byL = new Map<string, Row[]>();
  for (const r of rows) byL.set(r.league, [...(byL.get(r.league) || []), r]);
  const righe = [...byL.entries()].filter(([, v]) => v.length >= 15)
    .map(([k, v]) => ({ k, n: v.length, m: logloss(v, r => r.model), q: logloss(v, r => r.market) }))
    .sort((a, b) => (a.m - a.q) - (b.m - b.q));
  console.log('    campionato              n    modello   mercato   divario');
  for (const r of righe) {
    console.log(`    ${r.k.padEnd(22)}${String(r.n).padStart(4)}${r.m.toFixed(4).padStart(11)}${r.q.toFixed(4).padStart(10)}` +
      `${((r.m - r.q) >= 0 ? '+' : '') + (r.m - r.q).toFixed(4).padStart(9)}${r.m < r.q ? '   MEGLIO DEL MERCATO' : ''}`);
  }

  // 5. Il tetto: quanto varrebbe mescolare modello e mercato.
  console.log('\n  5. PESO OTTIMO DEL MODELLO IN UNA MISCELA COL MERCATO');
  console.log('  ' + '-'.repeat(72));
  for (const w of [0, 0.1, 0.2, 0.3, 0.5]) {
    const ll = logloss(rows, r => [0, 1, 2].map(i =>
      w * r.model[i] + (1 - w) * r.market[i]) as [number, number, number]);
    console.log(`    peso ${w.toFixed(1)}   log-loss ${ll.toFixed(5)}${w === 0 ? '   (solo mercato)' : ''}`);
  }
  const llCal = (w: number) => logloss(rows, r => {
    const t = temper(r.model, bestT);
    return [0, 1, 2].map(i => w * t[i] + (1 - w) * r.market[i]) as [number, number, number];
  });
  console.log('    con il modello ricalibrato:');
  for (const w of [0, 0.1, 0.2, 0.3, 0.5]) console.log(`    peso ${w.toFixed(1)}   log-loss ${llCal(w).toFixed(5)}`);

  console.log('');
  await prisma.$disconnect();
}

main().catch(async e => { console.error('Errore:', e.message); await prisma.$disconnect(); process.exit(1); });
