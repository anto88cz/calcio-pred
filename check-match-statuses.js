async function checkMatchStatuses() {
  try {
    const response = await fetch('http://localhost:3001/api/fixtures/sm/today');
    const data = await response.json();
    
    console.log('📊 CHECKING MATCH STATUSES\n');
    console.log('='.repeat(80));
    
    if (!data.fixtures || data.fixtures.length === 0) {
      console.log('❌ No matches found');
      return;
    }
    
    console.log(`\nTotal matches: ${data.fixtures.length}\n`);
    
    const statusCounts = {};
    
    data.fixtures.forEach(match => {
      const status = match.statusShort || 'UNKNOWN';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    console.log('Status breakdown:');
    Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
      console.log(`  ${status}: ${count} matches`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('Sample matches:\n');
    
    data.fixtures.slice(0, 10).forEach(match => {
      const homeScore = match.homeScore ?? '?';
      const awayScore = match.awayScore ?? '?';
      console.log(`${match.statusShort.padEnd(8)} | ${homeScore}-${awayScore} | ${match.homeTeam.name} vs ${match.awayTeam.name}`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('\n💡 Common status codes:');
    console.log('  FT  = Finished (90 minutes)');
    console.log('  AET = After Extra Time');
    console.log('  PEN = Penalty Shootout');
    console.log('  LIVE = In Progress');
    console.log('  NS  = Not Started');
    console.log('  PST = Postponed');
    console.log('  CANC = Cancelled');
    
    // Trova partite con score ma senza FT
    console.log('\n' + '='.repeat(80));
    console.log('\n🔍 Matches with scores but not FT:\n');
    
    const withScores = data.fixtures.filter(m => 
      m.homeScore !== null && 
      m.homeScore !== undefined && 
      m.statusShort !== 'FT' &&
      m.statusShort !== 'AET' &&
      m.statusShort !== 'PEN'
    );
    
    if (withScores.length > 0) {
      console.log(`Found ${withScores.length} matches:\n`);
      withScores.forEach(match => {
        console.log(`  ${match.statusShort} | ${match.homeScore}-${match.awayScore} | ${match.homeTeam.name} vs ${match.awayTeam.name}`);
      });
      console.log('\n⚠️ These might be finished but API hasn\'t updated the status yet');
    } else {
      console.log('None found - all matches with scores are properly marked FT');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkMatchStatuses();
