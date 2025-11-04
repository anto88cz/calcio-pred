// Test stagione corrente 2025
const axios = require('axios');

async function testCurrentSeason() {
  console.log('🧪 Test Stagione 2025-26...');
  
  try {
    // Test con stagione 2025
    const fixtures = await axios.get('https://v3.football.api-sports.io/fixtures', {
      headers: {
        'x-rapidapi-key': 'd5f809551b3fa59226715bbcf64c90b5'
      },
      params: {
        league: 39, // Premier League
        season: 2025,
        next: 10 // Prossime 10 partite
      }
    });
    
    console.log(`✅ Premier League 2025: ${fixtures.data.response.length} prossime partite`);
    
    if (fixtures.data.response.length > 0) {
      fixtures.data.response.forEach(f => {
        const matchDate = new Date(f.fixture.date).toLocaleDateString('it-IT');
        const matchTime = new Date(f.fixture.date).toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'});
        console.log(`   ${matchDate} ${matchTime} - ${f.teams.home.name} vs ${f.teams.away.name} (ID: ${f.fixture.id})`);
      });
    }
    
    // Proviamo anche live fixtures  
    console.log('\n🔴 Test Live Fixtures...');
    const live = await axios.get('https://v3.football.api-sports.io/fixtures', {
      headers: {
        'x-rapidapi-key': 'd5f809551b3fa59226715bbcf64c90b5'
      },
      params: {
        live: 'all'
      }
    });
    
    console.log(`✅ Partite Live: ${live.data.response.length}`);
    if (live.data.response.length > 0) {
      live.data.response.slice(0, 5).forEach(f => {
        console.log(`   🔴 LIVE: ${f.teams.home.name} ${f.goals.home} - ${f.goals.away} ${f.teams.away.name} (${f.fixture.status.elapsed}min)`);
      });
    }
    
  } catch (error) {
    console.error('❌ Errore:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testCurrentSeason();