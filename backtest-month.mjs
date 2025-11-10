/**
 * BACKTEST BETTING RECOMMENDATIONS - MENSILE (10 OTTOBRE - 9 NOVEMBRE 2025)
 * 
 * Recupera tutte le partite finite in 1 mese,
 * genera predizioni come se dovessero ancora giocare,
 * confronta con i risultati effettivi.
 * 
 * IMPORTANTE: Richiede backend in esecuzione su localhost:3001
 */

import axios from 'axios';
import fs from 'fs';

const API_KEY = 'Ug7hLwm9f7DtStxDjc61DZO9wKgdzAQ0AnjbgQiveBzJGF2mM97omCcXnDFd';
const BASE_URL = 'https://api.sportmonks.com/v3/football';
const LOCAL_API = 'http://localhost:3001/api';

console.log(`✅ API Key configurata\n`);

// Date: 10 ottobre - 9 novembre 2025 (1 mese)
const START_DATE = '2025-10-10';
const END_DATE = '2025-11-09';

// Campionati e competizioni da analizzare
const COMPETITIONS = [
  { id: 8, name: 'Premier League', season: 25583, type: 'league' },
  { id: 384, name: 'Serie A', season: 25533, type: 'league' },
  { id: 564, name: 'La Liga', season: 25543, type: 'league' },
  { id: 301, name: 'Bundesliga', season: 25523, type: 'league' },
  { id: 2, name: 'Champions League', season: 25551, type: 'cup' },
];

/**
 * Recupera tutte le partite finite del mese da Sportmonks
 */
async function getFinishedMatches() {
  console.log(`\n📅 Recupero partite finite dal ${START_DATE} al ${END_DATE}...\n`);
  
  const allMatches = [];
  
  console.log(`📊 Periodo: ${START_DATE} → ${END_DATE} (1 MESE)\n`);
  
  for (const comp of COMPETITIONS) {
    try {
      console.log(`🔍 Cercando partite in ${comp.name}...`);
      
      // Usa l'endpoint /fixtures/between/{startDate}/{endDate}
      const response = await axios.get(`${BASE_URL}/fixtures/between/${START_DATE}/${END_DATE}`, {
        params: {
          api_token: API_KEY,
          filters: `fixtureLeagues:${comp.id}`,
          include: 'participants;scores;state',
          per_page: 100,
        }
      });
      
      if (response.data?.data) {
        // Filtra solo partite finite (state_id = 5 = FT)
        const monthMatches = response.data.data.filter(match => 
          match.state_id === 5 && match.league_id === comp.id
        );
        
        // Aggiungi info sulla competizione
        monthMatches.forEach(m => {
          m.competition = comp.name;
          m.season_id = comp.season;
          m.league_id = comp.id;
        });
        
        console.log(`   ✅ ${comp.name}: ${monthMatches.length} partite finite`);
        allMatches.push(...monthMatches);
      }
      
      // Rate limiting Sportmonks
      await new Promise(resolve => setTimeout(resolve, 400));
      
    } catch (error) {
      console.error(`   ❌ Errore ${comp.name}:`, error.response?.data?.message || error.message);
    }
  }
  
  console.log(`\n📊 TOTALE: ${allMatches.length} partite recuperate\n`);
  return allMatches;
}

/**
 * Ottiene le raccomandazioni per un match
 */
async function getRecommendations(match) {
  try {
    const homeTeam = match.participants?.find(p => p.meta?.location === 'home');
    const awayTeam = match.participants?.find(p => p.meta?.location === 'away');
    
    if (!homeTeam || !awayTeam) {
      return null;
    }
    
    const response = await axios.post(`${LOCAL_API}/betting-recommendations`, {
      fixtureId: match.id,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      leagueId: match.league_id,
      seasonId: match.season_id,
    }, {
      timeout: 30000,
    });
    
    return response.data;
  } catch (error) {
    console.error(`      ❌ Errore API locale: ${error.message}`);
    return null;
  }
}

/**
 * Ottieni i punteggi finali
 */
function getMatchScores(match) {
  const homeScore = match.scores?.find(s => s.description === 'CURRENT' && s.participant_id === match.participants?.find(p => p.meta?.location === 'home')?.id);
  const awayScore = match.scores?.find(s => s.description === 'CURRENT' && s.participant_id === match.participants?.find(p => p.meta?.location === 'away')?.id);
  
  return {
    homeScore: homeScore?.score?.goals || 0,
    awayScore: awayScore?.score?.goals || 0
  };
}

/**
 * Verifica se la raccomandazione è vincente
 */
function checkRecommendation(recommendation, homeScore, awayScore) {
  let isWin = false;
  let description = '';
  
  const result = homeScore > awayScore ? '1' : homeScore < awayScore ? '2' : 'X';
  const totalGoals = homeScore + awayScore;
  
  switch (recommendation.type) {
    case 'result':
      if (recommendation.prediction === '1' && result === '1') isWin = true;
      if (recommendation.prediction === 'X' && result === 'X') isWin = true;
      if (recommendation.prediction === '2' && result === '2') isWin = true;
      description = `Risultato: ${homeScore}-${awayScore} (${result})`;
      break;
      
    case 'double_chance':
      if (recommendation.id === 'double_1x' && (result === '1' || result === 'X')) isWin = true;
      if (recommendation.id === 'double_x2' && (result === 'X' || result === '2')) isWin = true;
      if (recommendation.id === 'double_12' && (result === '1' || result === '2')) isWin = true;
      description = `Risultato: ${homeScore}-${awayScore} (${result})`;
      break;
      
    case 'goal_nogoal':
      const btts = homeScore > 0 && awayScore > 0;
      if (recommendation.id === 'btts_yes' && btts) isWin = true;
      if (recommendation.id === 'btts_no' && !btts) isWin = true;
      description = `BTTS: ${btts ? 'Sì' : 'No'}`;
      break;
      
    case 'over_under':
      if (recommendation.id.startsWith('over_')) {
        const threshold = parseFloat(recommendation.id.split('_')[1].replace('', '.'));
        isWin = totalGoals > threshold;
        description = `Gol: ${totalGoals} (${isWin ? '>' : '<='} ${threshold})`;
      } else if (recommendation.id.startsWith('under_')) {
        const threshold = parseFloat(recommendation.id.split('_')[1].replace('', '.'));
        isWin = totalGoals < threshold;
        description = `Gol: ${totalGoals} (${isWin ? '<' : '>='} ${threshold})`;
      }
      break;
  }
  
  return { isWin, description };
}

/**
 * Analisi principale
 */
async function analyzeRecommendations() {
  console.log('='*80);
  console.log(`🔍 BACKTEST MENSILE - ${START_DATE} → ${END_DATE}`);
  console.log('='*80);
  
  // 1. Ottieni tutte le partite finite del mese
  const matches = await getFinishedMatches();
  
  if (matches.length === 0) {
    console.log('\n❌ Nessuna partita trovata per l\'analisi\n');
    return;
  }
  
  console.log(`\n🎯 Inizio analisi di ${matches.length} partite...\n`);
  console.log('='*80 + '\n');
  
  const results = {
    total: 0,
    wins: 0,
    losses: 0,
    byCompetition: {},
    byType: {},
    byValueRating: { 5: {w:0, l:0}, 4: {w:0, l:0}, 3: {w:0, l:0}, 2: {w:0, l:0}, 1: {w:0, l:0} },
    byEV: { positive: {w:0, l:0}, neutral: {w:0, l:0}, negative: {w:0, l:0} },
    details: [],
    matchesAnalyzed: 0,
    matchesSkipped: 0,
  };
  
  let counter = 1;
  const skipReasons = { noTeams: 0, noRecs: 0, apiError: 0 };
  
  for (const match of matches) {
    const homeTeam = match.participants?.find(p => p.meta?.location === 'home');
    const awayTeam = match.participants?.find(p => p.meta?.location === 'away');
    
    if (!homeTeam || !awayTeam) {
      results.matchesSkipped++;
      skipReasons.noTeams++;
      console.log(`[${counter}/${matches.length}] ⚠️  SKIP: Mancano dati team (fixture ${match.id})\n`);
      counter++;
      continue;
    }
    
    const { homeScore, awayScore } = getMatchScores(match);
    const result = homeScore > awayScore ? '1' : homeScore < awayScore ? '2' : 'X';
    
    console.log(`[${counter}/${matches.length}] ⚽ ${match.competition}`);
    console.log(`    ${homeTeam.name} ${homeScore}-${awayScore} ${awayTeam.name}`);
    console.log(`    📅 ${match.starting_at} | Risultato: ${result}\n`);
    
    // Genera raccomandazioni "ex-post"
    const recommendations = await getRecommendations(match);
    
    if (!recommendations || !recommendations.topPicks || recommendations.topPicks.length === 0) {
      console.log(`    ⚠️  SKIP: Nessuna raccomandazione generata`);
      console.log(`       Possibili motivi: odds mancanti, xG insufficienti, filtri troppo stringenti\n`);
      results.matchesSkipped++;
      skipReasons.noRecs++;
      counter++;
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }
    
    results.matchesAnalyzed++;
    
    // Analizza TOP 3 raccomandazioni
    for (const rec of recommendations.topPicks) {
      results.total++;
      
      const check = checkRecommendation(rec, homeScore, awayScore);
      
      // Statistiche per competizione
      if (!results.byCompetition[match.competition]) {
        results.byCompetition[match.competition] = { wins: 0, losses: 0 };
      }
      
      // Statistiche per tipo
      if (!results.byType[rec.type]) {
        results.byType[rec.type] = { wins: 0, losses: 0 };
      }
      
      if (check.isWin) {
        results.wins++;
        results.byCompetition[match.competition].wins++;
        results.byType[rec.type].wins++;
        results.byValueRating[rec.valueRating].w++;
        
        const evCategory = rec.expectedValue > 0.05 ? 'positive' : rec.expectedValue < -0.05 ? 'negative' : 'neutral';
        results.byEV[evCategory].w++;
        
        console.log(`    ✅ WIN: ${rec.name}`);
        console.log(`       Quota: ${rec.odds} | ${rec.valueRating}⭐ | EV: ${(rec.expectedValue * 100).toFixed(1)}%`);
        console.log(`       ${check.description}\n`);
      } else {
        results.losses++;
        results.byCompetition[match.competition].losses++;
        results.byType[rec.type].losses++;
        results.byValueRating[rec.valueRating].l++;
        
        const evCategory = rec.expectedValue > 0.05 ? 'positive' : rec.expectedValue < -0.05 ? 'negative' : 'neutral';
        results.byEV[evCategory].l++;
        
        console.log(`    ❌ LOSS: ${rec.name}`);
        console.log(`       Quota: ${rec.odds} | ${rec.valueRating}⭐ | EV: ${(rec.expectedValue * 100).toFixed(1)}%`);
        console.log(`       ${check.description}\n`);
      }
      
      // Calcola ROI
      const profit = check.isWin ? (rec.odds - 1) : -1;
      
      results.details.push({
        competition: match.competition,
        match: `${homeTeam.name} vs ${awayTeam.name}`,
        result: `${homeScore}-${awayScore}`,
        recommendation: rec.name,
        prediction: rec.prediction,
        odds: rec.odds,
        valueRating: rec.valueRating,
        expectedValue: rec.expectedValue,
        outcome: check.isWin ? 'WIN' : 'LOSS',
        profit,
      });
    }
    
    counter++;
    
    // Rate limiting per non sovraccaricare il backend (più veloce del weekly)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // ============================================
  // REPORT FINALE
  // ============================================
  
  console.log('\n' + '='*80);
  console.log(`📊 REPORT FINALE - BACKTEST MENSILE`);
  console.log('='*80 + '\n');
  
  console.log(`📈 STATISTICHE GENERALI:`);
  console.log(`   Partite recuperate: ${matches.length}`);
  console.log(`   Partite analizzate: ${results.matchesAnalyzed}`);
  console.log(`   Partite saltate: ${results.matchesSkipped}`);
  console.log(`     └─ Dati team mancanti: ${skipReasons.noTeams}`);
  console.log(`     └─ Nessuna raccomandazione: ${skipReasons.noRecs}`);
  console.log(`   Raccomandazioni testate: ${results.total}`);
  console.log(`   Vincenti: ${results.wins} (${(results.wins/results.total*100).toFixed(1)}%)`);
  console.log(`   Perdenti: ${results.losses} (${(results.losses/results.total*100).toFixed(1)}%)`);
  
  // ROI
  const totalProfit = results.details.reduce((sum, d) => sum + d.profit, 0);
  const roi = (totalProfit / results.total) * 100;
  console.log(`\n💰 ROI (Return on Investment):`);
  console.log(`   Profitto totale: ${totalProfit > 0 ? '+' : ''}${totalProfit.toFixed(2)} unità`);
  console.log(`   ROI: ${roi > 0 ? '+' : ''}${roi.toFixed(2)}%`);
  console.log(`   ${roi > 0 ? '✅ PROFITTO' : roi < 0 ? '❌ PERDITA' : '➖ BREAK-EVEN'}`);
  
  // Per competizione
  console.log(`\n🏆 PERFORMANCE PER COMPETIZIONE:`);
  for (const [comp, stats] of Object.entries(results.byCompetition)) {
    const total = stats.wins + stats.losses;
    const winRate = (stats.wins / total * 100).toFixed(1);
    console.log(`   ${comp}: ${stats.wins}W/${stats.losses}L (${winRate}% win rate)`);
  }
  
  // Per tipo
  console.log(`\n📋 PERFORMANCE PER TIPO DI SCOMMESSA:`);
  for (const [type, stats] of Object.entries(results.byType)) {
    const total = stats.wins + stats.losses;
    const winRate = (stats.wins / total * 100).toFixed(1);
    const typeNames = {
      result: 'Risultato (1X2)',
      double_chance: 'Doppia Chance',
      goal_nogoal: 'Goal/NoGoal',
      over_under: 'Over/Under',
      multigoal: 'Multigoal',
      combo: 'Combo'
    };
    console.log(`   ${typeNames[type] || type}: ${stats.wins}W/${stats.losses}L (${winRate}%)`);
  }
  
  // Per value rating
  console.log(`\n⭐ PERFORMANCE PER VALUE RATING:`);
  for (const [rating, stats] of Object.entries(results.byValueRating)) {
    const total = stats.w + stats.l;
    if (total > 0) {
      const winRate = (stats.w / total * 100).toFixed(1);
      console.log(`   ${rating}⭐: ${stats.w}W/${stats.l}L (${winRate}% win rate)`);
    }
  }
  
  // Per EV
  console.log(`\n📊 PERFORMANCE PER EXPECTED VALUE:`);
  for (const [category, stats] of Object.entries(results.byEV)) {
    const total = stats.w + stats.l;
    if (total > 0) {
      const winRate = (stats.w / total * 100).toFixed(1);
      const categoryNames = {
        positive: 'Positive (EV > 5%)',
        neutral: 'Neutral (EV ±5%)',
        negative: 'Negative (EV < -5%)'
      };
      console.log(`   ${categoryNames[category]}: ${stats.w}W/${stats.l}L (${winRate}%)`);
    }
  }
  
  // Top vincenti
  console.log(`\n🏆 TOP 10 RACCOMANDAZIONI VINCENTI:`);
  const topWins = results.details
    .filter(d => d.outcome === 'WIN')
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10);
  
  topWins.forEach((d, i) => {
    console.log(`   ${i+1}. ${d.competition}: ${d.match} (${d.result})`);
    console.log(`      ${d.recommendation} @ ${d.odds} → ${d.valueRating}⭐ | EV: ${(d.expectedValue*100).toFixed(1)}%`);
    console.log(`      Profitto: +${d.profit.toFixed(2)} unità\n`);
  });
  
  // Top perdite
  console.log(`\n💸 TOP 10 PERDITE PIÙ PESANTI:`);
  const topLosses = results.details
    .filter(d => d.outcome === 'LOSS')
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 10);
  
  topLosses.forEach((d, i) => {
    console.log(`   ${i+1}. ${d.competition}: ${d.match} (${d.result})`);
    console.log(`      ${d.recommendation} @ ${d.odds} → ${d.valueRating}⭐ | EV: ${(d.expectedValue*100).toFixed(1)}%`);
    console.log(`      Perdita: ${d.profit.toFixed(2)} unità\n`);
  });
  
  console.log('\n' + '='*80);
  console.log('✅ Analisi completata!');
  console.log('='*80 + '\n');
  
  // Salva report JSON
  const report = {
    metadata: {
      period: `${START_DATE} to ${END_DATE}`,
      generatedAt: new Date().toISOString(),
      totalMatches: matches.length,
      matchesAnalyzed: results.matchesAnalyzed,
      matchesSkipped: results.matchesSkipped,
      skipReasons,
    },
    summary: {
      totalRecommendations: results.total,
      wins: results.wins,
      losses: results.losses,
      winRate: parseFloat((results.wins/results.total*100).toFixed(2)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      roi: parseFloat(roi.toFixed(2))
    },
    byCompetition: Object.entries(results.byCompetition).map(([competition, stats]) => ({
      competition,
      wins: stats.wins,
      losses: stats.losses,
      total: stats.wins + stats.losses,
      winRate: parseFloat((stats.wins / (stats.wins + stats.losses) * 100).toFixed(2))
    })),
    byBetType: Object.entries(results.byType).map(([type, stats]) => ({
      type,
      wins: stats.wins,
      losses: stats.losses,
      total: stats.wins + stats.losses,
      winRate: parseFloat((stats.wins / (stats.wins + stats.losses) * 100).toFixed(2))
    })),
    byValueRating: Object.entries(results.byValueRating)
      .filter(([_, stats]) => (stats.w + stats.l) > 0)
      .map(([rating, stats]) => ({
        rating: parseInt(rating),
        wins: stats.w,
        losses: stats.l,
        total: stats.w + stats.l,
        winRate: parseFloat((stats.w / (stats.w + stats.l) * 100).toFixed(2))
      })),
    byExpectedValue: Object.entries(results.byEV)
      .filter(([_, stats]) => (stats.w + stats.l) > 0)
      .map(([category, stats]) => ({
        category,
        wins: stats.w,
        losses: stats.l,
        total: stats.w + stats.l,
        winRate: parseFloat((stats.w / (stats.w + stats.l) * 100).toFixed(2))
      })),
    topWins: topWins.map(d => ({
      competition: d.competition,
      match: d.match,
      result: d.result,
      recommendation: d.recommendation,
      odds: d.odds,
      valueRating: d.valueRating,
      expectedValue: parseFloat((d.expectedValue * 100).toFixed(2)),
      profit: parseFloat(d.profit.toFixed(2))
    })),
    topLosses: topLosses.map(d => ({
      competition: d.competition,
      match: d.match,
      result: d.result,
      recommendation: d.recommendation,
      odds: d.odds,
      valueRating: d.valueRating,
      expectedValue: parseFloat((d.expectedValue * 100).toFixed(2)),
      loss: parseFloat(Math.abs(d.profit).toFixed(2))
    })),
    allRecommendations: results.details.map(d => ({
      competition: d.competition,
      match: d.match,
      result: d.result,
      recommendation: d.recommendation,
      odds: d.odds,
      valueRating: d.valueRating,
      expectedValue: parseFloat((d.expectedValue * 100).toFixed(2)),
      outcome: d.outcome,
      profit: parseFloat(d.profit.toFixed(2))
    }))
  };
  
  const reportFilename = `backtest-report-${START_DATE}_to_${END_DATE}.json`;
  fs.writeFileSync(reportFilename, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report salvato in: ${reportFilename}\n`);
}

// Esegui analisi
analyzeRecommendations().catch(error => {
  console.error('\n❌ Errore fatale:', error);
  process.exit(1);
});
