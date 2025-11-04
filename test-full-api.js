// Test completo API Calcio-Pred
const axios = require('axios');

async function testCalcioPredAPI() {
  console.log('🚀 Testing Calcio-Pred API...\n');
  
  const baseURL = 'http://localhost:3001';
  
  try {
    // 1. Health Check
    console.log('1️⃣ Health Check...');
    const health = await axios.get(`${baseURL}/health`);
    console.log(`   ✅ Status: ${health.data.status} (uptime: ${Math.round(health.data.uptime)}s)\n`);
    
    // 2. Test Fixtures endpoint
    console.log('2️⃣ Test /api/fixtures...');
    try {
      const fixtures = await axios.get(`${baseURL}/api/fixtures`);
      console.log(`   ✅ Fixtures response: ${fixtures.status}`);
      console.log(`   📊 Data: ${JSON.stringify(fixtures.data).substring(0, 100)}...\n`);
    } catch (err) {
      console.log(`   ⚠️  Fixtures error: ${err.response?.status} - ${err.message}\n`);
    }
    
    // 3. Test Predictions endpoint  
    console.log('3️⃣ Test /api/predictions...');
    try {
      const predictions = await axios.get(`${baseURL}/api/predictions`);
      console.log(`   ✅ Predictions response: ${predictions.status}`);
      console.log(`   📊 Data: ${JSON.stringify(predictions.data).substring(0, 100)}...\n`);
    } catch (err) {
      console.log(`   ⚠️  Predictions error: ${err.response?.status} - ${err.message}\n`);
    }
    
    // 4. Test Mock Prediction Calculation
    console.log('4️⃣ Test Mock Prediction Calculation...');
    try {
      const mockPrediction = await axios.post(`${baseURL}/api/predictions/calculate`, {
        fixtureId: 12345,
        homeTeamId: 489, // Inter
        awayTeamId: 497, // Juventus
        season: 2024,
        leagueId: 135
      });
      console.log(`   ✅ Mock prediction: ${mockPrediction.status}`);
      console.log(`   📊 Result: ${JSON.stringify(mockPrediction.data).substring(0, 150)}...\n`);
    } catch (err) {
      console.log(`   ⚠️  Mock prediction error: ${err.response?.status} - ${err.message}\n`);
    }
    
    console.log('🎉 Test completato!');
    
  } catch (error) {
    console.error('❌ Errore generale:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Assicurati che il server API sia in esecuzione su http://localhost:3001');
    }
  }
}

testCalcioPredAPI();