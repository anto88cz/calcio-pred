// Test semplice API-FOOTBALL
const axios = require('axios');

async function testAPI() {
  console.log('🧪 Test API-FOOTBALL...');
  
  try {
    const response = await axios.get('https://v3.football.api-sports.io/status', {
      headers: {
        'x-rapidapi-key': 'd5f809551b3fa59226715bbcf64c90b5'
      }
    });
    
    console.log('✅ Status API:', response.data);
    
    // Test fixtures Serie A
    const fixtures = await axios.get('https://v3.football.api-sports.io/fixtures', {
      headers: {
        'x-rapidapi-key': 'd5f809551b3fa59226715bbcf64c90b5'
      },
      params: {
        league: 135, // Serie A
        season: 2024,
        last: 10
      }
    });
    
    console.log('✅ Fixtures Serie A (ultimi 10):', fixtures.data.response.length, 'partite');
    fixtures.data.response.slice(0, 3).forEach(f => {
      console.log(`   ${f.teams.home.name} vs ${f.teams.away.name} - ${f.fixture.status.long}`);
    });
    
  } catch (error) {
    console.error('❌ Errore:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testAPI();