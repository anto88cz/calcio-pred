// Test rapido per verificare che tutto funzioni
const API_KEY = 'd5f809551b3fa59226715bbcf64c90b5';

async function quickTest() {
  console.log('🚀 Quick Test - Calcio-Pred\n');

  // Test API-FOOTBALL
  console.log('1️⃣ Testing API-FOOTBALL connection...');
  try {
    const res = await fetch('https://v3.football.api-sports.io/status', {
      headers: { 'x-rapidapi-key': API_KEY }
    });
    const data = await res.json();
    console.log('✅ API Key active:', data.response.account.email);
    console.log(`✅ Requests: ${data.response.requests.current}/${data.response.requests.limit_day}`);
  } catch (e) {
    console.log('❌ API-FOOTBALL error:', e.message);
    return;
  }

  // Test upcoming Serie A fixtures
  console.log('\n2️⃣ Testing Serie A fixtures (next 7 days)...');
  try {
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const from = today.toISOString().split('T')[0];
    const to = nextWeek.toISOString().split('T')[0];
    
    const res = await fetch(`https://v3.football.api-sports.io/fixtures?league=135&season=2024&from=${from}&to=${to}`, {
      headers: { 'x-rapidapi-key': API_KEY }
    });
    const data = await res.json();
    
    console.log(`✅ Found ${data.response.length} upcoming Serie A fixtures`);
    
    if (data.response.length > 0) {
      console.log('\n📅 Next matches:');
      data.response.slice(0, 3).forEach(match => {
        const date = new Date(match.fixture.date).toLocaleDateString();
        console.log(`  • ${match.teams.home.name} vs ${match.teams.away.name} - ${date}`);
      });
    }
  } catch (e) {
    console.log('❌ Fixtures error:', e.message);
  }

  // Test Premier League (alternative)
  console.log('\n3️⃣ Testing Premier League fixtures...');
  try {
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const from = today.toISOString().split('T')[0];
    const to = nextWeek.toISOString().split('T')[0];
    
    const res = await fetch(`https://v3.football.api-sports.io/fixtures?league=39&season=2024&from=${from}&to=${to}`, {
      headers: { 'x-rapidapi-key': API_KEY }
    });
    const data = await res.json();
    
    console.log(`✅ Found ${data.response.length} upcoming Premier League fixtures`);
    
    if (data.response.length > 0) {
      console.log('\n⚽ Premier League matches:');
      data.response.slice(0, 3).forEach(match => {
        const date = new Date(match.fixture.date).toLocaleDateString();
        console.log(`  • ${match.teams.home.name} vs ${match.teams.away.name} - ${date}`);
      });
    }
  } catch (e) {
    console.log('❌ Premier League error:', e.message);
  }

  console.log('\n✅ Quick test completed!');
  console.log('\n🎯 Next Steps:');
  console.log('   1. Run: docker compose up -d');
  console.log('   2. Wait 2 minutes for services to start');
  console.log('   3. Test: curl http://localhost:3001/health');
  console.log('   4. Open: http://localhost:3000 (frontend)');
}

quickTest().catch(console.error);