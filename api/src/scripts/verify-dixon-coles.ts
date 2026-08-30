/**
 * Verifiche sulle invarianti del Dixon-Coles.
 *
 * Sono i controlli che l'audit chiedeva alla Fase 0.1 e che il vecchio motore
 * non superava: la matrice dei punteggi deve essere una distribuzione di
 * probabilita' su tutto l'intervallo dei lambda, tau deve restare positiva,
 * l'Over deve essere monotono nella soglia e Under + Over deve fare 1.
 *
 * Uso: npx tsx src/scripts/verify-dixon-coles.ts
 */

import { fitDixonColes, predict, tau, clampRho, DCMatch, DixonColesParams } from '../services/prediction/dixon-coles';

let failures = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FALLITO  ${name}${detail ? '  ' + detail : ''}`);
  }
}

function near(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) < tol;
}

/** Parametri finti, per pilotare i lambda a piacere senza stimare niente. */
function paramsFor(lambdaHome: number, lambdaAway: number, rho: number): DixonColesParams {
  return {
    mu: Math.log(lambdaAway),
    gamma: Math.log(lambdaHome / lambdaAway),
    rho,
    xi: 0,
    attack: { 1: 0, 2: 0 },
    defence: { 1: 0, 2: 0 },
    logLikelihood: 0,
    matches: 0,
    teams: 2,
    referenceDate: new Date().toISOString(),
    target: 'goals',
  };
}

console.log('\n--- tau resta positiva su tutto lo spazio dei lambda ---');
{
  let minTau = Infinity;
  let worst = '';
  for (const lh of [0.2, 0.8, 1.5, 2.5, 3.5, 5.0, 7.0]) {
    for (const la of [0.2, 0.8, 1.5, 2.5, 3.5, 5.0, 7.0]) {
      for (const rho of [-0.5, -0.25, -0.05, 0, 0.05, 0.25, 0.5]) {
        for (const [x, y] of [[0, 0], [0, 1], [1, 0], [1, 1], [2, 3]]) {
          const t = tau(x, y, lh, la, rho);
          if (t < minTau) { minTau = t; worst = `lh=${lh} la=${la} rho=${rho} score=${x}-${y}`; }
        }
      }
    }
  }
  check('tau > 0 sempre', minTau > 0, `minimo ${minTau.toExponential(2)} a ${worst}`);
  // Il caso che rompeva il codice precedente: lh*la > 5.56 con rho positivo.
  check('tau(0,0) > 0 con lambda alti', tau(0, 0, 4.0, 4.0, 0.18) > 0, `valore ${tau(0, 0, 4.0, 4.0, 0.18).toFixed(4)}`);
  check('clampRho rispetta il limite inferiore', clampRho(-5, 2.0, 1.5) > -1 / 2.0);
}

console.log('\n--- la matrice e una distribuzione di probabilita ---');
{
  for (const [lh, la, rho] of [[1.2, 0.9, -0.05], [2.8, 2.0, -0.13], [4.0, 4.0, 0.18], [0.3, 0.2, -0.3]]) {
    const p = predict(paramsFor(lh, la, rho), 1, 2);
    const total = p.prob1 + p.probX + p.prob2;
    check(`somma 1X2 = 1  (lh=${lh} la=${la} rho=${rho})`, near(total, 1, 1e-9), `somma ${total}`);
    check(`probabilita non negative  (lh=${lh} la=${la})`, p.prob1 >= 0 && p.probX >= 0 && p.prob2 >= 0);
  }
}

console.log('\n--- mercati Over/Under ---');
{
  const p = predict(paramsFor(1.6, 1.2, -0.05), 1, 2);
  const thresholds = ['0.5', '1.5', '2.5', '3.5', '4.5'];
  let monotone = true;
  for (let i = 1; i < thresholds.length; i++) {
    if (p.over[thresholds[i]] > p.over[thresholds[i - 1]]) monotone = false;
  }
  check('Over decrescente al crescere della soglia', monotone,
    thresholds.map(t => `${t}:${(p.over[t] * 100).toFixed(1)}%`).join(' '));
  let sumsOk = true;
  for (const t of thresholds) if (!near(p.over[t] + p.under[t], 1, 1e-9)) sumsOk = false;
  check('under + over = 1 su ogni soglia', sumsOk);
  check('Over 0.5 alto su 2.8 gol attesi', p.over['0.5'] > 0.85 && p.over['0.5'] < 1);
  check('BTTS si + no = 1', near(p.bttsYes + p.bttsNo, 1, 1e-9));
}

console.log('\n--- il vantaggio casa va nella direzione giusta ---');
{
  const p = predict(paramsFor(1.8, 1.1, -0.05), 1, 2);
  check('prob1 > prob2 con lambda casa maggiore', p.prob1 > p.prob2, `${(p.prob1 * 100).toFixed(1)}% vs ${(p.prob2 * 100).toFixed(1)}%`);
  const simmetrica = predict(paramsFor(1.4, 1.4, -0.05), 1, 2);
  check('prob1 = prob2 con lambda uguali', near(simmetrica.prob1, simmetrica.prob2, 1e-9));
}

console.log('\n--- rho sposta i punteggi bassi nella direzione di Dixon-Coles ---');
{
  const senza = predict(paramsFor(1.4, 1.1, 0), 1, 2);
  const con = predict(paramsFor(1.4, 1.1, -0.10), 1, 2);
  check('rho negativo aumenta il pareggio', con.probX > senza.probX,
    `${(senza.probX * 100).toFixed(2)}% -> ${(con.probX * 100).toFixed(2)}%`);
}

console.log('\n--- la stima ritrova parametri noti ---');
{
  // Due squadre, una forte e una debole, con risultati generati coerenti.
  const matches: DCMatch[] = [];
  const base = new Date('2025-01-01');
  for (let i = 0; i < 400; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    // squadra 1 segna in media di piu' della 2
    matches.push({ homeTeamId: 1, awayTeamId: 2, homeGoals: 3, awayGoals: 1, date: d });
    matches.push({ homeTeamId: 2, awayTeamId: 1, homeGoals: 1, awayGoals: 2, date: d });
  }
  const fit = fitDixonColes(matches, { iterations: 1500, learningRate: 0.05 });
  check('attacco della squadra forte piu alto', fit.attack[1] > fit.attack[2],
    `${fit.attack[1].toFixed(3)} vs ${fit.attack[2].toFixed(3)}`);
  check('difesa della squadra forte migliore', fit.defence[1] < fit.defence[2],
    `${fit.defence[1].toFixed(3)} vs ${fit.defence[2].toFixed(3)}`);
  check('vantaggio casa positivo', fit.gamma > 0, `gamma ${fit.gamma.toFixed(3)}`);
  check('media degli attacchi azzerata', near(fit.attack[1] + fit.attack[2], 0, 1e-6));
  const p = predict(fit, 1, 2);
  check('lambda casa vicino ai 3 gol osservati', Math.abs(p.lambdaHome - 3) < 0.35, `lambda ${p.lambdaHome.toFixed(2)}`);
}

console.log('\n--- stima su xG ---');
{
  const matches: DCMatch[] = [];
  const base = new Date('2025-01-01');
  for (let i = 0; i < 300; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    // I gol dicono 1-1, l'xG dice che la squadra 1 domina: il modello stimato
    // sull'xG deve dare la 1 favorita, quello stimato sui gol no.
    matches.push({ homeTeamId: 1, awayTeamId: 2, homeGoals: 1, awayGoals: 1, homeXg: 2.4, awayXg: 0.6, date: d });
    matches.push({ homeTeamId: 2, awayTeamId: 1, homeGoals: 1, awayGoals: 1, homeXg: 0.7, awayXg: 2.1, date: d });
  }
  const suGol = fitDixonColes(matches, { iterations: 1200, target: 'goals' });
  const suXg = fitDixonColes(matches, { iterations: 1200, target: 'xg' });
  check('sui gol le due squadre risultano pari', Math.abs(suGol.attack[1] - suGol.attack[2]) < 0.15,
    `scarto ${(suGol.attack[1] - suGol.attack[2]).toFixed(3)}`);
  check('sull xG la squadra 1 risulta piu forte', suXg.attack[1] - suXg.attack[2] > 0.5,
    `scarto ${(suXg.attack[1] - suXg.attack[2]).toFixed(3)}`);
  const pXg = predict(suXg, 1, 2);
  check('il livello resta tarato sui gol veri', Math.abs(pXg.lambdaHome + pXg.lambdaAway - 2) < 0.35,
    `totale ${(pXg.lambdaHome + pXg.lambdaAway).toFixed(2)} contro 2 gol osservati`);
  check('rho stimato sui gol resta nei limiti', suXg.rho >= -0.2 && suXg.rho <= 0.1, `rho ${suXg.rho}`);
}

console.log(failures === 0 ? '\nTutte le verifiche superate.\n' : `\n${failures} verifiche fallite.\n`);
process.exit(failures === 0 ? 0 : 1);
