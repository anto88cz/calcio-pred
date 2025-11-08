async function testDirectAPI() {
  const testDate = '2025-11-04';
  const token = 'Ug7hLwm9f7DtStxDjc61DZO9wKgdzAQ0AnjbgQiveBzJGF2mM97omCcXnDFd';
  
  console.log(`🔍 Testing Sportsmonks API directly for date ${testDate}\n`);
  
  const url = `https://api.sportmonks.com/v3/football/fixtures/between/${testDate}/${testDate}?api_token=${token}&include=participants;scores;state`;
  
  console.log('📡 Calling:', url.replace(token, 'TOKEN_HIDDEN'));
  console.log('');
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('✅ Response received\n');
    console.log(`Total fixtures: ${data.data?.length || 0}\n`);
    
    if (data.data && data.data.length > 0) {
      const firstFixture = data.data[0];
      console.log('📊 First fixture structure:\n');
      console.log(JSON.stringify({
        id: firstFixture.id,
        name: firstFixture.name,
        starting_at: firstFixture.starting_at,
        state: firstFixture.state,
        scores: firstFixture.scores,
        participants: firstFixture.participants?.map((p) => ({ id: p.id, name: p.name, location: p.meta?.location }))
      }, null, 2));
      
      // Check all fixtures for scores
      const withScores = data.data.filter((f) => f.scores && f.scores.length > 0);
      console.log(`\n📈 Fixtures with scores: ${withScores.length} / ${data.data.length}`);
      
      if (withScores.length > 0) {
        console.log('\n🎯 Sample fixture with scores:\n');
        const sample = withScores[0];
        console.log(JSON.stringify({
          id: sample.id,
          name: sample.name,
          state: sample.state,
          scores: sample.scores
        }, null, 2));
      }
    } else {
      console.log('❌ No fixtures returned from API');
      console.log('Response:', JSON.stringify(data, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testDirectAPI();
