/**
 * Test diretto servizio odds Sportsmonks
 */

const sportsmonksOdds = require('./api/dist/services/sportsmonks/odds');

async function testOdds(fixtureId) {
  console.log(`\n🎲 Testing Sportsmonks Odds Service`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Fixture ID: ${fixtureId}\n`);
  
  try {
    const odds = await sportsmonksOdds.fetchOddsByFixtureId(fixtureId);
    
    if (odds) {
      console.log(`\n✅ SUCCESSO! Quote trovate per fixture ${fixtureId}`);
      console.log(`${'='.repeat(70)}`);
      console.log(`\n📊 Informazioni Bookmaker:`);
      console.log(`   • Numero bookmaker: ${odds.bookmakerCount}`);
      console.log(`   • Overround (margine): ${((odds.overround - 1) * 100).toFixed(2)}%`);
      console.log(`   • Ultimo aggiornamento: ${new Date(odds.lastUpdate).toLocaleString('it-IT')}`);
      
      console.log(`\n🎯 Quote 1X2:`);
      console.log(`   ┌─────────────┬──────────┬──────────────┐`);
      console.log(`   │   Esito     │  Quota   │  Prob. Impl. │`);
      console.log(`   ├─────────────┼──────────┼──────────────┤`);
      console.log(`   │ 1 (Casa)    │  ${odds.odds1X2.home.toFixed(2).padStart(6)} │    ${(odds.odds1X2.prob1 * 100).toFixed(1).padStart(5)}%   │`);
      console.log(`   │ X (Pareggio)│  ${odds.odds1X2.draw.toFixed(2).padStart(6)} │    ${(odds.odds1X2.probX * 100).toFixed(1).padStart(5)}%   │`);
      console.log(`   │ 2 (Trasferta)│  ${odds.odds1X2.away.toFixed(2).padStart(6)} │    ${(odds.odds1X2.prob2 * 100).toFixed(1).padStart(5)}%   │`);
      console.log(`   └─────────────┴──────────┴──────────────┘`);
      
      if (odds.oddsOverUnder) {
        console.log(`\n⚽ Over/Under 2.5 Goal:`);
        console.log(`   • Over 2.5:  ${odds.oddsOverUnder.over25.toFixed(2)}`);
        console.log(`   • Under 2.5: ${odds.oddsOverUnder.under25.toFixed(2)}`);
      }
      
      if (odds.oddsBTTS) {
        console.log(`\n🎯 Goal/No Goal (BTTS):`);
        console.log(`   • Goal (Sì): ${odds.oddsBTTS.yes.toFixed(2)}`);
        console.log(`   • No Goal:   ${odds.oddsBTTS.no.toFixed(2)}`);
      }
      
      console.log(`\n${'='.repeat(70)}`);
      console.log(`✅ Il servizio Sportsmonks Odds funziona correttamente!`);
      console.log(`   Le quote dovrebbero apparire nel frontend.`);
      
    } else {
      console.log(`\n⚠️ Nessuna quota trovata per fixture ${fixtureId}`);
      console.log(`\nMotivi possibili:`);
      console.log(`   • Fixture ID non valido per Sportsmonks`);
      console.log(`   • Il fixture è di un campionato non coperto`);
      console.log(`   • Le quote non sono ancora disponibili`);
      console.log(`   • Rate limit raggiunto (3000 richieste/ora)`);
      console.log(`\nSuggerimenti:`);
      console.log(`   • Verifica che il fixture ID sia corretto`);
      console.log(`   • Prova con partite di campionati top (Premier, Serie A, La Liga)`);
      console.log(`   • Verifica i log del servizio per dettagli`);
    }
    
  } catch (error) {
    console.error(`\n❌ ERRORE:`, error.message);
    console.error(`Stack:`, error.stack);
  }
}

// Test con fixture ID fornito
const fixtureId = parseInt(process.argv[2] || '19424983');
testOdds(fixtureId);
