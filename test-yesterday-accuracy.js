async function testYesterdayAccuracy() {
  try {
    const testDate = '2025-11-04'; // 3 giorni fa - dovrebbe avere risultati consolidati
    
    console.log('📊 TESTING PREDICTION ACCURACY ON PAST MATCHES');
    console.log(`📅 Date: ${testDate}\n`);
    console.log('='.repeat(80));
    
    // Get matches from test date
    const response = await fetch(`http://localhost:3001/api/fixtures/sm/range?startDate=${testDate}&endDate=${testDate}`);
    const data = await response.json();
    
    if (!data.fixtures || data.fixtures.length === 0) {
      console.log(`❌ No matches found for ${testDate}`);
      return;
    }
    
    // Consider finished all matches with scores
    const finished = data.fixtures.filter(f => {
      const hasFTStatus = f.statusShort === 'FT' || f.statusShort === 'AET' || f.statusShort === 'PEN';
      const hasScore = f.homeScore !== null && f.homeScore !== undefined;
      return hasFTStatus || hasScore;
    });
    
    console.log(`\n✅ Found ${finished.length} finished matches out of ${data.fixtures.length} total\n`);
    
    if (finished.length === 0) {
      console.log('❌ No finished matches with scores available');
      return;
    }
    
    // Statistics
    let stats = {
      total: 0,
      correct1X2: 0,
      correctOver25: 0,
      correctUnder25: 0,
      correctBTTS: 0,
      goalErrorSum: 0,
      lowConfidenceMatches: 0,
      skippedNoData: 0,
    };
    
    const results = [];
    
    for (const match of finished.slice(0, 20)) {
      const homeScore = match.homeScore ?? 0;
      const awayScore = match.awayScore ?? 0;
      const totalGoals = homeScore + awayScore;
      
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`⚽ ${match.homeTeam.name} ${homeScore}-${awayScore} ${match.awayTeam.name}`);
      console.log(`   ${match.league.name} (${match.league.country})`);
      
      try {
        const predResponse = await fetch('http://localhost:3001/api/predictions/calculate-by-name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            homeTeamName: match.homeTeam.name,
            awayTeamName: match.awayTeam.name,
            fixtureId: match.id
          })
        });
        
        if (!predResponse.ok) {
          console.log(`   ⚠️ Prediction failed (${predResponse.status})`);
          stats.skippedNoData++;
          continue;
        }
        
        const pred = await predResponse.json();
        
        // Check confidence
        if (pred.confidence < 0.4) {
          console.log(`   ⚠️ Low confidence: ${(pred.confidence * 100).toFixed(0)}% - SKIPPED`);
          stats.lowConfidenceMatches++;
          continue;
        }
        
        stats.total++;
        
        // Calculations
        const expectedGoals = pred.poissonParams.lambdaHome + pred.poissonParams.lambdaAway;
        const goalError = Math.abs(totalGoals - expectedGoals);
        stats.goalErrorSum += goalError;
        
        // Actual result
        const actualResult = homeScore > awayScore ? '1' : homeScore < awayScore ? '2' : 'X';
        const predictedResult = pred.market1X2.home > pred.market1X2.draw && pred.market1X2.home > pred.market1X2.away ? '1' :
                                pred.market1X2.away > pred.market1X2.draw && pred.market1X2.away > pred.market1X2.home ? '2' : 'X';
        
        const correct1X2 = actualResult === predictedResult;
        if (correct1X2) stats.correct1X2++;
        
        // Over/Under 2.5
        const actualOver25 = totalGoals > 2.5;
        const predictedOver25 = pred.marketUnderOver.over25 > 0.5;
        const correctOver = actualOver25 === predictedOver25;
        if (correctOver) {
          if (actualOver25) stats.correctOver25++;
          else stats.correctUnder25++;
        }
        
        // BTTS
        const actualBTTS = homeScore > 0 && awayScore > 0;
        const predictedBTTS = pred.marketBTTS.yes > 0.5;
        const correctBTTS = actualBTTS === predictedBTTS;
        if (correctBTTS) stats.correctBTTS++;
        
        console.log(`\n   📊 PREDICTIONS:`);
        console.log(`      1X2: H:${(pred.market1X2.home * 100).toFixed(0)}% D:${(pred.market1X2.draw * 100).toFixed(0)}% A:${(pred.market1X2.away * 100).toFixed(0)}%`);
        console.log(`      Expected Goals: ${expectedGoals.toFixed(2)} | Real: ${totalGoals} | Error: ${goalError.toFixed(2)}`);
        console.log(`      Confidence: ${(pred.confidence * 100).toFixed(0)}%`);
        
        console.log(`\n   ✅ RESULTS:`);
        console.log(`      1X2: Predicted ${predictedResult} | Actual ${actualResult} | ${correct1X2 ? '✅ CORRECT' : '❌ WRONG'}`);
        console.log(`      Over 2.5: Predicted ${predictedOver25 ? 'YES' : 'NO'} | Actual ${actualOver25 ? 'YES' : 'NO'} | ${correctOver ? '✅ CORRECT' : '❌ WRONG'}`);
        console.log(`      BTTS: Predicted ${predictedBTTS ? 'YES' : 'NO'} | Actual ${actualBTTS ? 'YES' : 'NO'} | ${correctBTTS ? '✅ CORRECT' : '❌ WRONG'}`);
        
        results.push({
          match: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
          score: `${homeScore}-${awayScore}`,
          correct1X2,
          correctOver,
          correctBTTS,
          confidence: pred.confidence,
          goalError,
        });
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        stats.skippedNoData++;
      }
    }
    
    // FINAL STATISTICS
    console.log(`\n\n${'='.repeat(80)}`);
    console.log('📈 FINAL ACCURACY REPORT\n');
    
    if (stats.total === 0) {
      console.log('❌ No valid predictions to analyze');
      console.log(`   - Low confidence: ${stats.lowConfidenceMatches}`);
      console.log(`   - Failed: ${stats.skippedNoData}`);
      return;
    }
    
    const accuracy1X2 = (stats.correct1X2 / stats.total * 100).toFixed(1);
    const accuracyOver = ((stats.correctOver25 + stats.correctUnder25) / stats.total * 100).toFixed(1);
    const accuracyBTTS = (stats.correctBTTS / stats.total * 100).toFixed(1);
    const avgGoalError = (stats.goalErrorSum / stats.total).toFixed(2);
    
    console.log(`Total Analyzed: ${stats.total}`);
    console.log(`Low Confidence Skipped: ${stats.lowConfidenceMatches}`);
    console.log(`Failed/No Data: ${stats.skippedNoData}`);
    console.log('');
    console.log(`🎯 1X2 Accuracy: ${stats.correct1X2}/${stats.total} (${accuracy1X2}%)`);
    console.log(`📊 Over/Under 2.5: ${stats.correctOver25 + stats.correctUnder25}/${stats.total} (${accuracyOver}%)`);
    console.log(`⚽ BTTS Accuracy: ${stats.correctBTTS}/${stats.total} (${accuracyBTTS}%)`);
    console.log(`📉 Avg Goal Error: ${avgGoalError} goals`);
    
    console.log('\n' + '='.repeat(80));
    console.log('\n💡 ANALYSIS:');
    
    if (parseFloat(accuracy1X2) >= 50) {
      console.log(`   ✅ 1X2 accuracy ${accuracy1X2}% is GOOD for football predictions`);
    } else if (parseFloat(accuracy1X2) >= 40) {
      console.log(`   📊 1X2 accuracy ${accuracy1X2}% is ACCEPTABLE`);
    } else {
      console.log(`   ⚠️ 1X2 accuracy ${accuracy1X2}% is LOW - model needs improvement`);
    }
    
    if (parseFloat(avgGoalError) < 1.5) {
      console.log(`   ✅ Goal predictions accurate (avg error ${avgGoalError})`);
    } else if (parseFloat(avgGoalError) < 2.5) {
      console.log(`   📊 Goal predictions moderate (avg error ${avgGoalError})`);
    } else {
      console.log(`   ⚠️ Goal predictions off (avg error ${avgGoalError})`);
    }
    
    console.log('');
    
  } catch (error) {
    console.error('Fatal error:', error.message);
  }
}

testYesterdayAccuracy();
