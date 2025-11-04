// Test fixtures attuali
const axios = require('axios');

async function testFixtures() {
  console.log('🧪 Test Fixtures Serie A 2025...');
  
  try {
    // Test fixtures oggi
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    const fixtures = await axios.get('https://v3.football.api-sports.io/fixtures', {
      headers: {
        'x-rapidapi-key': 'd5f809551b3fa59226715bbcf64c90b5'
      },
      params: {
        league: 135, // Serie A
        season: 2024, // Stagione 2024-25
        date: today
      }
    });
    
    console.log(`✅ Partite Serie A oggi (${today}):`, fixtures.data.response.length);
    
    if (fixtures.data.response.length > 0) {
      fixtures.data.response.forEach(f => {
        console.log(`   ${f.teams.home.name} vs ${f.teams.away.name} - ${f.fixture.status.long} (${f.fixture.date})`);
      });
    } else {
      console.log('   Nessuna partita oggi, proviamo prossimi giorni...');
      
      // Proviamo prossimi 7 giorni
      const next7days = new Date();
      next7days.setDate(next7days.getDate() + 7);
      
      const upcoming = await axios.get('https://v3.football.api-sports.io/fixtures', {
        headers: {
          'x-rapidapi-key': 'd5f809551b3fa59226715bbcf64c90b5'
        },
        params: {
          league: 135, // Serie A  
          season: 2024,
          from: today,
          to: next7days.toISOString().split('T')[0]
        }
      });
      
      console.log(`✅ Prossime partite Serie A (prossimi 7 giorni):`, upcoming.data.response.length);
      upcoming.data.response.slice(0, 5).forEach(f => {
        const matchDate = new Date(f.fixture.date).toLocaleDateString('it-IT');
        const matchTime = new Date(f.fixture.date).toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'});
        console.log(`   ${matchDate} ${matchTime} - ${f.teams.home.name} vs ${f.teams.away.name}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Errore:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testFixtures();