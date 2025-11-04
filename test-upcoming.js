// Test upcoming Serie A fixtures
const API_KEY = 'd5f809551b3fa59226715bbcf64c90b5';
const BASE_URL = 'https://v3.football.api-sports.io';

async function getUpcomingFixtures() {
  console.log('🔍 Finding upcoming Serie A fixtures...\n');

  // Get next 10 fixtures for Serie A
  const res = await fetch(`${BASE_URL}/fixtures?league=135&season=2024&next=10`, {
    headers: { 'x-rapidapi-key': API_KEY }
  });
  const data = await res.json();
  
  console.log(`📅 Found ${data.response.length} upcoming fixtures:\n`);
  
  data.response.forEach((match, i) => {
    const date = new Date(match.fixture.date);
    const dateStr = date.toLocaleDateString('it-IT', { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    console.log(`${i + 1}. ${dateStr}`);
    console.log(`   ${match.teams.home.name} vs ${match.teams.away.name}`);
    console.log(`   📍 ${match.fixture.venue.name}, ${match.fixture.venue.city}`);
    console.log(`   🆔 Fixture ID: ${match.fixture.id}`);
    console.log(`   📊 Status: ${match.fixture.status.long}\n`);
  });
  
  if (data.response.length > 0) {
    console.log('✅ Possiamo usare questi match per testare le predizioni!');
    console.log(`\n💡 Esempio comando per calcolare predizione:`);
    console.log(`curl -X POST http://localhost:3001/api/predictions/calculate \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"fixtureId": ${data.response[0].fixture.id}, "homeTeamId": ${data.response[0].teams.home.id}, "awayTeamId": ${data.response[0].teams.away.id}, "season": 2024, "leagueId": 135}'`);
  }
}

getUpcomingFixtures().catch(console.error);
