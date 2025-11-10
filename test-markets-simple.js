const axios = require('axios');

async function testMarkets() {
  try {
    console.log('🔍 TEST NUOVI MERCATI: Over/Under e Goal/NoGoal\n');
    console.log('📊 Verifico le partite di oggi...\n');
    
    // Partite da testare
    const matches = [
      { id: 19424985, home: 'Inter', away: 'Lazio', league: 'Serie A' },
      { id: 19433838, home: 'Lyon', away: 'PSG', league: 'Ligue 1' },
      { id: 19439362, home: 'Celta', away: 'Barcelona', league: 'La Liga' }
    ];
    
    for (const match of matches) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`⚽ ${match.home} vs ${match.away} (${match.league})`);
      console.log('='.repeat(70));
      
      try {
        const response = await axios.get(`http://localhost:3001/api/predictions/match/${match.id}`);
        const data = response.data;
        
        if (!data.recommendations) {
          console.log('❌ Nessuna raccomandazione disponibile');
          continue;
        }
        
        const { topPicks = [], recommendations = [] } = data.recommendations;
        const allRecs = [...topPicks, ...recommendations];
        
        if (allRecs.length === 0) {
          console.log('⚠️  Nessuna raccomandazione generata (filtri troppo stringenti o dati insufficienti)');
          continue;
        }
        
        // Analizza per tipo
        const overUnder = allRecs.filter(r => r.type === 'over_under');
        const goalNoGoal = allRecs.filter(r => r.type === 'goal_nogoal');
        const doubleChance = allRecs.filter(r => r.type === 'double_chance');
        const result = allRecs.filter(r => r.type === 'result');
        
        console.log(`\n📈 xG Previsto: ${data.mlPrediction?.expectedScore?.home?.toFixed(2) || '?'} - ${data.mlPrediction?.expectedScore?.away?.toFixed(2) || '?'}`);
        console.log(`   Totale xG: ${((data.mlPrediction?.expectedScore?.home || 0) + (data.mlPrediction?.expectedScore?.away || 0)).toFixed(2)}`);
        
        if (overUnder.length > 0) {
          console.log('\n🎯 OVER/UNDER (NUOVO!):');
          overUnder.forEach(r => {
            console.log(`   ✅ ${r.name}`);
            console.log(`      Predizione: ${r.prediction}`);
            console.log(`      Quota: ${r.odds} | Rating: ${r.valueRating}⭐ | Confidence: ${r.confidence}%`);
            console.log(`      EV: ${(r.expectedValue * 100).toFixed(1)}% | Prob. Modello: ${r.modelProbability?.toFixed(1)}%`);
            console.log(`      💡 ${r.reason}`);
          });
        } else {
          console.log('\n🎯 OVER/UNDER: Nessuna raccomandazione');
          console.log('   (Richiede: xG molto chiari, EV >15%, confidence >55%)');
        }
        
        if (goalNoGoal.length > 0) {
          console.log('\n⚽ GOAL/NOGOAL (FILTRI OTTIMIZZATI):');
          goalNoGoal.forEach(r => {
            console.log(`   ✅ ${r.name}`);
            console.log(`      Predizione: ${r.prediction}`);
            console.log(`      Quota: ${r.odds} | Rating: ${r.valueRating}⭐ | Confidence: ${r.confidence}%`);
            console.log(`      EV: ${(r.expectedValue * 100).toFixed(1)}% | Prob. Modello: ${r.modelProbability?.toFixed(1)}%`);
            console.log(`      💡 ${r.reason}`);
          });
        } else {
          console.log('\n⚽ GOAL/NOGOAL: Nessuna raccomandazione');
          console.log('   (Richiede: EV >15%, confidence >60%, max 3⭐)');
        }
        
        if (doubleChance.length > 0) {
          console.log('\n🔄 DOPPIA CHANCE:');
          doubleChance.forEach(r => {
            console.log(`   ${r.name} @ ${r.odds} | ${r.valueRating}⭐ | EV: ${(r.expectedValue * 100).toFixed(1)}%`);
          });
        }
        
        if (result.length > 0) {
          console.log('\n🏆 RISULTATO 1X2:');
          result.forEach(r => {
            console.log(`   ${r.name} @ ${r.odds} | ${r.valueRating}⭐ | EV: ${(r.expectedValue * 100).toFixed(1)}%`);
          });
        }
        
        console.log(`\n📊 TOTALE RACCOMANDAZIONI: ${allRecs.length}`);
        
      } catch (error) {
        console.log(`❌ Errore nel recupero dati: ${error.message}`);
      }
    }
    
    console.log('\n\n' + '='.repeat(70));
    console.log('✅ TEST COMPLETATO');
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('❌ Errore generale:', error.message);
  }
}

testMarkets();
