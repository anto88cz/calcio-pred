const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');

// Configurazione
const API_URL = process.env.API_URL || 'http://localhost:3001';
const INITIAL_CAPITAL = 100; // €100 iniziali
const STAKE_PERCENTAGE = 0.30; // 30% del capitale
const TARGET_ODDS = 1.4; // Target quota moderata
const MIN_ODDS = 1.4; // Minimo accettabile
const MAX_ODDS = 4.0; // Massimo accettabile
const START_DATE = '2025-12-01'; // Data inizio backtest
const END_DATE = '2025-12-14'; // Data fine backtest
const API_DELAY_MS = 2000; // Delay tra chiamate API (2 secondi)
const RETRY_DELAY_MS = 60000; // Delay dopo rate limit 429 (60 secondi)
const MAX_RETRIES = 3; // Numero massimo tentativi dopo 429

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

// Funzione sleep per delay
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Funzione fetch con retry su 429
async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        console.log(`  ${colors.yellow}⏳ Rate limit hit (429), attendo ${RETRY_DELAY_MS/1000}s prima di riprovare... (tentativo ${i+1}/${retries})${colors.reset}`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      
      return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`  ${colors.yellow}⚠️  Errore rete, riprovo tra ${API_DELAY_MS/1000}s...${colors.reset}`);
      await sleep(API_DELAY_MS);
    }
  }
  
  throw new Error('Max retries reached');
}

// 🔥 RIMOSSO calculateScore - usa solo filtri del backend API
// Il backend già applica filtri ottimali su EV, confidence e valueRating

// Funzione per generare multipla automatica
async function generateMultipleForDate(date) {
  console.log(`\n${colors.cyan}📅 Elaborazione ${date}...${colors.reset}`);
  
  try {
    // 1. Carica partite del giorno CON RETRY
    await sleep(API_DELAY_MS); // Delay prima di ogni chiamata
    const fixturesResponse = await fetchWithRetry(`${API_URL}/api/fixtures/sm/range?startDate=${date}&endDate=${date}`);
    const fixturesData = await fixturesResponse.json();
    
    if (!fixturesData.fixtures || fixturesData.fixtures.length === 0) {
      console.log(`  ⚠️  Nessuna partita trovata per ${date}`);
      return null;
    }
    
    console.log(`  ✓ ${fixturesData.fixtures.length} partite trovate`);
    
    // Filtra solo partite finite
    const finishedFixtures = fixturesData.fixtures.filter(f => f.status === 'FT' && f.score);
    console.log(`  ✓ ${finishedFixtures.length} partite finite`);
    
    if (finishedFixtures.length === 0) {
      console.log(`  ⚠️  Nessuna partita finita per ${date}`);
      return null;
    }
    
    // 2. Per ogni partita, carica raccomandazioni IN CHUNKS (IDENTICO A UPTEST)
    const allEvents = [];
    const chunkSize = Math.ceil(finishedFixtures.length / 3);
    
    for (let i = 0; i < finishedFixtures.length; i += chunkSize) {
      const chunk = finishedFixtures.slice(i, i + chunkSize);
      console.log(`  📦 Processando chunk ${Math.floor(i / chunkSize) + 1}/3 (${chunk.length} partite)...`);
      
      const fixturePromises = chunk.map(async (fixture) => {
        const homeTeamId = fixture.homeTeam?.id;
        const awayTeamId = fixture.awayTeam?.id;
        const leagueId = fixture.league?.id;
        const seasonId = fixture.league?.season;
        
        if (!homeTeamId || !awayTeamId || !leagueId || !seasonId) {
          return null;
        }
        
        try {
          await sleep(API_DELAY_MS); // Delay tra raccomandazioni
          const recsResponse = await fetchWithRetry(`${API_URL}/api/betting-recommendations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fixtureId: fixture.id,
              homeTeamId,
              awayTeamId,
              leagueId,
              seasonId,
              homeTeamName: fixture.homeTeam.name,
              awayTeamName: fixture.awayTeam.name
            })
          });
          
          if (!recsResponse.ok) {
            return null;
          }
          
          const recsData = await recsResponse.json();
          
          if (recsData.recommendations && recsData.recommendations.length > 0) {
            // 🔥 USA DIRETTAMENTE LE RACCOMANDAZIONI DAL BACKEND (ALLINEATO A UPTEST)
            // Il backend già applica tutti i filtri necessari (EV, confidence, valueRating)
            // Prendi semplicemente la prima (già ordinata per importanza dal backend)
            const bestRec = recsData.recommendations[0];
            
            return {
              fixture,
              recommendation: bestRec,
              actualResult: `${fixture.score.home}-${fixture.score.away}` // formato "2-1"
            };
          }
          return null;
        } catch (error) {
          return null;
        }
      });
      
      const chunkResults = await Promise.all(fixturePromises);
      allEvents.push(...chunkResults.filter(event => event !== null));
      
      // Delay più lungo tra chunks
      if (i + chunkSize < finishedFixtures.length) {
        await sleep(API_DELAY_MS * 2);
      }
    }
    
    if (allEvents.length === 0) {
      console.log(`  ⚠️  Nessun evento con raccomandazioni valide`);
      return null;
    }
    
    console.log(`  ✓ ${allEvents.length} eventi con raccomandazioni valide`);
    
    // 3. Ordina per expectedValue (valore atteso) - criterio principale del backend
    // Ordine secondario: confidence (per parità di EV)
    allEvents.sort((a, b) => {
      const evDiff = b.recommendation.expectedValue - a.recommendation.expectedValue;
      if (Math.abs(evDiff) > 0.001) return evDiff;
      return b.recommendation.confidence - a.recommendation.confidence;
    });
    
    // 4. STRATEGIA FLESSIBILE: Cerca di raggiungere quota ~2.0 con 1-3 partite
    let bestMultiple = null;
    let bestDiffFromTarget = Infinity;
    
    // Prova con 1 partita sola (quota alta)
    for (const event of allEvents) {
      const odds = event.recommendation.odds;
      if (odds >= MIN_ODDS && odds <= MAX_ODDS) {
        const diff = Math.abs(odds - TARGET_ODDS);
        if (diff < bestDiffFromTarget) {
          bestDiffFromTarget = diff;
          bestMultiple = {
            events: [event],
            odds: odds
          };
        }
      }
    }
    
    // Prova con 2 partite
    for (let i = 0; i < Math.min(allEvents.length, 10); i++) {
      for (let j = i + 1; j < Math.min(allEvents.length, 15); j++) {
        // Verifica che non siano della stessa partita
        if (allEvents[i].fixture.id === allEvents[j].fixture.id) continue;
        
        const combinedOdds = allEvents[i].recommendation.odds * allEvents[j].recommendation.odds;
        
        if (combinedOdds >= MIN_ODDS && combinedOdds <= MAX_ODDS) {
          const diff = Math.abs(combinedOdds - TARGET_ODDS);
          if (diff < bestDiffFromTarget) {
            bestDiffFromTarget = diff;
            bestMultiple = {
              events: [allEvents[i], allEvents[j]],
              odds: combinedOdds
            };
          }
        }
      }
    }
    
    // Prova con 3 partite (solo se non abbiamo trovato nulla di buono)
    if (bestDiffFromTarget > 0.3) {
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
              const diff = Math.abs(combinedOdds - TARGET_ODDS);
              if (diff < bestDiffFromTarget) {
                bestDiffFromTarget = diff;
                bestMultiple = {
                  events: [allEvents[i], allEvents[j], allEvents[k]],
                  odds: combinedOdds
                };
              }
            }
          }
        }
      }
    }
    
    if (!bestMultiple) {
      console.log(`  ⚠️  Impossibile creare multipla con quota target ${TARGET_ODDS}`);
      return null;
    }
    
    const selectedEvents = bestMultiple.events;
    const finalOdds = bestMultiple.odds;
    
    console.log(`  ${colors.bright}📊 Multipla generata: ${selectedEvents.length} eventi, quota ${finalOdds.toFixed(2)}${colors.reset}`);
    
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
  console.log('║    BACKTESTING MULTIPLE - SISTEMA ORIGINALE            ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(colors.reset);
  
  console.log(`💰 Capitale iniziale: €${INITIAL_CAPITAL}`);
  console.log(`📊 Stake per schedina: ${(STAKE_PERCENTAGE * 100)}% del capitale`);
  console.log(`🎯 Target quota: ${TARGET_ODDS}x (range: ${MIN_ODDS}-${MAX_ODDS})`);
  console.log(`🏆 Eventi per multipla: 1-3 partite (flessibile)`);
  console.log(`📅 Periodo: dal ${START_DATE} al ${END_DATE}\n`);
  
  const results = [];
  let currentCapital = INITIAL_CAPITAL;
  
  // Genera date dal START_DATE al END_DATE
  const dates = [];
  const startMoment = moment(START_DATE);
  const endMoment = moment(END_DATE);
  const totalDays = endMoment.diff(startMoment, 'days') + 1;
  
  console.log(`📊 Totale giorni da analizzare: ${totalDays}\n`);
  
  for (let i = 0; i < totalDays; i++) {
    const date = startMoment.clone().add(i, 'days').format('YYYY-MM-DD');
    dates.push(date);
  }
  
  // Elabora ogni giorno
  for (const date of dates) {
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
    
    // Delay tra giorni per evitare rate limit
    await sleep(API_DELAY_MS);
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
  
  // ========================================
  // 💾 SALVATAGGIO RISULTATI
  // ========================================
  
  const backtestData = {
    metadata: {
      startDate: START_DATE,
      endDate: END_DATE,
      initialCapital: INITIAL_CAPITAL,
      stakePercentage: STAKE_PERCENTAGE,
      targetOdds: TARGET_ODDS,
      minOdds: MIN_ODDS,
      maxOdds: MAX_ODDS,
      timestamp: new Date().toISOString(),
    },
    summary: {
      totalMultiples,
      totalWon: wonMultiples,
      totalLost: lostMultiples,
      winRate,
      initialCapital: INITIAL_CAPITAL,
      finalCapital: currentCapital,
      profitLoss: currentCapital - INITIAL_CAPITAL,
      roi,
      totalStaked,
      totalWonAmount: totalWon,
      avgOdds,
      avgEventsPerMultiple,
      capitalGrowth,
    },
    detailedResults: results.map(r => ({
      date: r.date,
      events: r.events.map(e => ({
        match: e.match,
        prediction: e.prediction,
        odds: e.odds,
        result: e.result,
        won: e.won,
      })),
      totalOdds: r.totalOdds,
      stake: r.stake,
      profit: r.profit,
      capitalAfter: r.capitalAfter,
      won: r.won,
    })),
  };
  
  // Nome file con timestamp e periodo
  const filename = `backtest-result-${START_DATE}_to_${END_DATE}-${new Date().toISOString().split('T')[0]}.json`;
  const filepath = path.join(__dirname, filename);
  
  try {
    fs.writeFileSync(filepath, JSON.stringify(backtestData, null, 2), 'utf-8');
    console.log(`\n${colors.green}💾 Risultati salvati in: ${filename}${colors.reset}`);
  } catch (err) {
    console.error(`${colors.red}❌ Errore nel salvataggio: ${err.message}${colors.reset}`);
  }
}

// Esegui backtesting
runBacktest().catch(console.error);
