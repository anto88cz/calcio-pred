// 🏆 TEST LEAGUE STRENGTH - GET PREDICTIONS
const axios = require('axios');

async function testLeagueStrength() {
  console.log('🏆 ==========================================');
  console.log('🏆 TEST LEAGUE STRENGTH ADJUSTMENT');
  console.log('🏆 ==========================================\n');

  try {
    console.log('🔍 Fetching predictions from API...');
    console.log('   (This will show league strength in backend logs)\n');

    const response = await axios.get('http://localhost:3001/api/predictions', {
      timeout: 120000 // 2 minuti
    });

    const predictions = response.data;
    
    console.log(`✅ Received ${predictions.length} predictions\n`);

    if (predictions.length > 0) {
      const first = predictions[0];
      console.log('📊 First prediction:');
      console.log(`   ${first.homeTeam} vs ${first.awayTeam}`);
      console.log(`   Confidence: ${(first.confidence * 100).toFixed(2)}%`);
      console.log(`   Lambda Home: ${first.poissonParams?.lambdaHome?.toFixed(4)}`);
      console.log(`   Lambda Away: ${first.poissonParams?.lambdaAway?.toFixed(4)}`);
    }

    console.log('\n🔍 IMPORTANTE:');
    console.log('   📌 Guarda i log del backend dove gira "npm run dev"');
    console.log('   📌 Per OGNI predizione dovresti vedere l\'emoji 🏆 con:');
    console.log('      - League name (e.g., "Premier League", "Champions League")');
    console.log('      - Coefficient (e.g., 1.00, 1.05, 0.92)');
    console.log('      - Lambda before/after league adjustment');
    console.log('      - League adjustment percentage');
    console.log('\n🏆 ==========================================');

  } catch (error) {
    console.error('\n❌ ERRORE:', error.response?.data || error.message);
    if (error.code === 'ECONNABORTED') {
      console.log('\n⏱️  Timeout - probabilmente nessun fixture disponibile');
    }
  }
}

testLeagueStrength();
