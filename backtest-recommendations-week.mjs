/**
 * BACKTEST BETTING RECOMMENDATIONS - ULTIMO MESE
 * 
 * Recupera tutte le partite finite dell'ultimo mese (9 ottobre - 9 novembre 2025),
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

// Date range: ultimo mese
const START_DATE = '2025-10-09';
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
 * Recupera tutte le partite finite dell'ultima settimana da Sportmonks
 */
async function getFinishedMatches() {
  console.log('\n📅 Recupero partite finite dell\'ultima settimana (3-9 novembre 2025)...\n');
  
  const allMatches = [];
  
  console.log(`📅 Recupero partite finite dell'ultimo mese (${START_DATE} - ${END_DATE})...\n`);
  
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
        const weekMatches = response.data.data.filter(match => 
          match.state_id === 5 && match.league_id === comp.id
        );
        
        // Aggiungi info sulla competizione
        weekMatches.forEach(m => {
          m.competition = comp.name;
          m.season_id = comp.season;
          m.league_id = comp.id;
        });
        
        console.log(`   ✅ ${comp.name}: ${weekMatches.length} partite finite`);
        allMatches.push(...weekMatches);
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
      seasonId: match.season_id,
      leagueId: match.league_id,
      homeTeamName: homeTeam.name,
      awayTeamName: awayTeam.name,
    });
    
    return response.data;
  } catch (error) {
    return null;
  }
}

/**
 * Estrae i punteggi dal match
 */
function getMatchScores(match) {
  const scores = match.scores || [];
  
  const homeScore = scores.find(s => 
    s.description === 'CURRENT' && 
    s.score?.participant === 'home'
  )?.score?.goals || 0;
  
  const awayScore = scores.find(s => 
    s.description === 'CURRENT' && 
    s.score?.participant === 'away'
  )?.score?.goals || 0;
  
  return { homeScore, awayScore };
}

/**
 * Verifica se una raccomandazione è vincente
 */
function checkRecommendation(recommendation, homeScore, awayScore) {
  const totalGoals = homeScore + awayScore;
  const result = homeScore > awayScore ? '1' : homeScore < awayScore ? '2' : 'X';
  
  let isWin = false;
  let description = '';
  
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
      
    case 'multigoal':
      if (recommendation.prediction.includes('CASA')) {
        const match = recommendation.prediction.match(/(\d+)-(\d+)/);
        if (match) {
          const [_, min, max] = match;
          isWin = homeScore >= parseInt(min) && homeScore <= parseInt(max);
          description = `Gol casa: ${homeScore} (${min}-${max})`;
        }
      } else if (recommendation.prediction.includes('TRASFERTA')) {
        const match = recommendation.prediction.match(/(\d+)-(\d+)/);
        if (match) {
          const [_, min, max] = match;
          isWin = awayScore >= parseInt(min) && awayScore <= parseInt(max);
          description = `Gol trasferta: ${awayScore} (${min}-${max})`;
        }
      }
      break;
      
    case 'combo':
      const conditions = recommendation.prediction.split(' + ');
      let comboWin = true;
      
      conditions.forEach(cond => {
        if (cond === '1' && result !== '1') comboWin = false;
        if (cond === '2' && result !== '2') comboWin = false;
        if (cond === 'X' && result !== 'X') comboWin = false;
        if (cond === '1X' && result === '2') comboWin = false;
        if (cond === 'X2' && result === '1') comboWin = false;
        if (cond.includes('OVER')) {
          const threshold = parseFloat(cond.match(/[\d.]+/)?.[0] || 0);
          if (totalGoals <= threshold) comboWin = false;
        }
        if (cond.includes('GOAL') && !(homeScore > 0 && awayScore > 0)) comboWin = false;
      });
      
      isWin = comboWin;
      description = `${homeScore}-${awayScore}, Tot: ${totalGoals}`;
      break;
  }
  
  return { isWin, description };
}

/**
 * Analisi principale
 */
async function analyzeRecommendations() {
  console.log('='*80);
  console.log(`🔍 BACKTEST BETTING RECOMMENDATIONS - ULTIMO MESE (${START_DATE} - ${END_DATE})`);
  console.log('='*80);
  
  // 1. Ottieni tutte le partite finite dell'ultimo mese
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
  
  for (const match of matches) {
    const homeTeam = match.participants?.find(p => p.meta?.location === 'home');
    const awayTeam = match.participants?.find(p => p.meta?.location === 'away');
    
    if (!homeTeam || !awayTeam) {
      results.matchesSkipped++;
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
      console.log(`    ⚠️  Nessuna raccomandazione generata\n`);
      results.matchesSkipped++;
      counter++;
      await new Promise(resolve => setTimeout(resolve, 1500));
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
    
    // Rate limiting per non sovraccaricare il backend
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  // ============================================
  // REPORT FINALE
  // ============================================
  
  console.log('\n' + '='*80);
  console.log('📊 REPORT FINALE - BACKTEST RACCOMANDAZIONI');
  console.log('='*80 + '\n');
  
  console.log(`📈 STATISTICHE GENERALI:`);
  console.log(`   Partite recuperate: ${matches.length}`);
  console.log(`   Partite analizzate: ${results.matchesAnalyzed}`);
  console.log(`   Partite saltate: ${results.matchesSkipped}`);
  console.log(`   Raccomandazioni testate: ${results.total}`);
  console.log(`   Vincenti: ${results.wins} (${(results.wins/results.total*100).toFixed(1)}%)`);
  console.log(`   Perdenti: ${results.losses} (${(results.losses/results.total*100).toFixed(1)}%)`);
  
  // ROI
  const totalProfit = results.details.reduce((sum, d) => sum + d.profit, 0);
  const roi = (totalProfit / results.total) * 100;
  console.log(`\n💰 ROI (Return on Investment):`);
  console.log(`   Profitto totale: ${totalProfit > 0 ? '+' : ''}${totalProfit.toFixed(2)} unità`);
  console.log(`   ROI: ${roi > 0 ? '+' : ''}${roi.toFixed(2)}%`);
  console.log(`   ${roi > 0 ? '✅ PROFITTO' : roi < 0 ? '❌ PERDITA' : '⚖️  BREAK-EVEN'}`);
  
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
  console.log(`\n💸 TOP 5 PERDITE PIÙ PESANTI:`);
  const topLosses = results.details
    .filter(d => d.outcome === 'LOSS')
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 5);
  
  topLosses.forEach((d, i) => {
    console.log(`   ${i+1}. ${d.competition}: ${d.match} (${d.result})`);
    console.log(`      ${d.recommendation} @ ${d.odds} → ${d.valueRating}⭐ | EV: ${(d.expectedValue*100).toFixed(1)}%`);
    console.log(`      Perdita: ${d.profit.toFixed(2)} unità\n`);
  });
  
  console.log('='*80);
  console.log('✅ Analisi completata!');
  console.log('='*80 + '\n');
  
  // ============================================
  // GENERA REPORT JSON
  // ============================================
  
  const report = {
    metadata: {
      period: `${START_DATE} to ${END_DATE}`,
      generatedAt: new Date().toISOString(),
      totalMatches: matches.length,
      matchesAnalyzed: results.matchesAnalyzed,
      matchesSkipped: results.matchesSkipped,
    },
    summary: {
      totalRecommendations: results.total,
      wins: results.wins,
      losses: results.losses,
      winRate: parseFloat((results.wins/results.total*100).toFixed(2)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      roi: parseFloat(roi.toFixed(2)),
    },
    byCompetition: Object.entries(results.byCompetition).map(([name, stats]) => ({
      competition: name,
      wins: stats.wins,
      losses: stats.losses,
      total: stats.wins + stats.losses,
      winRate: parseFloat((stats.wins / (stats.wins + stats.losses) * 100).toFixed(2)),
    })),
    byBetType: Object.entries(results.byType).map(([type, stats]) => ({
      type,
      wins: stats.wins,
      losses: stats.losses,
      total: stats.wins + stats.losses,
      winRate: parseFloat((stats.wins / (stats.wins + stats.losses) * 100).toFixed(2)),
    })),
    byValueRating: Object.entries(results.byValueRating)
      .filter(([_, stats]) => stats.w + stats.l > 0)
      .map(([rating, stats]) => ({
        rating: parseInt(rating),
        wins: stats.w,
        losses: stats.l,
        total: stats.w + stats.l,
        winRate: parseFloat((stats.w / (stats.w + stats.l) * 100).toFixed(2)),
      })),
    byExpectedValue: Object.entries(results.byEV)
      .filter(([_, stats]) => stats.w + stats.l > 0)
      .map(([category, stats]) => ({
        category,
        wins: stats.w,
        losses: stats.l,
        total: stats.w + stats.l,
        winRate: parseFloat((stats.w / (stats.w + stats.l) * 100).toFixed(2)),
      })),
    topWins: topWins.map(d => ({
      competition: d.competition,
      match: d.match,
      result: d.result,
      recommendation: d.recommendation,
      odds: d.odds,
      valueRating: d.valueRating,
      expectedValue: parseFloat((d.expectedValue * 100).toFixed(2)),
      profit: parseFloat(d.profit.toFixed(2)),
    })),
    topLosses: topLosses.map(d => ({
      competition: d.competition,
      match: d.match,
      result: d.result,
      recommendation: d.recommendation,
      odds: d.odds,
      valueRating: d.valueRating,
      expectedValue: parseFloat((d.expectedValue * 100).toFixed(2)),
      loss: parseFloat(Math.abs(d.profit).toFixed(2)),
    })),
    allRecommendations: results.details.map(d => ({
      competition: d.competition,
      match: d.match,
      result: d.result,
      recommendation: d.recommendation,
      type: d.type,
      odds: d.odds,
      valueRating: d.valueRating,
      expectedValue: parseFloat((d.expectedValue * 100).toFixed(2)),
      outcome: d.outcome,
      profit: parseFloat(d.profit.toFixed(2)),
    })),
  };
  
  // Salva report JSON
  const reportPath = `backtest-report-${START_DATE}_to_${END_DATE}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report salvato in: ${reportPath}\n`);
}

// Esegui l'analisi
analyzeRecommendations().catch(console.error);
