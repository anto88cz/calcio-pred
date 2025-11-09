const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'api', '.env') });

const API_KEY = process.env.SPORTSMONKS_API_KEY;
const BASE_URL = 'https://api.sportmonks.com/v3/football';

if (!API_KEY) {
  console.error('❌ SPORTSMONKS_API_KEY not found in api/.env');
  process.exit(1);
}

async function testStatCodes() {
  console.log('🧪 Testing Actual Stat Codes from Sportmonks\n');
  
  try {
    // Juventus team ID: 625, Serie A 2024/25 season: 25533
    const url = `${BASE_URL}/statistics/seasons/teams/625`;
    const response = await axios.get(url, {
      params: {
        api_token: API_KEY,
        filters: 'seasonIds:25533',
        include: 'details.type',
      }
    });

    if (response.data?.data && response.data.data.length > 0) {
      const stats = response.data.data[0];
      console.log(`✅ Found stats for Juventus (Team ID: 625)`);
      console.log(`Season ID: ${stats.season_id}`);
      console.log(`Has Values: ${stats.has_values}`);
      console.log(`\n📊 Available Stat Codes and Values:\n`);

      if (stats.details && stats.details.length > 0) {
        stats.details.forEach((detail) => {
          const code = detail.type?.code || 'unknown';
          const name = detail.type?.name || 'Unknown';
          const value = detail.value;
          
          console.log(`Code: "${code}"`);
          console.log(`Name: ${name}`);
          console.log(`Value Structure:`, JSON.stringify(value, null, 2));
          console.log('---');
        });
      } else {
        console.log('❌ No details available');
      }
    } else {
      console.log('❌ No data returned from API');
    }

    // Also try Torino
    console.log('\n\n🧪 Testing Torino Stats...\n');
    const torinoUrl = `${BASE_URL}/statistics/seasons/teams/613`;
    const torinoResponse = await axios.get(torinoUrl, {
      params: {
        api_token: API_KEY,
        filters: 'seasonIds:25533',
        include: 'details.type',
      }
    });

    if (torinoResponse.data?.data && torinoResponse.data.data.length > 0) {
      const stats = torinoResponse.data.data[0];
      console.log(`✅ Found stats for Torino (Team ID: 613)`);
      console.log(`Has Values: ${stats.has_values}`);
      
      if (stats.details && stats.details.length > 0) {
        console.log(`\n📊 Available Stat Codes (${stats.details.length} total):\n`);
        stats.details.forEach((detail) => {
          const code = detail.type?.code || 'unknown';
          const name = detail.type?.name || 'Unknown';
          console.log(`  - "${code}": ${name}`);
        });
      }
    } else {
      console.log('❌ No data returned from API for Torino');
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testStatCodes().catch(console.error);
