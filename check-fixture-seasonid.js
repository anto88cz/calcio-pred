const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'api', '.env') });

const API_KEY = process.env.SPORTSMONKS_API_KEY;

async function checkFixtureSeasonId() {
  console.log('🔍 Checking Fixture Season ID\n');
  
  try {
    // Juventus vs Torino fixture ID: 19424986
    const url = `https://api.sportmonks.com/v3/football/fixtures/19424986`;
    const response = await axios.get(url, {
      params: {
        api_token: API_KEY,
        include: 'league',
      }
    });

    const fixture = response.data.data;
    console.log('Fixture Details:');
    console.log(`  ID: ${fixture.id}`);
    console.log(`  Name: ${fixture.name}`);
    console.log(`  Date: ${fixture.starting_at}`);
    console.log(`\nLeague:`);
    console.log(`  ID: ${fixture.league_id}`);
    console.log(`  League Object:`, JSON.stringify(fixture.league, null, 2));
    console.log(`\nSeason from fixture.season (if exists):`, fixture.season);
    console.log(`\nSeason ID (from fixture.season_id): ${fixture.season_id}`);

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

checkFixtureSeasonId().catch(console.error);
