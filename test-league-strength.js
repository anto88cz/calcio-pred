// 🏆 TEST LEAGUE STRENGTH ADJUSTMENT
const axios = require('axios');

async function testLeagueStrength() {
  console.log('🏆 ==========================================');
  console.log('🏆 TEST LEAGUE STRENGTH ADJUSTMENT');
  console.log('🏆 ==========================================\n');

  try {
    // Prima recuperiamo i fixtures disponibili
    console.log('🔍 Fetching available fixtures...\n');
    const fixturesResponse = await axios.get('http://localhost:3001/api/fixtures');
    const fixtures = fixturesResponse.data;
    
    if (fixtures.length === 0) {
      console.log('❌ No fixtures available. Load fixtures first.');
      return;
    }

    // Usa il primo fixture disponibile
    const fixture = fixtures[0];
    console.log(`✅ Using fixture: ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`);
    console.log(`   League: ${fixture.league.name} (ID: ${fixture.leagueId})`);
    console.log(`   Fixture ID: ${fixture.id}\n`);

    // Test con il primo fixture disponibile
    const response = await axios.post('http://localhost:3001/api/predictions/calculate', {
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      leagueId: fixture.leagueId,
      season: 2024,
      fixtureId: fixture.id
    });

    const data = response.data;
    
    console.log('✅ PREDIZIONE RICEVUTA\n');
    console.log('🏆 LEAGUE STRENGTH INFO:');
    console.log(`   League: ${fixture.league.name}`);
    console.log('   Check backend logs for coefficient applied\n');

    console.log(`🏠 HOME (${fixture.homeTeam.name}):`);
    console.log(`   Lambda: ${data.poissonParams.lambdaHome.toFixed(4)}\n`);

    console.log(`🛫 AWAY (${fixture.awayTeam.name}):`);
    console.log(`   Lambda: ${data.poissonParams.lambdaAway.toFixed(4)}\n`);

    console.log('💪 CONFIDENCE:');
    console.log(`   Value: ${(data.confidence * 100).toFixed(2)}%\n`);

    console.log('🔍 VERIFICA:');
    console.log('   📌 Controlla i log del backend per vedere:');
    console.log('      "🏆 League strength adjustment applied"');
    console.log('      con i valori prima e dopo l\'adjustment\n');

    console.log('\n🏆 ==========================================');
    console.log('📊 RESPONSE COMPLETA:');
    console.log(JSON.stringify(data, null, 2));
    console.log('🏆 ==========================================');

  } catch (error) {
    console.error('❌ Errore:', error.response?.data || error.message);
  }
}

testLeagueStrength();
