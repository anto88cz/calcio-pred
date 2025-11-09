const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'api', '.env') });

const API_KEY = process.env.SPORTSMONKS_API_KEY;

async function checkCurrentSerieASeason() {
  console.log('🔍 Checking Current Serie A Season\n');
  
  try {
    // Get all Serie A seasons to find the current one
    const response = await axios.get(`https://api.sportmonks.com/v3/football/seasons`, {
      params: {
        api_token: API_KEY,
        filters: 'leagueIds:384', // Serie A
      }
    });

    const seasons = response.data.data;
    console.log(`📅 Found ${seasons.length} Serie A seasons\n`);
    
    // Find current season
    const currentSeasons = seasons.filter(s => s.is_current);
    console.log('Current Serie A Seasons:');
    currentSeasons.forEach(season => {
      console.log(`  - ID: ${season.id}`);
      console.log(`    Name: ${season.name}`);
      console.log(`    Start: ${season.starting_at}`);
      console.log(`    End: ${season.ending_at}`);
      console.log(`    Is Current: ${season.is_current}`);
      console.log('');
    });

    // Now check if Juventus and Torino have stats for the current season
    if (currentSeasons.length > 0) {
      const currentSeasonId = currentSeasons[0].id;
      console.log(`\n🧪 Testing stats for season ${currentSeasonId}...\n`);
      
      // Juventus
      const juvStats = await axios.get(`https://api.sportmonks.com/v3/football/statistics/seasons/teams/625`, {
        params: {
          api_token: API_KEY,
          filters: `seasonIds:${currentSeasonId};leagueIds:384`,
          include: 'details.type'
        }
      });
      
      console.log('Juventus Stats:');
      if (juvStats.data.data && juvStats.data.data.length > 0) {
        const stats = juvStats.data.data[0];
        console.log(`  ✅ Found stats - Season: ${stats.season_id}, League: ${stats.league_id}, Has Values: ${stats.has_values}`);
        
        // Find wins/draws/losses
        if (stats.details) {
          const wins = stats.details.find(d => d.type?.code === 'team-wins');
          const draws = stats.details.find(d => d.type?.code === 'team-draws');
          const losses = stats.details.find(d => d.type?.code === 'team-lost');
          const gamesPlayed = stats.details.find(d => d.type?.code === 'games-played');
          
          console.log(`  Record: ${wins?.value?.all?.count || 0}W - ${draws?.value?.all?.count || 0}D - ${losses?.value?.all?.count || 0}L`);
          console.log(`  Games Played: ${gamesPlayed?.value?.total || 0}`);
        }
      } else {
        console.log('  ❌ No stats found');
      }
      
      console.log('');
      
      // Torino
      const torStats = await axios.get(`https://api.sportmonks.com/v3/football/statistics/seasons/teams/613`, {
        params: {
          api_token: API_KEY,
          filters: `seasonIds:${currentSeasonId};leagueIds:384`,
          include: 'details.type'
        }
      });
      
      console.log('Torino Stats:');
      if (torStats.data.data && torStats.data.data.length > 0) {
        const stats = torStats.data.data[0];
        console.log(`  ✅ Found stats - Season: ${stats.season_id}, League: ${stats.league_id}, Has Values: ${stats.has_values}`);
        
        if (stats.details) {
          const wins = stats.details.find(d => d.type?.code === 'team-wins');
          const draws = stats.details.find(d => d.type?.code === 'team-draws');
          const losses = stats.details.find(d => d.type?.code === 'team-lost');
          const gamesPlayed = stats.details.find(d => d.type?.code === 'games-played');
          
          console.log(`  Record: ${wins?.value?.all?.count || 0}W - ${draws?.value?.all?.count || 0}D - ${losses?.value?.all?.count || 0}L`);
          console.log(`  Games Played: ${gamesPlayed?.value?.total || 0}`);
        }
      } else {
        console.log('  ❌ No stats found');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

checkCurrentSerieASeason().catch(console.error);
