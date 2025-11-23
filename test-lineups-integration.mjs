/**
 * TEST LINEUPS INTEGRATION
 * Verifica che le lineups vengano recuperate e parsate correttamente
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

async function testLineupsIntegration() {
  console.log('🧪 TEST LINEUPS INTEGRATION\n');
  
  try {
    // 1. Get today's fixtures
    const today = new Date().toISOString().split('T')[0];
    console.log(`📅 Fetching fixtures for ${today}...`);
    
    const fixturesRes = await axios.get(`${API_BASE}/fixtures/sm/range`, {
      params: {
        startDate: today,
        endDate: today,
        includeAllLeagues: true,
      },
    });
    
    const fixtures = fixturesRes.data.data || [];
    console.log(`✅ Found ${fixtures.length} fixtures\n`);
    
    if (fixtures.length === 0) {
      console.log('❌ No fixtures today. Try with a different date.');
      return;
    }
    
    // 2. Test lineup fetching for first 3 fixtures
    const testFixtures = fixtures.slice(0, 3);
    
    for (const fixture of testFixtures) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`🏟️  ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`);
      console.log(`   ID: ${fixture.id}`);
      console.log(`   League: ${fixture.league.name} (${fixture.league.country})`);
      console.log(`   Date: ${fixture.date}`);
      
      try {
        // Test prediction endpoint (should fetch lineups internally)
        console.log(`\n🔮 Generating prediction...`);
        const predictionRes = await axios.post(`${API_BASE}/predictions/generate`, {
          fixtureId: fixture.id,
        });
        
        const prediction = predictionRes.data.data;
        
        if (prediction) {
          console.log(`\n✅ Prediction generated:`);
          console.log(`   Confidence: ${(prediction.confidence * 100).toFixed(1)}%`);
          console.log(`   Outcome: ${prediction.prediction}`);
          console.log(`   Has Lineup: ${prediction.hasLineup ? 'YES ✅' : 'NO ❌'}`);
          
          if (prediction.metadata?.lineupStatus !== undefined) {
            console.log(`   Lineup Status Score: ${(prediction.metadata.lineupStatus * 100).toFixed(1)}%`);
          }
          
          // Log if lineups are affecting confidence
          if (prediction.hasLineup && prediction.metadata?.lineupStatus < 0.9) {
            console.log(`\n⚠️  WARNING: Incomplete lineups detected`);
            console.log(`   This is reducing prediction confidence`);
          }
          
        } else {
          console.log(`❌ No prediction generated`);
        }
        
      } catch (error) {
        console.error(`❌ Error generating prediction:`, error.response?.data || error.message);
      }
    }
    
    console.log(`\n${'='.repeat(80)}\n`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testLineupsIntegration().catch(console.error);
