const moment = require('moment-timezone');

// Test per verificare se il sistema usa dati futuri rispetto alla data della partita
const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testFutureDataLeak() {
  console.log('🔍 TEST VERIFICA DATI FUTURI - Controllo Temporale Critico');
  console.log('══════════════════════════════════════════════════════════\n');
  
  // Test scenari critici
  const testCases = [
    {
      name: "Scenario 1: Partita nel futuro rispetto a referenceDate",
      referenceDate: "2025-11-01", // Data di riferimento
      expectedIssue: "Sistema dovrebbe RIFIUTARE partite dopo 2025-11-01"
    },
    {
      name: "Scenario 2: Partita nel passato rispetto a referenceDate", 
      referenceDate: "2025-11-09", // Data più recente
      expectedIssue: "Sistema dovrebbe ACCETTARE solo partite prima 2025-11-09"
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n${testCase.name}`);
    console.log(`📅 Reference Date: ${testCase.referenceDate}`);
    console.log(`🎯 ${testCase.expectedIssue}\n`);
    
    try {
      // Carica partite di un giorno specifico che sappiamo essere nel futuro
      const futureDate = '2025-11-08'; // Data nota con partite
      const fixturesResponse = await fetch(`${API_URL}/api/fixtures/sm/range?startDate=${futureDate}&endDate=${futureDate}`);
      const fixturesData = await fixturesResponse.json();
      
      if (!fixturesData.fixtures || fixturesData.fixtures.length === 0) {
        console.log('⚠️  Nessuna partita trovata per il test');
        continue;
      }
      
      const finishedFixtures = fixturesData.fixtures.filter(f => f.status === 'FT' && f.score);
      
      if (finishedFixtures.length === 0) {
        console.log('⚠️  Nessuna partita finita per il test');
        continue;
      }
      
      // Prendi la prima partita e verifica cosa succede
      const testFixture = finishedFixtures[0];
      console.log(`🏟️  Test con: ${testFixture.homeTeam.name} vs ${testFixture.awayTeam.name}`);
      console.log(`📅 Partita giocata il: ${testFixture.starting_at}`);
      console.log(`📅 Reference date usato: ${testCase.referenceDate}`);
      
      // Calcola se la partita è nel futuro rispetto alla reference date
      const fixtureDate = new Date(testFixture.starting_at);
      const refDate = new Date(testCase.referenceDate);
      const isInFuture = fixtureDate > refDate;
      
      console.log(`⏰ Partita è nel ${isInFuture ? 'FUTURO' : 'PASSATO'} rispetto alla reference date`);
      
      // Testa l'API con questa combinazione
      const recsResponse = await fetch(`${API_URL}/api/betting-recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixtureId: testFixture.id,
          homeTeamId: testFixture.homeTeam.id,
          awayTeamId: testFixture.awayTeam.id,
          leagueId: testFixture.league.id,
          seasonId: testFixture.league.season,
          homeTeamName: testFixture.homeTeam.name,
          awayTeamName: testFixture.awayTeam.name,
          referenceDate: testCase.referenceDate
        })
      });
      
      if (recsResponse.ok) {
        const recsData = await recsResponse.json();
        
        if (isInFuture && recsData.recommendations && recsData.recommendations.length > 0) {
          console.log('🚨 CRITICAL BUG: Sistema ha generato raccomandazioni per partita nel FUTURO!');
          console.log(`📊 Raccomandazioni trovate: ${recsData.recommendations.length}`);
          console.log(`🎯 Prima raccomandazione: ${recsData.recommendations[0].prediction} @${recsData.recommendations[0].odds}`);
        } else if (!isInFuture && recsData.recommendations && recsData.recommendations.length > 0) {
          console.log('✅ OK: Sistema ha analizzato correttamente partita nel passato');
          console.log(`📊 Raccomandazioni: ${recsData.recommendations.length}`);
        } else if (isInFuture && (!recsData.recommendations || recsData.recommendations.length === 0)) {
          console.log('✅ PERFECT: Sistema ha correttamente RIFIUTATO partita nel futuro');
        } else {
          console.log('ℹ️  Nessuna raccomandazione generata (potrebbe essere normale)');
        }
      } else {
        console.log(`❌ Errore API: ${recsResponse.status}`);
      }
      
    } catch (error) {
      console.error(`❌ Errore nel test: ${error.message}`);
    }
    
    // Rate limiting tra test
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n🎯 CONCLUSIONI:');
  console.log('1. Se vedi "CRITICAL BUG", il sistema usa dati futuri - GRAVE PROBLEMA');
  console.log('2. Se vedi "PERFECT", il sistema filtra correttamente - SISTEMA OK'); 
  console.log('3. Controlla i log del server per warning "POTENTIAL DATA LEAKAGE"');
}

// Esegui test
testFutureDataLeak().catch(console.error);