const moment = require('moment-timezone');

// Configurazione OTTIMIZZATA per ROI positivo
const API_URL = process.env.API_URL || 'http://localhost:3001';
const INITIAL_CAPITAL = 100; // €100 iniziali
const STAKE_PERCENTAGE = 0.05; // 🆕 5% del capitale (era 20% - troppo rischioso)
const TARGET_ODDS = 1.8; // 🆕 Target quota ridotto (era 2.0 - con WR 53% serve ~1.88 per break-even)
const MIN_ODDS = 1.5; // 🆕 Minimo accettabile ridotto
const MAX_ODDS = 2.2; // 🆕 Massimo ridotto (evita multiple troppo rischiose)
const BACKTESTING_DAYS = 61; // Ultimo mese
const MAX_EVENTS = 2; // 🆕 Max 2 eventi per multipla (era 5 - troppo rischioso)

// 🆕 FILTRI QUALITÀ per raccomandazioni
const MIN_CONFIDENCE = 60; // Minimo 60% confidence
const MIN_EXPECTED_VALUE = 0.10; // Minimo 10% expected value
const MIN_VALUE_RATING = 3; // Minimo 3 stelle

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
    // 1. Carica partite del giorno
    const fixturesResponse = await fetch(`${API_URL}/api/fixtures/sm/range?startDate=${date}&endDate=${date}`);
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
    
    // Limita a 20 partite per velocizzare (prendi le prime 20)
    const limitedFixtures = finishedFixtures.slice(0, 20);
    
    // 2. Per ogni partita, carica raccomandazioni IN CHUNKS per evitare rate limit
    const allEvents = [];
    const chunkSize = Math.ceil(limitedFixtures.length / 3); // Dividi in 3 chunks
    
    for (let i = 0; i < limitedFixtures.length; i += chunkSize) {
      const chunk = limitedFixtures.slice(i, i + chunkSize);
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
          // 🆕 BACKTEST FIX: Passa la fixture date per evitare look-ahead bias
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
              fixtureDate: fixture.date // 🆕 CRITICAL: Pass fixture date to prevent using future data
            })
          });
          
          if (!recsResponse.ok) {
            return null;
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
            
            // 🆕 FILTRA per qualità PRIMA di calcolare score
            const qualityRecs = normalizedRecs.filter(rec => {
              return rec.confidence >= MIN_CONFIDENCE &&
                     rec.expectedValue >= MIN_EXPECTED_VALUE &&
                     rec.valueRating >= MIN_VALUE_RATING;
            });
            
            // Se nessuna raccomandazione passa i filtri di qualità, salta questa partita
            if (qualityRecs.length === 0) {
              return null;
            }
            
            // Calcola score per ogni raccomandazione di qualità e prendi la migliore
            const bestRec = qualityRecs
              .map(rec => ({
                ...rec,
                score: calculateScore(rec)
              }))
              .sort((a, b) => b.score - a.score)[0];
            
            return {
              fixture,
              recommendation: bestRec,
              actualResult: `${fixture.score.home}-${fixture.score.away}` // formato "2-1"
            };
          }
          return null;
        } catch (error) {
          // Salta partite con errori
          return null;
        }
      });
      
      // Aspetta il chunk corrente
      const chunkResults = await Promise.all(fixturePromises);
      allEvents.push(...chunkResults.filter(event => event !== null));
      
      // Pausa tra i chunks (tranne dopo l'ultimo)
      if (i + chunkSize < limitedFixtures.length) {
        console.log(`  ⏳ Pausa 1 secondo prima del prossimo chunk...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (allEvents.length === 0) {
      console.log(`  ⚠️  Nessun evento con raccomandazioni valide`);
      return null;
    }
    
    console.log(`  ✓ ${allEvents.length} eventi con raccomandazioni valide`);
    
    // 3. Ordina per score e seleziona i migliori
    allEvents.sort((a, b) => b.recommendation.score - a.recommendation.score);
    
    // 4. STRATEGIA FLESSIBILE: Cerca di raggiungere quota target con 1 fino a MAX_EVENTS partite
    let bestMultiple = null;
    let bestDiffFromTarget = Infinity;
    
    // Genera tutte le combinazioni da 1 a MAX_EVENTS
    for (let numEvents = 1; numEvents <= MAX_EVENTS; numEvents++) {
      // Limita il numero di partite da considerare per evitare troppe combinazioni
      const maxConsider = Math.min(allEvents.length, 15);
      
      if (numEvents === 1) {
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
      } else {
        // Genera combinazioni ricorsivamente
        const generateCombinations = (start, currentCombo, currentOdds) => {
          if (currentCombo.length === numEvents) {
            // Verifica che siano tutti di partite diverse
            const fixtureIds = new Set(currentCombo.map(e => e.fixture.id));
            if (fixtureIds.size !== currentCombo.length) return;
            
            if (currentOdds >= MIN_ODDS && currentOdds <= MAX_ODDS) {
              const diff = Math.abs(currentOdds - TARGET_ODDS);
              if (diff < bestDiffFromTarget) {
                bestDiffFromTarget = diff;
                bestMultiple = {
                  events: [...currentCombo],
                  odds: currentOdds
                };
              }
            }
            return;
          }
          
          for (let i = start; i < maxConsider; i++) {
            generateCombinations(
              i + 1,
              [...currentCombo, allEvents[i]],
              currentOdds * allEvents[i].recommendation.odds
            );
          }
        };
        
        generateCombinations(0, [], 1);
      }
      
      // Se abbiamo trovato una buona combinazione, non cercare con più eventi
      if (bestDiffFromTarget < 0.2) break;
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
  console.log('║      BACKTESTING MULTIPLE - OTTIMIZZATO (v2)           ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(colors.reset);
  
  console.log(`💰 Capitale iniziale: €${INITIAL_CAPITAL}`);
  console.log(`📊 Stake per schedina: ${(STAKE_PERCENTAGE * 100)}% del capitale (gestione conservativa)`);
  console.log(`🎯 Target quota: ${TARGET_ODDS}x (range: ${MIN_ODDS}-${MAX_ODDS})`);
  console.log(`🏆 Eventi per multipla: 1-${MAX_EVENTS} partite`);
  console.log(`📅 Periodo: ultimi ${BACKTESTING_DAYS} giorni`);
  console.log(`\n🔒 FILTRI QUALITÀ:`);
  console.log(`   - Confidence minima: ${MIN_CONFIDENCE}%`);
  console.log(`   - Expected Value minimo: ${(MIN_EXPECTED_VALUE * 100)}%`);
  console.log(`   - Value Rating minimo: ${MIN_VALUE_RATING}⭐\n`);
  
  const results = [];
  let currentCapital = INITIAL_CAPITAL;
  
  // Genera date degli ultimi 14 giorni
  const dates = [];
  for (let i = BACKTESTING_DAYS - 1; i >= 0; i--) {
    const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
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
    
    // Rate limiting - pausa di 2 secondi tra ogni giornata per evitare errore 429
    console.log(`  ⏳ Attesa 2 secondi prima della prossima giornata...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
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
