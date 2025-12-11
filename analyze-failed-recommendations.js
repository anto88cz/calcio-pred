/**
 * 🔍 ANALYZE FAILED RECOMMENDATIONS
 * 
 * Obiettivo: Capire PERCHÉ le raccomandazioni DC perdono
 * 
 * Analisi:
 * 1. Per raccomandazioni 12 PERSE (esito DRAW) → quale era P(X)?
 * 2. Per raccomandazioni X2 PERSE (esito HOME_WIN) → quale era P(1)?
 * 3. Per raccomandazioni 1X PERSE (esito AWAY_WIN) → quale era P(2)?
 * 4. Trova soglie ottimali per P(X), P(1), P(2) nei filtri raccomandazioni
 */

const API_BASE = 'http://localhost:3001/api';

// ========================================
// FETCH DATA
// ========================================

async function fetchMatchesInPeriod(startDate, endDate) {
  const matches = [];
  
  console.log(`   Fetching fixtures from Sportsmonks API...`);
  
  try {
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
    
    // Processa in chunks
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
          // Fetch raccomandazioni (include mlData)
          const recsResponse = await fetch(`${API_BASE}/betting-recommendations`, {
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
          
          if (!recsResponse.ok) {
            return null;
          }
          
          const recsData = await recsResponse.json();
          
          if (!recsData.recommendations || recsData.recommendations.length === 0) {
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
            recommendations: recsData.recommendations,
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
    
    console.log(`\n   ✓ Successfully loaded ${matches.length} matches with recommendations`);
    
  } catch (err) {
    console.error(`   ❌ Error fetching data: ${err.message}`);
  }
  
  return matches;
}

// ========================================
// ANALISI RACCOMANDAZIONI FALLITE
// ========================================

function analyzeFailedRecommendations(matches) {
  console.log('\n' + '='.repeat(120));
  console.log('🔍 ANALISI RACCOMANDAZIONI FALLITE');
  console.log('='.repeat(120));
  console.log('Obiettivo: Capire perché le DC perdono e trovare soglie ottimali\n');
  
  const failed12 = []; // 12 raccomandato → esce DRAW
  const failedX2 = []; // X2 raccomandato → esce HOME_WIN
  const failed1X = []; // 1X raccomandato → esce AWAY_WIN
  
  const success12 = []; // 12 raccomandato → esce 1 o 2
  const successX2 = []; // X2 raccomandato → esce X o 2
  const success1X = []; // 1X raccomandato → esce 1 o X
  
  matches.forEach(match => {
    match.recommendations.forEach(rec => {
      const prediction = rec.prediction;
      const actual = match.actualResult;
      
      // Estrai probabilità dal modelProbability (che è %)
      // La raccomandazione dovrebbe avere anche le prob individuali
      const probModel = rec.modelProbability / 100; // es: 75% → 0.75
      
      // Per le DC, dobbiamo dedurre le prob singole
      // Assumiamo che le raccomandazioni abbiano anche info sulle prob 1X2
      // Se non disponibili, dobbiamo fare fetch di mlData separatamente
      
      if (prediction === '12') {
        // 12 = P(1) + P(2) = 1 - P(X)
        // Quindi P(X) = 1 - modelProbability
        const probX = 1 - probModel;
        
        if (actual === 'X') {
          // FAILED: raccomandato 12, uscito X
          failed12.push({
            match: `${match.home} vs ${match.away}`,
            date: match.date,
            score: match.score,
            prob12: probModel,
            probX: probX,
            confidence: rec.confidence,
            odds: rec.odds,
            ev: rec.expectedValue,
          });
        } else {
          // SUCCESS: raccomandato 12, uscito 1 o 2
          success12.push({
            match: `${match.home} vs ${match.away}`,
            probX: probX,
          });
        }
      }
      
      if (prediction === 'X2') {
        // X2 = P(X) + P(2) = 1 - P(1)
        // Quindi P(1) = 1 - modelProbability
        const prob1 = 1 - probModel;
        
        if (actual === '1') {
          // FAILED: raccomandato X2, uscito 1
          failedX2.push({
            match: `${match.home} vs ${match.away}`,
            date: match.date,
            score: match.score,
            probX2: probModel,
            prob1: prob1,
            confidence: rec.confidence,
            odds: rec.odds,
            ev: rec.expectedValue,
          });
        } else {
          // SUCCESS: raccomandato X2, uscito X o 2
          successX2.push({
            match: `${match.home} vs ${match.away}`,
            prob1: prob1,
          });
        }
      }
      
      if (prediction === '1X') {
        // 1X = P(1) + P(X) = 1 - P(2)
        // Quindi P(2) = 1 - modelProbability
        const prob2 = 1 - probModel;
        
        if (actual === '2') {
          // FAILED: raccomandato 1X, uscito 2
          failed1X.push({
            match: `${match.home} vs ${match.away}`,
            date: match.date,
            score: match.score,
            prob1X: probModel,
            prob2: prob2,
            confidence: rec.confidence,
            odds: rec.odds,
            ev: rec.expectedValue,
          });
        } else {
          // SUCCESS: raccomandato 1X, uscito 1 o X
          success1X.push({
            match: `${match.home} vs ${match.away}`,
            prob2: prob2,
          });
        }
      }
    });
  });
  
  // ========================================
  // REPORT 12 FALLITE
  // ========================================
  
  console.log(`\n📊 RACCOMANDAZIONI 12 (Casa o Trasferta)`);
  console.log(`   Total raccomandazioni 12: ${failed12.length + success12.length}`);
  console.log(`   ❌ Perse (esito DRAW): ${failed12.length} (${(failed12.length / (failed12.length + success12.length) * 100).toFixed(1)}%)`);
  console.log(`   ✅ Vinte (esito 1 o 2): ${success12.length} (${(success12.length / (failed12.length + success12.length) * 100).toFixed(1)}%)`);
  
  if (failed12.length > 0) {
    const avgProbX_failed = failed12.reduce((sum, f) => sum + f.probX, 0) / failed12.length;
    const avgProbX_success = success12.reduce((sum, s) => sum + s.probX, 0) / success12.length;
    
    console.log(`\n   🎯 P(X) medio quando 12 PERDE: ${(avgProbX_failed * 100).toFixed(2)}%`);
    console.log(`   🎯 P(X) medio quando 12 VINCE: ${(avgProbX_success * 100).toFixed(2)}%`);
    console.log(`   📉 Differenza: ${((avgProbX_failed - avgProbX_success) * 100).toFixed(2)}%`);
    
    // Trova soglia ottimale
    const allProbX = [...failed12.map(f => ({ probX: f.probX, result: 'LOSS' })), 
                      ...success12.map(s => ({ probX: s.probX, result: 'WIN' }))];
    allProbX.sort((a, b) => a.probX - b.probX);
    
    let bestThreshold = 0;
    let bestWinRate = 0;
    
    for (let threshold = 0.15; threshold <= 0.35; threshold += 0.01) {
      const filtered = allProbX.filter(p => p.probX <= threshold);
      if (filtered.length === 0) continue;
      
      const wins = filtered.filter(p => p.result === 'WIN').length;
      const winRate = wins / filtered.length;
      
      if (winRate > bestWinRate && filtered.length >= 10) {
        bestWinRate = winRate;
        bestThreshold = threshold;
      }
    }
    
    console.log(`\n   💡 SOGLIA OTTIMALE per 12: P(X) < ${(bestThreshold * 100).toFixed(0)}%`);
    console.log(`      → Win rate atteso: ${(bestWinRate * 100).toFixed(1)}%`);
    console.log(`      → Raccomandazioni filtrate: ${allProbX.filter(p => p.probX <= bestThreshold).length}/${allProbX.length}`);
    
    // Top 10 worst
    console.log(`\n   🔴 TOP 10 WORST (12 raccomandato con P(X) troppo alta):`);
    failed12.sort((a, b) => b.probX - a.probX).slice(0, 10).forEach((f, i) => {
      console.log(`      ${i + 1}. ${f.match} (${f.score}) → P(X)=${(f.probX * 100).toFixed(1)}% | Conf=${f.confidence}% | EV=${(f.ev * 100).toFixed(1)}%`);
    });
  }
  
  // ========================================
  // REPORT X2 FALLITE
  // ========================================
  
  console.log(`\n\n📊 RACCOMANDAZIONI X2 (Pareggio o Trasferta)`);
  console.log(`   Total raccomandazioni X2: ${failedX2.length + successX2.length}`);
  console.log(`   ❌ Perse (esito HOME_WIN): ${failedX2.length} (${(failedX2.length / (failedX2.length + successX2.length) * 100).toFixed(1)}%)`);
  console.log(`   ✅ Vinte (esito X o 2): ${successX2.length} (${(successX2.length / (failedX2.length + successX2.length) * 100).toFixed(1)}%)`);
  
  if (failedX2.length > 0) {
    const avgProb1_failed = failedX2.reduce((sum, f) => sum + f.prob1, 0) / failedX2.length;
    const avgProb1_success = successX2.reduce((sum, s) => sum + s.prob1, 0) / successX2.length;
    
    console.log(`\n   🎯 P(1) medio quando X2 PERDE: ${(avgProb1_failed * 100).toFixed(2)}%`);
    console.log(`   🎯 P(1) medio quando X2 VINCE: ${(avgProb1_success * 100).toFixed(2)}%`);
    console.log(`   📉 Differenza: ${((avgProb1_failed - avgProb1_success) * 100).toFixed(2)}%`);
    
    // Trova soglia ottimale
    const allProb1 = [...failedX2.map(f => ({ prob1: f.prob1, result: 'LOSS' })), 
                      ...successX2.map(s => ({ prob1: s.prob1, result: 'WIN' }))];
    allProb1.sort((a, b) => a.prob1 - b.prob1);
    
    let bestThreshold = 0;
    let bestWinRate = 0;
    
    for (let threshold = 0.15; threshold <= 0.40; threshold += 0.01) {
      const filtered = allProb1.filter(p => p.prob1 <= threshold);
      if (filtered.length === 0) continue;
      
      const wins = filtered.filter(p => p.result === 'WIN').length;
      const winRate = wins / filtered.length;
      
      if (winRate > bestWinRate && filtered.length >= 10) {
        bestWinRate = winRate;
        bestThreshold = threshold;
      }
    }
    
    console.log(`\n   💡 SOGLIA OTTIMALE per X2: P(1) < ${(bestThreshold * 100).toFixed(0)}%`);
    console.log(`      → Win rate atteso: ${(bestWinRate * 100).toFixed(1)}%`);
    console.log(`      → Raccomandazioni filtrate: ${allProb1.filter(p => p.prob1 <= bestThreshold).length}/${allProb1.length}`);
    
    // Top 10 worst
    console.log(`\n   🔴 TOP 10 WORST (X2 raccomandato con P(1) troppo alta):`);
    failedX2.sort((a, b) => b.prob1 - a.prob1).slice(0, 10).forEach((f, i) => {
      console.log(`      ${i + 1}. ${f.match} (${f.score}) → P(1)=${(f.prob1 * 100).toFixed(1)}% | Conf=${f.confidence}% | EV=${(f.ev * 100).toFixed(1)}%`);
    });
  }
  
  // ========================================
  // REPORT 1X FALLITE
  // ========================================
  
  console.log(`\n\n📊 RACCOMANDAZIONI 1X (Casa o Pareggio)`);
  console.log(`   Total raccomandazioni 1X: ${failed1X.length + success1X.length}`);
  console.log(`   ❌ Perse (esito AWAY_WIN): ${failed1X.length} (${(failed1X.length / (failed1X.length + success1X.length) * 100).toFixed(1)}%)`);
  console.log(`   ✅ Vinte (esito 1 o X): ${success1X.length} (${(success1X.length / (failed1X.length + success1X.length) * 100).toFixed(1)}%)`);
  
  if (failed1X.length > 0) {
    const avgProb2_failed = failed1X.reduce((sum, f) => sum + f.prob2, 0) / failed1X.length;
    const avgProb2_success = success1X.reduce((sum, s) => sum + s.prob2, 0) / success1X.length;
    
    console.log(`\n   🎯 P(2) medio quando 1X PERDE: ${(avgProb2_failed * 100).toFixed(2)}%`);
    console.log(`   🎯 P(2) medio quando 1X VINCE: ${(avgProb2_success * 100).toFixed(2)}%`);
    console.log(`   📉 Differenza: ${((avgProb2_failed - avgProb2_success) * 100).toFixed(2)}%`);
    
    // Trova soglia ottimale
    const allProb2 = [...failed1X.map(f => ({ prob2: f.prob2, result: 'LOSS' })), 
                      ...success1X.map(s => ({ prob2: s.prob2, result: 'WIN' }))];
    allProb2.sort((a, b) => a.prob2 - b.prob2);
    
    let bestThreshold = 0;
    let bestWinRate = 0;
    
    for (let threshold = 0.15; threshold <= 0.40; threshold += 0.01) {
      const filtered = allProb2.filter(p => p.prob2 <= threshold);
      if (filtered.length === 0) continue;
      
      const wins = filtered.filter(p => p.result === 'WIN').length;
      const winRate = wins / filtered.length;
      
      if (winRate > bestWinRate && filtered.length >= 10) {
        bestWinRate = winRate;
        bestThreshold = threshold;
      }
    }
    
    console.log(`\n   💡 SOGLIA OTTIMALE per 1X: P(2) < ${(bestThreshold * 100).toFixed(0)}%`);
    console.log(`      → Win rate atteso: ${(bestWinRate * 100).toFixed(1)}%`);
    console.log(`      → Raccomandazioni filtrate: ${allProb2.filter(p => p.prob2 <= bestThreshold).length}/${allProb2.length}`);
    
    // Top 10 worst
    console.log(`\n   🔴 TOP 10 WORST (1X raccomandato con P(2) troppo alta):`);
    failed1X.sort((a, b) => b.prob2 - a.prob2).slice(0, 10).forEach((f, i) => {
      console.log(`      ${i + 1}. ${f.match} (${f.score}) → P(2)=${(f.prob2 * 100).toFixed(1)}% | Conf=${f.confidence}% | EV=${(f.ev * 100).toFixed(1)}%`);
    });
  }
}

// ========================================
// MAIN
// ========================================

async function main() {
  console.log('\n🔍 FAILED RECOMMENDATIONS ANALYSIS');
  console.log('━'.repeat(120));
  
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('\n❌ Usage: node analyze-failed-recommendations.js <startDate> <endDate>');
    console.log('   Example: node analyze-failed-recommendations.js 2025-11-01 2025-11-30');
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
  
  console.log(`✅ Loaded ${matches.length} matches with recommendations\n`);
  
  analyzeFailedRecommendations(matches);
  
  console.log('\n' + '='.repeat(120));
  console.log('✅ ANALYSIS COMPLETE');
  console.log('='.repeat(120));
  console.log('\n💡 NEXT STEPS:');
  console.log('   1. Applica soglie ottimali trovate nei filtri raccomandazioni DC');
  console.log('   2. Per 12: aggiungi filtro P(X) < soglia_ottimale');
  console.log('   3. Per X2: aggiungi filtro P(1) < soglia_ottimale');
  console.log('   4. Per 1X: aggiungi filtro P(2) < soglia_ottimale');
  console.log('');
}

main().catch(console.error);
