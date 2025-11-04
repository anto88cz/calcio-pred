// 🚀 DEMO RAPIDA SISTEMA COMPLETO
// Test frontend + backend + Enhanced Predictor

console.log('🚀 ========================================');
console.log('🎯 DEMO SISTEMA CALCIO-PRED COMPLETO');
console.log('🚀 ========================================\n');

const axios = require('axios');

async function testCompleteSystem() {
  console.log('📊 STATO DEI SERVIZI:');
  
  // 1. Test Enhanced API Server
  try {
    const healthCheck = await axios.get('http://localhost:3001/api/health');
    console.log('   ✅ Enhanced API Server: ATTIVO');
    console.log(`      📝 ${healthCheck.data.service} v${healthCheck.data.version}`);
  } catch (error) {
    console.log('   ❌ Enhanced API Server: NON DISPONIBILE');
    console.log('      🔧 Avvia con: node enhanced-api-server.js');
  }

  // 2. Test Frontend
  try {
    const frontendCheck = await axios.get('http://localhost:3000');
    console.log('   ✅ Frontend Next.js: ATTIVO su http://localhost:3000');
  } catch (error) {
    console.log('   ⚠️ Frontend Next.js: Verificare http://localhost:3000');
    console.log('      🔧 Se non funziona, controllare errori compilazione');
  }

  // 3. Test API League Analysis
  console.log('\n🔍 TEST ANALISI LEGA:');
  try {
    console.log('   🇫🇷 Testando Ligue 1 (ID: 61)...');
    
    const leagueAnalysis = await axios.get('http://localhost:3001/api/predictions/league/61');
    
    if (leagueAnalysis.data.success) {
      const predictions = leagueAnalysis.data.predictions;
      console.log(`   ✅ Analisi completata: ${predictions.length} partite trovate`);
      
      if (predictions.length > 0) {
        console.log('\n📊 ESEMPIO PREDIZIONE:');
        const firstMatch = predictions[0];
        console.log(`      🏠 ${firstMatch.homeTeam} vs ✈️ ${firstMatch.awayTeam}`);
        console.log(`      🎯 Expected Goals: ${firstMatch.predictions.homeGoals.toFixed(2)} - ${firstMatch.predictions.awayGoals.toFixed(2)}`);
        console.log(`      📈 Probabilità: ${firstMatch.predictions.prob1.toFixed(1)}% - ${firstMatch.predictions.probX.toFixed(1)}% - ${firstMatch.predictions.prob2.toFixed(1)}%`);
        console.log(`      🎲 Confidence: ${firstMatch.confidence.toFixed(1)}%`);
        console.log(`      💰 Value Bets: ${firstMatch.valueBets?.length || 0}`);
      } else {
        console.log('   📅 Nessuna partita oggi per Ligue 1');
      }
    } else {
      console.log('   ⚠️ Errore nell\'analisi:', leagueAnalysis.data.message);
    }
    
  } catch (error) {
    console.log('   ❌ Errore test analisi lega:', error.message);
  }

  // 4. Istruzioni per l'utente
  console.log('\n🎯 COME USARE IL SISTEMA:');
  console.log('   1️⃣ Vai su: http://localhost:3000');
  console.log('   2️⃣ Seleziona una lega (Premier, Serie A, etc.)');
  console.log('   3️⃣ Aspetta l\'analisi (10-30 secondi)');
  console.log('   4️⃣ Vedi tutte le partite con:');
  console.log('       📊 Expected Goals dettagliati');
  console.log('       🎯 Probabilità 1X2 precise');
  console.log('       💰 Value Betting opportunities');
  console.log('       📈 Confidence Score avanzato');
  console.log('       🔥 Raccomandazioni di gioco');

  console.log('\n🚀 LEGHE DISPONIBILI:');
  const leagues = [
    '🇬🇧 Premier League (39)',
    '🇪🇸 La Liga (140)',
    '🇮🇹 Serie A (135)',
    '🇩🇪 Bundesliga (78)',
    '🇫🇷 Ligue 1 (61)',
    '🇵🇹 Primeira Liga (94)',
    '🇳🇱 Eredivisie (88)',
    '🇹🇷 Süper Lig (203)'
  ];
  
  leagues.forEach(league => {
    console.log(`   ${league}`);
  });

  console.log('\n💡 FEATURES IMPLEMENTATE:');
  console.log('   ✅ Enhanced Predictor (H2H + Form + Stats)');
  console.log('   ✅ Value Betting System (Kelly Criterion)');
  console.log('   ✅ Frontend interattivo con selezione leghe');
  console.log('   ✅ API Server dedicato per analisi');
  console.log('   ✅ Visualizzazione completa statistiche');
  console.log('   ✅ Raccomandazioni automatiche');

  console.log('\n🎯 PROSSIMI MIGLIORAMENTI POSSIBILI:');
  console.log('   🤖 Machine Learning integration');
  console.log('   👥 Player Impact Analysis');
  console.log('   💰 Real-time Odds integration');
  console.log('   📊 Historical performance tracking');
  console.log('   ⚡ Live betting recommendations');
}

// Esegui test
testCompleteSystem().catch(console.error);