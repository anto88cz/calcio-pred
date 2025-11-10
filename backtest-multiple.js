const moment = require('moment-timezone');

// Configurazione
const API_URL = process.env.API_URL || 'http://localhost:3000';
const INITIAL_CAPITAL = 200; // €200 iniziali
const STAKE_PERCENTAGE = 0.20; // 20% del capitale
const TARGET_ODDS = 2.0; // Target quota ottimale (centro del range espanso)
const MIN_ODDS = 1.5; // Minimo accettabile (range dinamico)
const MAX_ODDS = 2.5; // Massimo accettabile (range dinamico espanso)

// BACKTESTING ULTIMI 60 GIORNI - STAGIONE 2025/2026
const BACKTESTING_DAYS = 60; // Test completo 60 giorni per validazione statistica
const API_DELAY = 1500; // 1.5 secondi tra chiamate API (ottimizzato dopo fix data leakage)
const FIXTURES_PER_DAY = 3; // Max 3 partite per giorno
const DAYS_PER_BATCH = 10; // Batch ogni 10 giorni per monitoraggio

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

// Funzione per calcolare score di una raccomandazione
function calculateScore(rec) {
  const valueRating = rec.valueRating || rec.value || 0;
  const confidence = (rec.confidence || 0) > 1 ? rec.confidence : (rec.confidence || 0) * 100;
  const expectedValue = (rec.expectedValue || 0) > 1 ? rec.expectedValue : (rec.expectedValue || 0) * 100;
  const oddsBonus = rec.odds >= 1.5 && rec.odds <= 3.0 ? 10 : 0;
  
  return valueRating * 0.4 + confidence * 0.3 + expectedValue * 0.2 + oddsBonus;
}

// Funzione per generare multipla automatica
async function generateMultipleForDate(date) {
  console.log(`\n${colors.cyan}📅 Elaborazione ${date}...${colors.reset}`);
  
  try {
    console.log(`  ⏳ Caricamento partite del ${date}...`);
    
    // 1. Carica partite del giorno con rate limiting
    const fixturesResponse = await fetch(`${API_URL}/api/fixtures/sm/range?startDate=${date}&endDate=${date}`);
    const fixturesData = await fixturesResponse.json();
    
    if (!fixturesData.fixtures || fixturesData.fixtures.length === 0) {
      console.log(`  ⚠️  Nessuna partita trovata per ${date}`);
      return null;
    }
    
    console.log(`  ✓ ${fixturesData.fixtures.length} partite trovate`);
    console.log(`  ⏳ Attesa ${API_DELAY/1000}s prima delle raccomandazioni...`);
    
    // Rate limiting OBBLIGATORIO dopo ogni chiamata API
    await new Promise(resolve => setTimeout(resolve, API_DELAY));
    
    // Filtra solo partite finite
    const finishedFixtures = fixturesData.fixtures.filter(f => f.status === 'FT' && f.score);
    console.log(`  ✓ ${finishedFixtures.length} partite finite`);
    
    if (finishedFixtures.length === 0) {
      console.log(`  ⚠️  Nessuna partita finita per ${date}`);
      return null;
    }
    
    // Limita drasticamente le partite per evitare rate limiting
    const limitedFixtures = finishedFixtures.slice(0, FIXTURES_PER_DAY);
    
    console.log(`  🎯 Analizzando ${limitedFixtures.length} partite (max ${FIXTURES_PER_DAY})`);
    
    // 2. Per ogni partita, carica raccomandazioni SEQUENZIALMENTE
    const allEvents = [];
    let processedCount = 0;
    
    for (const fixture of limitedFixtures) {
      processedCount++;
      console.log(`  ⏳ [${processedCount}/${limitedFixtures.length}] ${fixture.homeTeam?.name} vs ${fixture.awayTeam?.name}`);
      
      const homeTeamId = fixture.homeTeam?.id;
      const awayTeamId = fixture.awayTeam?.id;
      const leagueId = fixture.league?.id;
      const seasonId = fixture.league?.season;
      
      if (!homeTeamId || !awayTeamId || !leagueId || !seasonId) {
        continue;
      }
      
      try {
        const recsResponse = await fetch(`${API_URL}/api/betting-recommendations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fixtureId: fixture.id,
            homeTeamId,
            awayTeamId,
            leagueId,
            seasonId,
            homeTeamName: fixture.homeTeam.name,
            awayTeamName: fixture.awayTeam.name,
            referenceDate: date  // ← AGGIUNTO: Data di riferimento per backtest
          })
        });
        
        if (!recsResponse.ok) {
          console.log(`    ❌ Errore HTTP ${recsResponse.status} per ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`);
          // Rate limiting anche in caso di errore
          await new Promise(resolve => setTimeout(resolve, API_DELAY));
          continue;
        }
        
        const recsData = await recsResponse.json();
        
        if (recsData.recommendations && recsData.recommendations.length > 0) {
          // Normalizza confidence e expectedValue
          const normalizedRecs = recsData.recommendations.map(rec => {
            const confidence = (rec.confidence || 0) > 1 ? rec.confidence : (rec.confidence || 0) * 100;
            const expectedValue = (rec.expectedValue || 0) > 1 ? rec.expectedValue : (rec.expectedValue || 0) * 100;
            return {
              ...rec,
              confidence,
              expectedValue
            };
          });
          
          // Calcola score per ogni raccomandazione e prendi la migliore
          const bestRec = normalizedRecs
            .map(rec => ({
              ...rec,
              score: calculateScore(rec)
            }))
            .sort((a, b) => b.score - a.score)[0];
          
          allEvents.push({
            fixture,
            recommendation: bestRec,
            actualResult: `${fixture.score.home}-${fixture.score.away}` // formato "2-1"
          });
          console.log(`    ✅ Raccomandazione trovata: ${bestRec.prediction} @${bestRec.odds}`);
        } else {
          console.log(`    ⚠️  Nessuna raccomandazione valida`);
        }
      } catch (error) {
        console.log(`    ❌ Errore: ${error.message}`);
      }
      
      // Rate limiting OBBLIGATORIO dopo ogni chiamata (successo o errore)
      console.log(`    ⏳ Pausa ${API_DELAY/1000}s prima della prossima chiamata...`);
      await new Promise(resolve => setTimeout(resolve, API_DELAY));
    }
    
    if (allEvents.length === 0) {
      console.log(`  ⚠️  Nessun evento con raccomandazioni valide`);
      return null;
    }
    
    console.log(`  ✓ ${allEvents.length} eventi con raccomandazioni valide`);
    
    // 3. Ordina per score e seleziona i migliori
    allEvents.sort((a, b) => b.recommendation.score - a.recommendation.score);
    
    // 4. STRATEGIA RANGE DINAMICO 1.5-2.0: Preferisce quote più conservative
    let bestMultiple = null;
    let bestScore = -1; // Usa score invece di diff per ottimizzazione intelligente
    
    // Prova con 1 partita sola - Preferisce eventi di alta qualità nel range
    for (const event of allEvents) {
      const odds = event.recommendation.odds;
      if (odds >= MIN_ODDS && odds <= MAX_ODDS) {
        // Score composito: favorisce quote vicine a 1.75 + qualità raccomandazione
        const oddsScore = 1 - Math.abs(odds - TARGET_ODDS) / TARGET_ODDS; // Più vicino a 1.75 = meglio
        const qualityScore = event.recommendation.score / 100; // Normalizza score
        const finalScore = oddsScore * 0.6 + qualityScore * 0.4; // 60% odds, 40% qualità
        
        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestMultiple = {
            events: [event],
            odds: odds,
            score: finalScore
          };
        }
      }
    }
    
    // Prova con 2 partite - Solo se non hai trovato singoli di qualità
    if (bestScore < 0.7) { // Solo se singolo non è eccellente
      for (let i = 0; i < Math.min(allEvents.length, 8); i++) {
        for (let j = i + 1; j < Math.min(allEvents.length, 12); j++) {
          // Verifica che non siano della stessa partita
          if (allEvents[i].fixture.id === allEvents[j].fixture.id) continue;
          
          const combinedOdds = allEvents[i].recommendation.odds * allEvents[j].recommendation.odds;
          
          if (combinedOdds >= MIN_ODDS && combinedOdds <= MAX_ODDS) {
            // Score per multiple: penalizza rischio aggiuntivo
            const oddsScore = 1 - Math.abs(combinedOdds - TARGET_ODDS) / TARGET_ODDS;
            const avgQuality = (allEvents[i].recommendation.score + allEvents[j].recommendation.score) / 200;
            const riskPenalty = 0.85; // 15% penalità per il rischio aggiunto della multipla
            const finalScore = (oddsScore * 0.6 + avgQuality * 0.4) * riskPenalty;
            
            if (finalScore > bestScore) {
              bestScore = finalScore;
              bestMultiple = {
                events: [allEvents[i], allEvents[j]],
                odds: combinedOdds,
                score: finalScore
              };
            }
          }
        }
      }
    }
    
    // Prova con 3 partite (solo se non abbiamo trovato nulla di molto buono)
    if (bestScore < 0.6) { // Solo se non hai trovato nulla di decente
      for (let i = 0; i < Math.min(allEvents.length, 8); i++) {
        for (let j = i + 1; j < Math.min(allEvents.length, 10); j++) {
          for (let k = j + 1; k < Math.min(allEvents.length, 12); k++) {
            // Verifica che non siano della stessa partita
            if (allEvents[i].fixture.id === allEvents[j].fixture.id ||
                allEvents[i].fixture.id === allEvents[k].fixture.id ||
                allEvents[j].fixture.id === allEvents[k].fixture.id) continue;
            
            const combinedOdds = allEvents[i].recommendation.odds * 
                                allEvents[j].recommendation.odds * 
                                allEvents[k].recommendation.odds;
            
            if (combinedOdds >= MIN_ODDS && combinedOdds <= MAX_ODDS) {
              // Score per triple: forte penalità per il rischio elevato
              const oddsScore = 1 - Math.abs(combinedOdds - TARGET_ODDS) / TARGET_ODDS;
              const avgQuality = (allEvents[i].recommendation.score + 
                                allEvents[j].recommendation.score + 
                                allEvents[k].recommendation.score) / 300;
              const riskPenalty = 0.7; // 30% penalità per rischio molto alto
              const finalScore = (oddsScore * 0.6 + avgQuality * 0.4) * riskPenalty;
              
              if (finalScore > bestScore) {
                bestScore = finalScore;
                bestMultiple = {
                  events: [allEvents[i], allEvents[j], allEvents[k]],
                  odds: combinedOdds,
                  score: finalScore
                };
              }
            }
          }
        }
      }
    }
    
    if (!bestMultiple) {
      console.log(`  ⚠️  Nessuna multipla di qualità trovata nel range ${MIN_ODDS}-${MAX_ODDS}`);
      return null;
    }
    
    const selectedEvents = bestMultiple.events;
    const finalOdds = bestMultiple.odds;
    const qualityScore = bestMultiple.score;
    
    console.log(`  ${colors.bright}📊 Multipla generata: ${selectedEvents.length} eventi, quota ${finalOdds.toFixed(2)} (score: ${(qualityScore*100).toFixed(1)}%)${colors.reset}`);
    
    // 5. Verifica risultato di ogni evento
    const results = selectedEvents.map(event => {
      const prediction = event.recommendation.prediction;
      const actualScore = event.actualResult;
      const [homeScore, awayScore] = actualScore.split('-').map(Number);
      const totalGoals = homeScore + awayScore;
      
      let correct = false;
      
      // Verifica in base al tipo di predizione
      const predLower = prediction.toLowerCase();
      
      if (prediction === '1') {
        correct = homeScore > awayScore;
      } else if (prediction === 'X') {
        correct = homeScore === awayScore;
      } else if (prediction === '2') {
        correct = awayScore > homeScore;
      } else if (prediction === '1X') {
        correct = homeScore >= awayScore;
      } else if (prediction === 'X2') {
        correct = awayScore >= homeScore;
      } else if (prediction === '12') {
        correct = homeScore !== awayScore;
      } else if (predLower.includes('gg') || predLower === 'goal') {
        // Goal/Goal o GG (entrambe segnano)
        correct = homeScore > 0 && awayScore > 0;
      } else if (predLower.includes('ng') || predLower === 'no goal') {
        // No Goal (almeno una squadra non segna)
        correct = homeScore === 0 || awayScore === 0;
      } else if (predLower.includes('over')) {
        // Over X.5
        if (predLower.includes('0.5')) {
          correct = totalGoals > 0.5;
        } else if (predLower.includes('1.5')) {
          correct = totalGoals > 1.5;
        } else if (predLower.includes('2.5')) {
          correct = totalGoals > 2.5;
        } else if (predLower.includes('3.5')) {
          correct = totalGoals > 3.5;
        }
      } else if (predLower.includes('under')) {
        // Under X.5
        if (predLower.includes('0.5')) {
          correct = totalGoals < 0.5;
        } else if (predLower.includes('1.5')) {
          correct = totalGoals < 1.5;
        } else if (predLower.includes('2.5')) {
          correct = totalGoals < 2.5;
        } else if (predLower.includes('3.5')) {
          correct = totalGoals < 3.5;
        }
      } else if (predLower.includes('casa') || predLower.includes('home')) {
        // Goal range casa (es: "1-3 CASA" = tra 1 e 3 gol della casa)
        const match = prediction.match(/(\d+)-(\d+)/);
        if (match) {
          const min = parseInt(match[1]);
          const max = parseInt(match[2]);
          correct = homeScore >= min && homeScore <= max;
        }
      } else if (predLower.includes('trasferta') || predLower.includes('away')) {
        // Goal range trasferta (es: "1-3 TRASFERTA" = tra 1 e 3 gol della trasferta)
        const match = prediction.match(/(\d+)-(\d+)/);
        if (match) {
          const min = parseInt(match[1]);
          const max = parseInt(match[2]);
          correct = awayScore >= min && awayScore <= max;
        }
      } else if (predLower.includes('match') || predLower.includes('totale')) {
        // Goal range match (es: "2-5 MATCH" = tra 2 e 5 gol totali)
        const match = prediction.match(/(\d+)-(\d+)/);
        if (match) {
          const min = parseInt(match[1]);
          const max = parseInt(match[2]);
          correct = totalGoals >= min && totalGoals <= max;
        }
      } else {
        // Prova interpretazione generica come range gol totali
        const match = prediction.match(/(\d+)-(\d+)/);
        if (match) {
          const min = parseInt(match[1]);
          const max = parseInt(match[2]);
          correct = totalGoals >= min && totalGoals <= max;
        }
      }
      
      return {
        fixture: `${event.fixture.homeTeam.name} vs ${event.fixture.awayTeam.name}`,
        prediction,
        odds: event.recommendation.odds,
        actualScore,
        correct
      };
    });
    
    const allCorrect = results.every(r => r.correct);
    
    return {
      date,
      events: results,
      totalOdds: finalOdds,
      won: allCorrect
    };
    
  } catch (error) {
    console.error(`  ${colors.red}❌ Errore: ${error.message}${colors.reset}`);
    return null;
  }
}

// Funzione principale di backtesting
async function runBacktest() {
  console.log(`${colors.bright}${colors.blue}`);
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║      BACKTESTING RANGE 1.5-2.5 - TEST ESPANSO         ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(colors.reset);
  
  console.log(`💰 Capitale iniziale: €${INITIAL_CAPITAL}`);
  console.log(`📊 Stake per schedina: ${(STAKE_PERCENTAGE * 100)}% del capitale`);
  console.log(`🎯 Target quota: ${TARGET_ODDS}x (range dinamico ESPANSO: ${MIN_ODDS}-${MAX_ODDS})`);
  console.log(`🏆 Eventi per multipla: 1-3 partite (esplorando quote più alte)`);
  console.log(`📅 Periodo: ULTIMI ${BACKTESTING_DAYS} GIORNI - VALIDAZIONE COMPLETA (Stagione 2025/2026)`);
  console.log(`⏱️  Rate limiting: ${API_DELAY/1000}s tra ogni chiamata API`);
  console.log(`🎯 Max partite/giorno: ${FIXTURES_PER_DAY}`);
  console.log(`📦 Batch processing: ${DAYS_PER_BATCH} giorni per volta\n`);
  
  const results = [];
  let currentCapital = INITIAL_CAPITAL;
  
  // Genera date degli ultimi 60 giorni (fino a ieri)
  const dates = [];
  for (let i = BACKTESTING_DAYS - 1; i >= 0; i--) {
    const date = moment().subtract(i + 1, 'days').format('YYYY-MM-DD'); // +1 per escludere oggi
    dates.push(date);
  }
  
  const startAnalysisDate = dates[0];
  const endAnalysisDate = dates[dates.length - 1];
  
  console.log(`📊 Totale giorni da analizzare: ${dates.length}`);
  console.log(`📅 Periodo effettivo: ${startAnalysisDate} → ${endAnalysisDate}`);
  console.log(`🎯 Stima chiamate API: ~${dates.length * (1 + FIXTURES_PER_DAY)} (circa ${((dates.length * (1 + FIXTURES_PER_DAY) * API_DELAY) / 1000 / 60).toFixed(0)} minuti)`);
  console.log(`⚡ Tempo stimato completamento: ${new Date(Date.now() + (dates.length * (1 + FIXTURES_PER_DAY) * API_DELAY)).toLocaleTimeString()}\n`);
  
  // Elabora ogni giorno con batch processing per monitoraggio
  let processedDays = 0;
  
  for (const date of dates) {
    processedDays++;
    const progress = ((processedDays / dates.length) * 100).toFixed(1);
    
    console.log(`\n${colors.bright}[${processedDays}/${dates.length}] Progresso: ${progress}%${colors.reset}`);
    
    const multiple = await generateMultipleForDate(date);
    
    if (multiple) {
      const stake = currentCapital * STAKE_PERCENTAGE;
      const potentialWin = stake * multiple.totalOdds;
      const profit = multiple.won ? potentialWin - stake : -stake;
      
      currentCapital += profit;
      
      results.push({
        ...multiple,
        stake,
        potentialWin,
        profit,
        capitalAfter: currentCapital
      });
      
      const statusIcon = multiple.won ? '✅' : '❌';
      const statusColor = multiple.won ? colors.green : colors.red;
      console.log(`  ${statusIcon} ${statusColor}${multiple.won ? 'VINTA' : 'PERSA'}${colors.reset} - Stake: €${stake.toFixed(2)} | Quota: ${multiple.totalOdds.toFixed(2)} | Profit: ${colors.bright}${profit >= 0 ? '+' : ''}€${profit.toFixed(2)}${colors.reset} | Capitale: €${currentCapital.toFixed(2)}`);
      
      // Mostra dettaglio eventi
      multiple.events.forEach(evt => {
        const icon = evt.correct ? '✓' : '✗';
        const color = evt.correct ? colors.green : colors.red;
        console.log(`    ${color}${icon}${colors.reset} ${evt.fixture}: ${evt.prediction} @${evt.odds.toFixed(2)} (${evt.actualScore})`);
      });
    }
    
    // Salvataggio intermedio ogni 10 giorni
    if (processedDays % DAYS_PER_BATCH === 0) {
      const batchWinRate = results.length > 0 ? (results.filter(r => r.won).length / results.length * 100).toFixed(1) : 0;
      const batchProfit = currentCapital - INITIAL_CAPITAL;
      console.log(`\n${colors.cyan}📊 BATCH REPORT (${processedDays}/${dates.length} giorni):${colors.reset}`);
      console.log(`💰 Capitale: €${currentCapital.toFixed(2)} (${batchProfit >= 0 ? '+' : ''}€${batchProfit.toFixed(2)})`);
      console.log(`🏆 Multiple: ${results.length} | Win Rate: ${batchWinRate}%`);
      console.log(`⏱️  Tempo stimato rimanente: ${(((dates.length - processedDays) * (1 + FIXTURES_PER_DAY) * API_DELAY) / 1000 / 60).toFixed(0)} minuti\n`);
    }
    
    // Rate limiting tra giorni
    await new Promise(resolve => setTimeout(resolve, API_DELAY));
  }
  
  // Genera report finale
  console.log(`\n${colors.bright}${colors.blue}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}                   REPORT FINALE${colors.reset}`);
  console.log(`${colors.blue}═══════════════════════════════════════════════════════${colors.reset}\n`);
  
  const totalMultiples = results.length;
  const wonMultiples = results.filter(r => r.won).length;
  const lostMultiples = totalMultiples - wonMultiples;
  const winRate = totalMultiples > 0 ? (wonMultiples / totalMultiples) * 100 : 0;
  
  const totalStaked = results.reduce((sum, r) => sum + r.stake, 0);
  const totalWon = results.filter(r => r.won).reduce((sum, r) => sum + r.potentialWin, 0);
  const totalProfit = currentCapital - INITIAL_CAPITAL;
  const roi = ((totalProfit / INITIAL_CAPITAL) * 100);
  
  console.log(`📊 ${colors.bright}Multiple giocate:${colors.reset} ${totalMultiples}`);
  console.log(`${colors.green}✅ Vinte: ${wonMultiples}${colors.reset}`);
  console.log(`${colors.red}❌ Perse: ${lostMultiples}${colors.reset}`);
  console.log(`📈 ${colors.bright}Win Rate: ${winRate.toFixed(1)}%${colors.reset}\n`);
  
  console.log(`💵 Capitale iniziale: €${INITIAL_CAPITAL.toFixed(2)}`);
  console.log(`💰 ${colors.bright}Capitale finale: €${currentCapital.toFixed(2)}${colors.reset}`);
  console.log(`${totalProfit >= 0 ? colors.green : colors.red}${totalProfit >= 0 ? '📈' : '📉'} Profitto/Perdita: ${totalProfit >= 0 ? '+' : ''}€${totalProfit.toFixed(2)}${colors.reset}`);
  console.log(`📊 ROI: ${colors.bright}${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%${colors.reset}\n`);
  
  console.log(`💸 Totale investito: €${totalStaked.toFixed(2)}`);
  console.log(`💎 Totale vinto: €${totalWon.toFixed(2)}\n`);
  
  // Statistiche quota media
  const avgOdds = results.reduce((sum, r) => sum + r.totalOdds, 0) / totalMultiples;
  const avgEventsPerMultiple = results.reduce((sum, r) => sum + r.events.length, 0) / totalMultiples;
  
  console.log(`📈 Quota media: ${avgOdds.toFixed(2)}`);
  console.log(`🎯 Eventi medi per multipla: ${avgEventsPerMultiple.toFixed(1)}\n`);
  
  // Analisi performance
  console.log(`${colors.bright}${colors.yellow}💡 ANALISI PERFORMANCE${colors.reset}\n`);
  
  if (winRate >= 50) {
    console.log(`${colors.green}✅ Win rate eccellente (>50%)!${colors.reset}`);
  } else if (winRate >= 40) {
    console.log(`${colors.yellow}⚠️  Win rate buono (40-50%), ma può migliorare${colors.reset}`);
  } else {
    console.log(`${colors.red}❌ Win rate basso (<40%), rivedere strategia${colors.reset}`);
  }
  
  if (roi > 0) {
    console.log(`${colors.green}✅ ROI positivo (+${roi.toFixed(2)}%)! La strategia è profittevole${colors.reset}`);
  } else if (roi > -10) {
    console.log(`${colors.yellow}⚠️  ROI leggermente negativo (${roi.toFixed(2)}%), ancora sostenibile${colors.reset}`);
  } else {
    console.log(`${colors.red}❌ ROI molto negativo (${roi.toFixed(2)}%), rivedere completamente la strategia${colors.reset}`);
  }
  
  const capitalGrowth = ((currentCapital - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
  if (capitalGrowth > 0) {
    console.log(`${colors.green}📈 Crescita capitale: +${capitalGrowth.toFixed(2)}%${colors.reset}`);
  } else {
    console.log(`${colors.red}📉 Perdita capitale: ${capitalGrowth.toFixed(2)}%${colors.reset}`);
  }
  
  console.log(`\n${colors.bright}${colors.cyan}Conclusione:${colors.reset}`);
  if (currentCapital > INITIAL_CAPITAL * 1.1) {
    console.log(`${colors.green}🎉 Ottimo! Il capitale è cresciuto del ${((currentCapital/INITIAL_CAPITAL - 1) * 100).toFixed(1)}%${colors.reset}`);
  } else if (currentCapital > INITIAL_CAPITAL) {
    console.log(`${colors.yellow}👍 Buono! Il capitale è cresciuto del ${((currentCapital/INITIAL_CAPITAL - 1) * 100).toFixed(1)}%${colors.reset}`);
  } else if (currentCapital > INITIAL_CAPITAL * 0.9) {
    console.log(`${colors.yellow}⚠️  Il capitale è leggermente diminuito (${((currentCapital/INITIAL_CAPITAL - 1) * 100).toFixed(1)}%)${colors.reset}`);
  } else {
    console.log(`${colors.red}❌ Attenzione! Il capitale è diminuito significativamente (${((currentCapital/INITIAL_CAPITAL - 1) * 100).toFixed(1)}%)${colors.reset}`);
  }
}

// Esegui backtesting
runBacktest().catch(console.error);
