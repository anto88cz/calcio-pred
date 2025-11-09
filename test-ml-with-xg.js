const axios = require('axios');

async function testMLPrediction() {
  try {
    console.log('Testing ML Prediction API...\n');
    
    const response = await axios.post('http://localhost:3001/api/ml-prediction', {
      fixtureId: 19424986,
      homeTeamId: 625,
      awayTeamId: 613,
      seasonId: 25533,
      leagueId: 384
    });

    const data = response.data;
    
    console.log(`🏟️  ${data.homeTeam} vs ${data.awayTeam}\n`);
    console.log('📊 Predictions:');
    console.log(`   Home Win: ${(data.predictions.homeWin * 100).toFixed(1)}%`);
    console.log(`   Draw: ${(data.predictions.draw * 100).toFixed(1)}%`);
    console.log(`   Away Win: ${(data.predictions.awayWin * 100).toFixed(1)}%\n`);
    
    console.log('⚽ Expected Score:', `${data.expectedScore.home} - ${data.expectedScore.away}\n`);
    
    console.log('📈 Season Stats:');
    console.log(`   ${data.homeTeam}: ${data.factors.seasonStats.homeStats.wins}W-${data.factors.seasonStats.homeStats.draws}D-${data.factors.seasonStats.homeStats.losses}L`);
    console.log(`   ${data.awayTeam}: ${data.factors.seasonStats.awayStats.wins}W-${data.factors.seasonStats.awayStats.draws}D-${data.factors.seasonStats.awayStats.losses}L\n`);
    
    console.log('⚡ xG Data:');
    console.log(`   Home Avg xG: ${data.factors.xGData.homeAvgXG}`);
    console.log(`   Home Avg xGA: ${data.factors.xGData.homeAvgXGA}`);
    console.log(`   Away Avg xG: ${data.factors.xGData.awayAvgXG}`);
    console.log(`   Away Avg xGA: ${data.factors.xGData.awayAvgXGA}`);
    console.log(`   Weight: ${(data.factors.xGData.weight * 100).toFixed(0)}%\n`);
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testMLPrediction();
