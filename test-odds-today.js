/**
 * Test quote reali per partite di oggi
 * Simula esattamente il flusso dell'interfaccia
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3001';

async function getFixturesToday() {
  console.log('📅 Recupero partite di oggi (08/11/2025)...\n');
  
  try {
    const response = await axios.get(`${API_BASE}/api/fixtures/today`);
    return response.data.matches || [];
  } catch (error) {
    console.error('❌ Errore recupero fixtures:', error.response?.data || error.message);
    return [];
  }
}

async function analyzeFixture(fixtureId, homeTeam, awayTeam, league) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔍 Analisi: ${homeTeam} vs ${awayTeam}`);
  console.log(`   Fixture ID: ${fixtureId}`);
  console.log(`   Campionato: ${league}`);
  console.log(`${'='.repeat(70)}`);
  
  try {
    // Chiamata esattamente come fa il frontend
    const response = await axios.get(`${API_BASE}/api/predictions/${fixtureId}`);
    const data = response.data;
    
    console.log(`\n✅ Predizione ricevuta`);
    console.log(`   Confidence: ${(data.confidence * 100).toFixed(1)}%`);
    console.log(`   Data Quality: ${data.dataQuality || 'N/A'}`);
    
    // Verifica se ci sono quote reali
    if (data.realOdds) {
      console.log(`\n🎲 ✅ QUOTE REALI TROVATE!`);
      console.log(`   📊 Bookmakers: ${data.realOdds.bookmakerCount}`);
      console.log(`   📊 Margine mercato: ${((data.realOdds.overround - 1) * 100).toFixed(2)}%`);
      
      if (data.realOdds.lastUpdate) {
        const updateDate = new Date(data.realOdds.lastUpdate);
        console.log(`   📊 Ultimo aggiornamento: ${updateDate.toLocaleString('it-IT')}`);
      }
      
      console.log(`\n   🎯 QUOTE 1X2:`);
      console.log(`   ┌─────────────┬──────────┬─────────────┐`);
      console.log(`   │   Esito     │  Quota   │  Prob. Impl.│`);
      console.log(`   ├─────────────┼──────────┼─────────────┤`);
      console.log(`   │ 1 (Casa)    │  ${data.realOdds.odds1X2.home.toFixed(2).padStart(6)} │   ${(data.realOdds.odds1X2.prob1 * 100).toFixed(1).padStart(5)}%  │`);
      console.log(`   │ X (Pareggio)│  ${data.realOdds.odds1X2.draw.toFixed(2).padStart(6)} │   ${(data.realOdds.odds1X2.probX * 100).toFixed(1).padStart(5)}%  │`);
      console.log(`   │ 2 (Trasferta)│  ${data.realOdds.odds1X2.away.toFixed(2).padStart(6)} │   ${(data.realOdds.odds1X2.prob2 * 100).toFixed(1).padStart(5)}%  │`);
      console.log(`   └─────────────┴──────────┴─────────────┘`);
      
      // Over/Under
      if (data.realOdds.oddsOverUnder) {
        console.log(`\n   ⚽ OVER/UNDER 2.5 GOAL:`);
        console.log(`   • Over 2.5:  ${data.realOdds.oddsOverUnder.over25.toFixed(2)}`);
        console.log(`   • Under 2.5: ${data.realOdds.oddsOverUnder.under25.toFixed(2)}`);
      }
      
      // BTTS
      if (data.realOdds.oddsBTTS) {
        console.log(`\n   🎯 GOAL/NO GOAL (BTTS):`);
        console.log(`   • Goal (Sì):  ${data.realOdds.oddsBTTS.yes.toFixed(2)}`);
        console.log(`   • No Goal:    ${data.realOdds.oddsBTTS.no.toFixed(2)}`);
      }
      
      // Comparazione con modello ML
      if (data.market1X2 && data.market1X2.final) {
        console.log(`\n   📊 COMPARAZIONE MODELLO vs BOOKMAKER:`);
        const diff1 = (data.market1X2.final.prob1 - data.realOdds.odds1X2.prob1) * 100;
        const diffX = (data.market1X2.final.probX - data.realOdds.odds1X2.probX) * 100;
        const diff2 = (data.market1X2.final.prob2 - data.realOdds.odds1X2.prob2) * 100;
        
        console.log(`   • Casa (1):`);
        console.log(`     - Modello: ${(data.market1X2.final.prob1 * 100).toFixed(1)}%`);
        console.log(`     - Bookmaker: ${(data.realOdds.odds1X2.prob1 * 100).toFixed(1)}%`);
        console.log(`     - Differenza: ${diff1 > 0 ? '+' : ''}${diff1.toFixed(1)}%`);
        if (Math.abs(diff1) > 5) {
          console.log(`     ${diff1 > 0 ? '💎 VALUE BET! (Il modello vede più valore)' : '⚠️ SOPRAVVALUTATO (Bookmaker quota meglio)'}`);
        }
        
        console.log(`\n   • Pareggio (X):`);
        console.log(`     - Modello: ${(data.market1X2.final.probX * 100).toFixed(1)}%`);
        console.log(`     - Bookmaker: ${(data.realOdds.odds1X2.probX * 100).toFixed(1)}%`);
        console.log(`     - Differenza: ${diffX > 0 ? '+' : ''}${diffX.toFixed(1)}%`);
        if (Math.abs(diffX) > 5) {
          console.log(`     ${diffX > 0 ? '💎 VALUE BET!' : '⚠️ SOPRAVVALUTATO'}`);
        }
        
        console.log(`\n   • Trasferta (2):`);
        console.log(`     - Modello: ${(data.market1X2.final.prob2 * 100).toFixed(1)}%`);
        console.log(`     - Bookmaker: ${(data.realOdds.odds1X2.prob2 * 100).toFixed(1)}%`);
        console.log(`     - Differenza: ${diff2 > 0 ? '+' : ''}${diff2.toFixed(1)}%`);
        if (Math.abs(diff2) > 5) {
          console.log(`     ${diff2 > 0 ? '💎 VALUE BET!' : '⚠️ SOPRAVVALUTATO'}`);
        }
      }
      
      return true; // Quote trovate
      
    } else {
      console.log(`\n⚠️ QUOTE REALI NON DISPONIBILI`);
      console.log(`   Motivo: Sportsmonks non ha dati bookmaker per questa partita`);
      console.log(`   Suggerimento: Prova con partite dei prossimi giorni in campionati top`);
      
      // Mostra quote modello come fallback
      if (data.market1X2 && data.market1X2.final) {
        console.log(`\n   🔮 QUOTE MODELLO (teoriche):`);
        console.log(`   • Casa (1): ${(1 / data.market1X2.final.prob1).toFixed(2)} (${(data.market1X2.final.prob1 * 100).toFixed(1)}%)`);
        console.log(`   • Pareggio (X): ${(1 / data.market1X2.final.probX).toFixed(2)} (${(data.market1X2.final.probX * 100).toFixed(1)}%)`);
        console.log(`   • Trasferta (2): ${(1 / data.market1X2.final.prob2).toFixed(2)} (${(data.market1X2.final.prob2 * 100).toFixed(1)}%)`);
      }
      
      return false; // Quote non trovate
    }
    
  } catch (error) {
    console.error(`\n❌ ERRORE nell'analisi:`, error.response?.data || error.message);
    return false;
  }
}

async function main() {
  console.log('🎲 TEST INTEGRAZIONE QUOTE REALI SPORTSMONKS');
  console.log('📅 Data: 08/11/2025');
  console.log('🔄 Simula flusso completo dell\'interfaccia\n');
  console.log('='.repeat(70));
  
  // Step 1: Recupera fixtures di oggi
  const fixtures = await getFixturesToday();
  
  if (fixtures.length === 0) {
    console.log('\n⚠️ Nessuna partita trovata per oggi.');
    console.log('Prova a cercare partite nei prossimi giorni con:');
    console.log('  curl "http://localhost:3001/api/fixtures/upcoming?days=7&limit=20"\n');
    return;
  }
  
  console.log(`\n✅ Trovate ${fixtures.length} partite per oggi`);
  console.log('─'.repeat(70));
  
  // Mostra tutte le partite
  fixtures.forEach((fixture, idx) => {
    console.log(`${idx + 1}. ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`);
    console.log(`   📍 ${fixture.league.name} (${fixture.league.country})`);
    console.log(`   🆔 Fixture ID: ${fixture.id}`);
  });
  
  // Step 2: Analizza ogni partita
  console.log('\n\n🔍 INIZIO ANALISI DETTAGLIATA\n');
  
  let oddsFoundCount = 0;
  let totalAnalyzed = 0;
  
  for (const fixture of fixtures) {
    const hasOdds = await analyzeFixture(
      fixture.id,
      fixture.homeTeam.name,
      fixture.awayTeam.name,
      fixture.league.name
    );
    
    if (hasOdds) oddsFoundCount++;
    totalAnalyzed++;
    
    // Pausa tra le richieste per non sovraccaricare l'API
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  // Riepilogo finale
  console.log(`\n\n${'='.repeat(70)}`);
  console.log('📊 RIEPILOGO TEST');
  console.log(`${'='.repeat(70)}`);
  console.log(`✅ Partite analizzate: ${totalAnalyzed}`);
  console.log(`🎲 Quote reali trovate: ${oddsFoundCount}`);
  console.log(`⚠️ Quote non disponibili: ${totalAnalyzed - oddsFoundCount}`);
  
  if (oddsFoundCount > 0) {
    console.log(`\n✅ SUCCESSO! Le quote reali Sportsmonks funzionano correttamente!`);
    console.log(`   ${oddsFoundCount} partita/e hanno quote bookmaker disponibili.`);
    console.log(`   Vai su http://localhost:3000 e analizza queste partite per vedere le quote.`);
  } else {
    console.log(`\n⚠️ Nessuna quota reale trovata per oggi.`);
    console.log(`   Motivi possibili:`);
    console.log(`   • Partite di campionati non coperti da Sportsmonks`);
    console.log(`   • Partite troppo vecchie o troppo future`);
    console.log(`   • Rate limit Sportsmonks raggiunto (3000 req/ora)`);
    console.log(`\n   Prova con partite dei prossimi 2-7 giorni in campionati top.`);
  }
  
  console.log(`\n${'='.repeat(70)}\n`);
}

main().catch(console.error);
