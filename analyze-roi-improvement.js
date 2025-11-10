const moment = require('moment-timezone');

// ANALISI ROI - Identificazione aree di miglioramento
const API_URL = process.env.API_URL || 'http://localhost:3000';

async function analyzeROIImprovement() {
  console.log('📊 ANALISI ROI - Identificazione Aree di Miglioramento');
  console.log('═════════════════════════════════════════════════════════\n');
  
  // Test su partite recenti per analizzare pattern
  const testDates = ['2025-11-08', '2025-11-07', '2025-11-06'];
  
  let allRecommendations = [];
  
  for (const date of testDates) {
    console.log(`📅 Analisi ${date}...`);
    
    try {
      // Carica partite del giorno
      const fixturesResponse = await fetch(`${API_URL}/api/fixtures/sm/range?startDate=${date}&endDate=${date}`);
      const fixturesData = await fixturesResponse.json();
      
      if (!fixturesData.fixtures || fixturesData.fixtures.length === 0) continue;
      
      const finishedFixtures = fixturesData.fixtures.filter(f => f.status === 'FT' && f.score);
      console.log(`  ✓ ${finishedFixtures.length} partite finite`);
      
      // Analizza TUTTE le partite per capire i pattern
      for (const fixture of finishedFixtures.slice(0, 10)) { // Prime 10 per velocità
        try {
          const recsResponse = await fetch(`${API_URL}/api/betting-recommendations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fixtureId: fixture.id,
              homeTeamId: fixture.homeTeam.id,
              awayTeamId: fixture.awayTeam.id,
              leagueId: fixture.league.id,
              seasonId: fixture.league.season,
              homeTeamName: fixture.homeTeam.name,
              awayTeamName: fixture.awayTeam.name,
              referenceDate: date
            })
          });
          
          if (recsResponse.ok) {
            const recsData = await recsResponse.json();
            
            if (recsData.recommendations && recsData.recommendations.length > 0) {
              for (const rec of recsData.recommendations) {
                // Verifica risultato
                const actualScore = `${fixture.score.home}-${fixture.score.away}`;
                const [homeScore, awayScore] = actualScore.split('-').map(Number);
                const totalGoals = homeScore + awayScore;
                
                let correct = false;
                const prediction = rec.prediction;
                
                // Logica di verifica semplificata
                if (prediction === '1') correct = homeScore > awayScore;
                else if (prediction === 'X') correct = homeScore === awayScore;
                else if (prediction === '2') correct = awayScore > homeScore;
                else if (prediction === '1X') correct = homeScore >= awayScore;
                else if (prediction === 'X2') correct = awayScore >= homeScore;
                else if (prediction === '12') correct = homeScore !== awayScore;
                else if (prediction.includes('OVER 2.5')) correct = totalGoals > 2.5;
                else if (prediction.includes('UNDER 2.5')) correct = totalGoals < 2.5;
                else if (prediction.includes('OVER 1.5')) correct = totalGoals > 1.5;
                else if (prediction.includes('UNDER 1.5')) correct = totalGoals < 1.5;
                
                allRecommendations.push({
                  match: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
                  prediction,
                  odds: rec.odds,
                  confidence: rec.confidence,
                  expectedValue: rec.expectedValue,
                  valueRating: rec.valueRating,
                  actualResult: actualScore,
                  correct,
                  league: fixture.league.name
                });
              }
            }
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          // Salta errori
        }
      }
    } catch (error) {
      console.error(`Errore ${date}:`, error.message);
    }
  }
  
  console.log(`\n📊 ANALISI COMPLETA - ${allRecommendations.length} raccomandazioni analizzate\n`);
  
  // 1. ANALISI PER TIPO DI SCOMMESSA
  console.log('🎯 ANALISI PER TIPO DI SCOMMESSA:');
  console.log('═══════════════════════════════════════════');
  
  const byType = {};
  allRecommendations.forEach(rec => {
    const type = rec.prediction;
    if (!byType[type]) byType[type] = { total: 0, correct: 0, totalOdds: 0 };
    byType[type].total++;
    if (rec.correct) byType[type].correct++;
    byType[type].totalOdds += rec.odds;
  });
  
  Object.entries(byType)
    .sort((a, b) => (b[1].correct / b[1].total) - (a[1].correct / a[1].total))
    .forEach(([type, stats]) => {
      const winRate = ((stats.correct / stats.total) * 100).toFixed(1);
      const avgOdds = (stats.totalOdds / stats.total).toFixed(2);
      const roi = ((stats.correct * stats.totalOdds / stats.total - stats.total) / stats.total * 100).toFixed(1);
      console.log(`${type.padEnd(15)} | Win: ${winRate}% (${stats.correct}/${stats.total}) | Avg Odds: ${avgOdds} | ROI: ${roi}%`);
    });
  
  // 2. ANALISI PER RANGE DI QUOTA
  console.log('\n💰 ANALISI PER RANGE DI QUOTA:');
  console.log('═══════════════════════════════════════');
  
  const oddsRanges = [
    { min: 1.1, max: 1.5, name: 'Basse (1.1-1.5)' },
    { min: 1.5, max: 2.0, name: 'Medie (1.5-2.0)' },
    { min: 2.0, max: 3.0, name: 'Alte (2.0-3.0)' },
    { min: 3.0, max: 10, name: 'Molto Alte (3.0+)' }
  ];
  
  oddsRanges.forEach(range => {
    const recs = allRecommendations.filter(r => r.odds >= range.min && r.odds < range.max);
    if (recs.length > 0) {
      const winRate = ((recs.filter(r => r.correct).length / recs.length) * 100).toFixed(1);
      const avgOdds = (recs.reduce((sum, r) => sum + r.odds, 0) / recs.length).toFixed(2);
      const correctOdds = recs.filter(r => r.correct).reduce((sum, r) => sum + r.odds, 0);
      const roi = ((correctOdds - recs.length) / recs.length * 100).toFixed(1);
      console.log(`${range.name.padEnd(20)} | Win: ${winRate}% (${recs.filter(r => r.correct).length}/${recs.length}) | Avg: ${avgOdds} | ROI: ${roi}%`);
    }
  });
  
  // 3. ANALISI PER CONFIDENCE
  console.log('\n🎯 ANALISI PER CONFIDENCE:');
  console.log('══════════════════════════════════════');
  
  const confRanges = [
    { min: 90, max: 100, name: 'Molto Alta (90%+)' },
    { min: 80, max: 90, name: 'Alta (80-90%)' },
    { min: 70, max: 80, name: 'Media (70-80%)' },
    { min: 0, max: 70, name: 'Bassa (<70%)' }
  ];
  
  confRanges.forEach(range => {
    const recs = allRecommendations.filter(r => r.confidence >= range.min && r.confidence < range.max);
    if (recs.length > 0) {
      const winRate = ((recs.filter(r => r.correct).length / recs.length) * 100).toFixed(1);
      const correctOdds = recs.filter(r => r.correct).reduce((sum, r) => sum + r.odds, 0);
      const roi = ((correctOdds - recs.length) / recs.length * 100).toFixed(1);
      console.log(`${range.name.padEnd(20)} | Win: ${winRate}% (${recs.filter(r => r.correct).length}/${recs.length}) | ROI: ${roi}%`);
    }
  });
  
  // 4. RACCOMANDAZIONI PER MIGLIORAMENTO
  console.log('\n🚀 RACCOMANDAZIONI PER MIGLIORARE ROI:');
  console.log('══════════════════════════════════════════════');
  
  const bestTypes = Object.entries(byType)
    .filter(([type, stats]) => stats.total >= 2) // Almeno 2 campioni
    .sort((a, b) => {
      const roiA = ((a[1].correct * a[1].totalOdds / a[1].total - a[1].total) / a[1].total);
      const roiB = ((b[1].correct * b[1].totalOdds / b[1].total - b[1].total) / b[1].total);
      return roiB - roiA;
    });
  
  console.log('1. FILTRARE PER TIPI DI SCOMMESSA PROFITTEVOLI:');
  bestTypes.slice(0, 3).forEach(([type, stats]) => {
    const roi = ((stats.correct * stats.totalOdds / stats.total - stats.total) / stats.total * 100).toFixed(1);
    if (parseFloat(roi) > 0) {
      console.log(`   ✅ Concentrarsi su: ${type} (ROI: +${roi}%)`);
    }
  });
  
  console.log('\n2. OTTIMIZZARE SOGLIE:');
  const highConfWinRate = allRecommendations.filter(r => r.confidence >= 85);
  if (highConfWinRate.length > 0) {
    const winRate = ((highConfWinRate.filter(r => r.correct).length / highConfWinRate.length) * 100).toFixed(1);
    console.log(`   ✅ Aumentare soglia confidence a 85%+ (Win Rate: ${winRate}%)`);
  }
  
  const optimalOdds = allRecommendations.filter(r => r.odds >= 1.6 && r.odds <= 2.5);
  if (optimalOdds.length > 0) {
    const winRate = ((optimalOdds.filter(r => r.correct).length / optimalOdds.length) * 100).toFixed(1);
    console.log(`   ✅ Concentrarsi su quote 1.6-2.5 (Win Rate: ${winRate}%)`);
  }
  
  console.log('\n3. STRATEGIE AVANZATE:');
  console.log('   🎯 Implementare Kelly Criterion più aggressivo');
  console.log('   📊 Aggiungere filtri per campionati specifici');
  console.log('   🕐 Considerare timing delle scommesse (pre-match vs live)');
  console.log('   💰 Aumentare EV threshold da 7% a 10-15%');
  console.log('   🔄 Implementare multiple più intelligenti (correlation betting)');
  
}

// Esegui analisi
analyzeROIImprovement().catch(console.error);