// Ricalcola le predizioni per le 4 partite di oggi
const API_URL = 'http://localhost:3001';

const fixtures = [
  { id: 238, home: 'Werder Bremen', away: 'VfL Wolfsburg' },
  { id: 240, home: 'Paris FC', away: 'Rennes' },
  { id: 239, home: 'Pisa', away: 'Cremonese' },
  { id: 241, home: 'Elche', away: 'Real Sociedad' }
];

async function recalculatePredictions() {
  console.log('\n🔄 RECALCULATING PREDICTIONS WITH DIXON-COLES FIX\n');
  console.log('='.repeat(120));
  
  for (const fixture of fixtures) {
    console.log(`\n📊 ${fixture.home} vs ${fixture.away} (Fixture ID: ${fixture.id})`);
    console.log('-'.repeat(120));
    
    try {
      // Fetch fixture details
      const fixtureRes = await fetch(`${API_URL}/api/fixtures/${fixture.id}`);
      const fixtureData = await fixtureRes.json();
      
      if (!fixtureData || !fixtureData.homeTeam || !fixtureData.awayTeam) {
        console.log('   ❌ Could not fetch fixture details');
        continue;
      }
      
      // Calculate prediction
      console.log('   🔄 Calculating prediction...');
      
      const predRes = await fetch(`${API_URL}/api/predictions/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixtureId: fixture.id,
          homeTeamId: fixtureData.homeTeam.apiId,
          awayTeamId: fixtureData.awayTeam.apiId,
          season: fixtureData.leagueSeason,
          leagueId: fixtureData.leagueId
        })
      });
      
      if (!predRes.ok) {
        const error = await predRes.text();
        console.log(`   ❌ Error: ${error}`);
        continue;
      }
      
      const prediction = await predRes.json();
      
      console.log('\n   ✅ PREDICTION CALCULATED:');
      console.log(`      Lambda: Home=${prediction.lambdaHome.toFixed(3)}, Away=${prediction.lambdaAway.toFixed(3)}`);
      console.log(`      1X2: ${(prediction.prob1Final * 100).toFixed(1)}% / ${(prediction.probXFinal * 100).toFixed(1)}% / ${(prediction.prob2Final * 100).toFixed(1)}%`);
      console.log(`      Strength: ${prediction.strength1X2}`);
      console.log(`      Confidence: ${(prediction.confidence * 100).toFixed(1)}%`);
      
      if (prediction.exactGoals) {
        console.log('\n   🎯 TOP 5 EXACT SCORES (Poisson + Dixon-Coles):');
        
        // Get mostProbableScores if available
        if (prediction.mostProbableScores && prediction.mostProbableScores.length > 0) {
          prediction.mostProbableScores.forEach((score, i) => {
            const marker = i === 0 ? '👉' : '  ';
            console.log(`      ${marker} ${score.homeGoals}-${score.awayGoals}: ${(score.probability * 100).toFixed(2)}%`);
          });
        } else {
          console.log('      (mostProbableScores not returned by API)');
        }
      }
      
      console.log('');
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(120));
  console.log('\n✅ DONE! Refresh the frontend to see updated predictions.\n');
  console.log('   Expected changes:');
  console.log('   - Pisa vs Cremonese: TOP should be 1-0 (not 1-1)');
  console.log('   - Elche vs Real Sociedad: TOP should be 1-0 (not 1-1)');
  console.log('   - Paris FC vs Rennes: TOP should be 2-1 (not 1-1)');
  console.log('   - Werder vs Wolfsburg: TOP should be 0-1 (not 1-1)\n');
}

recalculatePredictions().catch(console.error);
