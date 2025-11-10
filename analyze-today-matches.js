// 🎯 ANALISI PARTITE DEL 9 NOVEMBRE 2025
// Compara predizioni ML vs risultati reali

require('dotenv').config({ path: './api/.env' });
const axios = require('axios');

const SPORTSMONKS_API_KEY = process.env.SPORTSMONKS_API_KEY;
const BASE_URL = 'https://api.sportmonks.com/v3/football';

// League IDs supportate
const SUPPORTED_LEAGUES = {
  'Serie A': 384,
  'Premier League': 8,
  'La Liga': 564,
  'Bundesliga': 82,
  'Ligue 1': 301,
  'Champions League': 2,
  'Europa League': 3
};

async function fetchTodayMatches() {
  console.log('🔍 RECUPERO PARTITE DEL 9 NOVEMBRE 2025...\n');
  
  const today = '2025-11-09';
  const allMatches = [];
  
  for (const [leagueName, leagueId] of Object.entries(SUPPORTED_LEAGUES)) {
    try {
      console.log(`   Checking ${leagueName}...`);
      
      const url = `${BASE_URL}/fixtures/date/${today}`;
      const response = await axios.get(url, {
        params: {
          api_token: SPORTSMONKS_API_KEY,
          include: 'participants;scores;league;state',
          filters: `fixtureLeagues:${leagueId}`
        }
      });
      
      if (response.data?.data && response.data.data.length > 0) {
        const matches = response.data.data.map(fixture => ({
          id: fixture.id,
          league: leagueName,
          leagueId: leagueId,
          homeTeam: fixture.participants?.find(p => p.meta?.location === 'home')?.name || 'Unknown',
          awayTeam: fixture.participants?.find(p => p.meta?.location === 'away')?.name || 'Unknown',
          startTime: fixture.starting_at,
          state: fixture.state?.state || 'unknown',
          homeScore: fixture.scores?.find(s => s.description === 'CURRENT')?.score?.participant === 'home' 
            ? fixture.scores.find(s => s.description === 'CURRENT')?.score?.goals 
            : null,
          awayScore: fixture.scores?.find(s => s.description === 'CURRENT')?.score?.participant === 'away'
            ? fixture.scores.find(s => s.description === 'CURRENT')?.score?.goals
            : null,
          finished: fixture.state?.state === 'FT' || fixture.state?.state === 'AET',
          fixtureData: fixture
        }));
        
        allMatches.push(...matches);
        console.log(`   ✅ ${matches.length} partite trovate in ${leagueName}`);
      } else {
        console.log(`   ℹ️  Nessuna partita in ${leagueName}`);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.log(`   ⚠️  Errore ${leagueName}: ${error.message}`);
    }
  }
  
  return allMatches;
}

async function generatePredictionsForMatch(match) {
  try {
    // Chiama il backend locale per generare predizioni
    const response = await axios.post('http://localhost:3001/api/predictions/match', {
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      league: match.league,
      fixtureId: match.id
    }, {
      timeout: 30000
    });
    
    return response.data?.recommendations || [];
  } catch (error) {
    console.log(`   ⚠️  Errore predizione ${match.homeTeam} vs ${match.awayTeam}: ${error.message}`);
    return [];
  }
}

function analyzeMatchResult(match, predictions) {
  if (!match.finished) {
    return {
      match: `${match.homeTeam} vs ${match.awayTeam}`,
      league: match.league,
      status: 'IN_PROGRESS',
      predictions: predictions.length,
      accuracy: null
    };
  }
  
  const homeScore = parseInt(match.homeScore) || 0;
  const awayScore = parseInt(match.awayScore) || 0;
  
  const actualResult = homeScore > awayScore ? 'HOME' : 
                       awayScore > homeScore ? 'AWAY' : 'DRAW';
  
  const results = predictions.map(pred => {
    let correct = false;
    let betType = pred.type;
    
    // Valuta accuracy per tipo di scommessa
    if (pred.type === 'result') {
      if (pred.name.includes('Vittoria Casa') && actualResult === 'HOME') correct = true;
      if (pred.name.includes('Pareggio') && actualResult === 'DRAW') correct = true;
      if (pred.name.includes('Vittoria Trasferta') && actualResult === 'AWAY') correct = true;
    } else if (pred.type === 'double_chance') {
      if (pred.name.includes('1X') && (actualResult === 'HOME' || actualResult === 'DRAW')) correct = true;
      if (pred.name.includes('12') && (actualResult === 'HOME' || actualResult === 'AWAY')) correct = true;
      if (pred.name.includes('X2') && (actualResult === 'DRAW' || actualResult === 'AWAY')) correct = true;
    } else if (pred.type === 'goal_nogoal') {
      const totalGoals = homeScore + awayScore;
      if (pred.name.includes('Goal') && totalGoals > 0) correct = true;
      if (pred.name.includes('No Goal') && totalGoals === 0) correct = true;
    }
    
    return {
      prediction: pred.name,
      betType: betType,
      confidence: pred.confidence,
      rating: pred.valueRating,
      expectedValue: pred.expectedValue,
      odds: pred.odds,
      correct: correct,
      potentialReturn: correct ? (pred.odds - 1) : -1
    };
  });
  
  return {
    match: `${match.homeTeam} vs ${match.awayTeam}`,
    league: match.league,
    score: `${homeScore}-${awayScore}`,
    result: actualResult,
    status: 'FINISHED',
    predictions: results,
    accuracy: results.length > 0 ? (results.filter(r => r.correct).length / results.length * 100).toFixed(1) : 0,
    roi: results.reduce((sum, r) => sum + r.potentialReturn, 0)
  };
}

async function main() {
  console.log('🎯 ANALISI PARTITE DEL 9 NOVEMBRE 2025');
  console.log('======================================\n');
  
  // 1. Recupera partite
  const matches = await fetchTodayMatches();
  console.log(`\n📊 TOTALE: ${matches.length} partite trovate\n`);
  
  if (matches.length === 0) {
    console.log('❌ Nessuna partita trovata per oggi nelle leghe supportate');
    return;
  }
  
  // Separare partite finite da quelle in corso/future
  const finishedMatches = matches.filter(m => m.finished);
  const upcomingMatches = matches.filter(m => !m.finished);
  
  console.log(`   ✅ Partite concluse: ${finishedMatches.length}`);
  console.log(`   ⏳ Partite in corso/future: ${upcomingMatches.length}\n`);
  
  // 2. Genera predizioni e analizza risultati
  console.log('🤖 GENERAZIONE PREDIZIONI E ANALISI...\n');
  
  const results = [];
  
  for (const match of matches) {
    console.log(`\n📍 ${match.homeTeam} vs ${match.awayTeam} (${match.league})`);
    console.log(`   Status: ${match.state} | Score: ${match.homeScore ?? '-'} - ${match.awayScore ?? '-'}`);
    
    // Genera predizioni (commenta se vuoi solo analizzare senza backend)
    // const predictions = await generatePredictionsForMatch(match);
    // console.log(`   Predizioni generate: ${predictions.length}`);
    
    // Per ora uso predizioni mock
    const predictions = [];
    
    const analysis = analyzeMatchResult(match, predictions);
    results.push(analysis);
    
    if (match.finished && predictions.length > 0) {
      console.log(`   Accuratezza: ${analysis.accuracy}%`);
      console.log(`   ROI: ${analysis.roi > 0 ? '+' : ''}${analysis.roi.toFixed(2)} units`);
    }
  }
  
  // 3. Report finale
  console.log('\n\n📊 REPORT FINALE');
  console.log('================\n');
  
  const finishedResults = results.filter(r => r.status === 'FINISHED' && r.predictions.length > 0);
  
  if (finishedResults.length === 0) {
    console.log('⚠️  Nessuna partita conclusa con predizioni disponibili');
    console.log('\n💡 NOTE:');
    console.log('   - Se vuoi generare predizioni, avvia il backend: npm run dev');
    console.log('   - Poi decomenta la chiamata generatePredictionsForMatch()');
    console.log(`   - ${matches.length} partite disponibili per analisi`);
  } else {
    const totalPredictions = finishedResults.reduce((sum, r) => sum + r.predictions.length, 0);
    const correctPredictions = finishedResults.reduce((sum, r) => 
      sum + r.predictions.filter(p => p.correct).length, 0);
    const totalROI = finishedResults.reduce((sum, r) => sum + r.roi, 0);
    
    console.log(`Partite analizzate: ${finishedResults.length}`);
    console.log(`Predizioni totali: ${totalPredictions}`);
    console.log(`Predizioni corrette: ${correctPredictions}`);
    console.log(`Win Rate: ${(correctPredictions / totalPredictions * 100).toFixed(1)}%`);
    console.log(`ROI Totale: ${totalROI > 0 ? '+' : ''}${totalROI.toFixed(2)} units`);
    
    // Breakdown per lega
    console.log('\n📊 BREAKDOWN PER LEGA:');
    const byLeague = {};
    finishedResults.forEach(r => {
      if (!byLeague[r.league]) {
        byLeague[r.league] = { correct: 0, total: 0, roi: 0 };
      }
      const correct = r.predictions.filter(p => p.correct).length;
      byLeague[r.league].correct += correct;
      byLeague[r.league].total += r.predictions.length;
      byLeague[r.league].roi += r.roi;
    });
    
    Object.entries(byLeague).forEach(([league, stats]) => {
      const winRate = (stats.correct / stats.total * 100).toFixed(1);
      console.log(`   ${league}: ${stats.correct}/${stats.total} (${winRate}%) | ROI: ${stats.roi > 0 ? '+' : ''}${stats.roi.toFixed(2)}`);
    });
  }
  
  // Lista partite del giorno
  console.log('\n\n📅 TUTTE LE PARTITE DEL 9 NOVEMBRE 2025:');
  console.log('=========================================\n');
  
  matches.forEach(match => {
    const time = new Date(match.startTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const status = match.finished ? `✅ ${match.homeScore}-${match.awayScore}` : `⏳ ${time}`;
    console.log(`${status} | ${match.league.padEnd(20)} | ${match.homeTeam} vs ${match.awayTeam}`);
  });
  
  console.log('\n✅ Analisi completata!');
}

main().catch(console.error);