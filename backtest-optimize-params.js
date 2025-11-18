const moment = require('moment-timezone');

// ============================================================================
// 🔬 BACKTEST PARAMETER OPTIMIZER
// ============================================================================
// Testa TUTTE le combinazioni di parametri per trovare la configurazione ottimale
//
// Parametri testati:
// - STAKE_PERCENTAGE: quanto del capitale scommettere per bet
// - TARGET_ODDS: quota target per costruire multiple
// - MIN_ODDS: quota minima accettabile
// - MAX_ODDS: quota massima accettabile  
// - MAX_EVENTS: numero massimo eventi per multipla
// - PREFERRED_EVENTS: numero preferito di eventi per multipla
// ============================================================================

const API_URL = process.env.API_URL || 'http://localhost:3001';
const INITIAL_CAPITAL = 100; // €100 iniziali

// 🎯 DATE RANGE (FISSO - non viene ottimizzato)
const START_DATE = '2025-09-01';
const END_DATE = '2025-11-09';

// 🎛️ PARAMETRI DA TESTARE (definisci range di valori)
const PARAM_GRID = {
  stake_percentage: [0.05, 0.1, 0.15, 0.2, 0.3], // 5%, 10%, 15%, 20%, 30%
  target_odds: [1.5, 1.6, 1.7, 1.8, 2.0], // Target quote
  min_odds: [1.2, 1.3, 1.4, 1.5], // Quote minime
  max_odds: [2.0, 2.5, 3.0, 3.5, 4.0], // Quote massime
  max_events: [1, 2, 3, 4, 5], // Numero massimo eventi
  preferred_events: [1, 2, 3], // Numero preferito eventi
};

// 🔧 FILTRI QUALITÀ (fissi) - RILASSATI per optimizer
const MIN_CONFIDENCE = 50; // Era 65 - troppo alto, nessuna recommendation passa
const MIN_EXPECTED_VALUE = 3; // Era 0.12 - BUG: deve essere 3 (=3%) per coerenza con normalizzazione *100
const MIN_VALUE_RATING = 2; // Era 3 - troppo alto, rilassiamo a 2⭐
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
  magenta: '\x1b[35m',
};

// 📊 Funzione helper per processare raccomandazioni
function processRecommendations(fixture, recsData, minConfidence, minEV, minRating) {
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
    return rec.confidence >= minConfidence &&
           rec.expectedValue >= minEV &&
           rec.valueRating >= minRating;
  });
  
  if (qualityRecs.length === 0) {
    return null;
  }
  
  // Prendi la migliore raccomandazione
  const bestRec = qualityRecs
    .map(rec => ({
      ...rec,
      score: rec.confidence * 0.4 + rec.expectedValue * 0.4 + rec.valueRating * 5
    }))
    .sort((a, b) => b.score - a.score)[0];
  
  return {
    fixture: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
    fixtureId: fixture.id,
    prediction: bestRec.prediction,
    odds: bestRec.odds,
    confidence: bestRec.confidence,
    expectedValue: bestRec.expectedValue,
    valueRating: bestRec.valueRating,
  };
}

// 🎲 Funzione per generare multiple per una data (CON PARAMETRI) - COPIA DA backtest-multiple.js
async function generateMultipleForDate(date, params, debug = false) {
  const dateStr = moment(date).format('YYYY-MM-DD');
  
  try {
    // 1. Carica partite del giorno (CORRETTA: usa sm/range come backtest-multiple.js)
    const fixturesResponse = await fetch(`${API_URL}/api/fixtures/sm/range?startDate=${dateStr}&endDate=${dateStr}`);
    const fixturesData = await fixturesResponse.json();
    
    if (!fixturesData.fixtures || fixturesData.fixtures.length === 0) {
      if (debug) console.log(`  ⚠️  No fixtures for ${dateStr}`);
      return null;
    }
    
    // Filtra solo partite finite
    const finishedFixtures = fixturesData.fixtures.filter(f => f.status === 'FT' && f.score);
    
    if (finishedFixtures.length === 0) {
      if (debug) console.log(`  ⚠️  No finished fixtures for ${dateStr}`);
      return null;
    }
    
    if (debug) console.log(`  ✓ Found ${finishedFixtures.length} finished fixtures for ${dateStr}`);
    
    // 2. Quick cache check
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
    const isCacheWarmed = testDuration < 100;
    
    // 3. Process all fixtures in parallel (cache sempre warm dopo prima config)
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
        return processRecommendations(fixture, recsData, MIN_CONFIDENCE, MIN_EXPECTED_VALUE, MIN_VALUE_RATING);
      } catch (error) {
        return null;
      }
    });
    
    const allEvents = (await Promise.all(fixturePromises)).filter(Boolean);
    
    if (allEvents.length === 0) {
      return null;
    }
    
    // 4. Filtra per range quote parametrizzato
    const validEvents = allEvents.filter(evt => {
      const oddsInRange = evt.recommendation.odds >= params.min_odds && evt.recommendation.odds <= params.max_odds;
      return oddsInRange;
    });
    
    if (validEvents.length === 0) {
      return null;
    }
    
    // 5. Costruisci multipla con parametri (LOGICA DA backtest-multiple.js)
    validEvents.sort((a, b) => b.recommendation.score - a.recommendation.score);
    
    let bestMultiple = null;
    let bestDiffFromTarget = Infinity;
    
    const eventSequence = [params.preferred_events];
    for (let i = 1; i <= params.max_events; i++) {
      if (i !== params.preferred_events) eventSequence.push(i);
    }
    
    for (const numEvents of eventSequence) {
      const maxConsider = Math.min(validEvents.length, 15);
      
      if (numEvents === 1) {
        for (const event of validEvents) {
          const odds = event.recommendation.odds;
          if (odds >= params.min_odds && odds <= params.max_odds) {
            const diff = Math.abs(odds - params.target_odds);
            if (diff < bestDiffFromTarget) {
              bestDiffFromTarget = diff;
              bestMultiple = { events: [event], odds: odds };
            }
          }
        }
      } else {
        const generateCombinations = (start, currentCombo, currentOdds) => {
          if (currentCombo.length === numEvents) {
            const fixtureIds = new Set(currentCombo.map(e => e.fixture.id));
            if (fixtureIds.size !== currentCombo.length) return;
            
            if (currentOdds >= params.min_odds && currentOdds <= params.max_odds) {
              const diff = Math.abs(currentOdds - params.target_odds);
              if (diff < bestDiffFromTarget) {
                bestDiffFromTarget = diff;
                bestMultiple = { events: [...currentCombo], odds: currentOdds };
              }
            }
            return;
          }
          
          for (let i = start; i < maxConsider; i++) {
            generateCombinations(
              i + 1,
              [...currentCombo, validEvents[i]],
              currentOdds * validEvents[i].recommendation.odds
            );
          }
        };
        
        generateCombinations(0, [], 1);
      }
      
      if (numEvents === params.preferred_events && bestDiffFromTarget < 0.3) break;
      if (bestDiffFromTarget < 0.2) break;
    }
    
    if (!bestMultiple) {
      return null;
    }
    
    const selectedEvents = bestMultiple.events;
    const finalOdds = bestMultiple.odds;
    
    // 6. Verifica risultati
    const results = selectedEvents.map(event => {
      const prediction = event.recommendation.prediction;
      const actualScore = event.actualResult;
      const [homeScore, awayScore] = actualScore.split('-').map(Number);
      
      let correct = false;
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
      }
      
      return {
        fixture: event.fixture.name,
        fixtureId: event.fixture.id,
        prediction: prediction,
        odds: event.recommendation.odds,
        correct: correct,
        actualScore: actualScore
      };
    });
    
    const allCorrect = results.every(r => r.correct);
    
    return {
      date: dateStr,
      events: results,
      totalOdds: finalOdds,
      won: allCorrect,
      cacheWarmed: isCacheWarmed,
    };
    
  } catch (error) {
    if (debug) console.error(`Error for ${dateStr}:`, error.message);
    return null;
  }
}
    
    // 3. Filtra eventi per quote range (rimuovi filtro min odds singolo per optimizer)
    const validEvents = allEvents.filter(evt => {
      const oddsInRange = evt.odds >= params.min_odds && evt.odds <= params.max_odds;
      return oddsInRange;
    });
    
    if (validEvents.length === 0) {
      return null;
    }
    
    // 4. Costruisci multipla con parametri forniti (LOGICA SEMPLIFICATA)
    let selectedEvents = [];
    let currentOdds = 1.0;
    
    // Ordina per confidence decrescente
    const sortedEvents = [...validEvents].sort((a, b) => b.confidence - a.confidence);
    
    // Seleziona eventi fino a raggiungere preferred_events (o max_events se non abbastanza)
    for (const evt of sortedEvents) {
      if (selectedEvents.length >= params.max_events) break;
      
      const newOdds = currentOdds * evt.odds;
      
      // Strategia: riempi fino a preferred_events, poi continua se non superi troppo target_odds
      if (selectedEvents.length < params.preferred_events) {
        // Aggiungi sempre fino a preferred_events
        selectedEvents.push(evt);
        currentOdds = newOdds;
      } else if (selectedEvents.length < params.max_events && newOdds <= params.target_odds * 2.0) {
        // Dopo preferred_events, aggiungi solo se non superi il doppio del target
        selectedEvents.push(evt);
        currentOdds = newOdds;
      }
    }
    
    if (selectedEvents.length === 0) {
      return null;
    }
    
    // 5. Fetch risultati per verificare correttezza
    const resultsPromises = selectedEvents.map(async (evt) => {
      try {
        const res = await fetch(`${API_URL}/api/fixtures/${evt.fixtureId}`);
        if (!res.ok) return { ...evt, correct: false, actualScore: 'N/A' };
        
        const fixtureData = await res.json();
        const scores = fixtureData.scores;
        
        if (!scores || !scores.ft_score) {
          return { ...evt, correct: false, actualScore: 'N/A' };
        }
        
        const [homeScore, awayScore] = scores.ft_score.split('-').map(Number);
        const actualScore = `${homeScore}-${awayScore}`;
        
        let correct = false;
        const pred = evt.prediction.toLowerCase();
        
        if (pred.includes('1x2')) {
          if (pred.includes('casa') || pred.includes('home') || pred.includes('1 ')) {
            correct = homeScore > awayScore;
          } else if (pred.includes('pareggio') || pred.includes('draw') || pred.includes('x')) {
            correct = homeScore === awayScore;
          } else if (pred.includes('trasferta') || pred.includes('away') || pred.includes('2')) {
            correct = homeScore < awayScore;
          }
        } else if (pred.includes('doppia chance') || pred.includes('double chance')) {
          if (pred.includes('1x')) {
            correct = homeScore >= awayScore;
          } else if (pred.includes('x2') || pred.includes('2x')) {
            correct = homeScore <= awayScore;
          } else if (pred.includes('12')) {
            correct = homeScore !== awayScore;
          }
        }
        
        return { ...evt, correct, actualScore };
      } catch (error) {
        return { ...evt, correct: false, actualScore: 'Error' };
      }
    });
    
    const results = await Promise.all(resultsPromises);
    const allCorrect = results.every(r => r.correct);
    const finalOdds = results.reduce((acc, r) => acc * r.odds, 1);
    
    return {
      date: dateStr,
      events: results,
      totalOdds: finalOdds,
      won: allCorrect,
      cacheWarmed: isCacheWarmed,
    };



// 🧪 Funzione per testare una singola configurazione
async function testConfiguration(params, configIndex, totalConfigs) {
  const dates = [];
  let currentDate = moment(START_DATE);
  const endDate = moment(END_DATE);
  
  while (currentDate.isSameOrBefore(endDate)) {
    dates.push(currentDate.clone());
    currentDate.add(1, 'days');
  }
  
  // 🚀 PARALLELIZZA ANCHE LE DATE: Fetch tutte le multiple in parallelo
  // DEBUG: Testa prima data per vedere cosa succede
  const firstMultiple = await generateMultipleForDate(dates[0], params, true);
  console.log(`[DEBUG Config ${configIndex + 1}] First date test:`, firstMultiple ? 'OK' : 'NULL');
  
  const multiplePromises = dates.map(date => generateMultipleForDate(date, params, false));
  const allMultiples = await Promise.all(multiplePromises);
  
  // Calcola capitale simulando sequenza temporale (anche se fetch in parallelo)
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

// 🚀 Funzione principale per testare tutte le combinazioni
async function runOptimization() {
  console.log(`${colors.bright}${colors.cyan}🔬 BACKTEST PARAMETER OPTIMIZER${colors.reset}\n`);
  console.log(`📅 Date Range: ${START_DATE} → ${END_DATE}`);
  console.log(`💰 Initial Capital: €${INITIAL_CAPITAL}\n`);
  
  // Genera tutte le combinazioni
  const combinations = [];
  for (const stake of PARAM_GRID.stake_percentage) {
    for (const target of PARAM_GRID.target_odds) {
      for (const minOdds of PARAM_GRID.min_odds) {
        for (const maxOdds of PARAM_GRID.max_odds) {
          for (const maxEvents of PARAM_GRID.max_events) {
            for (const prefEvents of PARAM_GRID.preferred_events) {
              // Validazione: preferred_events <= max_events
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
  console.log(`${colors.yellow}⚡ Testing configurations with MAXIMUM parallelization...${colors.reset}\n`);
  
  const allResults = [];
  const startTime = Date.now();
  
  // 🚀 MASSIMA PARALLELIZZAZIONE: Batch size aumentato
  const BATCH_SIZE = 50; // Testa 50 configurazioni in parallelo (era 10)
  
  for (let batchStart = 0; batchStart < combinations.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, combinations.length);
    const batch = combinations.slice(batchStart, batchEnd);
    
    console.log(`\n${colors.bright}${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.bright}Testing Batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(combinations.length / BATCH_SIZE)} (Configs ${batchStart + 1}-${batchEnd})${colors.reset}`);
    
    const batchStartTime = Date.now();
    
    // Esegui tutte le configurazioni del batch in parallelo
    const batchPromises = batch.map((config, idx) => 
      testConfiguration(config, batchStart + idx, combinations.length)
    );
    
    const batchResults = await Promise.all(batchPromises);
    allResults.push(...batchResults);
    
    const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(1);
    const overallProgress = ((batchEnd) / combinations.length * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const avgTimePerBatch = (Date.now() - startTime) / (batchStart / BATCH_SIZE + 1) / 1000;
    const remainingBatches = Math.ceil((combinations.length - batchEnd) / BATCH_SIZE);
    const remaining = (avgTimePerBatch * remainingBatches / 60).toFixed(1);
    
    console.log(`${colors.green}✓ Batch completed in ${batchDuration}s (avg ${(batchDuration / batch.length).toFixed(1)}s per config)${colors.reset}`);
    console.log(`${colors.cyan}Progress: ${overallProgress}% | Elapsed: ${elapsed}min | ETA: ${remaining}min${colors.reset}`);
  }
  
  console.log(`\n\n${colors.bright}${colors.green}✅ OPTIMIZATION COMPLETE!${colors.reset}\n`);
  
  // Ordina risultati per ROI
  allResults.sort((a, b) => b.metrics.roi - a.metrics.roi);
  
  // Mostra top 10 configurazioni
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
  
  // Salva risultati completi su file
  const fs = require('fs');
  const outputFile = `backtest-optimization-${moment().format('YYYY-MM-DD_HH-mm-ss')}.json`;
  fs.writeFileSync(outputFile, JSON.stringify(allResults, null, 2));
  console.log(`${colors.cyan}💾 Full results saved to: ${outputFile}${colors.reset}\n`);
}

// Esegui ottimizzazione
runOptimization().catch(console.error);
