// 🔍 ANALISI QUALITÀ DATI STORICI - Q1 2025 vs Periodi Recenti
// Verifica se i dati di training disponibili sono comparabili

require('dotenv').config({ path: './api/.env' });
const axios = require('axios');
const moment = require('moment');

const API_URL = process.env.API_URL || 'http://localhost:3001';
const SPORTSMONKS_API_KEY = process.env.SPORTSMONKS_API_KEY;
const BASE_URL = 'https://api.sportmonks.com/v3/football';

// Sample partite da analizzare
const SAMPLE_MATCHES = [
  // Q1 2025 - Partite perse
  { date: '2025-01-11', home: 'Espanyol', away: 'Leganés', result: 'LOST' },
  { date: '2025-02-15', home: 'Nottingham Forest', away: 'Arsenal', result: 'LOST' },
  { date: '2025-02-08', home: 'Cesena', away: 'Pisa', result: 'LOST' },
  
  // Set-Nov 2025 - Partite vinte
  { date: '2025-09-13', home: 'Charlton Athletic', away: 'Millwall', result: 'WON' },
  { date: '2025-10-04', home: 'Olympiacos', away: 'PSV', result: 'WON' },
  { date: '2025-11-04', home: 'Olympiacos', away: 'PSV', result: 'WON' },
];

async function searchFixtureByTeams(date, homeName, awayName) {
  try {
    const response = await axios.get(`${BASE_URL}/fixtures/date/${date}`, {
      params: {
        api_token: SPORTSMONKS_API_KEY,
        include: 'participants;league;season'
      }
    });

    const fixtures = response.data.data;
    const found = fixtures.find(f => {
      const home = f.participants?.find(p => p.meta?.location === 'home')?.name || '';
      const away = f.participants?.find(p => p.meta?.location === 'away')?.name || '';
      
      return (
        (home.toLowerCase().includes(homeName.toLowerCase()) || homeName.toLowerCase().includes(home.toLowerCase())) &&
        (away.toLowerCase().includes(awayName.toLowerCase()) || awayName.toLowerCase().includes(away.toLowerCase()))
      );
    });

    return found;
  } catch (error) {
    console.error(`   ❌ Errore ricerca: ${error.message}`);
    return null;
  }
}

async function getTeamHistoryCount(teamId, fixtureDate) {
  try {
    // Simula la stessa chiamata che fa il backend
    const beforeDate = moment(fixtureDate).format('YYYY-MM-DD');
    
    const response = await axios.get(`${BASE_URL}/fixtures`, {
      params: {
        api_token: SPORTSMONKS_API_KEY,
        include: 'participants;scores;statistics',
        filters: `fixtureParticipants:${teamId}`,
        'filter[endingBefore]': beforeDate,
        per_page: 20
      }
    });

    const fixtures = response.data.data || [];
    const finishedMatches = fixtures.filter(f => f.state?.short === 'FT' && f.scores?.length > 0);
    
    return {
      total: fixtures.length,
      finished: finishedMatches.length,
      withStats: finishedMatches.filter(f => f.statistics?.length > 0).length,
      fixtures: finishedMatches.slice(0, 7) // Prime 7 come fa il backend
    };
  } catch (error) {
    console.error(`   ❌ Errore history: ${error.message}`);
    return { total: 0, finished: 0, withStats: 0, fixtures: [] };
  }
}

async function getH2HCount(homeTeamId, awayTeamId, fixtureDate) {
  try {
    const beforeDate = moment(fixtureDate).format('YYYY-MM-DD');
    
    const response = await axios.get(`${BASE_URL}/fixtures/head-to-head/${homeTeamId}/${awayTeamId}`, {
      params: {
        api_token: SPORTSMONKS_API_KEY,
        include: 'participants;scores',
        'filter[endingBefore]': beforeDate,
        per_page: 10
      }
    });

    const fixtures = response.data.data || [];
    const finishedMatches = fixtures.filter(f => f.state?.short === 'FT' && f.scores?.length > 0);
    
    return {
      total: fixtures.length,
      finished: finishedMatches.length
    };
  } catch (error) {
    console.error(`   ❌ Errore H2H: ${error.message}`);
    return { total: 0, finished: 0 };
  }
}

async function analyzeDataQuality(match) {
  console.log('\n' + '═'.repeat(70));
  console.log(`📊 ANALISI DATI: ${match.home} vs ${match.away}`);
  console.log(`📅 Data: ${match.date} | Risultato backtest: ${match.result}`);
  console.log('═'.repeat(70));
  
  // 1. Trova fixture
  const fixture = await searchFixtureByTeams(match.date, match.home, match.away);
  
  if (!fixture) {
    console.log('   ❌ Fixture non trovato');
    return null;
  }
  
  console.log(`   ✓ Fixture trovato: ID ${fixture.id}`);
  
  const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home');
  const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away');
  
  if (!homeTeam || !awayTeam) {
    console.log('   ❌ Team non identificati');
    return null;
  }
  
  console.log(`   ✓ Home: ${homeTeam.name} (ID: ${homeTeam.id})`);
  console.log(`   ✓ Away: ${awayTeam.name} (ID: ${awayTeam.id})`);
  
  // 2. Analizza dati storici CASA
  console.log('\n   🏠 DATI STORICI CASA:');
  const homeHistory = await getTeamHistoryCount(homeTeam.id, match.date);
  console.log(`      Totali: ${homeHistory.total}`);
  console.log(`      Finite: ${homeHistory.finished}`);
  console.log(`      Con stats: ${homeHistory.withStats}`);
  console.log(`      Usate per training: ${Math.min(homeHistory.finished, 7)}/7`);
  
  // 3. Analizza dati storici TRASFERTA
  console.log('\n   🚗 DATI STORICI TRASFERTA:');
  const awayHistory = await getTeamHistoryCount(awayTeam.id, match.date);
  console.log(`      Totali: ${awayHistory.total}`);
  console.log(`      Finite: ${awayHistory.finished}`);
  console.log(`      Con stats: ${awayHistory.withStats}`);
  console.log(`      Usate per training: ${Math.min(awayHistory.finished, 7)}/7`);
  
  // 4. Analizza H2H
  console.log('\n   🔄 HEAD-TO-HEAD:');
  const h2h = await getH2HCount(homeTeam.id, awayTeam.id, match.date);
  console.log(`      Totali: ${h2h.total}`);
  console.log(`      Finite: ${h2h.finished}`);
  console.log(`      Usate per training: ${Math.min(h2h.finished, 10)}/10`);
  
  // 5. Calcola completezza dati
  const totalExpected = 7 + 7 + 10; // 7 casa + 7 trasferta + 10 H2H
  const totalAvailable = Math.min(homeHistory.finished, 7) + 
                         Math.min(awayHistory.finished, 7) + 
                         Math.min(h2h.finished, 10);
  const completeness = (totalAvailable / totalExpected) * 100;
  
  console.log('\n   📊 DATA COMPLETENESS:');
  console.log(`      Partite disponibili: ${totalAvailable}/${totalExpected}`);
  console.log(`      Completezza: ${completeness.toFixed(1)}%`);
  
  // 6. Valutazione qualità
  let quality = 'UNKNOWN';
  let issues = [];
  
  if (completeness >= 90) {
    quality = '✅ OTTIMA';
  } else if (completeness >= 70) {
    quality = '⚠️ BUONA';
  } else if (completeness >= 50) {
    quality = '⚠️ MEDIA';
    issues.push('Dati storici incompleti');
  } else {
    quality = '❌ SCARSA';
    issues.push('Dati storici molto incompleti');
  }
  
  if (homeHistory.finished < 7) {
    issues.push(`Casa: solo ${homeHistory.finished}/7 partite`);
  }
  if (awayHistory.finished < 7) {
    issues.push(`Trasferta: solo ${awayHistory.finished}/7 partite`);
  }
  if (h2h.finished < 5) {
    issues.push(`H2H: solo ${h2h.finished}/10 partite (minimo 5)`);
  }
  if (homeHistory.withStats < 5 || awayHistory.withStats < 5) {
    issues.push('Statistiche incomplete nelle partite storiche');
  }
  
  console.log('\n   🎯 QUALITÀ DATI:');
  console.log(`      Valutazione: ${quality}`);
  if (issues.length > 0) {
    console.log('      Problemi identificati:');
    issues.forEach(issue => console.log(`         - ${issue}`));
  }
  
  return {
    match,
    fixture: fixture.id,
    completeness,
    quality,
    issues,
    details: {
      homeHistory: homeHistory.finished,
      awayHistory: awayHistory.finished,
      h2h: h2h.finished,
      homeStats: homeHistory.withStats,
      awayStats: awayHistory.withStats
    }
  };
}

async function generateReport(results) {
  console.log('\n\n' + '═'.repeat(70));
  console.log('📊 REPORT COMPARATIVO QUALITÀ DATI');
  console.log('═'.repeat(70));
  
  // Separa Q1 vs Set-Nov
  const q1Results = results.filter(r => r && r.match.result === 'LOST');
  const goodResults = results.filter(r => r && r.match.result === 'WON');
  
  console.log('\n📉 Q1 2025 (Partite perse):');
  const q1AvgCompleteness = q1Results.reduce((sum, r) => sum + r.completeness, 0) / q1Results.length;
  console.log(`   Completeness media: ${q1AvgCompleteness.toFixed(1)}%`);
  console.log(`   Qualità media: ${q1Results.filter(r => r.quality.includes('OTTIMA')).length}/${q1Results.length} OTTIMA`);
  console.log('   Dettaglio:');
  q1Results.forEach(r => {
    console.log(`      ${r.match.home} vs ${r.match.away}: ${r.completeness.toFixed(1)}% (${r.quality})`);
    if (r.issues.length > 0) {
      r.issues.forEach(issue => console.log(`         ⚠️ ${issue}`));
    }
  });
  
  console.log('\n📈 Set-Nov 2025 (Partite vinte):');
  const goodAvgCompleteness = goodResults.reduce((sum, r) => sum + r.completeness, 0) / goodResults.length;
  console.log(`   Completeness media: ${goodAvgCompleteness.toFixed(1)}%`);
  console.log(`   Qualità media: ${goodResults.filter(r => r.quality.includes('OTTIMA')).length}/${goodResults.length} OTTIMA`);
  console.log('   Dettaglio:');
  goodResults.forEach(r => {
    console.log(`      ${r.match.home} vs ${r.match.away}: ${r.completeness.toFixed(1)}% (${r.quality})`);
    if (r.issues.length > 0) {
      r.issues.forEach(issue => console.log(`         ⚠️ ${issue}`));
    }
  });
  
  console.log('\n📊 CONFRONTO:');
  const diff = goodAvgCompleteness - q1AvgCompleteness;
  console.log(`   Differenza completeness: ${diff > 0 ? '+' : ''}${diff.toFixed(1)}pp`);
  
  if (Math.abs(diff) > 10) {
    console.log(`\n   🚨 PROBLEMA IDENTIFICATO!`);
    console.log(`   Q1 2025 ha ${Math.abs(diff).toFixed(1)}pp di dati in MENO rispetto a Set-Nov`);
    console.log(`   Questo spiega il crollo delle performance!`);
  } else {
    console.log(`\n   ✅ Dati comparabili tra i due periodi`);
    console.log(`   Il problema NON è la qualità dei dati storici`);
  }
  
  // Analisi dettagliata per tipo di dato
  console.log('\n📈 ANALISI PER TIPO DI DATO:');
  
  const q1AvgHome = q1Results.reduce((sum, r) => sum + r.details.homeHistory, 0) / q1Results.length;
  const goodAvgHome = goodResults.reduce((sum, r) => sum + r.details.homeHistory, 0) / goodResults.length;
  console.log(`   Storia Casa: Q1=${q1AvgHome.toFixed(1)}/7 | Set-Nov=${goodAvgHome.toFixed(1)}/7 | Diff: ${(goodAvgHome - q1AvgHome).toFixed(1)}`);
  
  const q1AvgAway = q1Results.reduce((sum, r) => sum + r.details.awayHistory, 0) / q1Results.length;
  const goodAvgAway = goodResults.reduce((sum, r) => sum + r.details.awayHistory, 0) / goodResults.length;
  console.log(`   Storia Trasferta: Q1=${q1AvgAway.toFixed(1)}/7 | Set-Nov=${goodAvgAway.toFixed(1)}/7 | Diff: ${(goodAvgAway - q1AvgAway).toFixed(1)}`);
  
  const q1AvgH2H = q1Results.reduce((sum, r) => sum + r.details.h2h, 0) / q1Results.length;
  const goodAvgH2H = goodResults.reduce((sum, r) => sum + r.details.h2h, 0) / goodResults.length;
  console.log(`   H2H: Q1=${q1AvgH2H.toFixed(1)}/10 | Set-Nov=${goodAvgH2H.toFixed(1)}/10 | Diff: ${(goodAvgH2H - q1AvgH2H).toFixed(1)}`);
  
  console.log('\n💡 RACCOMANDAZIONI:');
  
  if (q1AvgCompleteness < 70) {
    console.log('\n   ⚠️ PRIORITÀ ALTA: Implementare filtro data quality');
    console.log('   ```javascript');
    console.log('   // Nel backtest, filtrare partite con dati insufficienti');
    console.log('   const MIN_DATA_COMPLETENESS = 70; // 70% minimo');
    console.log('   if (dataCompleteness < MIN_DATA_COMPLETENESS) {');
    console.log('     console.log("⚠️ Dati insufficienti, skip partita");');
    console.log('     continue;');
    console.log('   }');
    console.log('   ```');
  }
  
  if (q1AvgH2H < 5) {
    console.log('\n   ⚠️ PRIORITÀ MEDIA: H2H insufficienti');
    console.log('   Considerare di ridurre peso H2H quando < 5 partite disponibili');
  }
  
  if (q1AvgHome < 6 || q1AvgAway < 6) {
    console.log('\n   ⚠️ PRIORITÀ MEDIA: Storia squadre incompleta');
    console.log('   Considerare MIN_HISTORY_MATCHES = 6 invece di 7');
  }
}

async function main() {
  console.log('🔍 ANALISI QUALITÀ DATI STORICI - Q1 2025 vs Set-Nov 2025\n');
  console.log('Obiettivo: Verificare se i dati di training sono comparabili\n');
  
  const results = [];
  
  for (const match of SAMPLE_MATCHES) {
    const result = await analyzeDataQuality(match);
    if (result) results.push(result);
    
    // Pausa per evitare rate limit
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  await generateReport(results);
  
  console.log('\n\n✅ Analisi completata!');
}

main().catch(console.error);
