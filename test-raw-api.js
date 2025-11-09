const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.SPORTMONKS_API_KEY;
const BASE_URL = 'https://api.sportmonks.com/v3/football';

async function testRawAPI() {
  console.log('🧪 Testing Raw Sportmonks API\n');
  
  const tests = [
    {
      name: 'Juventus Season Stats',
      url: `${BASE_URL}/statistics/seasons/teams/625?api_token=${API_KEY}&filters=seasonIds:25533&include=details`
    },
    {
      name: 'Torino Season Stats',
      url: `${BASE_URL}/statistics/seasons/teams/613?api_token=${API_KEY}&filters=seasonIds:25533&include=details`
    },
    {
      name: 'Juventus Recent Fixtures',
      url: `${BASE_URL}/teams/625/fixtures?api_token=${API_KEY}&filters=seasonIds:25533&include=statistics`
    }
  ];
  
  for (const test of tests) {
    console.log(`\n📊 ${test.name}:`);
    console.log(`URL: ${test.url.replace(API_KEY, 'XXX')}\n`);
    
    try {
      const response = await axios.get(test.url);
      console.log(`Status: ${response.status}`);
      console.log(`Data Structure:`);
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error(`❌ Error:`, error.response?.data || error.message);
    }
    
    console.log('\n' + '='.repeat(80));
  }
}

testRawAPI().catch(console.error);
