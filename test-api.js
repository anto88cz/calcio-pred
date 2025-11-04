// Quick test script for API-FOOTBALL
const API_KEY = 'd5f809551b3fa59226715bbcf64c90b5';
const BASE_URL = 'https://v3.football.api-sports.io';

async function testAPI() {
  console.log('🧪 Testing API-FOOTBALL...\n');

  // Test 1: Status
  console.log('1️⃣ Testing /status endpoint...');
  const statusRes = await fetch(`${BASE_URL}/status`, {
    headers: { 'x-rapidapi-key': API_KEY }
  });
  const status = await statusRes.json();
  console.log('✅ Account:', status.response.account);
  console.log('✅ Plan:', status.response.subscription.plan);
  console.log('✅ Requests today:', status.response.requests.current, '/', status.response.requests.limit_day);
  
  // Test 2: Get Serie A fixtures today
  console.log('\n2️⃣ Testing /fixtures endpoint (Serie A today)...');
  const today = new Date().toISOString().split('T')[0];
  const fixturesRes = await fetch(`${BASE_URL}/fixtures?league=135&season=2024&date=${today}`, {
    headers: { 'x-rapidapi-key': API_KEY }
  });
  const fixtures = await fixturesRes.json();
  console.log(`✅ Found ${fixtures.response.length} fixtures for Serie A on ${today}`);
  if (fixtures.response.length > 0) {
    const match = fixtures.response[0];
    console.log(`  📅 ${match.teams.home.name} vs ${match.teams.away.name}`);
    console.log(`  ⏰ ${match.fixture.date}`);
    console.log(`  🏟️  ${match.fixture.venue.name}`);
  }
  
  // Test 3: Get top leagues
  console.log('\n3️⃣ Testing /leagues endpoint (top leagues)...');
  const leaguesRes = await fetch(`${BASE_URL}/leagues?season=2024&type=League`, {
    headers: { 'x-rapidapi-key': API_KEY }
  });
  const leagues = await leaguesRes.json();
  const topLeagues = leagues.response.slice(0, 5);
  console.log(`✅ Found ${leagues.response.length} leagues. Top 5:`);
  topLeagues.forEach((l, i) => {
    console.log(`  ${i + 1}. ${l.league.name} (${l.country.name}) - ID: ${l.league.id}`);
  });
  
  console.log('\n🎉 All tests passed! API key is working correctly.\n');
  console.log('📊 API Requests used: ' + (status.response.requests.current + 3) + '/' + status.response.requests.limit_day);
}

testAPI().catch(console.error);
