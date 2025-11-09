const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'api', '.env') });

const API_KEY = process.env.SPORTSMONKS_API_KEY;

async function verifyFixture() {
  console.log('🔍 Verifico Fixture Juventus vs Torino\n');
  
  try {
    // Check the fixture
    const fixture = await axios.get(`https://api.sportmonks.com/v3/football/fixtures/19424986`, {
      params: {
        api_token: API_KEY,
      }
    });

    const f = fixture.data.data;
    console.log('Fixture Details:');
    console.log(`  ID: ${f.id}`);
    console.log(`  Name: ${f.name}`);
    console.log(`  Data Partita: ${f.starting_at}`);
    console.log(`  Season ID: ${f.season_id}`);
    console.log(`  League ID: ${f.league_id}`);
    console.log(`  State ID: ${f.state_id}`);
    
    // Check the season
    const season = await axios.get(`https://api.sportmonks.com/v3/football/seasons/${f.season_id}`, {
      params: { api_token: API_KEY }
    });
    
    console.log('\nSeason Details:');
    console.log(`  ID: ${season.data.data.id}`);
    console.log(`  Name: ${season.data.data.name}`);
    console.log(`  Start: ${season.data.data.starting_at}`);
    console.log(`  End: ${season.data.data.ending_at}`);
    console.log(`  League ID: ${season.data.data.league_id}`);
    console.log(`  Is Current: ${season.data.data.is_current}`);
    
    // Get actual 2024/2025 season for Serie A
    console.log('\n🔍 Cerco stagione 2024/2025 Serie A...\n');
    const seasons = await axios.get(`https://api.sportmonks.com/v3/football/seasons`, {
      params: {
        api_token: API_KEY,
        filters: 'leagueIds:384',
      }
    });
    
    const season2024 = seasons.data.data.find(s => s.name === '2024/2025');
    if (season2024) {
      console.log('Stagione 2024/2025:');
      console.log(`  ID: ${season2024.id}`);
      console.log(`  Name: ${season2024.name}`);
      console.log(`  Start: ${season2024.starting_at}`);
      console.log(`  End: ${season2024.ending_at}`);
      console.log(`  Is Current: ${season2024.is_current}`);
      
      // Check if Juventus has stats for this season
      console.log('\n🧪 Verifico statistiche Juventus per stagione 2024/2025...\n');
      const juvStats = await axios.get(`https://api.sportmonks.com/v3/football/statistics/seasons/teams/625`, {
        params: {
          api_token: API_KEY,
          filters: `seasonIds:${season2024.id};leagueIds:384`,
          include: 'details.type'
        }
      });
      
      if (juvStats.data.data && juvStats.data.data.length > 0) {
        const stats = juvStats.data.data[0];
        console.log(`✅ Juventus Stats Found - Season: ${stats.season_id}, Has Values: ${stats.has_values}`);
        
        if (stats.details) {
          const wins = stats.details.find(d => d.type?.code === 'team-wins');
          const draws = stats.details.find(d => d.type?.code === 'team-draws');
          const losses = stats.details.find(d => d.type?.code === 'team-lost');
          const gamesPlayed = stats.details.find(d => d.type?.code === 'games-played');
          const goals = stats.details.find(d => d.type?.code === 'goals');
          
          console.log(`  Partite Giocate: ${gamesPlayed?.value?.total || 0}`);
          console.log(`  Record: ${wins?.value?.all?.count || 0}V - ${draws?.value?.all?.count || 0}P - ${losses?.value?.all?.count || 0}S`);
          console.log(`  Gol Segnati: ${goals?.value?.all?.count || 0}`);
        }
      } else {
        console.log('❌ No stats found for Juventus in 2024/2025');
      }
      
      // Check Torino
      console.log('\n🧪 Verifico statistiche Torino per stagione 2024/2025...\n');
      const torStats = await axios.get(`https://api.sportmonks.com/v3/football/statistics/seasons/teams/613`, {
        params: {
          api_token: API_KEY,
          filters: `seasonIds:${season2024.id};leagueIds:384`,
          include: 'details.type'
        }
      });
      
      if (torStats.data.data && torStats.data.data.length > 0) {
        const stats = torStats.data.data[0];
        console.log(`✅ Torino Stats Found - Season: ${stats.season_id}, Has Values: ${stats.has_values}`);
        
        if (stats.details) {
          const wins = stats.details.find(d => d.type?.code === 'team-wins');
          const draws = stats.details.find(d => d.type?.code === 'team-draws');
          const losses = stats.details.find(d => d.type?.code === 'team-lost');
          const gamesPlayed = stats.details.find(d => d.type?.code === 'games-played');
          const goals = stats.details.find(d => d.type?.code === 'goals');
          
          console.log(`  Partite Giocate: ${gamesPlayed?.value?.total || 0}`);
          console.log(`  Record: ${wins?.value?.all?.count || 0}V - ${draws?.value?.all?.count || 0}P - ${losses?.value?.all?.count || 0}S`);
          console.log(`  Gol Segnati: ${goals?.value?.all?.count || 0}`);
        }
      } else {
        console.log('❌ No stats found for Torino in 2024/2025');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

verifyFixture().catch(console.error);
