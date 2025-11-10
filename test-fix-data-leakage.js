const moment = require('moment-timezone');

// Test rapido per verificare il fix del data leakage
const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testDataLeakageFix() {
  console.log('🔬 TEST FIX DATA LEAKAGE - Confronto Prima/Dopo');
  console.log('═══════════════════════════════════════════\n');
  
  // Test su 3 partite degli ultimi giorni
  const testDate = '2025-11-08';
  
  console.log(`📅 Test su partite del ${testDate}`);
  
  try {
    // 1. Carica partite del giorno di test
    const fixturesResponse = await fetch(`${API_URL}/api/fixtures/sm/range?startDate=${testDate}&endDate=${testDate}`);
    const fixturesData = await fixturesResponse.json();
    
    if (!fixturesData.fixtures || fixturesData.fixtures.length === 0) {
      console.log('❌ Nessuna partita trovata per il test');
      return;
    }
    
    const finishedFixtures = fixturesData.fixtures.filter(f => f.status === 'FT' && f.score);
    console.log(`✅ ${finishedFixtures.length} partite finite trovate\n`);
    
    // 2. Test su prime 3 partite
    const testFixtures = finishedFixtures.slice(0, 3);
    
    for (let i = 0; i < testFixtures.length; i++) {
      const fixture = testFixtures[i];
      
      console.log(`\n🏟️  [${i+1}/3] ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`);
      console.log(`📊 Risultato: ${fixture.score.home}-${fixture.score.away}`);
      
      // Test CON referenceDate (dovrebbe essere più conservativo)
      try {
        const recsResponse = await fetch(`${API_URL}/api/betting-recommendations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fixtureId: fixture.id,
            homeTeamId: fixture.homeTeam.id,
            awayTeamId: fixture.awayTeam.id,
            leagueId: fixture.league.id,
            seasonId: fixture.league.season,
            homeTeamName: fixture.homeTeam.name,
            awayTeamName: fixture.awayTeam.name,
            referenceDate: testDate  // ← Fix temporale applicato
          })
        });
        
        if (recsResponse.ok) {
          const recsData = await recsResponse.json();
          
          if (recsData.recommendations && recsData.recommendations.length > 0) {
            const bestRec = recsData.recommendations[0];
            console.log(`✅ Raccomandazione (CON fix): ${bestRec.prediction} @${bestRec.odds} (EV: ${bestRec.expectedValue}%)`);
            console.log(`📈 Confidence: ${bestRec.confidence}% | Value: ${bestRec.valueRating}`);
          } else {
            console.log('⚠️  Nessuna raccomandazione valida con fix temporale');
          }
        } else {
          console.log(`❌ Errore API: ${recsResponse.status}`);
        }
      } catch (error) {
        console.log(`❌ Errore: ${error.message}`);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    console.log('\n🎯 CONCLUSIONI:');
    console.log('- Se le raccomandazioni sono più conservative/assenti, il fix funziona');
    console.log('- Se le predizioni sono ancora troppo accurate, c\'è ancora data leakage');
    console.log('- Monitora i warning "POTENTIAL DATA LEAKAGE" nei log del server');
    
  } catch (error) {
    console.error('❌ Errore nel test:', error);
  }
}

// Esegui test
testDataLeakageFix().catch(console.error);