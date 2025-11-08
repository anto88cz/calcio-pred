const axios = require('axios');

async function testOddsFetch() {
  const fixtureId = 19427564; // Tottenham vs Man United
  const apiToken = 'Ug7hLwm9f7DtStxDjc61DZO9wKgdzAQ0AnjbgQiveBzJGF2mM97omCcXnDFd';
  
  console.log(`🔍 Fetching odds for fixture ${fixtureId}...`);
  
  try {
    const response = await axios.get(
      `https://api.sportmonks.com/v3/football/fixtures/${fixtureId}`,
      {
        params: {
          api_token: apiToken,
          include: 'odds',
        }
      }
    );
    
    const oddsArray = response.data?.data?.odds;
    
    if (!oddsArray || oddsArray.length === 0) {
      console.log('❌ No odds found');
      return;
    }
    
    console.log(`📊 Total odds entries: ${oddsArray.length}`);
    
    // Filter for 1X2 markets
    const fullTimeOdds = oddsArray.filter(odd =>
      odd.market_description === 'Fulltime Result' ||
      odd.market_description === 'Match Winner' ||
      odd.market_description === '3Way Result'
    );
    
    console.log(`📊 Fulltime odds: ${fullTimeOdds.length}`);
    console.log(`📊 Unique bookmakers: ${new Set(fullTimeOdds.map(o => o.bookmaker_id)).size}`);
    
    // Group by label
    const oddsMap = { Home: [], Draw: [], Away: [] };
    
    for (const odd of fullTimeOdds) {
      const value = parseFloat(odd.value);
      if (value > 0 && oddsMap[odd.label]) {
        oddsMap[odd.label].push(value);
      }
    }
    
    // Calculate averages
    const home = oddsMap.Home.reduce((a, b) => a + b, 0) / oddsMap.Home.length;
    const draw = oddsMap.Draw.reduce((a, b) => a + b, 0) / oddsMap.Draw.length;
    const away = oddsMap.Away.reduce((a, b) => a + b, 0) / oddsMap.Away.length;
    
    console.log('\n✅ Average odds:');
    console.log(`   Home: ${home.toFixed(2)} (${oddsMap.Home.length} bookmakers)`);
    console.log(`   Draw: ${draw.toFixed(2)} (${oddsMap.Draw.length} bookmakers)`);
    console.log(`   Away: ${away.toFixed(2)} (${oddsMap.Away.length} bookmakers)`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testOddsFetch();
