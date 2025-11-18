const moment = require('moment-timezone');

// 📅 UPTEST - Predizioni per date future
const API_URL = process.env.API_URL || 'http://localhost:3001';
const STAKE_PERCENTAGE = 0.5; // 30% del capitale (informativo)
const TARGET_ODDS = 1.3;
const MIN_ODDS = 1.1;
const MAX_ODDS = 1.6;
const MAX_EVENTS = 2;
const PREFERRED_EVENTS = 1;

// 🎯 GOAL/NOGOAL SETTINGS
const ENABLE_GG_NG = true;
const MIN_GG_NG_CONFIDENCE = 60;

// FILTRI QUALITÀ per raccomandazioni
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
  magenta: '\x1b[35m',
};

// 🎯 Funzione per identificare se una predizione è Goal/NoGoal
function isGGorNG(prediction) {
  const pred = prediction.toLowerCase();
  return pred.includes('gg') || pred.includes('ng') || 
         pred === 'goal' || pred === 'no goal' ||
         pred.includes('goal/goal') || pred.includes('nogoal') ||
         pred.includes('btts');
}

// Funzione per calcolare score di una raccomandazione
function calculateScore(rec) {
  const valueRating = rec.valueRating || rec.value || 0;
  const confidence = (rec.confidence || 0) > 1 ? rec.confidence : (rec.confidence || 0) * 100;
  const expectedValue = (rec.expectedValue || 0) > 1 ? rec.expectedValue : (rec.expectedValue || 0) * 100;
  const oddsBonus = rec.odds >= 1.7 && rec.odds <= 2.5 ? 15 : 0;
  
  return valueRating * 0.4 + confidence * 0.3 + expectedValue * 0.2 + oddsBonus;
}

// Funzione per generare predizioni per una data specifica
async function generatePredictionsForDate(date) {
  console.log(`\n${colors.cyan}${colors.bright}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}  🔮 PREDIZIONI PER ${date}${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}═══════════════════════════════════════════════════════${colors.reset}\n`);
  
  try {
    // 1. Carica partite del giorno
    console.log(`${colors.blue}📡 Caricamento partite...${colors.reset}`);
    const fixturesResponse = await fetch(`${API_URL}/api/fixtures/sm/range?startDate=${date}&endDate=${date}`);
    const fixturesData = await fixturesResponse.json();
    
    if (!fixturesData.fixtures || fixturesData.fixtures.length === 0) {
      console.log(`${colors.yellow}  ⚠️  Nessuna partita trovata per ${date}${colors.reset}`);
      return null;
    }
    
    console.log(`${colors.green}  ✓ ${fixturesData.fixtures.length} partite trovate${colors.reset}\n`);
    
    // Filtra solo partite in programma (non ancora giocate)
    const upcomingFixtures = fixturesData.fixtures.filter(f => 
      f.status !== 'FT' && f.status !== 'POSTP' && f.status !== 'CANCL'
    );
    
    if (upcomingFixtures.length === 0) {
      console.log(`${colors.yellow}  ⚠️  Nessuna partita in programma per ${date}${colors.reset}`);
      return null;
    }
    
    console.log(`${colors.blue}🎯 Analisi raccomandazioni per ${upcomingFixtures.length} partite...${colors.reset}\n`);
    
    // 2. Per ogni partita, carica raccomandazioni IN CHUNKS
    const allEvents = [];
    const chunkSize = Math.ceil(upcomingFixtures.length / 3);
    
    for (let i = 0; i < upcomingFixtures.length; i += chunkSize) {
      const chunk = upcomingFixtures.slice(i, i + chunkSize);
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
            
            // Filtra per qualità
            const qualityRecs = normalizedRecs.filter(rec => {
              return rec.confidence >= MIN_CONFIDENCE &&
                     rec.expectedValue >= MIN_EXPECTED_VALUE &&
                     rec.valueRating >= MIN_VALUE_RATING;
            });
            
            if (qualityRecs.length === 0) {
              return null;
            }
            
            // Calcola score e prendi la migliore
            const bestRec = qualityRecs
              .map(rec => ({
                ...rec,
                score: calculateScore(rec)
              }))
              .sort((a, b) => b.score - a.score)[0];
            
            return {
              fixture,
              recommendation: bestRec
            };
          }
          return null;
        } catch (error) {
          return null;
        }
      });
      
      const chunkResults = await Promise.all(fixturePromises);
      allEvents.push(...chunkResults.filter(event => event !== null));
      
      if (i + chunkSize < upcomingFixtures.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (allEvents.length === 0) {
      console.log(`\n${colors.yellow}  ⚠️  Nessun evento con raccomandazioni valide${colors.reset}`);
      return null;
    }
    
    console.log(`\n${colors.green}  ✓ ${allEvents.length} eventi con raccomandazioni di qualità${colors.reset}\n`);
    
    // 3. Ordina per score
    allEvents.sort((a, b) => b.recommendation.score - a.recommendation.score);
    
    // 4. Genera multipla ottimale
    let bestMultiple = null;
    let bestDiffFromTarget = Infinity;
    
    const eventSequence = [PREFERRED_EVENTS];
    for (let n = 1; n <= MAX_EVENTS; n++) {
      if (n !== PREFERRED_EVENTS) eventSequence.push(n);
    }
    
    for (const numEvents of eventSequence) {
      if (numEvents > allEvents.length) continue;
      
      // Genera combinazioni di numEvents
      const combinations = generateCombinations(allEvents, numEvents);
      
      for (const combination of combinations) {
        let totalOdds = 1;
        const events = [];
        let hasGGNG = false;
        
        for (const event of combination) {
          const rec = event.recommendation;
          
          // Filtra quote troppo basse se attivo
          if (ENABLE_LOW_ODDS_FILTER && rec.odds < MIN_ODDS_SINGLE_EVENT) {
            continue;
          }
          
          // Filtra GG/NG se non abilitato
          if (!ENABLE_GG_NG && isGGorNG(rec.prediction)) {
            continue;
          }
          
          if (isGGorNG(rec.prediction)) {
            hasGGNG = true;
            if (rec.confidence < MIN_GG_NG_CONFIDENCE) {
              continue;
            }
          }
          
          totalOdds *= rec.odds;
          events.push({
            fixture: event.fixture,
            recommendation: rec
          });
        }
        
        if (events.length !== numEvents) continue;
        if (totalOdds < MIN_ODDS || totalOdds > MAX_ODDS) continue;
        
        const diffFromTarget = Math.abs(totalOdds - TARGET_ODDS);
        if (diffFromTarget < bestDiffFromTarget) {
          bestDiffFromTarget = diffFromTarget;
          bestMultiple = {
            events,
            totalOdds,
            hasGGNG
          };
        }
      }
      
      // Se troviamo una multipla valida con PREFERRED_EVENTS, fermiamoci
      if (bestMultiple && numEvents === PREFERRED_EVENTS) {
        break;
      }
    }
    
    return bestMultiple;
    
  } catch (error) {
    console.error(`${colors.red}❌ Errore: ${error.message}${colors.reset}`);
    return null;
  }
}

// Funzione per generare combinazioni
function generateCombinations(array, size) {
  const result = [];
  
  function combine(start, combo) {
    if (combo.length === size) {
      result.push([...combo]);
      return;
    }
    
    for (let i = start; i < array.length; i++) {
      combo.push(array[i]);
      combine(i + 1, combo);
      combo.pop();
    }
  }
  
  combine(0, []);
  return result;
}

// Formatta orario partita
function formatMatchTime(dateString) {
  const date = moment(dateString).tz('Europe/Rome');
  return date.format('HH:mm');
}

// Visualizza la schedina
function displayBettingSlip(multiple, targetDate) {
  if (!multiple) {
    console.log(`\n${colors.yellow}❌ Nessuna schedina trovata con i parametri specificati${colors.reset}`);
    return;
  }
  
  console.log(`${colors.green}${colors.bright}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.green}${colors.bright}           🎯 SCHEDINA CONSIGLIATA${colors.reset}`);
  console.log(`${colors.green}${colors.bright}═══════════════════════════════════════════════════════${colors.reset}\n`);
  
  console.log(`${colors.cyan}📅 Data: ${colors.bright}${targetDate}${colors.reset}`);
  console.log(`${colors.cyan}📊 Quota totale: ${colors.bright}${multiple.totalOdds.toFixed(2)}${colors.reset}`);
  console.log(`${colors.cyan}🎲 Eventi: ${colors.bright}${multiple.events.length}${colors.reset}`);
  console.log(`${colors.cyan}💰 Stake consigliato: ${colors.bright}${(STAKE_PERCENTAGE * 100).toFixed(0)}%${colors.reset} del capitale\n`);
  
  console.log(`${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
  
  multiple.events.forEach((event, index) => {
    const fixture = event.fixture;
    const rec = event.recommendation;
    const matchTime = formatMatchTime(fixture.date);
    const isGGNG = isGGorNG(rec.prediction);
    
    console.log(`${colors.bright}${index + 1}. ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}${colors.reset}`);
    console.log(`   ${colors.blue}🏆 ${fixture.league.name}${colors.reset}`);
    console.log(`   ${colors.cyan}🕐 Orario: ${matchTime}${colors.reset}`);
    console.log(`   ${colors.magenta}${isGGNG ? '🎯' : '⚽'} Scommessa: ${colors.bright}${rec.prediction} @${rec.odds.toFixed(2)}${colors.reset}`);
    console.log(`   ${colors.yellow}📊 Confidence: ${rec.confidence.toFixed(1)}%${colors.reset}`);
    console.log(`   ${colors.yellow}💎 Expected Value: ${rec.expectedValue.toFixed(1)}%${colors.reset}`);
    console.log(`   ${colors.yellow}⭐ Value Rating: ${rec.valueRating}/5${colors.reset}`);
    console.log(`   ${colors.yellow}🎲 Score: ${rec.score.toFixed(1)}${colors.reset}`);
    
    if (rec.reasoning) {
      console.log(`   ${colors.blue}💡 ${rec.reasoning}${colors.reset}`);
    }
    
    console.log();
  });
  
  console.log(`${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
  
  // Calcolo stake e potenziale vincita su €100
  const exampleCapital = 100;
  const stake = exampleCapital * STAKE_PERCENTAGE;
  const potentialWin = stake * multiple.totalOdds;
  const potentialProfit = potentialWin - stake;
  
  console.log(`${colors.cyan}💰 ESEMPIO CON CAPITALE €${exampleCapital.toFixed(2)}:${colors.reset}`);
  console.log(`   ${colors.bright}Stake: €${stake.toFixed(2)}${colors.reset}`);
  console.log(`   ${colors.green}Vincita potenziale: €${potentialWin.toFixed(2)}${colors.reset}`);
  console.log(`   ${colors.green}Profitto potenziale: +€${potentialProfit.toFixed(2)} (+${((potentialProfit / exampleCapital) * 100).toFixed(1)}%)${colors.reset}\n`);
  
  console.log(`${colors.green}${colors.bright}═══════════════════════════════════════════════════════${colors.reset}\n`);
  
  // Note operative
  console.log(`${colors.yellow}📝 NOTE OPERATIVE:${colors.reset}`);
  console.log(`   • Controlla sempre le quote attuali prima di giocare`);
  console.log(`   • Verifica che tutte le partite siano ancora in programma`);
  console.log(`   • Gli orari sono in fuso Europe/Rome (CET/CEST)`);
  console.log(`   • Gestisci responsabilmente il tuo capitale`);
  if (multiple.hasGGNG) {
    console.log(`   ${colors.cyan}• 🎯 Include mercato Goal/NoGoal${colors.reset}`);
  }
  console.log();
}

// MAIN
async function main() {
  // Parse argomenti
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`${colors.red}❌ Errore: devi specificare una data${colors.reset}`);
    console.log(`${colors.cyan}Uso: node uptest-multiple.js <data>${colors.reset}`);
    console.log(`${colors.cyan}Esempio: node uptest-multiple.js 22/11/2025${colors.reset}`);
    console.log(`${colors.cyan}Formati accettati: DD/MM/YYYY, YYYY-MM-DD${colors.reset}`);
    process.exit(1);
  }
  
  const dateInput = args[0];
  let targetDate;
  
  // Parse data in vari formati
  if (dateInput.includes('/')) {
    // Formato DD/MM/YYYY
    const [day, month, year] = dateInput.split('/');
    targetDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  } else if (dateInput.includes('-')) {
    // Formato YYYY-MM-DD (già ok)
    targetDate = dateInput;
  } else {
    console.log(`${colors.red}❌ Formato data non valido${colors.reset}`);
    console.log(`${colors.cyan}Formati accettati: DD/MM/YYYY o YYYY-MM-DD${colors.reset}`);
    process.exit(1);
  }
  
  // Valida data
  const parsedDate = moment(targetDate, 'YYYY-MM-DD', true);
  if (!parsedDate.isValid()) {
    console.log(`${colors.red}❌ Data non valida: ${targetDate}${colors.reset}`);
    process.exit(1);
  }
  
  // Verifica che sia nel futuro
  const today = moment().startOf('day');
  if (parsedDate.isBefore(today)) {
    console.log(`${colors.yellow}⚠️  Attenzione: la data ${targetDate} è nel passato${colors.reset}`);
    console.log(`${colors.yellow}   Per analisi storiche usa backtest-multiple.js${colors.reset}\n`);
  }
  
  console.log(`${colors.cyan}${colors.bright}╔═══════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}║           🔮 UPTEST - PREDIZIONI FUTURE              ║${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}╚═══════════════════════════════════════════════════════╝${colors.reset}\n`);
  
  console.log(`${colors.blue}📋 PARAMETRI:${colors.reset}`);
  console.log(`   Target Odds: ${TARGET_ODDS.toFixed(2)}`);
  console.log(`   Range Odds: ${MIN_ODDS.toFixed(2)} - ${MAX_ODDS.toFixed(2)}`);
  console.log(`   Eventi preferiti: ${PREFERRED_EVENTS}`);
  console.log(`   Max eventi: ${MAX_EVENTS}`);
  console.log(`   Min Confidence: ${MIN_CONFIDENCE}%`);
  console.log(`   Min Expected Value: ${(MIN_EXPECTED_VALUE * 100).toFixed(0)}%`);
  console.log(`   Min Value Rating: ${MIN_VALUE_RATING}/5`);
  console.log(`   Goal/NoGoal: ${ENABLE_GG_NG ? 'Abilitato' : 'Disabilitato'}`);
  
  const startTime = Date.now();
  
  // Genera predizioni
  const multiple = await generatePredictionsForDate(targetDate);
  
  // Visualizza schedina
  displayBettingSlip(multiple, targetDate);
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`${colors.cyan}⏱️  Tempo di elaborazione: ${elapsed}s${colors.reset}\n`);
}

main().catch(error => {
  console.error(`${colors.red}❌ Errore fatale: ${error.message}${colors.reset}`);
  process.exit(1);
});
