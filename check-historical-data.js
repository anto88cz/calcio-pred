/**
 * Script per verificare quante partite storiche ci sono nel database
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

async function checkHistoricalData() {
  console.log('🔍 Checking historical data in database...\n');
  
  try {
    // Ottieni le fixture di oggi
    const fixturesResponse = await fetch(`${API_URL}/api/fixtures/today`);
    if (!fixturesResponse.ok) {
      console.log('❌ Could not fetch fixtures');
      return;
    }
    
    const fixturesData = await fixturesResponse.json();
    const fixtures = fixturesData.matches || [];
    
    if (fixtures.length === 0) {
      console.log('⚠️  No fixtures for today');
      return;
    }
    
    console.log(`📅 Found ${fixtures.length} fixtures for today\n`);
    
    // Per ogni fixture, controlla quante partite storiche ci sono
    for (const fixture of fixtures.slice(0, 3)) {
      console.log('='.repeat(80));
      console.log(`🏆 ${fixture.homeTeam} vs ${fixture.awayTeam}`);
      console.log(`   Fixture ID: ${fixture.id}`);
      console.log('='.repeat(80));
      
      try {
        // Prova a ottenere la predizione (che dovrebbe dirci quanti match sono stati usati)
        const predResponse = await fetch(`${API_URL}/api/predictions/calculate-by-name`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            homeTeamName: fixture.homeTeam,
            awayTeamName: fixture.awayTeam,
          }),
        });
        
        if (predResponse.ok) {
          const pred = await predResponse.json();
          console.log(`\n📊 Prediction Results:`);
          console.log(`   Home matches used: ${pred.homeMatchesUsed || 0}`);
          console.log(`   Away matches used: ${pred.awayMatchesUsed || 0}`);
          console.log(`   Data quality: ${pred.dataQuality}`);
          console.log(`   Confidence: ${(pred.confidence * 100).toFixed(1)}%`);
          
          if (pred.dataQuality === 'INSUFFICIENT') {
            console.log('\n❌ PROBLEMA: Dati insufficienti per questa partita');
            console.log(`   Servono almeno 3 partite per squadra della stagione 2025`);
            console.log(`   Home team ha: ${pred.homeMatchesUsed || 0} partite`);
            console.log(`   Away team ha: ${pred.awayMatchesUsed || 0} partite`);
          }
        } else {
          const error = await predResponse.json();
          console.log(`\n❌ Error: ${error.error}`);
        }
        
        console.log('');
        
      } catch (err) {
        console.log(`\n💥 Error: ${err.message}\n`);
      }
    }
    
    console.log('='.repeat(80));
    console.log('\n💡 DIAGNOSI:');
    console.log('   Il problema è che non ci sono abbastanza partite storiche nel database');
    console.log('   per la stagione corrente (2025).');
    console.log('\n   SOLUZIONE:');
    console.log('   1. Assicurati che le partite storiche siano state caricate nel database');
    console.log('   2. Controlla che le partite siano della stagione corretta (2025)');
    console.log('   3. Verifica che ci siano almeno 3 partite per squadra');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.log('💥 Error:', error.message);
  }
}

// Run check
checkHistoricalData().catch(console.error);
