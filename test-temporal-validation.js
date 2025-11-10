const moment = require('moment-timezone');

// Test specifico per verificare la validazione temporale appena implementata
const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testTemporalValidation() {
  console.log('🛡️  TEST VALIDAZIONE TEMPORALE - Verifica Fix Implementato');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Test con data di riferimento nel passato per forzare violazione temporale
  const testDate = '2025-11-08'; // Data con partite conosciute
  const referenceDate = '2025-11-07'; // Data di riferimento PRIMA delle partite
  
  console.log(`🎯 Test Scenario: Analizzare partite del ${testDate} con referenceDate ${referenceDate}`);
  console.log(`⚠️  Questo DOVREBBE fallire se la validazione temporale funziona\n`);
  
  try {
    // Carica partite del giorno test
    const fixturesResponse = await fetch(`${API_URL}/api/fixtures/sm/range?startDate=${testDate}&endDate=${testDate}`);
    const fixturesData = await fixturesResponse.json();
    
    if (!fixturesData.fixtures || fixturesData.fixtures.length === 0) {
      console.log('❌ Nessuna partita trovata per il test');
      return;
    }
    
    const finishedFixtures = fixturesData.fixtures.filter(f => f.status === 'FT' && f.score);
    
    if (finishedFixtures.length === 0) {
      console.log('❌ Nessuna partita finita per il test');
      return;
    }
    
    const testFixture = finishedFixtures[0];
    console.log(`🏟️  Testando: ${testFixture.homeTeam.name} vs ${testFixture.awayTeam.name}`);
    console.log(`📅 Partita del: ${testDate}`);
    console.log(`📅 Reference date: ${referenceDate} (dovrebbe essere PRIMA)\n`);
    
    // Test dell'API con validazione temporale
    console.log('🔄 Chiamando API con validazione temporale...');
    
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
        referenceDate: referenceDate // Data nel passato
      })
    });
    
    if (recsResponse.ok) {
      const recsData = await recsResponse.json();
      
      if (recsData.recommendations && recsData.recommendations.length > 0) {
        console.log('🚨 CRITICAL BUG STILL EXISTS: API ha accettato partita nel futuro!');
        console.log(`📊 Raccomandazioni generate: ${recsData.recommendations.length}`);
        console.log('❌ La validazione temporale NON funziona correttamente');
      } else {
        console.log('⚠️  API ha restituito 200 ma nessuna raccomandazione');
        console.log('ℹ️  Possibile che sia stato filtrato in altro modo');
      }
    } else {
      // Leggiamo il messaggio di errore
      try {
        const errorData = await recsResponse.json();
        console.log('✅ PERFETTO: API ha rifiutato la richiesta!');
        console.log(`📨 Status: ${recsResponse.status}`);
        console.log(`📄 Errore: ${errorData.error}`);
        console.log('🛡️  Validazione temporale funziona correttamente!');
        
        if (errorData.fixtureDate && errorData.referenceDate) {
          console.log(`📅 Fixture Date: ${errorData.fixtureDate}`);
          console.log(`📅 Reference Date: ${errorData.referenceDate}`);
        }
      } catch (e) {
        console.log(`✅ API ha rifiutato con status ${recsResponse.status}`);
        console.log('🛡️  Validazione temporale probabilmente funziona');
      }
    }
    
  } catch (error) {
    console.error(`❌ Errore nel test: ${error.message}`);
  }
  
  console.log('\n🎯 INTERPRETAZIONE RISULTATI:');
  console.log('✅ Se vedi "PERFETTO" → Validazione temporale implementata correttamente');
  console.log('🚨 Se vedi "CRITICAL BUG" → Serve fix aggiuntivo');
  console.log('⚠️  Se vedi "nessuna raccomandazione" → Potrebbe essere filtrato altrove');
}

// Esegui test
testTemporalValidation().catch(console.error);