const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'api', '.env') });

const API_KEY = process.env.SPORTSMONKS_API_KEY;

async function checkSeasons() {
  console.log('🔍 Checking Specific Seasons\n');
  
  try {
    const season25533 = await axios.get(`https://api.sportmonks.com/v3/football/seasons/25533`, {
      params: { api_token: API_KEY }
    });
    console.log('Season 25533:');
    console.log(JSON.stringify(season25533.data.data, null, 2));
    
    console.log('\n' + '='.repeat(80) + '\n');
    
    const season25580 = await axios.get(`https://api.sportmonks.com/v3/football/seasons/25580`, {
      params: { api_token: API_KEY }
    });
    console.log('Season 25580:');
    console.log(JSON.stringify(season25580.data.data, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

checkSeasons().catch(console.error);
