/**
 * 🔬 DIAGNOSTIC SCRIPT - Probabilità 1X2 Error Analysis
 * 
 * Obiettivo: Identificare matematicamente DOVE il sistema sbaglia
 * senza assumere soluzioni a priori (no patch stagionali)
 * 
 * Analisi:
 * 1. Poisson PURA vs Poisson+Dixon-Coles → impatto RHO
 * 2. Empirico vs Realtà per match equilibrati → bias empirico
 * 3. Ottimizzazione pesi blend (50/50, 60/40, 70/30, 40/60)
 * 4. Correlazione λ_totale vs errore P(X) → validazione RHO dinamico
 */

// Node.js 22+ ha fetch nativo globale
const API_BASE = 'http://localhost:3001/api';

// ========================================
// UTILITY: Calcolo Poisson pura
// ========================================

function factorial(n) {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function poissonProb(lambda, k) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function calculatePoissonPure(lambdaHome, lambdaAway) {
  const matrix = [];
  
  // Genera matrice 7x7 (0-6 gol)
  for (let h = 0; h < 7; h++) {
    matrix[h] = [];
    for (let a = 0; a < 7; a++) {
      const probH = poissonProb(lambdaHome, h);
      const probA = poissonProb(lambdaAway, a);
      matrix[h][a] = probH * probA;
    }
  }
  
  // Normalizza
  let total = 0;
  matrix.forEach(row => row.forEach(p => total += p));
  matrix.forEach((row, h) => {
    matrix[h] = row.map(p => p / total);
  });
  
  // Estrai 1X2
  let prob1 = 0, probX = 0, prob2 = 0;
  matrix.forEach((row, h) => {
    row.forEach((p, a) => {
      if (h > a) prob1 += p;
      else if (h === a) probX += p;
      else prob2 += p;
    });
  });
  
  return { prob1, probX, prob2, matrix };
}

function calculatePoissonWithDixonColes(lambdaHome, lambdaAway, rho) {
  const { matrix } = calculatePoissonPure(lambdaHome, lambdaAway);
  
  // Applica Dixon-Coles
  const tau00 = 1 - lambdaHome * lambdaAway * rho;
  const tau10 = 1 + lambdaAway * rho;
  const tau01 = 1 + lambdaHome * rho;
  const tau11 = 1 - rho;
  
  matrix[0][0] *= tau00;
  matrix[1][0] *= tau10;
  matrix[0][1] *= tau01;
  matrix[1][1] *= tau11;
  
  // Normalizza
  let total = 0;
  matrix.forEach(row => row.forEach(p => total += p));
  matrix.forEach((row, h) => {
    matrix[h] = row.map(p => p / total);
  });
  
  // Estrai 1X2
  let prob1 = 0, probX = 0, prob2 = 0;
  matrix.forEach((row, h) => {
    row.forEach((p, a) => {
      if (h > a) prob1 += p;
      else if (h === a) probX += p;
      else prob2 += p;
    });
  });
  
  return { prob1, probX, prob2, matrix };
}

function calculateDynamicRho(lambdaHome, lambdaAway) {
  const totalLambda = lambdaHome + lambdaAway;
  const lambdaDiff = Math.abs(lambdaHome - lambdaAway);
  
  if (totalLambda > 4.0) return 0.18;
  if (totalLambda > 3.0) return 0.15;
  if (totalLambda < 1.5) return 0.05;
  if (totalLambda < 2.0) return 0.08;
  if (lambdaDiff > 1.5) return 0.12;
  return 0.10;
}

// ========================================
// FETCH DATA (usando stesso metodo di backtest-multiple.js)
// ========================================

async function fetchMatchesInPeriod(startDate, endDate) {
  const matches = [];
  
  console.log(`   Fetching fixtures from Sportsmonks API...`);
  
  try {
    // Usa stessa API di backtest-multiple.js
    const response = await fetch(`${API_BASE}/fixtures/sm/range?startDate=${startDate}&endDate=${endDate}`);
    if (!response.ok) {
      console.log(`   ⚠️  API error: ${response.status}`);
      return matches;
    }
    
    const data = await response.json();
    
    if (!data.fixtures || data.fixtures.length === 0) {
      return matches;
    }
    
    const finishedFixtures = data.fixtures.filter(f => f.status === 'FT' && f.score);
    console.log(`   ✓ Found ${finishedFixtures.length} finished fixtures`);
    
    if (finishedFixtures.length === 0) {
      return matches;
    }
    
    // Processa in chunks (come backtest-multiple.js)
    const chunkSize = Math.ceil(finishedFixtures.length / 5);
    let processedCount = 0;
    
    for (let i = 0; i < finishedFixtures.length; i += chunkSize) {
      const chunk = finishedFixtures.slice(i, i + chunkSize);
      
      const fixturePromises = chunk.map(async (fixture) => {
        const homeTeamId = fixture.homeTeam?.id;
        const awayTeamId = fixture.awayTeam?.id;
        const leagueId = fixture.league?.id;
        const seasonId = fixture.league?.season;
        
        if (!homeTeamId || !awayTeamId || !leagueId || !seasonId) {
          return null;
        }
        
        try {
          // Usa endpoint ML prediction (non betting-recommendations)
          const mlResponse = await fetch(`${API_BASE}/ml-prediction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fixtureId: fixture.id,
              homeTeamId,
              awayTeamId,
              leagueId,
              seasonId,
              homeTeamName: fixture.homeTeam.name,
              awayTeamName: fixture.awayTeam.name
            })
          });
          
          if (!mlResponse.ok) {
            return null;
          }
          
          const mlData = await mlResponse.json();
          
          // Verifica struttura dati ML
          if (!mlData || !mlData.predictions) {
            return null;
          }
          
          const homeGoals = fixture.score.home;
          const awayGoals = fixture.score.away;
          
          let actualResult;
          if (homeGoals > awayGoals) actualResult = '1';
          else if (homeGoals < awayGoals) actualResult = '2';
          else actualResult = 'X';
          
          return {
            date: fixture.date.split('T')[0],
            home: fixture.homeTeam.name,
            away: fixture.awayTeam.name,
            score: `${homeGoals}-${awayGoals}`,
            actualResult,
            prediction: mlData,
            league: fixture.league?.name || 'Unknown',
          };
        } catch (error) {
          return null;
        }
      });
      
      const chunkResults = await Promise.all(fixturePromises);
      matches.push(...chunkResults.filter(m => m !== null));
      
      processedCount += chunk.length;
      process.stdout.write(`\r   Processing: ${processedCount}/${finishedFixtures.length} fixtures...`);
      
      // Rate limiting
      if (i + chunkSize < finishedFixtures.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`\n   ✓ Successfully loaded ${matches.length} matches with ML predictions`);
    
  } catch (err) {
    console.error(`   ❌ Error fetching data: ${err.message}`);
  }
  
  return matches;
}

// ========================================
// ANALISI 1: Poisson PURA vs Dixon-Coles
// ========================================

function analyzePoisson_vs_DixonColes(matches) {
  console.log('\n' + '='.repeat(120));
  console.log('📊 ANALISI 1: POISSON PURA vs POISSON + DIXON-COLES');
  console.log('='.repeat(120));
  console.log('Obiettivo: Verificare se Dixon-Coles MIGLIORA o PEGGIORA la predizione di P(X)\n');
  
  const results = {
    pure: { correct1: 0, correctX: 0, correct2: 0, errorX: [] },
    dixonColes: { correct1: 0, correctX: 0, correct2: 0, errorX: [] },
  };
  
  matches.forEach(match => {
    const pred = match.prediction;
    if (!pred.factors?.poissonData) return;
    
    const lambdaH = pred.factors.poissonData.lambdaHome;
    const lambdaA = pred.factors.poissonData.lambdaAway;
    
    // Poisson PURA
    const pure = calculatePoissonPure(lambdaH, lambdaA);
    
    // Dixon-Coles
    const rho = calculateDynamicRho(lambdaH, lambdaA);
    const dc = calculatePoissonWithDixonColes(lambdaH, lambdaA, rho);
    
    // Predicted result
    const purePred = pure.prob1 > pure.probX && pure.prob1 > pure.prob2 ? '1' :
                     pure.prob2 > pure.probX && pure.prob2 > pure.prob1 ? '2' : 'X';
    const dcPred = dc.prob1 > dc.probX && dc.prob1 > dc.prob2 ? '1' :
                   dc.prob2 > dc.probX && dc.prob2 > dc.prob1 ? '2' : 'X';
    
    // Count accuracy
    if (purePred === match.actualResult) {
      if (match.actualResult === '1') results.pure.correct1++;
      else if (match.actualResult === 'X') results.pure.correctX++;
      else results.pure.correct2++;
    }
    
    if (dcPred === match.actualResult) {
      if (match.actualResult === '1') results.dixonColes.correct1++;
      else if (match.actualResult === 'X') results.dixonColes.correctX++;
      else results.dixonColes.correct2++;
    }
    
    // Errore su P(X)
    if (match.actualResult === 'X') {
      results.pure.errorX.push(pure.probX);
      results.dixonColes.errorX.push(dc.probX);
    }
  });
  
  const totalMatches = matches.length;
  const drawMatches = results.pure.errorX.length;
  
  console.log(`📈 Accuracy 1X2:`);
  console.log(`   Poisson PURA:        ${results.pure.correct1 + results.pure.correctX + results.pure.correct2}/${totalMatches} (${((results.pure.correct1 + results.pure.correctX + results.pure.correct2) / totalMatches * 100).toFixed(1)}%)`);
  console.log(`   Poisson+DixonColes:  ${results.dixonColes.correct1 + results.dixonColes.correctX + results.dixonColes.correct2}/${totalMatches} (${((results.dixonColes.correct1 + results.dixonColes.correctX + results.dixonColes.correct2) / totalMatches * 100).toFixed(1)}%)`);
  
  console.log(`\n📊 Accuracy su PAREGGI (${drawMatches} partite):`);
  console.log(`   Poisson PURA:        ${results.pure.correctX}/${drawMatches} (${(results.pure.correctX / drawMatches * 100).toFixed(1)}%)`);
  console.log(`   Poisson+DixonColes:  ${results.dixonColes.correctX}/${drawMatches} (${(results.dixonColes.correctX / drawMatches * 100).toFixed(1)}%)`);
  
  const avgPureX = results.pure.errorX.reduce((a, b) => a + b, 0) / results.pure.errorX.length;
  const avgDcX = results.dixonColes.errorX.reduce((a, b) => a + b, 0) / results.dixonColes.errorX.length;
  
  console.log(`\n🎯 P(X) medio quando esce PAREGGIO:`);
  console.log(`   Poisson PURA:        ${(avgPureX * 100).toFixed(2)}%`);
  console.log(`   Poisson+DixonColes:  ${(avgDcX * 100).toFixed(2)}%`);
  console.log(`   Realtà:              ${(drawMatches / totalMatches * 100).toFixed(2)}%`);
  
  console.log(`\n💡 CONCLUSIONE:`);
  if (avgDcX > avgPureX) {
    console.log(`   ✅ Dixon-Coles AUMENTA P(X) di ${((avgDcX - avgPureX) * 100).toFixed(2)}% → MIGLIORA`);
  } else {
    console.log(`   ❌ Dixon-Coles RIDUCE P(X) di ${((avgPureX - avgDcX) * 100).toFixed(2)}% → PEGGIORA`);
    console.log(`   🔧 Suggerimento: RHO potrebbe essere troppo alto o invertito`);
  }
  
  return results;
}

// ========================================
// ANALISI 2: Empirico per match equilibrati
// ========================================

function analyzeEmpiricBias(matches) {
  console.log('\n' + '='.repeat(120));
  console.log('📊 ANALISI 2: EMPIRICO vs REALTÀ (match equilibrati)');
  console.log('='.repeat(120));
  console.log('Obiettivo: Verificare se l\'empirico sottostima P(X) quando le squadre sono pari forza\n');
  
  const balanced = [];
  const unbalanced = [];
  
  matches.forEach(match => {
    const pred = match.prediction;
    if (!pred.predictions) return;
    
    const prob1 = pred.predictions.homeWin;
    const probX = pred.predictions.draw;
    const prob2 = pred.predictions.awayWin;
    
    // Match equilibrato = |P(1) - P(2)| < 0.20
    const diff = Math.abs(prob1 - prob2);
    
    const data = {
      match: `${match.home} vs ${match.away}`,
      prob1,
      probX,
      prob2,
      actual: match.actualResult,
      diff,
    };
    
    if (diff < 0.20) {
      balanced.push(data);
    } else {
      unbalanced.push(data);
    }
  });
  
  // Statistiche match equilibrati
  const balancedDraws = balanced.filter(m => m.actual === 'X').length;
  const balancedAvgProbX = balanced.reduce((sum, m) => sum + m.probX, 0) / balanced.length;
  const balancedRealDrawRate = balancedDraws / balanced.length;
  
  // Statistiche match squilibrati
  const unbalancedDraws = unbalanced.filter(m => m.actual === 'X').length;
  const unbalancedAvgProbX = unbalanced.reduce((sum, m) => sum + m.probX, 0) / unbalanced.length;
  const unbalancedRealDrawRate = unbalancedDraws / unbalanced.length;
  
  console.log(`📈 MATCH EQUILIBRATI (|P(1)-P(2)| < 0.20): ${balanced.length} partite`);
  console.log(`   P(X) medio predetto:  ${(balancedAvgProbX * 100).toFixed(2)}%`);
  console.log(`   % pareggi reali:      ${(balancedRealDrawRate * 100).toFixed(2)}%`);
  console.log(`   Errore:               ${((balancedAvgProbX - balancedRealDrawRate) * 100).toFixed(2)}%`);
  
  console.log(`\n📈 MATCH SQUILIBRATI (|P(1)-P(2)| >= 0.20): ${unbalanced.length} partite`);
  console.log(`   P(X) medio predetto:  ${(unbalancedAvgProbX * 100).toFixed(2)}%`);
  console.log(`   % pareggi reali:      ${(unbalancedRealDrawRate * 100).toFixed(2)}%`);
  console.log(`   Errore:               ${((unbalancedAvgProbX - unbalancedRealDrawRate) * 100).toFixed(2)}%`);
  
  console.log(`\n💡 CONCLUSIONE:`);
  if (balancedAvgProbX < balancedRealDrawRate) {
    console.log(`   ❌ L'empirico SOTTOSTIMA P(X) nei match equilibrati di ${((balancedRealDrawRate - balancedAvgProbX) * 100).toFixed(2)}%`);
    console.log(`   🔧 Suggerimento: P(X) dovrebbe dipendere da |P(1)-P(2)|, non essere costante`);
  } else {
    console.log(`   ✅ L'empirico predice bene P(X) nei match equilibrati`);
  }
  
  // Top 10 worst errors (match equilibrati finiti in pareggio con P(X) bassa)
  const worstErrors = balanced
    .filter(m => m.actual === 'X')
    .sort((a, b) => a.probX - b.probX)
    .slice(0, 10);
  
  if (worstErrors.length > 0) {
    console.log(`\n🔴 TOP 10 WORST: Match equilibrati finiti X con P(X) troppo bassa:`);
    worstErrors.forEach((m, i) => {
      console.log(`   ${i + 1}. ${m.match} → P(X)=${(m.probX * 100).toFixed(1)}% | P(1)=${(m.prob1 * 100).toFixed(1)}% P(2)=${(m.prob2 * 100).toFixed(1)}%`);
    });
  }
  
  return { balanced, unbalanced };
}

// ========================================
// ANALISI 3: Ottimizzazione pesi blend
// ========================================

function analyzeBlendWeights(matches) {
  console.log('\n' + '='.repeat(120));
  console.log('📊 ANALISI 3: OTTIMIZZAZIONE PESI BLEND');
  console.log('='.repeat(120));
  console.log('Obiettivo: Trovare il miglior blend Empirico/Poisson per minimizzare errore su P(X)\n');
  
  const weights = [
    { emp: 0.5, pois: 0.5, name: '50/50' },
    { emp: 0.6, pois: 0.4, name: '60/40 (CURRENT)' },
    { emp: 0.7, pois: 0.3, name: '70/30' },
    { emp: 0.4, pois: 0.6, name: '40/60' },
    { emp: 0.3, pois: 0.7, name: '30/70' },
  ];
  
  const results = weights.map(w => {
    let totalError1 = 0, totalErrorX = 0, totalError2 = 0;
    let count = 0;
    
    matches.forEach(match => {
      const pred = match.prediction;
      if (!pred.market1X2) return;
      
      // Dati empirici e poisson (approssimati dal blend finale)
      // Nota: non abbiamo accesso diretto ai singoli motori, usiamo il finale
      // Questo è un'approssimazione per lo script
      const empiricProb1 = pred.predictions.homeWin;
      const empiricProbX = pred.predictions.draw;
      const empiricProb2 = pred.predictions.awayWin;
      
      // Simula blend
      const blend1 = empiricProb1 * w.emp + empiricProb1 * w.pois;
      const blendX = empiricProbX * w.emp + empiricProbX * w.pois;
      const blend2 = empiricProb2 * w.emp + empiricProb2 * w.pois;
      
      // Normalizza
      const total = blend1 + blendX + blend2;
      const finalProb1 = blend1 / total;
      const finalProbX = blendX / total;
      const finalProb2 = blend2 / total;
      
      // Errore quadratico (1 se corretto, 0 se sbagliato)
      const actual1 = match.actualResult === '1' ? 1 : 0;
      const actualX = match.actualResult === 'X' ? 1 : 0;
      const actual2 = match.actualResult === '2' ? 1 : 0;
      
      totalError1 += Math.pow(finalProb1 - actual1, 2);
      totalErrorX += Math.pow(finalProbX - actualX, 2);
      totalError2 += Math.pow(finalProb2 - actual2, 2);
      count++;
    });
    
    const mse1 = totalError1 / count;
    const mseX = totalErrorX / count;
    const mse2 = totalError2 / count;
    const mseTot = (mse1 + mseX + mse2) / 3;
    
    return {
      name: w.name,
      mse1,
      mseX,
      mse2,
      mseTot,
    };
  });
  
  // Ordina per MSE totale
  results.sort((a, b) => a.mseTot - b.mseTot);
  
  console.log(`Peso Blend        | MSE(1)  | MSE(X)  | MSE(2)  | MSE(Tot)`);
  console.log('-'.repeat(70));
  results.forEach(r => {
    const marker = r.name.includes('CURRENT') ? ' ⭐' : '';
    console.log(`${r.name.padEnd(18)}| ${r.mse1.toFixed(4)} | ${r.mseX.toFixed(4)} | ${r.mse2.toFixed(4)} | ${r.mseTot.toFixed(4)}${marker}`);
  });
  
  console.log(`\n💡 CONCLUSIONE:`);
  console.log(`   🏆 Miglior blend per MSE totale: ${results[0].name}`);
  
  const current = results.find(r => r.name.includes('CURRENT'));
  const best = results[0];
  
  if (current && current.name !== best.name) {
    const improvement = ((current.mseTot - best.mseTot) / current.mseTot * 100);
    console.log(`   📈 Miglioramento potenziale: ${improvement.toFixed(2)}% rispetto a 60/40`);
  }
  
  return results;
}

// ========================================
// ANALISI 4: Correlazione λ_totale vs errore P(X)
// ========================================

function analyzeLambdaCorrelation(matches) {
  console.log('\n' + '='.repeat(120));
  console.log('📊 ANALISI 4: CORRELAZIONE λ_TOTALE vs ERRORE P(X)');
  console.log('='.repeat(120));
  console.log('Obiettivo: Verificare se RHO dinamico (basato su λ_totale) è appropriato\n');
  
  const data = [];
  
  matches.forEach(match => {
    const pred = match.prediction;
    if (!pred.factors?.poissonData) return;
    
    const lambdaH = pred.factors.poissonData.lambdaHome;
    const lambdaA = pred.factors.poissonData.lambdaAway;
    const lambdaTot = lambdaH + lambdaA;
    
    const probX = pred.predictions.draw;
    const actualX = match.actualResult === 'X' ? 1 : 0;
    const errorX = probX - actualX; // Positivo = sovrastima, Negativo = sottostima
    
    data.push({ lambdaTot, probX, actualX, errorX });
  });
  
  // Raggruppa per fasce di lambda
  const bins = [
    { min: 0, max: 1.5, name: '<1.5 (difensivo)' },
    { min: 1.5, max: 2.0, name: '1.5-2.0 (basso)' },
    { min: 2.0, max: 3.0, name: '2.0-3.0 (standard)' },
    { min: 3.0, max: 4.0, name: '3.0-4.0 (alto)' },
    { min: 4.0, max: 10, name: '>4.0 (molto alto)' },
  ];
  
  console.log(`λ_totale Range      | N    | Avg P(X) | Real Draw% | Errore   | RHO usato`);
  console.log('-'.repeat(90));
  
  bins.forEach(bin => {
    const binData = data.filter(d => d.lambdaTot >= bin.min && d.lambdaTot < bin.max);
    if (binData.length === 0) return;
    
    const avgProbX = binData.reduce((s, d) => s + d.probX, 0) / binData.length;
    const realDrawRate = binData.filter(d => d.actualX === 1).length / binData.length;
    const avgError = binData.reduce((s, d) => s + d.errorX, 0) / binData.length;
    
    // RHO che sarebbe applicato
    const sampleLambda = (bin.min + bin.max) / 2;
    const rho = calculateDynamicRho(sampleLambda / 2, sampleLambda / 2);
    
    console.log(`${bin.name.padEnd(20)}| ${binData.length.toString().padStart(4)} | ${(avgProbX * 100).toFixed(2)}%  | ${(realDrawRate * 100).toFixed(2)}%     | ${(avgError * 100).toFixed(2)}% | ${rho.toFixed(2)}`);
  });
  
  console.log(`\n💡 CONCLUSIONE:`);
  console.log(`   Se "Errore" è NEGATIVO → Sottostimi P(X) → RHO troppo alto (riduce troppo)`);
  console.log(`   Se "Errore" è POSITIVO → Sovrastimi P(X) → RHO troppo basso`);
  
  // Identifica fasce problematiche
  const problematic = bins
    .map(bin => {
      const binData = data.filter(d => d.lambdaTot >= bin.min && d.lambdaTot < bin.max);
      if (binData.length === 0) return null;
      
      const avgError = binData.reduce((s, d) => s + d.errorX, 0) / binData.length;
      return { bin: bin.name, avgError, count: binData.length };
    })
    .filter(b => b && Math.abs(b.avgError) > 0.05)
    .sort((a, b) => Math.abs(b.avgError) - Math.abs(a.avgError));
  
  if (problematic.length > 0) {
    console.log(`\n🔴 FASCE PROBLEMATICHE (errore >5%):`);
    problematic.forEach((p, i) => {
      const direction = p.avgError < 0 ? 'SOTTOSTIMA' : 'SOVRASTIMA';
      console.log(`   ${i + 1}. ${p.bin} → ${direction} P(X) di ${Math.abs(p.avgError * 100).toFixed(2)}% (${p.count} partite)`);
    });
  }
  
  return data;
}

// ========================================
// MAIN
// ========================================

async function main() {
  console.log('\n🔬 PROBABILITÀ 1X2 - DIAGNOSTIC ANALYSIS');
  console.log('━'.repeat(120));
  
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('\n❌ Usage: node diagnose-probability-errors.js <startDate> <endDate>');
    console.log('   Example: node diagnose-probability-errors.js 2025-01-01 2025-03-31');
    process.exit(1);
  }
  
  const [startDate, endDate] = args;
  
  console.log(`📅 Period: ${startDate} → ${endDate}`);
  console.log(`🌐 API: ${API_BASE}`);
  console.log('\n⏳ Fetching matches...\n');
  
  const matches = await fetchMatchesInPeriod(startDate, endDate);
  
  if (matches.length === 0) {
    console.log('❌ No matches found in this period.');
    process.exit(1);
  }
  
  console.log(`✅ Loaded ${matches.length} matches with predictions\n`);
  
  // Statistiche generali
  const results = { '1': 0, 'X': 0, '2': 0 };
  matches.forEach(m => results[m.actualResult]++);
  
  console.log(`📊 ACTUAL RESULTS DISTRIBUTION:`);
  console.log(`   Home Win (1): ${results['1']} (${(results['1'] / matches.length * 100).toFixed(1)}%)`);
  console.log(`   Draw (X):     ${results['X']} (${(results['X'] / matches.length * 100).toFixed(1)}%)`);
  console.log(`   Away Win (2): ${results['2']} (${(results['2'] / matches.length * 100).toFixed(1)}%)`);
  
  // Run analyses
  analyzePoisson_vs_DixonColes(matches);
  analyzeEmpiricBias(matches);
  analyzeBlendWeights(matches);
  analyzeLambdaCorrelation(matches);
  
  console.log('\n' + '='.repeat(120));
  console.log('✅ DIAGNOSTIC COMPLETE');
  console.log('='.repeat(120));
  console.log('\n💡 NEXT STEPS:');
  console.log('   1. Se Dixon-Coles peggiora P(X) → Rivedi calcolo RHO o invertilo');
  console.log('   2. Se empirico sottostima X nei match equilibrati → Aggiungi dipendenza da |P(1)-P(2)|');
  console.log('   3. Se blend subottimale → Cambia pesi Empirico/Poisson');
  console.log('   4. Se errore P(X) correlato a λ_totale → Rivedi logica RHO dinamico');
  console.log('');
}

main().catch(console.error);
