/**
 * Le schede che il sistema avrebbe giocato, una per giornata, con quanto si
 * sarebbe vinto e perso su ciascuna e come sarebbe andata la cassa.
 *
 * Gira sull'export prodotto da verifica-giornata --export, dove ogni partita
 * gia' giocata porta con se' TUTTE le sue giocate possibili con le quote
 * pre-partita e il risultato. Il calcolo caro — ristimare il modello ogni
 * giorno su quindicimila partite — e' gia' stato fatto li': qui si possono
 * riprovare strategie diverse in un secondo, che e' l'unico modo di cercare
 * una configurazione profittevole senza aspettare venti minuti per tentativo.
 *
 * La scheda e' una multipla: paga solo se TUTTI gli eventi passano. E' il
 * motivo per cui il default e' un evento solo.
 *
 * Uso:
 *   npx tsx src/scripts/storico-schedine.ts data/giornate-2026-27.json
 *   npx tsx src/scripts/storico-schedine.ts data/giornate.json --eventi 2 --stake kelly
 *   npx tsx src/scripts/storico-schedine.ts data/giornate.json --criterio sicure --prob-min 0.75
 *   npx tsx src/scripts/storico-schedine.ts data/giornate.json --stake flat --puntata 2
 */

import * as fs from 'fs';
import { selectPick, score, CandidateRow, Criterio } from '../services/prediction/live-odds';

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

interface Leg { m: MatchExport; pick: CandidateRow; won: boolean }

interface Slip {
  date: string;
  legs: Leg[];
  odds: number;
  modelProb: number;
  marketProb: number;
  stake: number;
  ret: number;      // incasso lordo
  pl: number;       // profitto o perdita
  bank: number;     // cassa dopo la scheda
  won: boolean;
}

function main() {
  const file = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!file) { console.error('Serve il file esportato da verifica-giornata --export'); process.exit(1); }

  const criterioArg = arg('--criterio', 'sicure');
  const criterio: Criterio =
    criterioArg === 'ev' ? 'ev' : criterioArg === 'prob' ? 'prob'
      : criterioArg === 'prezzo' ? 'prezzo' : 'sicure';
  const filters = {
    minBooks: parseInt(arg('--min-book', '5'), 10),
    minOdds: parseFloat(arg('--quota-min', '1.4')),
    maxOdds: parseFloat(arg('--quota-max', '8')),
    minDeviation: parseFloat(arg('--scarto-min', '0')) || -Infinity,
    maxDeviation: parseFloat(arg('--scarto-max', '0.15')),
    minProb: parseFloat(arg('--prob-min', '0.70')),
  };
  const maxEvents = parseInt(arg('--eventi', '1'), 10);
  const capitale = parseFloat(arg('--capitale', '100'));
  const stakeMode = arg('--stake', 'kelly');           // kelly | flat | percento
  const flatStake = parseFloat(arg('--puntata', '2'));
  const kellyFraction = parseFloat(arg('--kelly', '0.25'));
  const kellyCap = parseFloat(arg('--tetto', '0.05'));
  // Su quale probabilita' dimensionare la puntata.
  //
  // 'mercato' e' il default perche' e' la stima migliore che abbiamo: il
  // mercato batte il modello in log-loss ogni volta che lo misuriamo. Con
  // 'min' bastava un modello in disaccordo — 27% contro il 70.8% del mercato —
  // per azzerare la puntata, cioe' lasciare allo stimatore peggiore il veto su
  // quello migliore. Su quel campione cinque schede su undici uscivano a
  // puntata zero e restavano contate come vinte.
  const probSource = arg('--prob', 'mercato');
  const dettaglio = !process.argv.includes('--sintesi');

  const data: MatchExport[] = JSON.parse(fs.readFileSync(file, 'utf-8'));

  const byDate = new Map<string, MatchExport[]>();
  for (const m of data) byDate.set(m.date, [...(byDate.get(m.date) || []), m]);

  console.log('='.repeat(76));
  console.log(`  STORICO SCHEDE — ${[...byDate.keys()].sort()[0]} → ${[...byDate.keys()].sort().pop()}`);
  console.log('='.repeat(76));
  console.log(`  criterio ${criterio}   ${maxEvents} ${maxEvents === 1 ? 'evento' : 'eventi'} per scheda   ` +
    `quote ${filters.minOdds.toFixed(2)}-${filters.maxOdds.toFixed(2)}   probabilita' >= ${(filters.minProb * 100).toFixed(0)}%`);
  console.log(`  cassa iniziale ${capitale.toFixed(2)} EUR   puntata: ` +
    (stakeMode === 'kelly' ? `${kellyFraction} di Kelly, tetto ${(kellyCap * 100).toFixed(0)}% della cassa`
      : stakeMode === 'flat' ? `${flatStake.toFixed(2)} EUR fissi`
      : `${flatStake.toFixed(1)}% della cassa`) +
    (stakeMode === 'kelly' ? `, su probabilita' ${probSource}` : '') + '\n');

  let bank = capitale;
  const slips: Slip[] = [];

  for (const date of [...byDate.keys()].sort()) {
    const legs: Leg[] = [];
    for (const m of byDate.get(date)!) {
      const pick = selectPick(m.candidates, criterio, filters);
      if (pick) legs.push({ m, pick, won: won(pick.key, m.hg, m.ag) });
    }
    if (!legs.length) continue;

    legs.sort((a, b) => score(b.pick, criterio) - score(a.pick, criterio));
    const chosen = legs.slice(0, maxEvents);

    const odds = chosen.reduce((s, l) => s * l.pick.best, 1);
    const modelProb = chosen.reduce((s, l) => s * l.pick.modelProb, 1);
    const marketProb = chosen.reduce((s, l) => s * l.pick.consensusProb, 1);
    const slipWon = chosen.every(l => l.won);

    // La puntata si dimensiona sulla probabilita' piu' bassa fra modello e
    // mercato: dove i due non vanno d'accordo il mercato ha ragione piu'
    // spesso, e una multipla va comunque dimensionata sul caso peggiore.
    const p = probSource === 'modello' ? modelProb
      : probSource === 'min' ? Math.min(modelProb, marketProb)
      : marketProb;
    const b = odds - 1;
    let stake: number;
    if (stakeMode === 'flat') stake = flatStake;
    else if (stakeMode === 'percento') stake = bank * (flatStake / 100);
    else {
      const kelly = b > 0 ? (b * p - (1 - p)) / b : 0;
      stake = bank * Math.max(0, Math.min(kellyCap, kelly * kellyFraction));
    }
    stake = Math.min(stake, bank);
    // Una scheda su cui non si punta niente non e' una scheda giocata: contarla
    // gonfierebbe le vincenti senza mettere un euro sul tavolo.
    if (stake < 0.01) continue;

    const ret = slipWon ? stake * odds : 0;
    const pl = ret - stake;
    bank += pl;
    slips.push({ date, legs: chosen, odds, modelProb, marketProb, stake, ret, pl, bank, won: slipWon });
  }

  if (!slips.length) { console.log('  Nessuna scheda con questi filtri.\n'); return; }

  if (dettaglio) {
    for (const s of slips) {
      console.log('-'.repeat(76));
      console.log(`  ${s.date}   SCHEDA ${slips.indexOf(s) + 1}${s.won ? '   VINTA' : '   PERSA'}`);
      for (const l of s.legs) {
        console.log(`    ${l.won ? '✓' : '✗'} ${l.m.home} — ${l.m.away}   ${l.m.hg}-${l.m.ag}   (${l.m.league})`);
        console.log(`      ${l.pick.label} @ ${l.pick.best.toFixed(2)}   mercato ${(l.pick.consensusProb * 100).toFixed(1)}%   modello ${(l.pick.modelProb * 100).toFixed(1)}%`);
      }
      console.log(`    quota ${s.odds.toFixed(2)}   puntata ${s.stake.toFixed(2)}   incasso ${s.ret.toFixed(2)}   ` +
        `${s.pl >= 0 ? '+' : ''}${s.pl.toFixed(2)} EUR   cassa ${s.bank.toFixed(2)}`);
    }
  }

  // Riepilogo.
  const staked = slips.reduce((a, s) => a + s.stake, 0);
  const profit = slips.reduce((a, s) => a + s.pl, 0);
  const wins = slips.filter(s => s.won).length;
  const avgOdds = slips.reduce((a, s) => a + s.odds, 0) / slips.length;

  // Significativita' sotto l'ipotesi di quote eque, dove la varianza di una
  // scommessa da 1 unita' a quota o vale esattamente (o - 1). Con le puntate
  // variabili si pesa per la puntata.
  const nullVar = slips.reduce((a, s) => a + s.stake * s.stake * (s.odds - 1), 0);
  const z = nullVar > 0 ? profit / Math.sqrt(nullVar) : 0;

  // Massima perdita dal picco: e' il numero che dice se la strategia si puo'
  // davvero tenere, molto piu' del ROI.
  let peak = capitale, maxDD = 0;
  for (const s of slips) {
    peak = Math.max(peak, s.bank);
    maxDD = Math.max(maxDD, (peak - s.bank) / peak);
  }
  let streak = 0, worstStreak = 0;
  for (const s of slips) { streak = s.won ? 0 : streak + 1; worstStreak = Math.max(worstStreak, streak); }

  console.log('\n' + '='.repeat(76));
  console.log(`  Schede giocate:     ${slips.length}   vinte ${wins} (${((wins / slips.length) * 100).toFixed(1)}%)   quota media ${avgOdds.toFixed(2)}`);
  console.log(`  Totale puntato:     ${staked.toFixed(2)} EUR`);
  console.log(`  Totale incassato:   ${slips.reduce((a, s) => a + s.ret, 0).toFixed(2)} EUR`);
  console.log(`  Risultato:          ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} EUR   (ROI sul puntato ${((profit / staked) * 100).toFixed(2)}%)   z = ${z.toFixed(2)}${Math.abs(z) > 1.96 ? '  *' : ''}`);
  console.log(`  Cassa: ${capitale.toFixed(2)} → ${bank.toFixed(2)} EUR   (${(((bank / capitale) - 1) * 100 >= 0 ? '+' : '')}${(((bank / capitale) - 1) * 100).toFixed(1)}%)`);
  console.log(`  Perdita massima dal picco: ${(maxDD * 100).toFixed(1)}%   sconfitte di fila: ${worstStreak}`);
  console.log('='.repeat(76) + '\n');
}

main();
