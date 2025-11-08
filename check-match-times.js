async function checkMatchTimes() {
  try {
    const response = await fetch('http://localhost:3001/api/fixtures/sm/today');
    const data = await response.json();
    
    console.log('🕐 CHECKING MATCH TIMES\n');
    console.log('='.repeat(80));
    
    const now = new Date();
    console.log(`Current time: ${now.toLocaleString('it-IT')}\n`);
    console.log('='.repeat(80));
    
    if (!data.fixtures || data.fixtures.length === 0) {
      console.log('❌ No matches found');
      return;
    }
    
    console.log(`\nTotal matches today: ${data.fixtures.length}\n`);
    
    const sorted = [...data.fixtures].sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA - dateB;
    });
    
    let past = 0;
    let future = 0;
    
    sorted.forEach(match => {
      const matchDate = new Date(match.date);
      const isPast = matchDate < now;
      const diff = Math.abs(now - matchDate);
      const hours = Math.floor(diff / 1000 / 60 / 60);
      const minutes = Math.floor((diff / 1000 / 60) % 60);
      
      if (isPast) past++;
      else future++;
      
      const timeStr = matchDate.toLocaleTimeString('it-IT', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      const indicator = isPast ? '✅' : '⏳';
      const timeInfo = isPast 
        ? `(${hours}h ${minutes}m ago)` 
        : `(in ${hours}h ${minutes}m)`;
      
      console.log(`${indicator} ${timeStr.padEnd(8)} ${timeInfo.padEnd(20)} | ${match.homeTeam.name} vs ${match.awayTeam.name}`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log(`\n📊 Summary:`);
    console.log(`   Past matches (should be finished): ${past}`);
    console.log(`   Future matches: ${future}`);
    
    if (past > 0) {
      console.log(`\n⚠️ WARNING: ${past} matches have passed but have no scores!`);
      console.log('   Possible reasons:');
      console.log('   1. Sportsmonks API slow to update results (can take hours)');
      console.log('   2. Matches were postponed/cancelled');
      console.log('   3. API data issue');
      console.log('\n💡 Solution: Test with yesterday\'s matches instead');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkMatchTimes();
