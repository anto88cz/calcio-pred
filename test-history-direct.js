// Test diretto della funzione getTeamHistory
import { getTeamHistory } from './api/src/services/sportsmonks/statistics.js';

async function test() {
  console.log('🧪 Testing getTeamHistory for Union Berlin (1079)...\n');
  
  try {
    const history = await getTeamHistory(1079, 25646, 30, 'FC Union Berlin');
    console.log(`\n✅ Retrieved ${history.length} matches`);
    console.log('First 3 matches:');
    history.slice(0, 3).forEach((m, i) => {
      console.log(`  ${i + 1}. ${m.homeTeam} vs ${m.awayTeam} - ${m.homeGoals}-${m.awayGoals}`);
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

test();
