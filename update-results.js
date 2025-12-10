/**
 * Script per aggiornare i risultati delle raccomandazioni logggate
 * Verifica quali scommesse sono state vinte/perse dopo le partite
 */

const moment = require('moment-timezone');

const API_URL = process.env.API_URL || 'http://localhost:3001';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Verifica se una scommessa è stata vinta
function checkBetWon(prediction, homeGoals, awayGoals) {
  const h = parseInt(homeGoals);
  const a = parseInt(awayGoals);
  
  switch (prediction) {
    case '1': return h > a;
    case 'X': return h === a;
    case '2': return h < a;
    case '1X': return h >= a;
    case 'X2': return h <= a;
    case '12': return h !== a;
    case 'Over 2.5': return (h + a) > 2.5;
    case 'Under 2.5': return (h + a) < 2.5;
    case 'GG': return h > 0 && a > 0;
    case 'NG': return h === 0 || a === 0;
    default:
      // Gestisci altri formati
      if (prediction.startsWith('Over')) {
        const threshold = parseFloat(prediction.replace('Over ', ''));
        return (h + a) > threshold;
      }
      if (prediction.startsWith('Under')) {
        const threshold = parseFloat(prediction.replace('Under ', ''));
        return (h + a) < threshold;
      }
      return null;
  }
}

async function updateResultsForDate(date) {
  console.log(`\n${colors.cyan}📅 Aggiornamento risultati per ${date}...${colors.reset}`);
  
  try {
    // 1. Recupera le raccomandazioni logggate per questa data
    const loggedResponse = await fetch(`${API_URL}/api/recommendation-logs/logged/${date}`);
    
    if (!loggedResponse.ok) {
      if (loggedResponse.status === 404) {
        console.log(`${colors.yellow}  ⚠️  Nessuna raccomandazione trovata per ${date}${colors.reset}`);
        return null;
      }
      throw new Error(`Failed to fetch logged recommendations: ${loggedResponse.status}`);
    }
    
    const { dailyBet, recommendations } = await loggedResponse.json();
    
    if (!recommendations || recommendations.length === 0) {
      console.log(`${colors.yellow}  ⚠️  Nessuna raccomandazione da verificare${colors.reset}`);
      return null;
    }
    
    console.log(`${colors.blue}  📋 ${recommendations.length} raccomandazioni da verificare${colors.reset}`);
    
    // 2. Recupera i risultati delle partite
    const fixturesResponse = await fetch(`${API_URL}/api/fixtures/sm/range?startDate=${date}&endDate=${date}`);
    const fixturesData = await fixturesResponse.json();
    
    if (!fixturesData.fixtures || fixturesData.fixtures.length === 0) {
      console.log(`${colors.yellow}  ⚠️  Nessuna partita trovata per ${date}${colors.reset}`);
      return null;
    }
    
    // 3. Verifica ogni raccomandazione
    const results = [];
    let wonCount = 0;
    let lostCount = 0;
    let pendingCount = 0;
    
    for (const rec of recommendations) {
      const fixture = fixturesData.fixtures.find(f => f.id === rec.fixtureId);
      
      if (!fixture) {
        console.log(`${colors.yellow}  ⚠️  Partita ${rec.homeTeam} vs ${rec.awayTeam} non trovata${colors.reset}`);
        pendingCount++;
        continue;
      }
      
      if (fixture.status !== 'FT' || !fixture.score) {
        console.log(`${colors.yellow}  ⏳ ${rec.homeTeam} vs ${rec.awayTeam}: partita non ancora finita${colors.reset}`);
        pendingCount++;
        continue;
      }
      
      const actualResult = `${fixture.score.home}-${fixture.score.away}`;
      const won = checkBetWon(rec.prediction, fixture.score.home, fixture.score.away);
      
      results.push({
        fixtureId: rec.fixtureId,
        actualResult,
        won,
      });
      
      if (won) {
        wonCount++;
        console.log(`${colors.green}  ✓ ${rec.homeTeam} vs ${rec.awayTeam}: ${rec.prediction} @${rec.odds} → ${actualResult} ✅ VINTA${colors.reset}`);
      } else {
        lostCount++;
        console.log(`${colors.red}  ✗ ${rec.homeTeam} vs ${rec.awayTeam}: ${rec.prediction} @${rec.odds} → ${actualResult} ❌ PERSA${colors.reset}`);
      }
    }
    
    // 4. Aggiorna i risultati nel database
    if (results.length > 0) {
      const updateResponse = await fetch(`${API_URL}/api/recommendation-logs/update-results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, results }),
      });
      
      if (updateResponse.ok) {
        console.log(`${colors.green}  ✅ Risultati aggiornati nel database${colors.reset}`);
      } else {
        console.log(`${colors.yellow}  ⚠️  Errore aggiornamento database${colors.reset}`);
      }
    }
    
    // 5. Riepilogo
    const allWon = wonCount > 0 && lostCount === 0;
    console.log(`\n${colors.bright}  📊 Riepilogo: ${wonCount}W / ${lostCount}L / ${pendingCount}P${colors.reset}`);
    console.log(`${colors.bright}  🎯 Schedina: ${allWon ? '✅ VINTA' : '❌ PERSA'}${colors.reset}`);
    console.log(`${colors.bright}  💰 Quota: ${dailyBet.totalOdds.toFixed(2)}${colors.reset}`);
    
    return {
      date,
      won: allWon,
      wonCount,
      lostCount,
      pendingCount,
      totalOdds: dailyBet.totalOdds,
    };
    
  } catch (error) {
    console.error(`${colors.red}  ❌ Errore: ${error.message}${colors.reset}`);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Aggiorna risultati per ieri (default)
    const yesterday = moment().subtract(1, 'day').format('YYYY-MM-DD');
    await updateResultsForDate(yesterday);
  } else if (args[0] === '--all') {
    // Aggiorna tutti i risultati pendenti
    console.log(`${colors.cyan}${colors.bright}📊 Aggiornamento tutti i risultati pendenti...${colors.reset}`);
    
    const listResponse = await fetch(`${API_URL}/api/recommendation-logs/logged-list`);
    const dailyBets = await listResponse.json();
    
    const pending = dailyBets.filter(b => b.won === null);
    console.log(`${colors.blue}  📋 ${pending.length} schedine pendenti${colors.reset}`);
    
    for (const bet of pending) {
      await updateResultsForDate(bet.id);
    }
  } else {
    // Aggiorna per data specifica
    let date = args[0];
    
    if (date.includes('/')) {
      const [day, month, year] = date.split('/');
      date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    await updateResultsForDate(date);
  }
  
  console.log(`\n${colors.cyan}✅ Completato${colors.reset}\n`);
}

main().catch(error => {
  console.error(`${colors.red}❌ Errore fatale: ${error.message}${colors.reset}`);
  process.exit(1);
});
