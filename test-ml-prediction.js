/**
 * Test ML Prediction System
 * 
 * Verifica che il sistema di predizione ML funzioni correttamente
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

async function testMLPrediction() {
  console.log('🧪 Testing ML Prediction System\n');
  
  // Dati di test per una partita reale
  const testData = {
    fixtureId: 19424971,
    homeTeamId: 10722,  // Cremonese
    awayTeamId: 625,    // Juventus
    seasonId: 25533,
    leagueId: 384,
    homeTeamName: 'Cremonese',
    awayTeamName: 'Juventus',
  };

  console.log('📊 Test Data:');
  console.log(JSON.stringify(testData, null, 2));
  console.log('\n🌐 Calling ML Prediction API...\n');

  try {
    const response = await fetch(`${API_URL}/api/ml-prediction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ API Error:', error);
      process.exit(1);
    }

    const result = await response.json();

    console.log('✅ ML Prediction Result:\n');
    console.log('🏆 Match:', result.homeTeam, 'vs', result.awayTeam);
    console.log('📈 Confidence:', result.confidence + '%');
    console.log('\n📊 Predictions:');
    console.log('  Home Win:', (result.predictions.homeWin * 100).toFixed(1) + '%');
    console.log('  Draw:    ', (result.predictions.draw * 100).toFixed(1) + '%');
    console.log('  Away Win:', (result.predictions.awayWin * 100).toFixed(1) + '%');
    console.log('\n⚽ Expected Score:');
    console.log('  Home:', result.expectedScore.home);
    console.log('  Away:', result.expectedScore.away);
    console.log('\n🔍 Analysis:');
    console.log('  H2H Advantage:', result.analysis.headToHeadAdvantage);
    console.log('  Form Advantage:', result.analysis.formAdvantage);
    console.log('  xG Advantage:', result.analysis.xGAdvantage);
    console.log('  Strength Diff:', result.analysis.strengthDifference.toFixed(1));
    console.log('\n📜 Head to Head:');
    console.log('  Matches:', result.factors.headToHead.matches);
    console.log('  Home Wins:', result.factors.headToHead.homeWins);
    console.log('  Draws:', result.factors.headToHead.draws);
    console.log('  Away Wins:', result.factors.headToHead.awayWins);
    console.log('  Weight:', (result.factors.headToHead.weight * 100).toFixed(0) + '%');
    console.log('\n⚡ xG Data:');
    console.log('  Home Avg xG:', result.factors.xGData.homeAvgXG.toFixed(2));
    console.log('  Home Avg xGA:', result.factors.xGData.homeAvgXGA.toFixed(2));
    console.log('  Away Avg xG:', result.factors.xGData.awayAvgXG.toFixed(2));
    console.log('  Away Avg xGA:', result.factors.xGData.awayAvgXGA.toFixed(2));
    console.log('  Weight:', (result.factors.xGData.weight * 100).toFixed(0) + '%');
    console.log('\n💾 From Cache:', result.fromCache || false);
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run test
testMLPrediction();
