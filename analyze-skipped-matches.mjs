import axios from 'axios';
import fs from 'fs';

// ==========================================
// CONFIGURAZIONE
// ==========================================
const SPORTSMONKS_API_KEY = '4A6OqSOuGcOBjmcKNaxVaNcf0DrvInSfYBzcF8AQ8DJlTVPMVqTqWgBvhwO0';
const API_BASE = 'http://localhost:3001';

const START_DATE = '2025-10-10';
const END_DATE = '2025-11-09';

// Competizioni da analizzare (stesse del backtest)
const COMPETITIONS = [
  { id: 8, name: 'Premier League', season: 23660 },
  { id: 384, name: 'Serie A', season: 23817 },
  { id: 564, name: 'La Liga', season: 23872 },
  { id: 301, name: 'Bundesliga/Ligue 1', season: 23637 },
  { id: 2, name: 'Champions League', season: 23657 }
];

// ==========================================
// UTILITY: Ottieni fixture da Sportsmonks
// ==========================================
async function getFinishedMatches(startDate, endDate, leagueIds) {
  const allMatches = [];
  
  for (const leagueId of leagueIds) {
    try {
      const url = `https://api.sportmonks.com/v3/football/fixtures?api_token=${SPORTSMONKS_API_KEY}&filters=fixtureLeagues:${leagueId}&filters=fixtureStartingBetween:${startDate},${endDate}&filters=fixtureStates:5&include=scores;participants;state;league`;
      
      const response = await axios.get(url);
      
      if (response.data?.data) {
        allMatches.push(...response.data.data);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.error(`❌ Errore recupero partite league ${leagueId}:`, error.message);
    }
  }
  
  return allMatches;
}

// ==========================================
// UTILITY: Ottieni odds da Sportsmonks
// ==========================================
async function getOddsForMatch(fixtureId) {
  try {
    const url = `https://api.sportmonks.com/v3/football/odds/pre-match/fixtures/${fixtureId}?api_token=${SPORTSMONKS_API_KEY}&bookmakers=1,2,3,5,8&markets=1,2,3,5,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30`;
    
    const response = await axios.get(url);
    
    if (!response.data?.data || response.data.data.length === 0) {
      return null;
    }
    
    return response.data.data;
  } catch (error) {
    return null;
  }
}

// ==========================================
// UTILITY: Verifica disponibilità dati team
// ==========================================
async function getTeamData(teamId, competitionName) {
  try {
    const response = await axios.get(`${API_BASE}/api/ml-predictions/team-data/${teamId}`);
    
    if (!response.data) {
      return { available: false, reason: 'No response from API' };
    }
    
    const data = response.data;
    
    // Verifica presenza dati essenziali
    const checks = {
      hasStats: !!data.stats,
      hasForm: !!data.form && data.form.length > 0,
      hasXG: !!data.stats?.xG,
      hasXGAgainst: !!data.stats?.xGAgainst,
      hasGoalsScored: !!data.stats?.goalsScored,
      hasGoalsConceded: !!data.stats?.goalsConceded
    };
    
    const available = Object.values(checks).filter(Boolean).length >= 4;
    
    return {
      available,
      checks,
      data: {
        xG: data.stats?.xG || 0,
        xGAgainst: data.stats?.xGAgainst || 0,
        goalsScored: data.stats?.goalsScored || 0,
        goalsConceded: data.stats?.goalsConceded || 0,
        formLength: data.form?.length || 0
      }
    };
  } catch (error) {
    return { available: false, reason: error.message };
  }
}

// ==========================================
// UTILITY: Ottieni raccomandazioni da API
// ==========================================
async function getRecommendations(matchData, competitionName) {
  try {
    const response = await axios.post(`${API_BASE}/api/ml-predictions/recommendations`, {
      homeTeamId: matchData.homeTeamId,
      awayTeamId: matchData.awayTeamId,
      competition: competitionName
    });
    
    return response.data;
  } catch (error) {
    return null;
  }
}

// ==========================================
// FUNZIONE PRINCIPALE: Analisi dettagliata
// ==========================================
async function analyzeSkippedMatches() {
  console.log('🔍 ANALISI DETTAGLIATA PARTITE SALTATE\n');
  console.log(`📅 Periodo: ${START_DATE} → ${END_DATE}\n`);
  
  // 1. Recupera tutte le partite
  console.log('📥 Recupero partite finite...');
  const leagueIds = COMPETITIONS.map(c => c.id);
  const matches = await getFinishedMatches(START_DATE, END_DATE, leagueIds);
  
  console.log(`✅ ${matches.length} partite recuperate\n`);
  
  // 2. Analizza ogni partita
  const results = {
    total: matches.length,
    analyzed: 0,
    skipped: 0,
    skipReasons: {
      noOdds: [],
      noTeamData: [],
      incompleteTeamData: [],
      noRecommendations: [],
      apiError: []
    }
  };
  
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    
    const homeTeam = match.participants?.find(p => p.meta?.location === 'home');
    const awayTeam = match.participants?.find(p => p.meta?.location === 'away');
    
    if (!homeTeam || !awayTeam) {
      results.skipped++;
      results.skipReasons.noTeamData.push({
        fixtureId: match.id,
        name: `${homeTeam?.name || '?'} vs ${awayTeam?.name || '?'}`,
        competition: match.league?.name,
        reason: 'Missing participants'
      });
      continue;
    }
    
    const matchInfo = {
      fixtureId: match.id,
      name: `${homeTeam.name} vs ${awayTeam.name}`,
      competition: match.league?.name,
      date: match.starting_at,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id
    };
    
    console.log(`\n[${i + 1}/${matches.length}] 🏆 ${matchInfo.name}`);
    console.log(`   📍 ${matchInfo.competition} | 📅 ${matchInfo.date}`);
    
    // Verifica 1: Odds disponibili?
    console.log('   🔍 Verifica odds...');
    const odds = await getOddsForMatch(match.id);
    
    if (!odds || odds.length === 0) {
      console.log('   ❌ SKIP: Nessuna quota disponibile');
      results.skipped++;
      results.skipReasons.noOdds.push(matchInfo);
      await new Promise(resolve => setTimeout(resolve, 500));
      continue;
    }
    
    console.log(`   ✅ ${odds.length} quote trovate`);
    
    // Verifica 2: Dati team disponibili?
    console.log('   🔍 Verifica dati team...');
    const homeData = await getTeamData(homeTeam.id, matchInfo.competition);
    const awayData = await getTeamData(awayTeam.id, matchInfo.competition);
    
    if (!homeData.available || !awayData.available) {
      console.log(`   ❌ SKIP: Dati team incompleti`);
      console.log(`      Home: ${homeData.available ? '✅' : '❌'} (xG: ${homeData.data?.xG || 0}, form: ${homeData.data?.formLength || 0})`);
      console.log(`      Away: ${awayData.available ? '✅' : '❌'} (xG: ${awayData.data?.xG || 0}, form: ${awayData.data?.formLength || 0})`);
      
      results.skipped++;
      results.skipReasons.incompleteTeamData.push({
        ...matchInfo,
        homeData: homeData.data,
        awayData: awayData.data
      });
      
      await new Promise(resolve => setTimeout(resolve, 500));
      continue;
    }
    
    console.log(`   ✅ Dati team completi`);
    console.log(`      Home: xG ${homeData.data.xG.toFixed(2)}, xGA ${homeData.data.xGAgainst.toFixed(2)}, form ${homeData.data.formLength}`);
    console.log(`      Away: xG ${awayData.data.xG.toFixed(2)}, xGA ${awayData.data.xGAgainst.toFixed(2)}, form ${awayData.data.formLength}`);
    
    // Verifica 3: Raccomandazioni generate?
    console.log('   🔍 Verifica raccomandazioni...');
    const recommendations = await getRecommendations(matchInfo, matchInfo.competition);
    
    if (!recommendations || !recommendations.topPicks || recommendations.topPicks.length === 0) {
      console.log('   ❌ SKIP: Nessuna raccomandazione generata');
      console.log(`      Motivo: Filtri troppo stringenti o odds non convenienti`);
      
      results.skipped++;
      results.skipReasons.noRecommendations.push({
        ...matchInfo,
        homeData: homeData.data,
        awayData: awayData.data,
        oddsCount: odds.length
      });
    } else {
      console.log(`   ✅ ${recommendations.topPicks.length} raccomandazioni generate`);
      results.analyzed++;
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // 3. Report finale
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 REPORT FINALE - ANALISI PARTITE SALTATE');
  console.log('='.repeat(80));
  
  console.log(`\n📈 STATISTICHE GENERALI:`);
  console.log(`   Partite totali: ${results.total}`);
  console.log(`   Partite con raccomandazioni: ${results.analyzed} (${(results.analyzed / results.total * 100).toFixed(1)}%)`);
  console.log(`   Partite saltate: ${results.skipped} (${(results.skipped / results.total * 100).toFixed(1)}%)`);
  
  console.log(`\n🔍 BREAKDOWN MOTIVI SKIP:`);
  console.log(`   ❌ Nessuna quota: ${results.skipReasons.noOdds.length} (${(results.skipReasons.noOdds.length / results.skipped * 100).toFixed(1)}%)`);
  console.log(`   ❌ Dati team mancanti: ${results.skipReasons.noTeamData.length} (${(results.skipReasons.noTeamData.length / results.skipped * 100).toFixed(1)}%)`);
  console.log(`   ❌ Dati team incompleti: ${results.skipReasons.incompleteTeamData.length} (${(results.skipReasons.incompleteTeamData.length / results.skipped * 100).toFixed(1)}%)`);
  console.log(`   ❌ Nessuna raccomandazione: ${results.skipReasons.noRecommendations.length} (${(results.skipReasons.noRecommendations.length / results.skipped * 100).toFixed(1)}%)`);
  
  // Analisi dettagliata partite senza raccomandazioni
  if (results.skipReasons.noRecommendations.length > 0) {
    console.log(`\n\n📋 DETTAGLIO PARTITE SENZA RACCOMANDAZIONI (${results.skipReasons.noRecommendations.length}):`);
    console.log('─'.repeat(80));
    
    // Analizza statistiche medie
    const avgHomeXG = results.skipReasons.noRecommendations.reduce((sum, m) => sum + m.homeData.xG, 0) / results.skipReasons.noRecommendations.length;
    const avgAwayXG = results.skipReasons.noRecommendations.reduce((sum, m) => sum + m.awayData.xG, 0) / results.skipReasons.noRecommendations.length;
    const avgTotalXG = avgHomeXG + avgAwayXG;
    
    console.log(`\n📊 STATISTICHE MEDIE:`);
    console.log(`   xG Home medio: ${avgHomeXG.toFixed(2)}`);
    console.log(`   xG Away medio: ${avgAwayXG.toFixed(2)}`);
    console.log(`   xG Totale medio: ${avgTotalXG.toFixed(2)}`);
    
    // Distribuzione per xG totale
    const xgDistribution = {
      veryLow: 0,  // < 2.0
      low: 0,       // 2.0 - 2.5
      medium: 0,    // 2.5 - 3.0
      high: 0       // > 3.0
    };
    
    results.skipReasons.noRecommendations.forEach(m => {
      const totalXG = m.homeData.xG + m.awayData.xG;
      if (totalXG < 2.0) xgDistribution.veryLow++;
      else if (totalXG < 2.5) xgDistribution.low++;
      else if (totalXG < 3.0) xgDistribution.medium++;
      else xgDistribution.high++;
    });
    
    console.log(`\n📊 DISTRIBUZIONE xG TOTALE:`);
    console.log(`   < 2.0 (Very Low): ${xgDistribution.veryLow} (${(xgDistribution.veryLow / results.skipReasons.noRecommendations.length * 100).toFixed(1)}%)`);
    console.log(`   2.0 - 2.5 (Low): ${xgDistribution.low} (${(xgDistribution.low / results.skipReasons.noRecommendations.length * 100).toFixed(1)}%)`);
    console.log(`   2.5 - 3.0 (Medium): ${xgDistribution.medium} (${(xgDistribution.medium / results.skipReasons.noRecommendations.length * 100).toFixed(1)}%)`);
    console.log(`   > 3.0 (High): ${xgDistribution.high} (${(xgDistribution.high / results.skipReasons.noRecommendations.length * 100).toFixed(1)}%)`);
    
    // Mostra esempi
    console.log(`\n📝 ESEMPI (primi 10):`);
    results.skipReasons.noRecommendations.slice(0, 10).forEach((m, idx) => {
      const totalXG = m.homeData.xG + m.awayData.xG;
      console.log(`\n   ${idx + 1}. ${m.name}`);
      console.log(`      Competition: ${m.competition}`);
      console.log(`      Home xG: ${m.homeData.xG.toFixed(2)} | Away xG: ${m.awayData.xG.toFixed(2)} | Total: ${totalXG.toFixed(2)}`);
      console.log(`      Home form: ${m.homeData.formLength} matches | Away form: ${m.awayData.formLength} matches`);
      console.log(`      Odds disponibili: ${m.oddsCount}`);
    });
  }
  
  // Salva report dettagliato
  const reportPath = './skipped-matches-analysis.json';
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  
  console.log(`\n\n💾 Report salvato in: ${reportPath}`);
  console.log('\n✅ Analisi completata!\n');
}

// ==========================================
// ESECUZIONE
// ==========================================
analyzeSkippedMatches().catch(error => {
  console.error('\n❌ Errore durante l\'analisi:', error);
  process.exit(1);
});
