const moment = require('moment-timezone');

// 📅 UPTEST - Predizioni per date future (ALLINEATO A BACKTEST)
const API_URL = process.env.API_URL || 'http://localhost:3001';
const STAKE_PERCENTAGE = 0.30; // 30% del capitale (identico a backtest)
const TARGET_ODDS = 1.4; // ALLINEATO A BACKTEST
const MIN_ODDS = 1.4;
const MAX_ODDS = 4.0;

// 🔧 PARAMETRO: Esclude partite già giocate (status FT)
// true = considera solo partite non ancora giocate (NS, SCHEDULED)
// false = considera tutte le partite (anche quelle finite)
const EXCLUDE_FINISHED_MATCHES = true;

// 🔧 PARAMETRO: Esclude partite già iniziate (orario passato)
// true = considera solo partite che devono ancora iniziare
// false = considera tutte le partite indipendentemente dall'orario
const EXCLUDE_STARTED_MATCHES = true;

// 🔧 PARAMETRO: Forza quote fresche (bypass cache)
// Impostato dinamicamente via --fresh flag
let FRESH_ODDS = false;

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

// 🔥 RIMOSSO calculateScore - usa solo filtri del backend API
// Il backend già applica filtri ottimali su EV, confidence e valueRating
// ALLINEATO A BACKTEST

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
    
    // Filtra partite in base al parametro EXCLUDE_FINISHED_MATCHES
    let fixtures = fixturesData.fixtures;
    
    if (EXCLUDE_FINISHED_MATCHES) {
      const beforeFilter = fixtures.length;
      fixtures = fixtures.filter(f => f.status !== 'FT');
      const excluded = beforeFilter - fixtures.length;
      if (excluded > 0) {
        console.log(`${colors.yellow}  ⏭️  ${excluded} partite già giocate escluse${colors.reset}`);
      }
    }
    
    // Filtra partite in base al parametro EXCLUDE_STARTED_MATCHES
    if (EXCLUDE_STARTED_MATCHES) {
      const now = moment();
      const beforeFilter = fixtures.length;
      fixtures = fixtures.filter(f => {
        const matchTime = moment(f.date);
        return matchTime.isAfter(now);
      });
      const excluded = beforeFilter - fixtures.length;
      if (excluded > 0) {
        console.log(`${colors.yellow}  ⏭️  ${excluded} partite già iniziate escluse (ora: ${now.format('HH:mm')})${colors.reset}`);
      }
    }
    
    if (fixtures.length === 0) {
      console.log(`${colors.yellow}  ⚠️  Nessuna partita disponibile per ${date}${colors.reset}`);
      return null;
    }
    
    console.log(`${colors.blue}🎯 Analisi raccomandazioni per ${fixtures.length} partite...${colors.reset}\n`);
    
    // 2. Per ogni partita, carica raccomandazioni IN CHUNKS
    const allEvents = [];
    const chunkSize = Math.ceil(fixtures.length / 3);
    
    for (let i = 0; i < fixtures.length; i += chunkSize) {
      const chunk = fixtures.slice(i, i + chunkSize);
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
              skipCache: FRESH_ODDS, // 🔄 Bypass cache se --fresh
            })
          });
          
          if (!recsResponse.ok) {
            return null;
          }
          
          const recsData = await recsResponse.json();
          
          if (recsData.recommendations && recsData.recommendations.length > 0) {
            // 🔥 USA DIRETTAMENTE LE RACCOMANDAZIONI DAL BACKEND (ALLINEATO A BACKTEST)
            // Il backend già applica tutti i filtri necessari (EV, confidence, valueRating)
            // Prendi semplicemente la prima (già ordinata per importanza dal backend)
            const bestRec = recsData.recommendations[0];
            
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
      
      if (i + chunkSize < fixtures.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (allEvents.length === 0) {
      console.log(`\n${colors.yellow}  ⚠️  Nessun evento con raccomandazioni valide${colors.reset}`);
      return null;
    }
    
    console.log(`\n${colors.green}  ✓ ${allEvents.length} eventi con raccomandazioni valide${colors.reset}\n`);
    
    // 3. Ordina per expectedValue (valore atteso) - criterio principale del backend (IDENTICO A BACKTEST)
    // Ordine secondario: confidence (per parità di EV)
    allEvents.sort((a, b) => {
      const evDiff = b.recommendation.expectedValue - a.recommendation.expectedValue;
      if (Math.abs(evDiff) > 0.001) return evDiff;
      return b.recommendation.confidence - a.recommendation.confidence;
    });
    
    // 4. STRATEGIA FLESSIBILE: Cerca di raggiungere quota ~1.8 con 1-3 partite (IDENTICO A BACKTEST)
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
      console.log(`\n${colors.yellow}  ⚠️  Impossibile creare multipla con quota target ${TARGET_ODDS}${colors.reset}`);
      return null;
    }
    
    const selectedEvents = bestMultiple.events;
    const finalOdds = bestMultiple.odds;
    
    console.log(`\n${colors.bright}${colors.cyan}📊 MULTIPLA CONSIGLIATA: ${selectedEvents.length} eventi, quota ${finalOdds.toFixed(2)}${colors.reset}\n`);
    
    // Ritorna multipla con formato compatibile per display
    return {
      events: selectedEvents,
      totalOdds: finalOdds
    };
    
  } catch (error) {
    console.error(`${colors.red}❌ Errore: ${error.message}${colors.reset}`);
    return null;
  }
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
    
    console.log(`${colors.bright}${index + 1}. ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}${colors.reset}`);
    console.log(`   ${colors.blue}🏆 ${fixture.league.name}${colors.reset}`);
    console.log(`   ${colors.cyan}🕐 Orario: ${matchTime}${colors.reset}`);
    console.log(`   ${colors.magenta}⚽ Scommessa: ${colors.bright}${rec.prediction} @${rec.odds.toFixed(2)}${colors.reset}`);
    console.log(`   ${colors.yellow}📊 Confidence: ${rec.confidence.toFixed(1)}%${colors.reset}`);
    console.log(`   ${colors.yellow}💎 Expected Value: ${rec.expectedValue.toFixed(1)}%${colors.reset}`);
    console.log(`   ${colors.yellow}⭐ Value Rating: ${rec.valueRating}/5${colors.reset}`);
    
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
  console.log();
}

// MAIN
async function main() {
  // Parse argomenti
  const args = process.argv.slice(2);
  
  // Check for --fresh flag
  const freshIndex = args.indexOf('--fresh');
  if (freshIndex !== -1) {
    FRESH_ODDS = true;
    args.splice(freshIndex, 1); // Rimuovi il flag dagli args
  }
  
  if (args.length === 0) {
    console.log(`${colors.red}❌ Errore: devi specificare una data${colors.reset}`);
    console.log(`${colors.cyan}Uso: node uptest-multiple.js <data> [--fresh]${colors.reset}`);
    console.log(`${colors.cyan}Esempio: node uptest-multiple.js 22/11/2025${colors.reset}`);
    console.log(`${colors.cyan}         node uptest-multiple.js 22/11/2025 --fresh  (quote aggiornate)${colors.reset}`);
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
  console.log(`   Stake: ${(STAKE_PERCENTAGE * 100).toFixed(0)}% del capitale`);
  if (FRESH_ODDS) {
    console.log(`   ${colors.yellow}🔄 FRESH MODE: Quote aggiornate (no cache)${colors.reset}`);
  }
  
  const startTime = Date.now();
  
  // Genera predizioni
  const multiple = await generatePredictionsForDate(targetDate);
  
  // Visualizza schedina
  displayBettingSlip(multiple, targetDate);
  
  // 📝 LOG RACCOMANDAZIONI SU DATABASE
  if (multiple && multiple.events.length > 0) {
    await logRecommendationsToDatabase(multiple, targetDate);
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`${colors.cyan}⏱️  Tempo di elaborazione: ${elapsed}s${colors.reset}\n`);
}

// Logga le raccomandazioni sul database per tracking storico
async function logRecommendationsToDatabase(multiple, targetDate) {
  try {
    const recommendations = multiple.events.map(event => ({
      fixtureId: event.fixture.id,
      fixtureApiId: event.fixture.id,
      homeTeam: event.fixture.homeTeam.name,
      awayTeam: event.fixture.awayTeam.name,
      leagueName: event.fixture.league.name,
      leagueId: event.fixture.league.id,
      matchDate: event.fixture.date,
      matchTime: formatMatchTime(event.fixture.date),
      prediction: event.recommendation.prediction,
      odds: event.recommendation.odds,
      confidence: event.recommendation.confidence,
      expectedValue: event.recommendation.expectedValue,
      valueRating: event.recommendation.valueRating || 3,
    }));

    const response = await fetch(`${API_URL}/api/recommendation-logs/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: targetDate,
        recommendations,
        totalOdds: multiple.totalOdds,
        stakePercent: STAKE_PERCENTAGE,
      }),
    });

    if (response.ok) {
      console.log(`${colors.green}✅ Raccomandazioni salvate nel database per ${targetDate}${colors.reset}`);
    } else {
      console.log(`${colors.yellow}⚠️  Impossibile salvare raccomandazioni: ${response.status}${colors.reset}`);
    }
  } catch (error) {
    console.log(`${colors.yellow}⚠️  Errore salvataggio raccomandazioni: ${error.message}${colors.reset}`);
  }
}

main().catch(error => {
  console.error(`${colors.red}❌ Errore fatale: ${error.message}${colors.reset}`);
  process.exit(1);
});
