async function checkTeamData() {
  try {
    // Check Kudrivka
    console.log('🔍 Checking team data availability...\n');
    
    const teams = [
      { name: 'Kudrivka', search: 'Kudrivka' },
      { name: 'Kolos Kovalivka', search: 'Kolos' }
    ];
    
    for (const team of teams) {
      console.log(`\n📊 ${team.name}:`);
      console.log('─'.repeat(60));
      
      // Search team on Sportsmonks
      const response = await fetch(`http://localhost:3001/api/teams/search?name=${encodeURIComponent(team.search)}`);
      
      if (!response.ok) {
        console.log('  ❌ Team not found or API error');
        continue;
      }
      
      const data = await response.json();
      
      if (!data.teams || data.teams.length === 0) {
        console.log('  ❌ No teams found');
        continue;
      }
      
      const foundTeam = data.teams[0];
      console.log(`  ✅ Found: ${foundTeam.name} (ID: ${foundTeam.id})`);
      console.log(`     Country: ${foundTeam.country || 'N/A'}`);
      
      // Get team stats
      const statsResponse = await fetch(`http://localhost:3001/api/teams/${foundTeam.id}/stats`);
      
      if (statsResponse.ok) {
        const stats = await statsResponse.json();
        console.log(`  📈 Fixtures available: ${stats.fixtures?.length || 0}`);
        
        if (stats.fixtures && stats.fixtures.length > 0) {
          console.log(`     Latest fixture: ${stats.fixtures[0].date}`);
          console.log(`     Oldest fixture: ${stats.fixtures[stats.fixtures.length - 1].date}`);
          
          // Count goals
          let totalGoals = 0;
          let matches = 0;
          stats.fixtures.forEach(f => {
            if (f.scores && f.scores.home !== null && f.scores.away !== null) {
              totalGoals += f.scores.home + f.scores.away;
              matches++;
            }
          });
          
          console.log(`     Matches with scores: ${matches}`);
          console.log(`     Average total goals: ${matches > 0 ? (totalGoals / matches).toFixed(2) : 'N/A'}`);
        }
      } else {
        console.log(`  ⚠️ Stats not available (${statsResponse.status})`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 CONCLUSIONE:');
    console.log('Se le squadre hanno 0 fixtures o pochi dati storici,');
    console.log('il modello non può fare predizioni accurate.');
    console.log('\nSOLUZIONE: Implementare fallback per squadre con pochi dati:');
    console.log('  - Usare medie della lega');
    console.log('  - Aumentare expected goals di default');
    console.log('  - Ridurre confidence per avvisare utente');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkTeamData();
