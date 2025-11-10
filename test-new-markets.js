const axios = require('axios');

async function testNewMarkets() {
  try {
    console.log('🔍 Test nuove raccomandazioni Over/Under e Goal/NoGoal\n');
    
    const response = await axios.get('http://localhost:3001/api/fixtures/sm/today');
    const fixtures = response.data.fixtures;
    
    console.log(`📊 Totale partite upcoming: ${fixtures.length}\n`);
    
    for (const fixture of fixtures) {
      const predictions = fixture.predictions;
      if (!predictions || !predictions.recommendations) continue;
      
      const { recommendations, topPicks } = predictions;
      const allRecs = [...(topPicks || []), ...(recommendations || [])];
      
      if (allRecs.length === 0) continue;
      
      console.log(`\n⚽ ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`);
      console.log(`   ${fixture.league.name} - ${new Date(fixture.date).toLocaleTimeString('it-IT')}`);
      console.log(`   📈 xG: ${predictions.mlPrediction?.expectedScore?.home?.toFixed(2)} - ${predictions.mlPrediction?.expectedScore?.away?.toFixed(2)}`);
      
      // Filtra per tipo di mercato
      const overUnder = allRecs.filter(r => r.type === 'over_under');
      const goalNoGoal = allRecs.filter(r => r.type === 'goal_nogoal');
      const doubleChance = allRecs.filter(r => r.type === 'double_chance');
      const result = allRecs.filter(r => r.type === 'result');
      
      if (overUnder.length > 0) {
        console.log('\n   🎯 OVER/UNDER:');
        overUnder.forEach(r => {
          console.log(`      ${r.prediction} @ ${r.odds} | ${r.valueRating}⭐ | EV: ${(r.expectedValue * 100).toFixed(1)}% | Conf: ${r.confidence}%`);
          console.log(`         ${r.reason}`);
        });
      }
      
      if (goalNoGoal.length > 0) {
        console.log('\n   ⚽ GOAL/NOGOAL:');
        goalNoGoal.forEach(r => {
          console.log(`      ${r.prediction} @ ${r.odds} | ${r.valueRating}⭐ | EV: ${(r.expectedValue * 100).toFixed(1)}% | Conf: ${r.confidence}%`);
          console.log(`         ${r.reason}`);
        });
      }
      
      if (doubleChance.length > 0) {
        console.log('\n   🔄 DOPPIA CHANCE:');
        doubleChance.forEach(r => {
          console.log(`      ${r.prediction} @ ${r.odds} | ${r.valueRating}⭐ | EV: ${(r.expectedValue * 100).toFixed(1)}% | Conf: ${r.confidence}%`);
        });
      }
      
      if (result.length > 0) {
        console.log('\n   🏆 RISULTATO 1X2:');
        result.forEach(r => {
          console.log(`      ${r.prediction} @ ${r.odds} | ${r.valueRating}⭐ | EV: ${(r.expectedValue * 100).toFixed(1)}% | Conf: ${r.confidence}%`);
        });
      }
    }
    
    console.log('\n\n📊 RIEPILOGO RACCOMANDAZIONI PER TIPO:');
    let totalOverUnder = 0;
    let totalGoalNoGoal = 0;
    let totalDoubleChance = 0;
    let totalResult = 0;
    
    fixtures.forEach(f => {
      if (!f.predictions?.recommendations) return;
      const allRecs = [...(f.predictions.topPicks || []), ...(f.predictions.recommendations || [])];
      totalOverUnder += allRecs.filter(r => r.type === 'over_under').length;
      totalGoalNoGoal += allRecs.filter(r => r.type === 'goal_nogoal').length;
      totalDoubleChance += allRecs.filter(r => r.type === 'double_chance').length;
      totalResult += allRecs.filter(r => r.type === 'result').length;
    });
    
    console.log(`   Over/Under: ${totalOverUnder} raccomandazioni`);
    console.log(`   Goal/NoGoal: ${totalGoalNoGoal} raccomandazioni`);
    console.log(`   Doppia Chance: ${totalDoubleChance} raccomandazioni`);
    console.log(`   Risultato 1X2: ${totalResult} raccomandazioni`);
    console.log(`   TOTALE: ${totalOverUnder + totalGoalNoGoal + totalDoubleChance + totalResult} raccomandazioni\n`);
    
  } catch (error) {
    console.error('❌ Errore:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testNewMarkets();
