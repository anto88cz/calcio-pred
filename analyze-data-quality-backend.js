// 🔍 ANALISI QUALITÀ DATI STORICI - Via Backend API
// Verifica quanti dati storici il backend ha realmente usato per fare le predizioni

const axios = require('axios');

const API_URL = 'http://localhost:3001';

// Sample partite reali dal backtest
const SAMPLE_MATCHES = [
  // Q1 2025 - Partite PERSE dal backtest
  { date: '2025-01-11', home: 'Espanyol', away: 'Leganés', fixtureId: null, result: 'LOST', realResult: '1-1' },
  { date: '2025-01-18', home: 'Mallorca', away: 'Valencia', fixtureId: null, result: 'LOST', realResult: '2-1' },
  { date: '2025-02-08', home: 'Cesena', away: 'Pisa', fixtureId: null, result: 'LOST', realResult: '1-1' },
  
  // Set-Nov 2025 - Partite VINTE dal backtest  
  { date: '2025-09-13', home: 'Charlton Athletic', away: 'Millwall', fixtureId: 19431795, result: 'WON', realResult: '3-0' },
  { date: '2025-09-14', home: 'Sunderland', away: 'Derby County', fixtureId: null, result: 'WON', realResult: '0-0' },
  { date: '2025-10-04', home: 'Olympiacos', away: 'PSV', fixtureId: null, result: 'WON', realResult: '3-2' },
];

async function analyzeMatch(match) {
  console.log('\n' + '═'.repeat(80));
  console.log(`📊 ${match.home} vs ${match.away}`);
  console.log(`📅 ${match.date} | Esito backtest: ${match.result} | Risultato: ${match.realResult}`);
  console.log('═'.repeat(80));
  
  try {
    // Chiama il backend API endpoint per ottenere raccomandazioni
    // Questo ci permette di vedere esattamente quanti dati ha usato
    const response = await axios.post(`${API_URL}/api/betting-recommendations`, {
      fixtures: [{
        id: match.fixtureId || Date.now(), // Usa ID dummy se non disponibile
        starting_at: match.date,
        name: `${match.home} vs ${match.away}`,
        participants: [
          { name: match.home, meta: { location: 'home' } },
          { name: match.away, meta: { location: 'away' } }
        ]
      }]
    }, {
      timeout: 30000
    });
    
    const recommendations = response.data;
    
    if (!recommendations || recommendations.length === 0) {
      console.log('   ⚠️ Nessuna raccomandazione generata');
      console.log('   Possibili motivi:');
      console.log('      - Dati storici insufficienti');
      console.log('      - Confidence/Expected Value sotto soglia');
      console.log('      - League non supportata');
      return null;
    }
    
    const rec = recommendations[0];
    
    console.log(`\n   ✅ Raccomandazione generata:`);
    console.log(`      Market: ${rec.market}`);
    console.log(`      Confidence: ${rec.confidence}%`);
    console.log(`      Expected Value: ${rec.expectedValue}%`);
    console.log(`      Odds: ${rec.odds}`);
    
    // Analizza dati disponibili dalla raccomandazione
    if (rec.analysis) {
      console.log(`\n   📊 DATI USATI PER LA PREDIZIONE:`);
      
      if (rec.analysis.homeTeamData) {
        const homeGames = rec.analysis.homeTeamData.recentMatches?.length || 0;
        console.log(`      Casa - Partite recenti: ${homeGames}/7`);
        if (homeGames < 7) {
          console.log(`         ⚠️ Dati casa incompleti (${homeGames}/7)`);
        }
      }
      
      if (rec.analysis.awayTeamData) {
        const awayGames = rec.analysis.awayTeamData.recentMatches?.length || 0;
        console.log(`      Trasferta - Partite recenti: ${awayGames}/7`);
        if (awayGames < 7) {
          console.log(`         ⚠️ Dati trasferta incompleti (${awayGames}/7)`);
        }
      }
      
      if (rec.analysis.h2hData) {
        const h2hGames = rec.analysis.h2hData.matches?.length || 0;
        console.log(`      H2H - Scontri diretti: ${h2hGames}/10`);
        if (h2hGames < 5) {
          console.log(`         ⚠️ H2H insufficienti (${h2hGames}/10, minimo 5)`);
        }
      }
      
      // Calcola completezza
      const homeGames = rec.analysis.homeTeamData?.recentMatches?.length || 0;
      const awayGames = rec.analysis.awayTeamData?.recentMatches?.length || 0;
      const h2hGames = rec.analysis.h2hData?.matches?.length || 0;
      
      const totalAvailable = Math.min(homeGames, 7) + Math.min(awayGames, 7) + Math.min(h2hGames, 10);
      const totalExpected = 24; // 7 + 7 + 10
      const completeness = (totalAvailable / totalExpected) * 100;
      
      console.log(`\n   📈 DATA COMPLETENESS: ${completeness.toFixed(1)}%`);
      console.log(`      Partite totali: ${totalAvailable}/${totalExpected}`);
      
      let quality;
      if (completeness >= 90) quality = '✅ OTTIMA';
      else if (completeness >= 70) quality = '⚠️ BUONA';
      else if (completeness >= 50) quality = '⚠️ MEDIA';
      else quality = '❌ SCARSA';
      
      console.log(`      Qualità: ${quality}`);
      
      return {
        match,
        completeness,
        quality,
        details: {
          homeGames,
          awayGames,
          h2hGames,
          confidence: rec.confidence,
          expectedValue: rec.expectedValue
        }
      };
    } else {
      console.log(`\n   ⚠️ Nessun dettaglio analisi disponibile`);
      return null;
    }
    
  } catch (error) {
    console.log(`\n   ❌ Errore: ${error.message}`);
    
    if (error.response) {
      console.log(`      Status: ${error.response.status}`);
      console.log(`      Dettaglio: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    
    return null;
  }
}

async function generateReport(results) {
  const validResults = results.filter(r => r !== null);
  
  if (validResults.length === 0) {
    console.log('\n❌ Nessun risultato valido per generare report');
    return;
  }
  
  console.log('\n\n' + '═'.repeat(80));
  console.log('📊 REPORT COMPARATIVO QUALITÀ DATI');
  console.log('═'.repeat(80));
  
  const lostResults = validResults.filter(r => r.match.result === 'LOST');
  const wonResults = validResults.filter(r => r.match.result === 'WON');
  
  if (lostResults.length > 0) {
    console.log('\n📉 Q1 2025 (Partite perse):');
    const avgCompleteness = lostResults.reduce((sum, r) => sum + r.completeness, 0) / lostResults.length;
    const avgHome = lostResults.reduce((sum, r) => sum + r.details.homeGames, 0) / lostResults.length;
    const avgAway = lostResults.reduce((sum, r) => sum + r.details.awayGames, 0) / lostResults.length;
    const avgH2H = lostResults.reduce((sum, r) => sum + r.details.h2hGames, 0) / lostResults.length;
    
    console.log(`   Completeness media: ${avgCompleteness.toFixed(1)}%`);
    console.log(`   Casa media: ${avgHome.toFixed(1)}/7`);
    console.log(`   Trasferta media: ${avgAway.toFixed(1)}/7`);
    console.log(`   H2H media: ${avgH2H.toFixed(1)}/10`);
    console.log(`\n   Dettaglio:`);
    lostResults.forEach(r => {
      console.log(`      ${r.match.home} vs ${r.match.away}: ${r.completeness.toFixed(1)}% (${r.quality})`);
      console.log(`         Casa: ${r.details.homeGames}/7 | Trasferta: ${r.details.awayGames}/7 | H2H: ${r.details.h2hGames}/10`);
    });
  }
  
  if (wonResults.length > 0) {
    console.log('\n📈 Set-Nov 2025 (Partite vinte):');
    const avgCompleteness = wonResults.reduce((sum, r) => sum + r.completeness, 0) / wonResults.length;
    const avgHome = wonResults.reduce((sum, r) => sum + r.details.homeGames, 0) / wonResults.length;
    const avgAway = wonResults.reduce((sum, r) => sum + r.details.awayGames, 0) / wonResults.length;
    const avgH2H = wonResults.reduce((sum, r) => sum + r.details.h2hGames, 0) / wonResults.length;
    
    console.log(`   Completeness media: ${avgCompleteness.toFixed(1)}%`);
    console.log(`   Casa media: ${avgHome.toFixed(1)}/7`);
    console.log(`   Trasferta media: ${avgAway.toFixed(1)}/7`);
    console.log(`   H2H media: ${avgH2H.toFixed(1)}/10`);
    console.log(`\n   Dettaglio:`);
    wonResults.forEach(r => {
      console.log(`      ${r.match.home} vs ${r.match.away}: ${r.completeness.toFixed(1)}% (${r.quality})`);
      console.log(`         Casa: ${r.details.homeGames}/7 | Trasferta: ${r.details.awayGames}/7 | H2H: ${r.details.h2hGames}/10`);
    });
  }
  
  if (lostResults.length > 0 && wonResults.length > 0) {
    console.log('\n📊 CONFRONTO:');
    const lostAvg = lostResults.reduce((sum, r) => sum + r.completeness, 0) / lostResults.length;
    const wonAvg = wonResults.reduce((sum, r) => sum + r.completeness, 0) / wonResults.length;
    const diff = wonAvg - lostAvg;
    
    console.log(`   Differenza completeness: ${diff > 0 ? '+' : ''}${diff.toFixed(1)}pp`);
    
    if (Math.abs(diff) > 10) {
      console.log(`\n   🚨 PROBLEMA IDENTIFICATO!`);
      if (diff > 0) {
        console.log(`   Q1 2025 ha ${Math.abs(diff).toFixed(1)}pp di dati in MENO rispetto a Set-Nov`);
      } else {
        console.log(`   Set-Nov ha ${Math.abs(diff).toFixed(1)}pp di dati in MENO rispetto a Q1`);
      }
      console.log(`   Questo potrebbe spiegare la differenza di performance!`);
    } else {
      console.log(`\n   ✅ Dati comparabili tra i due periodi`);
      console.log(`   Il problema NON sembra essere la qualità dei dati storici`);
    }
  }
}

async function main() {
  console.log('🔍 ANALISI QUALITÀ DATI STORICI - Via Backend API\n');
  console.log('Obiettivo: Verificare quanti dati il backend usa realmente per le predizioni\n');
  
  const results = [];
  
  for (const match of SAMPLE_MATCHES) {
    const result = await analyzeMatch(match);
    if (result) results.push(result);
    
    // Pausa tra chiamate
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  await generateReport(results);
  
  console.log('\n\n✅ Analisi completata!');
}

main().catch(console.error);
