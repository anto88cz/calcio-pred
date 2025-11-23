const moment = require('moment-timezone');

// ============================================================================
// 🔬 BACKTEST PARAMETER OPTIMIZER V2 (BASED ON WORKING backtest-multiple.js)
// ============================================================================
// Testa TUTTE le combinazioni di parametri in parallelo usando la logica 
// FUNZIONANTE di backtest-multiple.js
// ============================================================================

const API_URL = process.env.API_URL || 'http://localhost:3001';
const INITIAL_CAPITAL = 100; // €100 iniziali

// 🎯 DATE RANGE (FISSO - stesso del backtest funzionante)
const START_DATE = '2025-09-01';
const END_DATE = '2025-11-09';

// �️ PARAMETRI DA TESTARE
const PARAM_GRID = {
  stake_percentage: [0.05, 0.1, 0.15, 0.2, 0.3], // 5%, 10%, 15%, 20%, 30%
  target_odds: [1.5, 1.6, 1.7, 1.8, 2.0], // Target quote
  min_odds: [1.2, 1.3, 1.4, 1.5], // Quote minime
  max_odds: [2.0, 2.5, 3.0, 3.5, 4.0], // Quote massime
  max_events: [1, 2, 3, 4, 5], // Numero massimo eventi
  preferred_events: [1, 2, 3], // Numero preferito eventi
};

// 🔧 FILTRI QUALITÀ (fissi - stessi del backtest funzionante)
const MIN_CONFIDENCE = 65;
const MIN_EXPECTED_VALUE = 0.12;
const MIN_VALUE_RATING = 3;
const MIN_ODDS_SINGLE_EVENT = 1.42;
const ENABLE_LOW_ODDS_FILTER = true;

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

// 🎯 Funzione per identificare se una predizione è Goal/NoGoal
function isGGorNG(prediction) {
  const pred = prediction.toLowerCase();
  return pred.includes('gg') || pred.includes('ng') || 
         pred === 'goal' || pred === 'no goal' ||
         pred.includes('goal/goal') || pred.includes('nogoal') ||
         pred.includes('btts'); // Both Teams To Score
}

// 📊 Funzione helper per processare raccomandazioni
function processRecommendations(fixture, recsData) {
  if (!recsData.recommendations || recsData.recommendations.length === 0) {
    return null;
  }
  
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
  
  // Filtra per qualità
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
    actualResult: `${fixture.score.home}-${fixture.score.away}`
  };
}

// Funzione per calcolare score di una raccomandazione
function calculateScore(rec) {
  const valueRating = rec.valueRating || rec.value || 0;
  const confidence = (rec.confidence || 0) > 1 ? rec.confidence : (rec.confidence || 0) * 100;
  const expectedValue = (rec.expectedValue || 0) > 1 ? rec.expectedValue : (rec.expectedValue || 0) * 100;
  const oddsBonus = rec.odds >= 1.7 && rec.odds <= 2.5 ? 15 : 0;
  
  // 🎯 Goal/NoGoal sono trattati esattamente come gli altri mercati
  // Nessun bonus o penalità - competono alla pari
  
  return valueRating * 0.4 + confidence * 0.3 + expectedValue * 0.2 + oddsBonus;
}

// Funzione per generare multipla automatica (CON PARAMETRI)
async function generateMultipleForDate(date, params) {
  
  try {
    // 1. Carica partite del giorno
    const fixturesResponse = await fetch(`${API_URL}/api/fixtures/sm/range?startDate=${date}&endDate=${date}`);
    const fixturesData = await fixturesResponse.json();
    
    if (!fixturesData.fixtures || fixturesData.fixtures.length === 0) {
      // console.log(`  ⚠️  Nessuna partita trovata per ${date}`);
      return null;
    }
    
    // console.log(`  ✓ ${fixturesData.fixtures.length} partite trovate`);
    
    // Filtra solo partite finite
    const finishedFixtures = fixturesData.fixtures.filter(f => f.status === 'FT' && f.score);
    // console.log(`  ✓ ${finishedFixtures.length} partite finite`);
    
    if (finishedFixtures.length === 0) {
      // console.log(`  ⚠️  Nessuna partita finita per ${date}`);
      return null;
    }
    
    // 2. 🚀 OTTIMIZZAZIONE: Check se dati sono in cache Redis prima di decidere chunking
    // Se cache hit, processiamo tutto in parallelo (velocissimo)
    // Se cache miss, usiamo chunks per rispettare rate limit API
    
    // console.log(`  🔍 Checking Redis cache availability...`);
    
    // Quick check: prova a fare una chiamata di test per vedere se risponde da cache
    const testFixture = finishedFixtures[0];
    const testStart = Date.now();
    const testResponse = await fetch(`${API_URL}/api/betting-recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fixtureId: testFixture.id,
        homeTeamId: testFixture.homeTeam?.id,
        awayTeamId: testFixture.awayTeam?.id,
        leagueId: testFixture.league?.id,
        seasonId: testFixture.league?.season,
        homeTeamName: testFixture.homeTeam?.name,
        awayTeamName: testFixture.awayTeam?.name,
        fixtureDate: testFixture.date
      })
    });
    const testDuration = Date.now() - testStart;
    
    // Se risposta < 100ms, probabilmente è cache hit (API call normalmente > 500ms)
    const isCacheWarmed = testDuration < 100;
    
    if (isCacheWarmed) {
      // console.log(`  ⚡ Cache WARM detected (${testDuration}ms) - processing all ${finishedFixtures.length} fixtures in parallel!`);
    } else {
      // console.log(`  🐌 Cache COLD detected (${testDuration}ms) - using chunked processing for rate limit safety`);
    }
    
    const allEvents = [];
    
    if (isCacheWarmed) {
      // 🚀 MODALITÀ VELOCE: Cache warm, elabora tutto insieme
      const fixturePromises = finishedFixtures.map(async (fixture) => {
        const homeTeamId = fixture.homeTeam?.id;
        const awayTeamId = fixture.awayTeam?.id;
        const leagueId = fixture.league?.id;
        const seasonId = fixture.league?.season;
        
        if (!homeTeamId || !awayTeamId || !leagueId || !seasonId) {
          return null;
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
              fixtureDate: fixture.date
            })
          });
          
          if (!recsResponse.ok) {
            return null;
          }
          
          const recsData = await recsResponse.json();
          return processRecommendations(fixture, recsData);
        } catch (error) {
          return null;
        }
      });
      
      const results = await Promise.all(fixturePromises);
      allEvents.push(...results.filter(event => event !== null));
      
    } else {
      // 🐌 MODALITÀ SICURA: Cache cold, usa chunks per rate limit
      const chunkSize = Math.ceil(finishedFixtures.length / 3);
      
      // Salta il primo fixture già processato nel test
      const remainingFixtures = finishedFixtures.slice(1);
      
      // Aggiungi risultato del test se valido
      if (testResponse.ok) {
        const testData = await testResponse.json();
        const testEvent = processRecommendations(testFixture, testData);
        if (testEvent) allEvents.push(testEvent);
      }
      
      for (let i = 0; i < remainingFixtures.length; i += chunkSize) {
        const chunk = remainingFixtures.slice(i, i + chunkSize);
        // console.log(`  📦 Processando chunk ${Math.floor(i / chunkSize) + 1}/3 (${chunk.length} partite)...`);
        
        const fixturePromises = chunk.map(async (fixture) => {
          const homeTeamId = fixture.homeTeam?.id;
          const awayTeamId = fixture.awayTeam?.id;
          const leagueId = fixture.league?.id;
          const seasonId = fixture.league?.season;
          
          if (!homeTeamId || !awayTeamId || !leagueId || !seasonId) {
            return null;
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
                fixtureDate: fixture.date
              })
            });
            
            if (!recsResponse.ok) {
              return null;
            }
            
            const recsData = await recsResponse.json();
            return processRecommendations(fixture, recsData);
          } catch (error) {
            return null;
          }
        });
        
        const chunkResults = await Promise.all(fixturePromises);
        allEvents.push(...chunkResults.filter(event => event !== null));
        
        // Pausa tra i chunks (tranne dopo l'ultimo)
        if (i + chunkSize < remainingFixtures.length) {
          // console.log(`  ⏳ Pausa 1 secondo prima del prossimo chunk...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    if (allEvents.length === 0) {
      // console.log(`  ⚠️  Nessun evento con raccomandazioni valide`);
      return null;
    }
    
    // console.log(`  ✓ ${allEvents.length} eventi con raccomandazioni valide`);
    
    // 3. Ordina per score e seleziona i migliori
    allEvents.sort((a, b) => b.recommendation.score - a.recommendation.score);
    
    // 4. STRATEGIA FLESSIBILE: Cerca di raggiungere quota target con 1 fino a MAX_EVENTS partite
    // 🎯 STEP 1: Inizia da preferred_events poi prova altri
    let bestMultiple = null;
    let bestDiffFromTarget = Infinity;
    
    // Genera tutte le combinazioni, dando priorità a params.preferred_events
    const eventSequence = [params.preferred_events];
    for (let i = 1; i <= params.max_events; i++) {
      if (i !== params.preferred_events) eventSequence.push(i);
    }
    
    for (const numEvents of eventSequence) {
      // Limita il numero di partite da considerare per evitare troppe combinazioni
      const maxConsider = Math.min(allEvents.length, 15);
      
      if (numEvents === 1) {
        // Prova con 1 partita sola (quota alta)
        for (const event of allEvents) {
          const odds = event.recommendation.odds;
          
          // 🔧 Q1 FIX: Evita singoli eventi con quote troppo basse (rischio pareggio)
          if (ENABLE_LOW_ODDS_FILTER && odds < MIN_ODDS_SINGLE_EVENT) {
            continue; // Skip quote basse per eventi singoli
          }
          
          if (odds >= params.min_odds && odds <= params.max_odds) {
            const diff = Math.abs(odds - params.target_odds);
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
            
            if (currentOdds >= params.min_odds && currentOdds <= params.max_odds) {
              const diff = Math.abs(currentOdds - params.target_odds);
              
              // 🎯 Nessuna preferenza per GG/NG - tutti i mercati competono alla pari
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
      
      // 🎯 STEP 1: Se abbiamo trovato una buona combinazione con preferred_events, non cercare altro
      if (numEvents === params.preferred_events && bestDiffFromTarget < 0.3) break;
      // Altrimenti, se abbiamo una combinazione decente, esci
      if (bestDiffFromTarget < 0.2) break;
    }
    
    if (!bestMultiple) {
      return null;
    }
    
    const selectedEvents = bestMultiple.events;
    const finalOdds = bestMultiple.odds;
    
    // console.log(`  ${colors.bright}📊 Multipla generata: ${selectedEvents.length} eventi, quota ${finalOdds.toFixed(2)}${colors.reset}`);
    
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
      won: allCorrect,
      cacheWarmed: isCacheWarmed // 🚀 Ritorna info cache per decidere pausa
    };
    
  } catch (error) {
    console.error(`  ${colors.red}❌ Errore: ${error.message}${colors.reset}`);
    return null;
  }
}

// Funzione per testare una singola configurazione
async function testConfiguration(params) {
  const dates = [];
  const startMoment = moment(START_DATE);
  const endMoment = moment(END_DATE);
  let currentDate = startMoment.clone();
  
  while (currentDate.isSameOrBefore(endMoment)) {
    dates.push(currentDate.format('YYYY-MM-DD'));
    currentDate.add(1, 'days');
  }
  
  // 🚀 PARALLEL: Fetch tutte le date in parallelo
  const multiplePromises = dates.map(date => generateMultipleForDate(date, params));
  const allMultiples = await Promise.all(multiplePromises);
  
  // Calcola capitale simulando sequenza temporale
  let currentCapital = INITIAL_CAPITAL;
  const results = [];
  
  for (const multiple of allMultiples) {
    if (multiple) {
      const stake = currentCapital * params.stake_percentage;
      const payout = multiple.won ? stake * multiple.totalOdds : 0;
      const profit = payout - stake;
      
      currentCapital += profit;
      results.push(multiple);
    }
  }
  
  // Calcola metriche
  const totalBets = results.length;
  const wonBets = results.filter(r => r.won).length;
  const winRate = totalBets > 0 ? (wonBets / totalBets) * 100 : 0;
  const totalStaked = totalBets * INITIAL_CAPITAL * params.stake_percentage;
  const roi = totalStaked > 0 ? ((currentCapital - INITIAL_CAPITAL) / totalStaked) * 100 : 0;
  const profitLoss = currentCapital - INITIAL_CAPITAL;
  
  return {
    params,
    metrics: {
      winRate,
      roi,
      profitLoss,
      finalCapital: currentCapital,
      totalBets,
      wonBets,
    }
  };
}

// Funzione principale optimizer
async function runBacktest() {
  console.log(`${colors.bright}${colors.cyan}🔬 BACKTEST PARAMETER OPTIMIZER V2${colors.reset}\n`);
  console.log(`📅 Date Range: ${START_DATE} → ${END_DATE}`);
  console.log(`� Initial Capital: €${INITIAL_CAPITAL}\n`);
  
  // Genera tutte le combinazioni
  const combinations = [];
  for (const stake of PARAM_GRID.stake_percentage) {
    for (const target of PARAM_GRID.target_odds) {
      for (const minOdds of PARAM_GRID.min_odds) {
        for (const maxOdds of PARAM_GRID.max_odds) {
          for (const maxEvents of PARAM_GRID.max_events) {
            for (const prefEvents of PARAM_GRID.preferred_events) {
              if (prefEvents <= maxEvents && minOdds < maxOdds && target >= minOdds && target <= maxOdds) {
                combinations.push({
                  stake_percentage: stake,
                  target_odds: target,
                  min_odds: minOdds,
                  max_odds: maxOdds,
                  max_events: maxEvents,
                  preferred_events: prefEvents,
                });
              }
            }
          }
        }
      }
    }
  }
  
  console.log(`🎯 Total Combinations: ${combinations.length}\n`);
  console.log(`${colors.yellow}⚡ Testing with MAXIMUM parallelization...${colors.reset}\n`);
  
  const allResults = [];
  const startTime = Date.now();
  
  const BATCH_SIZE = 50; // Test 50 configs in parallel
  
  for (let batchStart = 0; batchStart < combinations.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, combinations.length);
    const batch = combinations.slice(batchStart, batchEnd);
    
    console.log(`\n${colors.bright}${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.bright}Batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(combinations.length / BATCH_SIZE)} (Configs ${batchStart + 1}-${batchEnd})${colors.reset}`);
    
    const batchStartTime = Date.now();
    
    const batchPromises = batch.map(config => testConfiguration(config));
    const batchResults = await Promise.all(batchPromises);
    allResults.push(...batchResults);
    
    const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(1);
    const overallProgress = ((batchEnd) / combinations.length * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const avgTimePerBatch = (Date.now() - startTime) / (batchStart / BATCH_SIZE + 1) / 1000;
    const remainingBatches = Math.ceil((combinations.length - batchEnd) / BATCH_SIZE);
    const remaining = (avgTimePerBatch * remainingBatches / 60).toFixed(1);
    
    console.log(`${colors.green}✓ Batch completed in ${batchDuration}s${colors.reset}`);
    console.log(`${colors.cyan}Progress: ${overallProgress}% | Elapsed: ${elapsed}min | ETA: ${remaining}min${colors.reset}`);
  }
  
  console.log(`\n\n${colors.bright}${colors.green}✅ OPTIMIZATION COMPLETE!${colors.reset}\n`);
  
  // Ordina per ROI
  allResults.sort((a, b) => b.metrics.roi - a.metrics.roi);
  
  // Top 10
  console.log(`${colors.bright}${colors.magenta}🏆 TOP 10 CONFIGURATIONS (by ROI)${colors.reset}\n`);
  
  for (let i = 0; i < Math.min(10, allResults.length); i++) {
    const result = allResults[i];
    const p = result.params;
    const m = result.metrics;
    
    console.log(`${colors.bright}#${i + 1}${colors.reset}`);
    console.log(`  📊 Metrics:`);
    console.log(`     ROI: ${colors.green}${m.roi.toFixed(2)}%${colors.reset}`);
    console.log(`     Win Rate: ${m.winRate.toFixed(1)}%`);
    console.log(`     Profit/Loss: ${m.profitLoss >= 0 ? colors.green : colors.red}€${m.profitLoss.toFixed(2)}${colors.reset}`);
    console.log(`     Final Capital: €${m.finalCapital.toFixed(2)}`);
    console.log(`     Bets: ${m.wonBets}/${m.totalBets}`);
    console.log(`  🎛️  Parameters:`);
    console.log(`     stake_percentage: ${(p.stake_percentage * 100).toFixed(0)}%`);
    console.log(`     target_odds: ${p.target_odds}`);
    console.log(`     min_odds: ${p.min_odds}`);
    console.log(`     max_odds: ${p.max_odds}`);
    console.log(`     max_events: ${p.max_events}`);
    console.log(`     preferred_events: ${p.preferred_events}`);
    console.log('');
  }
  
  // Salva risultati
  const fs = require('fs');
  const outputFile = `backtest-optimization-${moment().format('YYYY-MM-DD_HH-mm-ss')}.json`;
  fs.writeFileSync(outputFile, JSON.stringify(allResults, null, 2));
  console.log(`${colors.cyan}💾 Full results saved to: ${outputFile}${colors.reset}\n`);
}

// Esegui backtesting
runBacktest().catch(console.error);

