const moment = require('moment-timezone');

// Configurazione OTTIMIZZATA - STRATEGIA STABILE (basata su analisi Set-Ott)
const API_URL = process.env.API_URL || 'http://localhost:3001';
const INITIAL_CAPITAL = 100; // €100 iniziali

// 🎯 KELLY CRITERION SETTINGS
const USE_KELLY = false; // Abilita Kelly Criterion per stake management intelligente
const ESTIMATED_WIN_RATE = 0.74; // Win rate stimato basato su backtesting (74%)
const ESTIMATED_AVG_ODDS = 1.65; // Quota media stimata
const KELLY_FRACTION = 0.5; // Fractional Kelly: 25% della Kelly completa (conservativo)
const MIN_STAKE_PERCENTAGE = 0.02; // Minimo 2% del capitale
const MAX_STAKE_PERCENTAGE = 0.15; // Massimo 15% del capitale (safety cap)

// Legacy stake (usato se USE_KELLY = false)
const STAKE_PERCENTAGE = 0.3; // 30% del capitale per bet più frequenti (NON RACCOMANDATO)

const TARGET_ODDS = 1.8; // 🎯 OTTIMIZZATO: Target quota moderata 1.6
const MIN_ODDS = 1.4; // 🎯 OTTIMIZZATO: Minimo 1.4 (range migliore: 1.5-2.0 con 85.7% accuracy)
const MAX_ODDS = 4; // 🎯 OTTIMIZZATO: Massimo 2.0 (quote alte hanno solo 50% accuracy)
const START_DATE = '2025-09-01'; // Data inizio backtest (formato YYYY-MM-DD)
const END_DATE = '2025-11-23'; // Data fine backtest (formato YYYY-MM-DD)
const MAX_EVENTS = 2; // 🎯 OTTIMIZZATO: Max 2 eventi per win rate 60-70%
const PREFERRED_EVENTS = 2; // 🎯 OTTIMIZZATO: Preferisci doppie invece di 5-7 eventi

// 🎯 GOAL/NOGOAL SETTINGS
const ENABLE_GG_NG = true; // Abilita supporto per raccomandazioni Goal/NoGoal
const GG_NG_BONUS = 0; // 🎯 NO BONUS - Trattati come tutti gli altri mercati
const MIN_GG_NG_CONFIDENCE = 60; // Stessa confidence degli altri mercati

// FILTRI QUALITÀ per raccomandazioni
const MIN_CONFIDENCE = 65; // 🔧 Q1 FIX: Aumentato da 60% a 65%
const MIN_EXPECTED_VALUE = 0.12; // 🔧 Q1 FIX: Aumentato da 10% a 12%
const MIN_VALUE_RATING = 3; // Minimo 3 stelle

// 🔧 Q1 FIX: FILTRO QUOTE BASSE PER EVITARE PAREGGI
const MIN_ODDS_SINGLE_EVENT = 1.42; // Evita quote troppo basse (< 1.42) per singoli eventi
const ENABLE_LOW_ODDS_FILTER = true; // Abilita filtro quote basse

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

// 🎯 Kelly Criterion: calcola stake ottimale basato su edge
function calculateKellyStake(odds, capital) {
  if (!USE_KELLY) {
    return capital * STAKE_PERCENTAGE;
  }

  // Kelly Criterion formula: f = (p * b - q) / b
  // p = probabilità di vincita (win rate)
  // q = probabilità di perdita (1 - p)
  // b = odds - 1 (net odds)
  
  const p = ESTIMATED_WIN_RATE;
  const q = 1 - p;
  const b = odds - 1;
  
  // Calcola Kelly fraction
  const kellyFraction = (p * b - q) / b;
  
  // Applica fractional Kelly (più conservativo)
  const fractionalKelly = kellyFraction * KELLY_FRACTION;
  
  // Applica caps di sicurezza
  const cappedKelly = Math.max(
    MIN_STAKE_PERCENTAGE,
    Math.min(MAX_STAKE_PERCENTAGE, fractionalKelly)
  );
  
  // Se Kelly suggerisce stake negativo o zero, usa minimo
  if (cappedKelly <= 0) {
    return capital * MIN_STAKE_PERCENTAGE;
  }
  
  return capital * cappedKelly;
}

// Funzione per generare multipla automatica
async function generateMultipleForDate(date) {
  console.log(`\n${colors.cyan}📅 Elaborazione ${date}...${colors.reset}`);

  try {
    // 1. Carica partite del giorno - USA TUTTE LE LEGHE per backtest completo
    const fixturesResponse = await fetch(`${API_URL}/api/fixtures/sm/range?startDate=${date}&endDate=${date}&includeAllLeagues=true`);
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

    // 2. 🚀 OTTIMIZZAZIONE: Check se dati sono in cache Redis prima di decidere chunking
    // Se cache hit, processiamo tutto in parallelo (velocissimo)
    // Se cache miss, usiamo chunks per rispettare rate limit API

    console.log(`  🔍 Checking Redis cache availability...`);

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
      console.log(`  ⚡ Cache WARM detected (${testDuration}ms) - processing all ${finishedFixtures.length} fixtures in parallel!`);
    } else {
      console.log(`  � Cache COLD detected (${testDuration}ms) - using chunked processing for rate limit safety`);
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
          console.log(`  ⏳ Pausa 1 secondo prima del prossimo chunk...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
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
    // 🎯 STEP 1: Inizia da 2 eventi (preferito) poi prova 1 e 3
    let bestMultiple = null;
    let bestDiffFromTarget = Infinity;

    // Genera tutte le combinazioni, dando priorità a PREFERRED_EVENTS
    const eventSequence = [PREFERRED_EVENTS];
    for (let i = 1; i <= MAX_EVENTS; i++) {
      if (i !== PREFERRED_EVENTS) eventSequence.push(i);
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

      // 🎯 STEP 1: Se abbiamo trovato una buona combinazione con PREFERRED_EVENTS, non cercare altro
      if (numEvents === PREFERRED_EVENTS && bestDiffFromTarget < 0.3) break;
      // Altrimenti, se abbiamo una combinazione decente, esci
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
      won: allCorrect,
      cacheWarmed: isCacheWarmed // 🚀 Ritorna info cache per decidere pausa
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
  console.log('║    BACKTESTING MULTIPLE - STEP 1 OTTIMIZZAZIONE        ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  console.log(`💰 Capitale iniziale: €${INITIAL_CAPITAL}`);
  
  if (USE_KELLY) {
    console.log(`\n${colors.bright}${colors.green}🎯 KELLY CRITERION ATTIVO${colors.reset}`);
    console.log(`   - Fractional Kelly: ${(KELLY_FRACTION * 100)}% (conservativo)`);
    console.log(`   - Win Rate stimato: ${(ESTIMATED_WIN_RATE * 100)}%`);
    console.log(`   - Quota media stimata: ${ESTIMATED_AVG_ODDS}`);
    console.log(`   - Range stake: ${(MIN_STAKE_PERCENTAGE * 100)}%-${(MAX_STAKE_PERCENTAGE * 100)}% del capitale`);
  } else {
    console.log(`📊 Stake per schedina: ${(STAKE_PERCENTAGE * 100)}% del capitale ${colors.red}(FISSO - NON RACCOMANDATO)${colors.reset}`);
  }
  
  console.log(`🎯 Target quota: ${TARGET_ODDS}x (range: ${MIN_ODDS}-${MAX_ODDS})`);
  console.log(`🏆 Eventi per multipla: 1-${MAX_EVENTS} (preferito: ${PREFERRED_EVENTS})`);
  console.log(`📅 Periodo: dal ${START_DATE} al ${END_DATE}`);
  console.log(`\n🔒 FILTRI QUALITÀ:`);
  console.log(`   - Confidence minima: ${MIN_CONFIDENCE}% 🔧 Q1 FIX`);
  console.log(`   - Expected Value minimo: ${(MIN_EXPECTED_VALUE * 100)}% 🔧 Q1 FIX`);
  console.log(`   - Value Rating minimo: ${MIN_VALUE_RATING}⭐`);
  if (ENABLE_LOW_ODDS_FILTER) {
    console.log(`\n⚠️  FILTRO ANTI-PAREGGIO: 🔧 Q1 FIX`);
    console.log(`   - Quote singole minime: ${MIN_ODDS_SINGLE_EVENT} (evita equilibri)`);
  }
  if (ENABLE_GG_NG) {
    console.log(`\n⚽ GOAL/NOGOAL:`);
    console.log(`   - Supporto abilitato: ✅`);
    console.log(`   - Trattamento: Alla pari con altri mercati (no bonus)`);
  }
  console.log('');

  const results = [];
  let currentCapital = INITIAL_CAPITAL;

  // Genera date dal range specificato
  const dates = [];
  const startMoment = moment(START_DATE);
  const endMoment = moment(END_DATE);
  let currentDate = startMoment.clone();

  while (currentDate.isSameOrBefore(endMoment)) {
    dates.push(currentDate.format('YYYY-MM-DD'));
    currentDate.add(1, 'days');
  }

  console.log(`📊 Totale giorni da analizzare: ${dates.length}\n`);

  // Elabora ogni giorno
  for (const date of dates) {
    const multiple = await generateMultipleForDate(date);

    if (multiple) {
      // 🎯 Calcola stake con Kelly Criterion o fisso
      const stake = USE_KELLY 
        ? calculateKellyStake(multiple.totalOdds, currentCapital)
        : currentCapital * STAKE_PERCENTAGE;
      
      const stakePercentage = (stake / currentCapital) * 100;
      const potentialWin = stake * multiple.totalOdds;
      const profit = multiple.won ? potentialWin - stake : -stake;

      currentCapital += profit;

      results.push({
        ...multiple,
        stake,
        stakePercentage,
        potentialWin,
        profit,
        capitalAfter: currentCapital
      });

      const statusIcon = multiple.won ? '✅' : '❌';
      const statusColor = multiple.won ? colors.green : colors.red;
      const kellyInfo = USE_KELLY ? ` (${stakePercentage.toFixed(1)}% Kelly)` : '';
      console.log(`  ${statusIcon} ${statusColor}${multiple.won ? 'VINTA' : 'PERSA'}${colors.reset} - Stake: €${stake.toFixed(2)}${kellyInfo} | Quota: ${multiple.totalOdds.toFixed(2)} | Profit: ${colors.bright}${profit >= 0 ? '+' : ''}€${profit.toFixed(2)}${colors.reset} | Capitale: €${currentCapital.toFixed(2)}`);

      // Mostra dettaglio eventi
      multiple.events.forEach(evt => {
        const icon = evt.correct ? '✓' : '✗';
        const color = evt.correct ? colors.green : colors.red;
        console.log(`    ${color}${icon}${colors.reset} ${evt.fixture}: ${evt.prediction} @${evt.odds.toFixed(2)} (${evt.actualScore})`);
      });
    }

    // 🚀 OTTIMIZZAZIONE: Salta pausa se cache è warm (dati già pronti)
    // Rate limiting necessario solo con API calls (cache cold)
    if (multiple && multiple.cacheWarmed) {
      // Cache warm: nessuna pausa necessaria, dati istantanei
      // Continua immediatamente con la prossima giornata
    } else {
      // Cache cold o nessuna multipla: pausa per rate limit safety
      console.log(`  ⏳ Attesa 2 secondi prima della prossima giornata...`);
      //await new Promise(resolve => setTimeout(resolve, 2000));
    }
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

  // Statistiche quota media e stake
  const avgOdds = results.reduce((sum, r) => sum + r.totalOdds, 0) / totalMultiples;
  const avgEventsPerMultiple = results.reduce((sum, r) => sum + r.events.length, 0) / totalMultiples;
  const avgStakePercentage = results.reduce((sum, r) => sum + r.stakePercentage, 0) / totalMultiples;

  console.log(`📈 Quota media: ${avgOdds.toFixed(2)}`);
  console.log(`🎯 Eventi medi per multipla: ${avgEventsPerMultiple.toFixed(1)}`);
  if (USE_KELLY) {
    console.log(`💰 Stake medio (Kelly): ${avgStakePercentage.toFixed(1)}% del capitale`);
  }
  console.log('');

  // 🎯 Statistiche Goal/NoGoal
  if (ENABLE_GG_NG) {
    const allEventsList = results.flatMap(r => r.events);
    const ggNgEvents = allEventsList.filter(e => isGGorNG(e.prediction));
    const ggNgCount = ggNgEvents.length;
    const ggNgPercentage = (ggNgCount / allEventsList.length) * 100;
    const ggNgWon = ggNgEvents.filter(e => e.correct).length;
    const ggNgWinRate = ggNgCount > 0 ? (ggNgWon / ggNgCount) * 100 : 0;

    console.log(`${colors.bright}${colors.cyan}⚽ STATISTICHE GOAL/NOGOAL${colors.reset}`);
    console.log(`   - Eventi GG/NG: ${ggNgCount}/${allEventsList.length} (${ggNgPercentage.toFixed(1)}%)`);
    console.log(`   - Win Rate GG/NG: ${ggNgWinRate.toFixed(1)}%`);
    console.log(`   - Multiple con GG/NG: ${results.filter(r => r.events.some(e => isGGorNG(e.prediction))).length}/${results.length}\n`);
  }

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
    console.log(`${colors.green}🎉 Ottimo! Il capitale è cresciuto del ${((currentCapital / INITIAL_CAPITAL - 1) * 100).toFixed(1)}%${colors.reset}`);
  } else if (currentCapital > INITIAL_CAPITAL) {
    console.log(`${colors.yellow}👍 Buono! Il capitale è cresciuto del ${((currentCapital / INITIAL_CAPITAL - 1) * 100).toFixed(1)}%${colors.reset}`);
  } else if (currentCapital > INITIAL_CAPITAL * 0.9) {
    console.log(`${colors.yellow}⚠️  Il capitale è leggermente diminuito (${((currentCapital / INITIAL_CAPITAL - 1) * 100).toFixed(1)}%)${colors.reset}`);
  } else {
    console.log(`${colors.red}❌ Attenzione! Il capitale è diminuito significativamente (${((currentCapital / INITIAL_CAPITAL - 1) * 100).toFixed(1)}%)${colors.reset}`);
  }
}

// Esegui backtesting
runBacktest().catch(console.error);
