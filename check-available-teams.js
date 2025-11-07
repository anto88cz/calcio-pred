/**
 * Script per verificare quali squadre sono disponibili nel database
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

async function checkAvailableTeams() {
  console.log('🔍 Checking available teams in database...\n');
  
  try {
    // Prova a ottenere le fixture di oggi
    console.log('📅 Fetching today\'s fixtures...');
    const fixturesResponse = await fetch(`${API_URL}/api/fixtures/today`);
    
    if (!fixturesResponse.ok) {
      console.log('❌ Could not fetch fixtures:', fixturesResponse.status);
      return;
    }
    
    const fixtures = await fixturesResponse.json();
    console.log(`✅ Found ${fixtures.length} fixtures\n`);
    
    if (fixtures.length === 0) {
      console.log('ℹ️  No fixtures found for today. Trying upcoming...\n');
      
      const upcomingResponse = await fetch(`${API_URL}/api/fixtures/upcoming?days=7`);
      if (upcomingResponse.ok) {
        const upcoming = await upcomingResponse.json();
        console.log(`✅ Found ${upcoming.length} upcoming fixtures\n`);
        
        if (upcoming.length > 0) {
          console.log('🏆 First 10 available fixtures:');
          console.log('='.repeat(80));
          
          upcoming.slice(0, 10).forEach((fixture, idx) => {
            console.log(`${idx + 1}. ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`);
            console.log(`   League: ${fixture.league.name}`);
            console.log(`   Date: ${new Date(fixture.date).toLocaleString()}`);
            console.log(`   Fixture ID: ${fixture.id}`);
            console.log('');
          });
          
          return upcoming.slice(0, 10);
        }
      }
    } else {
      console.log('🏆 Today\'s fixtures:');
      console.log('='.repeat(80));
      
      fixtures.slice(0, 10).forEach((fixture, idx) => {
        console.log(`${idx + 1}. ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`);
        console.log(`   League: ${fixture.league.name}`);
        console.log(`   Date: ${new Date(fixture.date).toLocaleString()}`);
        console.log(`   Fixture ID: ${fixture.id}`);
        console.log('');
      });
      
      return fixtures.slice(0, 10);
    }
    
    // Se non ci sono fixture, proviamo a cercare le squadre direttamente
    console.log('\nℹ️  Trying to fetch teams directly...');
    const teamsResponse = await fetch(`${API_URL}/api/teams`);
    
    if (teamsResponse.ok) {
      const teams = await teamsResponse.json();
      console.log(`✅ Found ${teams.length} teams in database\n`);
      
      if (teams.length > 0) {
        console.log('🏃 First 20 teams available:');
        console.log('='.repeat(80));
        
        teams.slice(0, 20).forEach((team, idx) => {
          console.log(`${idx + 1}. ${team.name} (ID: ${team.id}, API ID: ${team.apiId})`);
        });
      }
      
      return teams.slice(0, 20);
    } else {
      console.log('❌ Could not fetch teams');
    }
    
  } catch (error) {
    console.log('💥 Error:', error.message);
  }
}

// Run check
checkAvailableTeams()
  .then(data => {
    if (data && data.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('✅ You can use these teams/fixtures for testing');
      console.log('='.repeat(80));
    } else {
      console.log('\n' + '='.repeat(80));
      console.log('⚠️  No data found in database. You may need to:');
      console.log('   1. Run the seeder: cd api && npm run seed');
      console.log('   2. Fetch fixtures: curl http://localhost:3001/api/fixtures/fetch');
      console.log('='.repeat(80));
    }
  })
  .catch(console.error);
