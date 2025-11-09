/**
 * Test per verificare quale endpoint funziona per le statistiche stagionali
 */

require('dotenv').config({ path: './api/.env' });

const API_KEY = process.env.SPORTSMONKS_API_KEY;
const BASE_URL = 'https://api.sportmonks.com/v3/football';

async function testEndpoints() {
  const teamId = 625; // Juventus
  const seasonId = 25533; // Season ID corrente
  
  console.log('🧪 Testing Sportmonks API endpoints for team statistics\n');
  
  // Test 1: teams/{teamId}
  console.log('1️⃣ Testing: /teams/' + teamId);
  try {
    const url1 = `${BASE_URL}/teams/${teamId}?api_token=${API_KEY}&include=statistics`;
    const res1 = await fetch(url1);
    const data1 = await res1.json();
    console.log('✅ Response:', JSON.stringify(data1, null, 2).substring(0, 500));
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  
  console.log('\n');
  
  // Test 2: teams/seasons/{seasonId}
  console.log('2️⃣ Testing: /teams/seasons/' + seasonId);
  try {
    const url2 = `${BASE_URL}/teams/seasons/${seasonId}?api_token=${API_KEY}`;
    const res2 = await fetch(url2);
    const data2 = await res2.json();
    console.log('✅ Response:', JSON.stringify(data2, null, 2).substring(0, 500));
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  
  console.log('\n');
  
  // Test 3: statistics/seasons/teams/{teamId}
  console.log('3️⃣ Testing: /statistics/seasons/teams/' + teamId);
  try {
    const url3 = `${BASE_URL}/statistics/seasons/teams/${teamId}?api_token=${API_KEY}&filters=seasonIds:${seasonId}`;
    const res3 = await fetch(url3);
    const data3 = await res3.json();
    console.log('✅ Response:', JSON.stringify(data3, null, 2).substring(0, 500));
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  
  console.log('\n');
  
  // Test 4: team statistics by season
  console.log('4️⃣ Testing: /team-statistics/seasons/' + seasonId);
  try {
    const url4 = `${BASE_URL}/team-statistics/seasons/${seasonId}?api_token=${API_KEY}&filters=teamIds:${teamId}`;
    const res4 = await fetch(url4);
    const data4 = await res4.json();
    console.log('✅ Response:', JSON.stringify(data4, null, 2).substring(0, 1000));
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

testEndpoints();
