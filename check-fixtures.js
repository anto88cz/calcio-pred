// 🔍 CHECK AVAILABLE FIXTURES
const axios = require('axios');

async function checkFixtures() {
  console.log('🔍 Checking available fixtures...\n');

  try {
    const response = await axios.get('http://localhost:3001/api/fixtures');
    const fixtures = response.data;

    console.log(`📊 Total fixtures: ${fixtures.length}\n`);

    // Mostra i primi 10 fixtures con team names
    console.log('🎯 Available fixtures:\n');
    fixtures.slice(0, 10).forEach((f, i) => {
      console.log(`${i + 1}. [${f.id}] ${f.homeTeam.name} vs ${f.awayTeam.name}`);
      console.log(`   League: ${f.league.name} (ID: ${f.leagueId})`);
      console.log(`   Date: ${f.date}`);
      console.log(`   Home Team ID: ${f.homeTeamId}, Away Team ID: ${f.awayTeamId}\n`);
    });

  } catch (error) {
    console.error('❌ Errore:', error.message);
  }
}

checkFixtures();
