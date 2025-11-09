/**
 * Test specifico per statistiche stagionali
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

async function testSeasonStats() {
  console.log('🧪 Testing Season Stats Fetching\n');
  
  const testData = {
    fixtureId: 19424986,  // Juventus vs Torino
    homeTeamId: 625,      // Juventus
    awayTeamId: 613,      // Torino
    seasonId: 25533,
    leagueId: 384,
    homeTeamName: 'Juventus',
    awayTeamName: 'Torino',
  };

  console.log('📊 Test Data:', testData);
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
    
    console.log('📈 Season Stats - Home (Juventus):');
    const homeStats = result.factors.seasonStats.homeStats;
    if (homeStats && Object.keys(homeStats).length > 0) {
      console.log('  Matches Played:', homeStats.matchesPlayed || '❌ Missing');
      console.log('  Goals Scored:', homeStats.goalsScored || '❌ Missing');
      console.log('  Goals Conceded:', homeStats.goalsConceded || '❌ Missing');
      console.log('  Wins:', homeStats.wins || '❌ Missing');
      console.log('  Draws:', homeStats.draws || '❌ Missing');
      console.log('  Losses:', homeStats.losses || '❌ Missing');
      console.log('  Avg Goals Scored:', homeStats.avgGoalsScored?.toFixed(2) || '❌ Missing');
      console.log('  Win Rate:', (homeStats.winRate * 100)?.toFixed(1) + '%' || '❌ Missing');
    } else {
      console.log('  ❌ NO STATS AVAILABLE');
    }
    
    console.log('\n📈 Season Stats - Away (Torino):');
    const awayStats = result.factors.seasonStats.awayStats;
    if (awayStats && Object.keys(awayStats).length > 0) {
      console.log('  Matches Played:', awayStats.matchesPlayed || '❌ Missing');
      console.log('  Goals Scored:', awayStats.goalsScored || '❌ Missing');
      console.log('  Goals Conceded:', awayStats.goalsConceded || '❌ Missing');
      console.log('  Wins:', awayStats.wins || '❌ Missing');
      console.log('  Draws:', awayStats.draws || '❌ Missing');
      console.log('  Losses:', awayStats.losses || '❌ Missing');
      console.log('  Avg Goals Scored:', awayStats.avgGoalsScored?.toFixed(2) || '❌ Missing');
      console.log('  Win Rate:', (awayStats.winRate * 100)?.toFixed(1) + '%' || '❌ Missing');
    } else {
      console.log('  ❌ NO STATS AVAILABLE');
    }
    
    console.log('\n⚡ xG Data:');
    console.log('  Home Avg xG:', result.factors.xGData.homeAvgXG.toFixed(2));
    console.log('  Home Avg xGA:', result.factors.xGData.homeAvgXGA.toFixed(2));
    console.log('  Away Avg xG:', result.factors.xGData.awayAvgXG.toFixed(2));
    console.log('  Away Avg xGA:', result.factors.xGData.awayAvgXGA.toFixed(2));
    
    console.log('\n📊 Weights:');
    console.log('  H2H:', (result.factors.headToHead.weight * 100).toFixed(0) + '%');
    console.log('  Season Stats:', (result.factors.seasonStats.weight * 100).toFixed(0) + '%');
    console.log('  xG:', (result.factors.xGData.weight * 100).toFixed(0) + '%');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testSeasonStats();
