/**
 * DIAGNOSTIC SCRIPT v2.0
 * Analizza un campione di predizioni in parallelo con output verboso
 */

const { isLeagueSupported } = require('./supported-leagues-config');

async function diagnose() {
  console.log('🔍 DIAGNOSTIC ANALYSIS v2.0\n');
  console.log('='.repeat(80));

  // Get test date - 7 novembre 2025 (yesterday - has confirmed matches)
  const testDate = new Date('2025-11-07');
  const dateStr = testDate.toISOString().split('T')[0];

  console.log(`\n📅 Analyzing matches from: ${dateStr}\n`);

  try {
    console.log('⏳ Step 1: Fetching fixtures from API...');
    const fetchStart = Date.now();
    
    const response = await fetch(`http://localhost:3001/api/fixtures/sm/range?startDate=${dateStr}&endDate=${dateStr}`);
    
    console.log(`✅ Response received in ${Date.now() - fetchStart}ms (status: ${response.status})`);
    
    const data = await response.json();
    console.log(`📦 Total fixtures in response: ${data.fixtures?.length || 0}`);
    
    const finished = (data.fixtures || []).filter(f => 
      (f.statusShort === 'FT' || f.statusShort === 'AET') &&
      f.score?.home !== null && f.score?.away !== null
    );

    console.log(`📊 Filtered to ${finished.length} finished matches with scores`);
    
    // 🔥 FILTER: Solo campionati supportati
    const supported = finished.filter(f => isLeagueSupported(f.league?.name || ''));
    console.log(`🔥 Filtered to ${supported.length} matches from supported leagues (removed ${finished.length - supported.length})\n`);

    if (supported.length === 0) {
      console.log('❌ No supported matches found. Try a different date.');
      return;
    }

    // Analyze first 10 matches
    const sample = supported.slice(0, 10);
    
    console.log('='.repeat(80));
    console.log(`\n⚡ Step 2: Launching parallel predictions for ${sample.length} matches...\n`);

    const predictions = { '1': 0, 'X': 0, '2': 0 };
    const actuals = { '1': 0, 'X': 0, '2': 0 };
    const confidences = [];

    // 🔧 Lancio TUTTE le predizioni in parallelo con Promise.all
    const parallelStart = Date.now();
    
    const predictionPromises = sample.map(async (match, idx) => {
      const startTime = Date.now();
      console.log(`[Request ${idx + 1}/${sample.length}] 🔄 ${match.homeTeam.name} vs ${match.awayTeam.name}`);
      
      try {
        const predResp = await fetch('http://localhost:3001/api/predictions/calculate-by-name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            homeTeamName: match.homeTeam.name,
            awayTeamName: match.awayTeam.name,
            fixtureId: match.id,
          }),
        });

        const elapsed = Date.now() - startTime;

        if (!predResp.ok) {
          console.log(`[Request ${idx + 1}] ❌ Failed with status ${predResp.status} after ${elapsed}ms`);
          return { match, error: predResp.status, idx };
        }

        const pred = await predResp.json();
        console.log(`[Request ${idx + 1}] ✅ Success in ${elapsed}ms (Confidence: ${(pred.confidence * 100).toFixed(0)}%)`);
        
        return { match, pred, error: null, idx };
      } catch (err) {
        const elapsed = Date.now() - startTime;
        console.log(`[Request ${idx + 1}] ❌ Exception after ${elapsed}ms: ${err.message}`);
        return { match, error: err.message, idx };
      }
    });

    console.log(`\n⏳ Waiting for all ${sample.length} parallel requests to complete...\n`);
    const results = await Promise.all(predictionPromises);
    
    const totalTime = Date.now() - parallelStart;
    const avgTime = totalTime / sample.length;
    
    console.log(`\n✅ All predictions completed in ${totalTime}ms (avg: ${avgTime.toFixed(0)}ms per match)\n`);
    console.log('='.repeat(80));
    console.log('\n📊 Step 3: Analyzing Results\n');
    console.log('='.repeat(80));

    // Ordina per indice originale
    results.sort((a, b) => a.idx - b.idx);

    // Analizza i risultati
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < results.length; i++) {
      const { match, pred, error } = results[i];
      
      console.log(`\n\n[Match ${i + 1}/${results.length}] ${match.homeTeam.name} vs ${match.awayTeam.name}`);
      console.log(`${'─'.repeat(80)}`);
      console.log(`📍 Actual Score: ${match.score.home}-${match.score.away}`);

      if (error) {
        console.log(`❌ Prediction Error: ${error}`);
        errorCount++;
        continue;
      }

      successCount++;

      // Actual result
      const actualResult = match.score.home > match.score.away ? '1' : 
                          match.score.home < match.score.away ? '2' : 'X';
      actuals[actualResult]++;

      // Predicted result - Use ML probabilities if available, fallback to classic
      let home, draw, away;
      if (pred.mlPrediction && pred.mlPrediction.probabilities) {
        home = pred.mlPrediction.probabilities.home;
        draw = pred.mlPrediction.probabilities.draw;
        away = pred.mlPrediction.probabilities.away;
      } else if (pred.market1X2) {
        home = pred.market1X2.home;
        draw = pred.market1X2.draw;
        away = pred.market1X2.away;
      } else {
        home = 0; draw = 0; away = 0;
      }

      console.log(`\n🎲 1X2 Probabilities ${pred.mlPrediction ? '(ML)' : '(Classic)'}:`);
      console.log(`   Home Win (1): ${(home * 100).toFixed(1)}% ${home > 0.45 ? '⭐' : ''}`);
      console.log(`   Draw (X):     ${(draw * 100).toFixed(1)}% ${draw > 0.35 ? '⭐' : ''}`);
      console.log(`   Away Win (2): ${(away * 100).toFixed(1)}% ${away > 0.45 ? '⭐' : ''}`);

      const predictedResult = home > draw && home > away ? '1' : 
                             away > draw && away > home ? '2' : 'X';
      predictions[predictedResult]++;

      const isCorrect = predictedResult === actualResult;
      console.log(`\n🎯 Prediction: ${predictedResult} | Actual: ${actualResult} ${isCorrect ? '✅ CORRECT' : '❌ WRONG'}`);
      console.log(`📊 Confidence: ${(pred.confidence * 100).toFixed(0)}% ${pred.confidence > 0.5 ? '(Good)' : pred.confidence > 0.3 ? '(Medium)' : '(Low)'}`);
      confidences.push(pred.confidence);

      console.log(`\n⚽ Expected Goals:`);
      // Use ML expected goals if available
      const lambdaHome = pred.mlPrediction?.expectedGoals?.home || pred.poissonParams?.lambdaHome || 0;
      const lambdaAway = pred.mlPrediction?.expectedGoals?.away || pred.poissonParams?.lambdaAway || 0;
      console.log(`   Predicted: ${lambdaHome.toFixed(2)} - ${lambdaAway.toFixed(2)} (total: ${(lambdaHome + lambdaAway).toFixed(2)})`);
      console.log(`   Actual:    ${match.score.home} - ${match.score.away} (total: ${match.score.home + match.score.away})`);
      
      const goalError = Math.abs((lambdaHome + lambdaAway) - (match.score.home + match.score.away));
      console.log(`   Error:     ${goalError.toFixed(2)} goals ${goalError < 1 ? '✅' : goalError < 2 ? '⚠️' : '❌'}`);

      console.log(`\n📈 Markets:`);
      console.log(`   Over 2.5:  ${(pred.marketUnderOver.over25 * 100).toFixed(1)}%`);
      console.log(`   BTTS Yes:  ${(pred.marketBTTS.yes * 100).toFixed(1)}%`);

      // Check recommendations
      if (pred.recommendations && pred.recommendations.length > 0) {
        console.log(`\n💡 Recommendations (${pred.recommendations.length}):`);
        pred.recommendations.forEach(r => {
          console.log(`   ✓ ${r.type}: ${r.option} (prob: ${(r.probability * 100).toFixed(0)}%, odds: ${r.suggestedOdds})`);
        });
      } else {
        console.log(`\n⚠️  No recommendations generated (low confidence or weak probabilities)`);
      }

      // ML Prediction details if available
      if (pred.mlPrediction) {
        console.log(`\n🤖 ML Model Details:`);
        console.log(`   Data Completeness: ${(pred.mlPrediction.confidence * 100).toFixed(0)}%`);
        if (pred.mlPrediction.factors) {
          const f = pred.mlPrediction.factors;
          console.log(`   Home Attack: ${f.homeStrength?.attack?.toFixed(2) || 'N/A'} | Defense: ${f.homeStrength?.defense?.toFixed(2) || 'N/A'}`);
          console.log(`   Away Attack: ${f.awayStrength?.attack?.toFixed(2) || 'N/A'} | Defense: ${f.awayStrength?.defense?.toFixed(2) || 'N/A'}`);
          console.log(`   Home Advantage: ${f.homeAdvantage?.toFixed(2) || 'N/A'}`);
        }
      }
    }

    // Final Summary
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 FINAL SUMMARY');
    console.log('='.repeat(80));

    console.log(`\n✅ Successful Predictions: ${successCount}/${results.length}`);
    console.log(`❌ Failed Predictions: ${errorCount}/${results.length}`);

    if (successCount > 0) {
      const correct1X2 = results.filter(r => {
        if (r.error || !r.pred) return false;
        const actual = r.match.score.home > r.match.score.away ? '1' : r.match.score.home < r.match.score.away ? '2' : 'X';
        const { home, draw, away } = r.pred.market1X2;
        const predicted = home > draw && home > away ? '1' : away > draw && away > home ? '2' : 'X';
        return actual === predicted;
      }).length;

      console.log(`\n🎯 1X2 Accuracy: ${correct1X2}/${successCount} (${(correct1X2/successCount*100).toFixed(1)}%)`);
      
      console.log(`\n📈 Prediction Distribution:`);
      console.log(`   Home Win (1): ${predictions['1']} predicted | ${actuals['1']} actual`);
      console.log(`   Draw (X):     ${predictions['X']} predicted | ${actuals['X']} actual`);
      console.log(`   Away Win (2): ${predictions['2']} predicted | ${actuals['2']} actual`);

      const avgConf = confidences.reduce((a, b) => a + b, 0) / confidences.length;
      console.log(`\n📊 Average Confidence: ${(avgConf * 100).toFixed(1)}%`);

      console.log('\n💡 Diagnosis:');
      
      const homePercent = predictions['1'] / successCount;
      const drawPercent = predictions['X'] / successCount;

      if (predictions['1'] === successCount || predictions['X'] === successCount || predictions['2'] === successCount) {
        console.log('   ❌ CRITICAL: Model predicting same outcome for all matches!');
        console.log('      Possible causes:');
        console.log('      - Using only fallback values (no historical data)');
        console.log('      - Extreme parameter bias');
      } else if (homePercent > 0.7) {
        console.log('   ⚠️  Model strongly biased toward home wins');
        console.log('      💡 Consider: Reduce HOME_ADVANTAGE parameter');
      } else if (drawPercent > 0.5) {
        console.log('   ⚠️  Model over-predicting draws');
        console.log('      💡 Consider: Adjust DIXON_COLES_RHO (more negative)');
      } else if (avgConf < 0.3) {
        console.log('   ⚠️  Very low confidence across predictions');
        console.log('      💡 Likely cause: Insufficient historical data');
      } else {
        console.log('   ✅ Model making varied predictions with reasonable confidence');
        console.log('      📝 Continue with parameter optimization');
      }
    }

    console.log('\n⏱️  Performance:');
    console.log(`   Total time: ${totalTime}ms`);
    console.log(`   Avg per match: ${avgTime.toFixed(0)}ms`);
    console.log(`   Speed improvement: ~${(sample.length * avgTime / totalTime).toFixed(1)}x faster than sequential\n`);

    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error(error.stack);
  }
}

diagnose().catch(console.error);
