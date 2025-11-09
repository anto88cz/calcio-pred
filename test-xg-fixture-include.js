const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'api', '.env') });

const API_KEY = process.env.SPORTSMONKS_API_KEY;

async function testXGFixtureInclude() {
  console.log('🔍 Test include xGFixture\n');
  
  try {
    // Test con la partita Union Berlin vs Bayern München
    const fixtureId = 19433556;
    
    console.log(`Testing fixture ${fixtureId}...\n`);
    
    // Test 1: Con xGFixture.type
    console.log('=== Test 1: include=xGFixture.type ===\n');
    try {
      const response1 = await axios.get(`https://api.sportmonks.com/v3/football/fixtures/${fixtureId}`, {
        params: {
          api_token: API_KEY,
          include: 'participants;scores;xGFixture.type',
        }
      });
      
      const fixture = response1.data.data;
      console.log(`Fixture: ${fixture.name}`);
      console.log(`Has xgfixture field: ${!!fixture.xgfixture}`);
      console.log(`xgfixture type: ${typeof fixture.xgfixture}`);
      
      if (fixture.xgfixture) {
        console.log(`xgfixture length: ${fixture.xgfixture.length}`);
        console.log(`xgfixture content:`, JSON.stringify(fixture.xgfixture, null, 2));
      }
    } catch (error) {
      console.error('Error with xGFixture.type:', error.response?.data?.message || error.message);
    }
    
    // Test 2: Con statistics.type (per vedere se gli xG sono nelle statistics)
    console.log('\n\n=== Test 2: include=statistics.type ===\n');
    try {
      const response2 = await axios.get(`https://api.sportmonks.com/v3/football/fixtures/${fixtureId}`, {
        params: {
          api_token: API_KEY,
          include: 'participants;scores;statistics.type',
        }
      });
      
      const fixture = response2.data.data;
      console.log(`Has statistics field: ${!!fixture.statistics}`);
      
      if (fixture.statistics && Array.isArray(fixture.statistics)) {
        console.log(`Statistics count: ${fixture.statistics.length}`);
        
        // Cerca statistiche xG
        const xgStats = fixture.statistics.filter(s => {
          const code = s.type?.code || '';
          const name = s.type?.name || '';
          return code.includes('xg') || code.includes('expected') || 
                 name.toLowerCase().includes('xg') || name.toLowerCase().includes('expected');
        });
        
        console.log(`\nxG-related statistics: ${xgStats.length}`);
        xgStats.forEach(stat => {
          console.log(`  - Type: ${stat.type?.code} (${stat.type?.name})`);
          console.log(`    Data:`, JSON.stringify(stat.data, null, 2));
        });
        
        // Mostra tutte le statistiche disponibili
        console.log(`\nTutte le statistiche disponibili:`);
        fixture.statistics.slice(0, 10).forEach(stat => {
          console.log(`  - ${stat.type?.code}: ${stat.type?.name}`);
        });
      }
    } catch (error) {
      console.error('Error with statistics.type:', error.response?.data?.message || error.message);
    }

    // Test 3: Senza include (per vedere la struttura base)
    console.log('\n\n=== Test 3: Struttura base fixture ===\n');
    const response3 = await axios.get(`https://api.sportmonks.com/v3/football/fixtures/${fixtureId}`, {
      params: {
        api_token: API_KEY,
      }
    });
    
    const fixture = response3.data.data;
    console.log('Campi disponibili nel fixture:');
    console.log(Object.keys(fixture).sort());

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testXGFixtureInclude().catch(console.error);
