// Test completo con più leghe - API KEY AGGIORNATA PRO
const axios = require('axios');

async function testMultipleLeagues() {
  console.log('🧪 Test Multiple Leagues con Piano PRO (7500 chiamate)...');
  
  const leagues = [
    { id: 135, name: 'Serie A', country: 'Italy' },
    { id: 39, name: 'Premier League', country: 'England' },  
    { id: 140, name: 'La Liga', country: 'Spain' },
    { id: 78, name: 'Bundesliga', country: 'Germany' },
    { id: 61, name: 'Ligue 1', country: 'France' }
  ];
  
  const next30days = new Date();
  next30days.setDate(next30days.getDate() + 30);
  const today = new Date().toISOString().split('T')[0];
  
  try {
    for (const league of leagues) {
      console.log(`\n🔍 Testing ${league.name} (${league.country})...`);
      
      const fixtures = await axios.get('https://v3.football.api-sports.io/fixtures', {
        headers: {
          'x-rapidapi-key': '81d8ada776a8b5373697743a1c0c8ad6'
        },
        params: {
          league: league.id,
          season: 2024,
          from: today,
          to: next30days.toISOString().split('T')[0]
        }
      });
      
      console.log(`   ✅ ${fixtures.data.response.length} partite trovate`);
      
      if (fixtures.data.response.length > 0) {
        // Mostra prime 3 partite
        fixtures.data.response.slice(0, 3).forEach(f => {
          const matchDate = new Date(f.fixture.date).toLocaleDateString('it-IT');
          const matchTime = new Date(f.fixture.date).toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'});
          console.log(`      ${matchDate} ${matchTime} - ${f.teams.home.name} vs ${f.teams.away.name}`);
        });
        
        // Testa anche predizione mock
        console.log(`      📊 Test calcolo predizione per: ${fixtures.data.response[0].teams.home.name} vs ${fixtures.data.response[0].teams.away.name}`);
        break; // Stoppa al primo con partite
      }
      
      // Delay per evitare rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
  } catch (error) {
    console.error('❌ Errore:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testMultipleLeagues();