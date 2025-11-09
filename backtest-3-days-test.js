const moment = require('moment-timezone');

// Configurazione
const API_URL = 'http://localhost:3001'; // Porta corretta del backend
const DAYS_TO_TEST = 3; // Ultimi 3 giorni

// Colori per console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Funzione per verificare risultato di una predizione
function checkPrediction(prediction, homeScore, awayScore) {
  const totalGoals = homeScore + awayScore;
  const predLower = prediction.toLowerCase();
  
  if (prediction === '1') return homeScore > awayScore;
  if (prediction === 'X') return homeScore === awayScore;
  if (prediction === '2') return awayScore > homeScore;
  if (prediction === '1X') return homeScore >= awayScore;
  if (prediction === 'X2') return awayScore >= homeScore;
  if (prediction === '12') return homeScore !== awayScore;
  
  // Goal/NoGoal
  if (predLower.includes('gg') || predLower === 'goal') {
    return homeScore > 0 && awayScore > 0;
  }
  if (predLower.includes('ng') || predLower === 'no goal') {
    return homeScore === 0 || awayScore === 0;
  }
  
  // Over/Under
  if (predLower.includes('over')) {
    if (predLower.includes('0.5')) return totalGoals > 0.5;
    if (predLower.includes('1.5')) return totalGoals > 1.5;
    if (predLower.includes('2.5')) return totalGoals > 2.5;
    if (predLower.includes('3.5')) return totalGoals > 3.5;
  }
  if (predLower.includes('under')) {
    if (predLower.includes('0.5')) return totalGoals < 0.5;
    if (predLower.includes('1.5')) return totalGoals < 1.5;
    if (predLower.includes('2.5')) return totalGoals < 2.5;
    if (predLower.includes('3.5')) return totalGoals < 3.5;
  }
  
  return false; // Default: predizione non riconosciuta
}

// Funzione per testare un singolo giorno
async function testDate(date) {
  console.log(`\n${colors.cyan}📅 Testing ${date}...${colors.reset}`);
  
  try {
    // Carica partite del giorno da Sportsmonks
    const fixturesResponse = await fetch(`${API_URL}/api/fixtures/sm/range?startDate=${date}&endDate=${date}`);
    
    if (!fixturesResponse.ok) {
      console.log(`  ${colors.red}❌ Errore API fixtures: ${fixturesResponse.status}${colors.reset}`);
      return { date, tested: 0, withRecs: 0, wins: 0, losses: 0 };
    }
    
    const fixturesData = await fixturesResponse.json();
    
    if (!fixturesData.fixtures || fixturesData.fixtures.length === 0) {
      console.log(`  ⚠️  Nessuna partita trovata`);
      return { date, tested: 0, withRecs: 0, wins: 0, losses: 0 };
    }
    
    // Filtra solo partite finite (FT = Full Time)
    const finishedFixtures = fixturesData.fixtures.filter(f => 
      (f.status === 'FT' || f.state?.short === 'FT') && f.score
    );
    
    console.log(`  ✓ ${fixturesData.fixtures.length} partite totali, ${finishedFixtures.length} finite`);
    
    if (finishedFixtures.length === 0) {
      console.log(`  ⚠️  Nessuna partita finita`);
      return { date, tested: 0, withRecs: 0, wins: 0, losses: 0 };
    }
    
    // Test ogni partita (limita a 15 per velocità)
    const matchesToTest = finishedFixtures.slice(0, 15);
    let tested = 0;
    let withRecs = 0;
    let wins = 0;
    let losses = 0;
    const results = [];
    
    for (const fixture of matchesToTest) {
      const homeTeamId = fixture.homeTeam?.id || fixture.participants?.find(p => p.meta?.location === 'home')?.id;
      const awayTeamId = fixture.awayTeam?.id || fixture.participants?.find(p => p.meta?.location === 'away')?.id;
      const homeTeamName = fixture.homeTeam?.name || fixture.participants?.find(p => p.meta?.location === 'home')?.name || 'Home';
      const awayTeamName = fixture.awayTeam?.name || fixture.participants?.find(p => p.meta?.location === 'away')?.name || 'Away';
      
      if (!homeTeamId || !awayTeamId) continue;
      
      tested++;
      
      try {
        // Chiama API raccomandazioni
        const recsResponse = await fetch(`${API_URL}/api/betting-recommendations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fixtureId: fixture.id,
            homeTeamId,
            awayTeamId,
            homeTeamName,
            awayTeamName
          })
        });
        
        if (!recsResponse.ok) {
          console.log(`  ⚠️  ${homeTeamName} vs ${awayTeamName}: API error ${recsResponse.status}`);
          continue;
        }
        
        const recsData = await recsResponse.json();
        
        // Verifica se ci sono raccomandazioni
        if (!recsData.topPicks || recsData.topPicks.length === 0) {
          console.log(`  ⚠️  ${homeTeamName} vs ${awayTeamName}: Nessuna raccomandazione generata`);
          
          // Mostra raccomandazioni filtrate se disponibili
          if (recsData.filteredRecommendations && recsData.filteredRecommendations.length > 0) {
            console.log(`     🔍 ${recsData.filteredRecommendations.length} raccomandazioni scartate:`);
            const filterBreakdown = {};
            recsData.filteredRecommendations.forEach(f => {
              filterBreakdown[f.filterType] = (filterBreakdown[f.filterType] || 0) + 1;
            });
            Object.entries(filterBreakdown).forEach(([type, count]) => {
              console.log(`        - ${type}: ${count}`);
            });
            
            // Mostra top 2 scartate per EV
            const topFiltered = recsData.filteredRecommendations
              .filter(f => f.filterType === 'ev_too_low')
              .sort((a, b) => b.recommendation.expectedValue - a.recommendation.expectedValue)
              .slice(0, 2);
            
            if (topFiltered.length > 0) {
              console.log(`     Top scartate per EV:`);
              topFiltered.forEach(f => {
                const ev = (f.recommendation.expectedValue * 100).toFixed(1);
                const conf = f.recommendation.confidence.toFixed(0);
                console.log(`        - ${f.recommendation.name}: EV ${ev}%, Conf ${conf}%`);
              });
            }
          }
          
          continue;
        }
        
        withRecs++;
        
        // Prendi la migliore raccomandazione
        const topRec = recsData.topPicks[0];
        
        // Estrai score dalla fixture
        const homeScore = fixture.score?.home || fixture.scores?.find(s => s.description === 'CURRENT')?.score?.participant === 'home' ? 
                         fixture.scores.find(s => s.description === 'CURRENT').score.goals : 0;
        const awayScore = fixture.score?.away || fixture.scores?.find(s => s.description === 'CURRENT')?.score?.participant === 'away' ? 
                         fixture.scores.find(s => s.description === 'CURRENT').score.goals : 0;
        
        // Verifica risultato
        const isCorrect = checkPrediction(topRec.prediction, homeScore, awayScore);
        
        if (isCorrect) {
          wins++;
          console.log(`  ${colors.green}✅ ${homeTeamName} vs ${awayTeamName} (${homeScore}-${awayScore})${colors.reset}`);
        } else {
          losses++;
          console.log(`  ${colors.red}❌ ${homeTeamName} vs ${awayTeamName} (${homeScore}-${awayScore})${colors.reset}`);
        }
        
        const ev = (topRec.expectedValue * 100).toFixed(1);
        const conf = topRec.confidence.toFixed(0);
        console.log(`     ${topRec.name} @ ${topRec.odds.toFixed(2)} | ${topRec.valueRating}⭐ | EV ${ev}% | Conf ${conf}%`);
        
        results.push({
          match: `${homeTeamName} vs ${awayTeamName}`,
          score: `${homeScore}-${awayScore}`,
          recommendation: topRec.name,
          prediction: topRec.prediction,
          odds: topRec.odds,
          rating: topRec.valueRating,
          ev,
          confidence: conf,
          result: isCorrect ? 'WIN' : 'LOSS'
        });
        
      } catch (error) {
        console.log(`  ${colors.red}❌ ${homeTeamName} vs ${awayTeamName}: ${error.message}${colors.reset}`);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log(`\n  ${colors.bright}Summary: ${tested} tested, ${withRecs} with recs (${(withRecs/tested*100).toFixed(1)}%), ${wins}W/${losses}L${colors.reset}`);
    
    return { date, tested, withRecs, wins, losses, results };
    
  } catch (error) {
    console.error(`  ${colors.red}❌ Errore: ${error.message}${colors.reset}`);
    return { date, tested: 0, withRecs: 0, wins: 0, losses: 0 };
  }
}

// Funzione principale
async function runBacktest() {
  console.log(`${colors.bright}${colors.blue}`);
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║       BACKTEST ULTIMI 3 GIORNI - NUOVE MODIFICHE      ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(colors.reset);
  
  console.log(`\n🔧 Modifiche testate:`);
  console.log(`   ✓ Goal/NoGoal disabilitato`);
  console.log(`   ✓ Filtro EV abbassato a 9.5%`);
  console.log(`   ✓ Logging dettagliato raccomandazioni filtrate\n`);
  
  // Verifica connessione API
  try {
    console.log(`🔌 Verifica connessione a ${API_URL}...`);
    const healthCheck = await fetch(`${API_URL}/health`).catch(() => null);
    if (!healthCheck || !healthCheck.ok) {
      console.log(`${colors.red}❌ Backend non raggiungibile su ${API_URL}${colors.reset}`);
      console.log(`${colors.yellow}💡 Assicurati che il backend sia avviato con 'npm run dev'${colors.reset}`);
      return;
    }
    console.log(`${colors.green}✅ Backend connesso${colors.reset}\n`);
  } catch (error) {
    console.log(`${colors.red}❌ Impossibile connettersi al backend${colors.reset}`);
    return;
  }
  
  // Genera date degli ultimi 3 giorni
  const dates = [];
  for (let i = DAYS_TO_TEST - 1; i >= 0; i--) {
    dates.push(moment().subtract(i, 'days').format('YYYY-MM-DD'));
  }
  
  console.log(`📅 Date da testare: ${dates.join(', ')}\n`);
  
  // Test ogni giorno
  const allResults = [];
  for (const date of dates) {
    const result = await testDate(date);
    allResults.push(result);
  }
  
  // Report finale
  console.log(`\n${colors.bright}${colors.blue}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}                   REPORT FINALE${colors.reset}`);
  console.log(`${colors.blue}═══════════════════════════════════════════════════════${colors.reset}\n`);
  
  const totalTested = allResults.reduce((sum, r) => sum + r.tested, 0);
  const totalWithRecs = allResults.reduce((sum, r) => sum + r.withRecs, 0);
  const totalWins = allResults.reduce((sum, r) => sum + r.wins, 0);
  const totalLosses = allResults.reduce((sum, r) => sum + r.losses, 0);
  
  const coverage = totalTested > 0 ? (totalWithRecs / totalTested * 100).toFixed(1) : 0;
  const winRate = totalWithRecs > 0 ? (totalWins / totalWithRecs * 100).toFixed(1) : 0;
  
  console.log(`📊 ${colors.bright}Partite testate:${colors.reset} ${totalTested}`);
  console.log(`📈 ${colors.bright}Con raccomandazioni:${colors.reset} ${totalWithRecs} (${coverage}%)`);
  console.log(`${colors.green}✅ Vinte: ${totalWins}${colors.reset}`);
  console.log(`${colors.red}❌ Perse: ${totalLosses}${colors.reset}`);
  console.log(`🎯 ${colors.bright}Win Rate: ${winRate}%${colors.reset}\n`);
  
  // Analisi copertura
  console.log(`${colors.bright}${colors.yellow}💡 ANALISI COPERTURA${colors.reset}\n`);
  
  const previousCoverage = 46.4; // Dal backtest mensile precedente
  const currentCoverage = parseFloat(coverage);
  
  console.log(`   Copertura precedente: ${previousCoverage}%`);
  console.log(`   Copertura attuale: ${currentCoverage}%`);
  
  if (currentCoverage > previousCoverage) {
    const improvement = (currentCoverage - previousCoverage).toFixed(1);
    console.log(`   ${colors.green}✅ Miglioramento: +${improvement}%${colors.reset}`);
  } else if (currentCoverage < previousCoverage) {
    const decline = (previousCoverage - currentCoverage).toFixed(1);
    console.log(`   ${colors.yellow}⚠️  Calo: -${decline}%${colors.reset}`);
  } else {
    console.log(`   ${colors.cyan}➡️  Invariata${colors.reset}`);
  }
  
  // Analisi Win Rate
  console.log(`\n${colors.bright}${colors.yellow}💡 ANALISI WIN RATE${colors.reset}\n`);
  
  const previousWR = 72.6; // Dal backtest mensile precedente
  const currentWR = parseFloat(winRate);
  
  console.log(`   Win Rate precedente: ${previousWR}%`);
  console.log(`   Win Rate attuale: ${currentWR}%`);
  
  if (currentWR >= previousWR) {
    console.log(`   ${colors.green}✅ Mantenuto o migliorato${colors.reset}`);
  } else if (currentWR >= previousWR - 5) {
    console.log(`   ${colors.yellow}⚠️  Leggero calo accettabile (< 5%)${colors.reset}`);
  } else {
    console.log(`   ${colors.red}❌ Calo significativo (> 5%)${colors.reset}`);
  }
  
  // Conclusione
  console.log(`\n${colors.bright}${colors.cyan}📝 CONCLUSIONE${colors.reset}\n`);
  
  if (currentWR >= 70 && currentCoverage >= 45) {
    console.log(`${colors.green}✅ Modifiche validate con successo!${colors.reset}`);
    console.log(`   • Win Rate: ${currentWR}% (target: 70%+) ✓`);
    console.log(`   • Copertura: ${currentCoverage}% (target: 70%+) - in progress`);
  } else if (currentWR >= 65) {
    console.log(`${colors.yellow}⚠️  Risultati accettabili, ma migliorabili${colors.reset}`);
    console.log(`   • Win Rate: ${currentWR}% (target: 70%+)`);
    console.log(`   • Copertura: ${currentCoverage}% (target: 70%+)`);
  } else {
    console.log(`${colors.red}❌ Risultati sotto le aspettative${colors.reset}`);
    console.log(`   • Win Rate: ${currentWR}% (target: 70%+) ✗`);
    console.log(`   • Copertura: ${currentCoverage}% (target: 70%+)`);
  }
  
  console.log(`\n${colors.bright}Prossimi passi consigliati:${colors.reset}`);
  if (currentCoverage < 50) {
    console.log(`   1. Analizzare in dettaglio le raccomandazioni filtrate`);
    console.log(`   2. Considerare ulteriore allentamento filtri (EV 9% o tier 4⭐)`);
  }
  if (currentWR < 70) {
    console.log(`   1. Verificare quali mercati hanno WR più basso`);
    console.log(`   2. Ottimizzare soglie confidence per mercati specifici`);
  }
  if (totalWithRecs > 0) {
    console.log(`   3. Eseguire backtest mensile completo per validazione statistica`);
  }
}

// Esegui backtest
runBacktest().catch(error => {
  console.error(`\n${colors.red}❌ Errore fatale: ${error.message}${colors.reset}`);
  console.error(error.stack);
});
