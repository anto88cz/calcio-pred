// 🏆 TEST LEAGUE STRENGTH - SIMPLE VERSION
const axios = require('axios');

async function testLeagueStrength() {
  console.log('🏆 ==========================================');
  console.log('🏆 TEST LEAGUE STRENGTH ADJUSTMENT');
  console.log('🏆 ==========================================\n');

  try {
    // Usa team che sappiamo esistere (dal seed)
    // Liverpool (ID 40) vs Arsenal (ID 42) - Premier League (ID 39)
    console.log('🔍 Testing with: Liverpool vs Arsenal (Premier League)');
    console.log('   Expected coefficient: 1.00 (Premier League standard)\n');

    const response = await axios.post('http://localhost:3001/api/predictions/calculate', {
      homeTeamId: 40,     // Liverpool
      awayTeamId: 42,     // Arsenal  
      leagueId: 39,       // Premier League
      season: 2024,
      fixtureId: 999999   // Fake ID for testing
    }, {
      timeout: 60000
    });

    const data = response.data;
    
    console.log('✅ PREDIZIONE RICEVUTA\n');
    console.log('🏠 HOME (Liverpool):');
    console.log(`   Lambda: ${data.poissonParams.lambdaHome.toFixed(4)}\n`);

    console.log('🛫 AWAY (Arsenal):');
    console.log(`   Lambda: ${data.poissonParams.lambdaAway.toFixed(4)}\n`);

    console.log('💪 CONFIDENCE:');
    console.log(`   Value: ${(data.confidence * 100).toFixed(2)}%\n`);

    console.log('🔍 IMPORTANTE:');
    console.log('   📌 Guarda i log del backend dove gira "npm run dev"');
    console.log('   📌 Dovresti vedere l\'emoji 🏆 con:');
    console.log('      - League name: Premier League');
    console.log('      - Coefficient: 1.00');
    console.log('      - Lambda before/after league adjustment');
    console.log('\n🏆 ==========================================');
    console.log('📊 FULL RESPONSE:');
    console.log(JSON.stringify(data, null, 2));
    console.log('🏆 ==========================================');

  } catch (error) {
    console.error('\n❌ ERRORE:', error.response?.data || error.message);
    if (error.code === 'ECONNABORTED') {
      console.log('\n⏱️  Timeout - la richiesta sta impiegando troppo tempo');
      console.log('   Probabilmente sta fetchando dati storici da API-FOOTBALL');
    }
  }
}

testLeagueStrength();
