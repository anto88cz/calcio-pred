/**
 * Test xG Storici - Verifica integrazione Expected Goals
 * 
 * Questo script testa:
 * 1. Fetch xG storici da API-FOOTBALL
 * 2. Calcolo medie xG/xGA
 * 3. Copertura xG (% match con dati disponibili)
 */

const { historyService } = require('./api/src/services/api-football');

async function testXGHistorical() {
  console.log('🧪 TEST XG STORICI\n');
  console.log('='.repeat(60));

  try {
    // Test con squadre Serie A 2024
    const testTeams = [
      { id: 487, name: 'Juventus' },
      { id: 489, name: 'AC Milan' },
      { id: 505, name: 'Inter' },
      { id: 497, name: 'AS Roma' },
    ];

    for (const team of testTeams) {
      console.log(`\n📊 ${team.name.toUpperCase()} (ID: ${team.id})`);
      console.log('-'.repeat(60));

      // Fetch storico con xG
      const history = await historyService.getTeamHistoryWithXG(
        team.id,
        2024,   // Season
        10,     // Ultime 10 partite
        true    // Fetch xG
      );

      if (history.length === 0) {
        console.log('⚠️  Nessuna partita trovata\n');
        continue;
      }

      // Analisi dati
      let xgCount = 0;
      let totalXG = 0;
      let totalXGA = 0;
      let totalGoals = 0;
      let totalGoalsConceded = 0;

      console.log(`\n🎯 Ultime ${history.length} partite:\n`);

      history.forEach((match, idx) => {
        const teamGoals = match.isHome ? match.homeGoals : match.awayGoals;
        const oppGoals = match.isHome ? match.awayGoals : match.homeGoals;
        const teamXG = match.isHome ? match.homeXg : match.awayXg;
        const oppXG = match.isHome ? match.awayXg : match.homeXg;
        
        const venue = match.isHome ? '🏠' : '✈️';
        const result = teamGoals > oppGoals ? '✅' : teamGoals < oppGoals ? '❌' : '🟰';
        
        console.log(`${idx + 1}. ${venue} ${result} ${match.homeTeamName} ${match.homeGoals}-${match.awayGoals} ${match.awayTeamName}`);
        console.log(`   📅 ${match.date.toISOString().split('T')[0]}`);
        
        if (teamXG !== null && teamXG !== undefined) {
          console.log(`   ⚽ xG: ${match.homeXg?.toFixed(2)} - ${match.awayXg?.toFixed(2)}`);
          console.log(`   📈 Team: ${teamGoals} gol (xG ${teamXG.toFixed(2)}) | Diff: ${(teamGoals - teamXG).toFixed(2)}`);
          xgCount++;
          totalXG += teamXG;
          totalXGA += oppXG || 0;
        } else {
          console.log(`   ⚠️  xG non disponibile`);
        }
        console.log('');

        totalGoals += teamGoals;
        totalGoalsConceded += oppGoals;
      });

      // Statistiche aggregate
      const xgCoverage = (xgCount / history.length) * 100;
      const avgXG = xgCount > 0 ? totalXG / xgCount : 0;
      const avgXGA = xgCount > 0 ? totalXGA / xgCount : 0;
      const avgGoals = history.length > 0 ? totalGoals / history.length : 0;
      const avgGoalsConceded = history.length > 0 ? totalGoalsConceded / history.length : 0;

      console.log('📊 STATISTICHE AGGREGATE:');
      console.log('-'.repeat(60));
      console.log(`   Copertura xG:        ${xgCoverage.toFixed(1)}% (${xgCount}/${history.length} match)`);
      console.log('');
      console.log('   GOL FATTI:');
      console.log(`     • Media gol reali: ${avgGoals.toFixed(2)}`);
      console.log(`     • Media xG:        ${avgXG.toFixed(2)}`);
      console.log(`     • Differenza:      ${(avgGoals - avgXG).toFixed(2)} (${avgGoals > avgXG ? 'sovraperformance' : 'underperformance'})`);
      console.log('');
      console.log('   GOL SUBITI:');
      console.log(`     • Media concessi:  ${avgGoalsConceded.toFixed(2)}`);
      console.log(`     • Media xGA:       ${avgXGA.toFixed(2)}`);
      console.log(`     • Differenza:      ${(avgGoalsConceded - avgXGA).toFixed(2)}`);
      console.log('');
      
      // Blend simulation
      if (xgCount > 0) {
        const blendWeight = 0.30;
        const lambdaBlended = (1 - blendWeight) * avgGoals + blendWeight * avgXG;
        console.log(`   LAMBDA BLENDING (70% goals + 30% xG):`);
        console.log(`     • Lambda da gol:   ${avgGoals.toFixed(2)}`);
        console.log(`     • Lambda da xG:    ${avgXG.toFixed(2)}`);
        console.log(`     • Lambda blended:  ${lambdaBlended.toFixed(2)}`);
      }

      console.log('\n' + '='.repeat(60));
      
      // Pausa per non sovraccaricare API
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n✅ TEST COMPLETATO CON SUCCESSO!\n');
    
  } catch (error) {
    console.error('\n❌ ERRORE NEL TEST:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Esegui test
testXGHistorical()
  .then(() => {
    console.log('🎉 Tutti i test completati');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Test fallito:', error);
    process.exit(1);
  });
