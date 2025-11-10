// 🎯 REPORT COMPLETO: Predizioni vs Risultati Reali - 9 Novembre 2025
// Con generazione predizioni ML e confronto accuratezza

require('dotenv').config({ path: './api/.env' });
const axios = require('axios');

const SPORTSMONKS_API_KEY = process.env.SPORTSMONKS_API_KEY;
const BASE_URL = 'https://api.sportmonks.com/v3/football';
const BACKEND_URL = 'http://localhost:3001';

// League IDs
const LEAGUES = {
  'Serie A': 384,
  'Premier League': 8,
  'La Liga': 564,
  'Bundesliga': 82,
  'Ligue 1': 301
};

async function fetchFixtureDetails(fixtureId) {
  try {
    const url = `${BASE_URL}/fixtures/${fixtureId}`;
    const response = await axios.get(url, {
      params: {
        api_token: SPORTSMONKS_API_KEY,
        include: 'participants;scores;league;state;statistics;odds'
      }
    });
    
    return response.data?.data;
  } catch (error) {
    console.log(`   ⚠️  Errore dettagli fixture ${fixtureId}: ${error.message}`);
    return null;
  }
}

async function generateMLPredictions(match) {
  try {
    // Chiamata diretta al sistema di predizioni
    const response = await axios.post(`${BACKEND_URL}/api/predictions/analyze`, {
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      league: match.league,
      date: '2025-11-09'
    }, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.data?.recommendations) {
      return response.data.recommendations;
    }
    
    return [];
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Backend non disponibile. Avvia con: cd api && npm run dev');
    }
    console.log(`   ⚠️  Errore predizione: ${error.message}`);
    return [];
  }
}

function parseScore(fixture) {
  // Trova lo score finale
  const ftScore = fixture.scores?.find(s => s.description === 'CURRENT' || s.description === 'FT');
  
  if (!ftScore) return { home: null, away: null };
  
  // Estrai i gol
  const participants = fixture.participants || [];
  const homeTeam = participants.find(p => p.meta?.location === 'home');
  const awayTeam = participants.find(p => p.meta?.location === 'away');
  
  let homeScore = null;
  let awayScore = null;
  
  // Cerca negli score
  fixture.scores?.forEach(score => {
    if (score.description === 'CURRENT' || score.description === 'FT') {
      if (score.score?.participant === 'home' || score.participant_id === homeTeam?.id) {
        homeScore = score.score?.goals ?? score.goals;
      } else if (score.score?.participant === 'away' || score.participant_id === awayTeam?.id) {
        awayScore = score.score?.goals ?? score.goals;
      }
    }
  });
  
  return { home: homeScore, away: awayScore };
}

function evaluatePrediction(prediction, homeScore, awayScore) {
  const totalGoals = homeScore + awayScore;
  const result = homeScore > awayScore ? 'HOME' : 
                 awayScore > homeScore ? 'AWAY' : 'DRAW';
  
  let correct = false;
  let betOutcome = '';
  
  if (prediction.type === 'result') {
    if (prediction.name.includes('Vittoria Casa') || prediction.name.includes('1 -')) {
      correct = result === 'HOME';
      betOutcome = `1 (${homeScore}-${awayScore})`;
    } else if (prediction.name.includes('Pareggio') || prediction.name.includes('X -')) {
      correct = result === 'DRAW';
      betOutcome = `X (${homeScore}-${awayScore})`;
    } else if (prediction.name.includes('Vittoria Trasferta') || prediction.name.includes('2 -')) {
      correct = result === 'AWAY';
      betOutcome = `2 (${homeScore}-${awayScore})`;
    }
  } else if (prediction.type === 'double_chance') {
    if (prediction.name.includes('1X')) {
      correct = result === 'HOME' || result === 'DRAW';
      betOutcome = `1X (${result})`;
    } else if (prediction.name.includes('12')) {
      correct = result === 'HOME' || result === 'AWAY';
      betOutcome = `12 (${result})`;
    } else if (prediction.name.includes('X2')) {
      correct = result === 'DRAW' || result === 'AWAY';
      betOutcome = `X2 (${result})`;
    }
  } else if (prediction.type === 'goal_nogoal') {
    if (prediction.name.toLowerCase().includes('goal') && !prediction.name.toLowerCase().includes('no')) {
      correct = totalGoals > 0;
      betOutcome = `Goal (${totalGoals} gol)`;
    } else if (prediction.name.toLowerCase().includes('no goal')) {
      correct = totalGoals === 0;
      betOutcome = `No Goal (${totalGoals} gol)`;
    }
  }
  
  return { correct, betOutcome };
}

async function main() {
  console.log('🎯 REPORT COMPLETO: PREDIZIONI vs RISULTATI REALI');
  console.log('📅 Data: 9 Novembre 2025');
  console.log('=================================================\n');
  
  // Test connessione backend
  console.log('🔌 Test connessione backend...');
  try {
    await axios.get(`${BACKEND_URL}/health`, { timeout: 3000 });
    console.log('✅ Backend online\n');
  } catch (error) {
    console.log('❌ Backend offline');
    console.log('💡 Avvia il backend con: cd api && npm run dev\n');
    console.log('📊 Mostr solo i risultati delle partite...\n');
  }
  
  // Recupera partite
  console.log('📥 RECUPERO PARTITE CONCLUSE...\n');
  
  const today = '2025-11-09';
  const finishedMatches = [];
  
  for (const [leagueName, leagueId] of Object.entries(LEAGUES)) {
    try {
      const url = `${BASE_URL}/fixtures/date/${today}`;
      const response = await axios.get(url, {
        params: {
          api_token: SPORTSMONKS_API_KEY,
          include: 'participants;scores;league;state',
          filters: `fixtureLeagues:${leagueId}`
        }
      });
      
      if (response.data?.data) {
        const finished = response.data.data.filter(f => 
          f.state?.state === 'FT' || f.state?.state === 'AET'
        );
        
        for (const fixture of finished) {
          const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home')?.name || 'Unknown';
          const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away')?.name || 'Unknown';
          const score = parseScore(fixture);
          
          finishedMatches.push({
            id: fixture.id,
            league: leagueName,
            homeTeam,
            awayTeam,
            homeScore: score.home,
            awayScore: score.away,
            fixture
          });
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 400));
    } catch (error) {
      console.log(`⚠️  Errore ${leagueName}: ${error.message}`);
    }
  }
  
  console.log(`✅ Trovate ${finishedMatches.length} partite concluse\n`);
  
  if (finishedMatches.length === 0) {
    console.log('❌ Nessuna partita conclusa disponibile per l\'analisi');
    return;
  }
  
  // Mostra risultati
  console.log('📊 RISULTATI PARTITE:');
  console.log('=====================\n');
  
  finishedMatches.forEach(match => {
    const score = `${match.homeScore}-${match.awayScore}`;
    console.log(`${match.league.padEnd(18)} | ${score.padStart(5)} | ${match.homeTeam} vs ${match.awayTeam}`);
  });
  
  console.log('\n\n🤖 GENERAZIONE PREDIZIONI ML...\n');
  console.log('⚠️  NOTA: Per generare predizioni reali, assicurati che il backend sia online');
  console.log('          Altrimenti verrà mostrata solo l\'analisi dei risultati\n');
  
  const analysisResults = [];
  let backendAvailable = true;
  
  for (const match of finishedMatches) {
    console.log(`\n📍 ${match.homeTeam} vs ${match.awayTeam}`);
    console.log(`   Lega: ${match.league}`);
    console.log(`   Risultato: ${match.homeScore}-${match.awayScore}`);
    
    if (backendAvailable) {
      try {
        const predictions = await generateMLPredictions(match);
        
        if (predictions && predictions.length > 0) {
          console.log(`   ✅ ${predictions.length} predizioni generate`);
          
          const evaluations = predictions.map(pred => {
            const { correct, betOutcome } = evaluatePrediction(
              pred, 
              match.homeScore, 
              match.awayScore
            );
            
            return {
              prediction: pred.name,
              type: pred.type,
              confidence: pred.confidence,
              rating: pred.valueRating,
              odds: pred.odds,
              correct,
              betOutcome,
              profit: correct ? (pred.odds - 1) : -1
            };
          });
          
          const correctCount = evaluations.filter(e => e.correct).length;
          const accuracy = (correctCount / evaluations.length * 100).toFixed(1);
          const totalProfit = evaluations.reduce((sum, e) => sum + e.profit, 0);
          
          console.log(`   📊 Accuratezza: ${correctCount}/${evaluations.length} (${accuracy}%)`);
          console.log(`   💰 ROI: ${totalProfit > 0 ? '+' : ''}${totalProfit.toFixed(2)} units`);
          
          analysisResults.push({
            match: `${match.homeTeam} vs ${match.awayTeam}`,
            league: match.league,
            score: `${match.homeScore}-${match.awayScore}`,
            predictions: evaluations,
            accuracy: parseFloat(accuracy),
            roi: totalProfit
          });
          
          // Mostra dettaglio predizioni
          evaluations.forEach(evaluation => {
            const icon = evaluation.correct ? '✅' : '❌';
            const stars = '⭐'.repeat(evaluation.rating);
            console.log(`      ${icon} ${evaluation.prediction} ${stars}`);
            console.log(`         Confidence: ${evaluation.confidence}% | Odds: ${evaluation.odds.toFixed(2)} | ${evaluation.betOutcome}`);
          });
          
        } else {
          console.log(`   ⚠️  Nessuna predizione generata (filtri troppo restrittivi?)`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.log(`   ❌ Errore: ${error.message}`);
        if (error.message.includes('Backend non disponibile')) {
          backendAvailable = false;
          console.log('   ⚠️  Disabilito generazione predizioni per le partite rimanenti\n');
        }
      }
    }
  }
  
  // Report finale
  if (analysisResults.length > 0) {
    console.log('\n\n📈 REPORT FINALE');
    console.log('================\n');
    
    const totalMatches = analysisResults.length;
    const totalPredictions = analysisResults.reduce((sum, r) => sum + r.predictions.length, 0);
    const totalCorrect = analysisResults.reduce((sum, r) => 
      sum + r.predictions.filter(p => p.correct).length, 0);
    const totalROI = analysisResults.reduce((sum, r) => sum + r.roi, 0);
    const avgAccuracy = analysisResults.reduce((sum, r) => sum + r.accuracy, 0) / totalMatches;
    
    console.log(`📊 STATISTICHE GLOBALI:`);
    console.log(`   Partite analizzate: ${totalMatches}`);
    console.log(`   Predizioni totali: ${totalPredictions}`);
    console.log(`   Predizioni corrette: ${totalCorrect}`);
    console.log(`   Win Rate: ${(totalCorrect / totalPredictions * 100).toFixed(1)}%`);
    console.log(`   Accuratezza media: ${avgAccuracy.toFixed(1)}%`);
    console.log(`   ROI Totale: ${totalROI > 0 ? '+' : ''}${totalROI.toFixed(2)} units`);
    console.log(`   ROI per partita: ${(totalROI / totalMatches).toFixed(2)} units`);
    
    // Per lega
    console.log(`\n🌍 BREAKDOWN PER LEGA:`);
    const byLeague = {};
    analysisResults.forEach(r => {
      if (!byLeague[r.league]) {
        byLeague[r.league] = { correct: 0, total: 0, roi: 0, matches: 0 };
      }
      const correct = r.predictions.filter(p => p.correct).length;
      byLeague[r.league].correct += correct;
      byLeague[r.league].total += r.predictions.length;
      byLeague[r.league].roi += r.roi;
      byLeague[r.league].matches++;
    });
    
    Object.entries(byLeague).sort((a, b) => b[1].correct / b[1].total - a[1].correct / a[1].total).forEach(([league, stats]) => {
      const winRate = (stats.correct / stats.total * 100).toFixed(1);
      console.log(`   ${league.padEnd(18)}: ${stats.correct}/${stats.total} (${winRate}%) | ROI: ${stats.roi > 0 ? '+' : ''}${stats.roi.toFixed(2)} | ${stats.matches} partite`);
    });
    
    // Per tipo scommessa
    console.log(`\n🎲 BREAKDOWN PER TIPO SCOMMESSA:`);
    const byType = {};
    analysisResults.forEach(r => {
      r.predictions.forEach(p => {
        if (!byType[p.type]) {
          byType[p.type] = { correct: 0, total: 0, roi: 0 };
        }
        byType[p.type].total++;
        if (p.correct) byType[p.type].correct++;
        byType[p.type].roi += p.profit;
      });
    });
    
    Object.entries(byType).sort((a, b) => b[1].correct / b[1].total - a[1].correct / a[1].total).forEach(([type, stats]) => {
      const winRate = (stats.correct / stats.total * 100).toFixed(1);
      const typeName = type === 'double_chance' ? 'Doppia Chance' :
                       type === 'result' ? '1X2 Risultato' :
                       type === 'goal_nogoal' ? 'Goal/No Goal' : type;
      console.log(`   ${typeName.padEnd(18)}: ${stats.correct}/${stats.total} (${winRate}%) | ROI: ${stats.roi > 0 ? '+' : ''}${stats.roi.toFixed(2)}`);
    });
    
    // Valutazione accuracy fix
    console.log(`\n\n🎯 VALUTAZIONE FIX ACCURATEZZA:`);
    console.log(`   Target precedente: 72% win rate`);
    console.log(`   Risultato attuale: ${(totalCorrect / totalPredictions * 100).toFixed(1)}% win rate`);
    const improvement = (totalCorrect / totalPredictions * 100) - 72;
    if (improvement > 0) {
      console.log(`   ✅ MIGLIORAMENTO: +${improvement.toFixed(1)}% win rate!`);
    } else {
      console.log(`   ⚠️  Variazione: ${improvement.toFixed(1)}% (sample size piccolo)`);
    }
    
  } else {
    console.log('\n⚠️  Nessuna analisi disponibile');
    console.log('💡 Avvia il backend per generare predizioni: cd api && npm run dev');
  }
  
  console.log('\n✅ Report completato!\n');
}

main().catch(console.error);