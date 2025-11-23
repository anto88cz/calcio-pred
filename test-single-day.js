const moment = require('moment-timezone');

/**
 * 🎯 TEST SINGOLO GIORNO - Verifica accuratezza raccomandazioni
 * 
 * Usage: node test-single-day.js [DATA]
 * Esempio: node test-single-day.js 2025-11-15
 * 
 * Controlla TUTTE le raccomandazioni generate per una data specifica
 * e valida i risultati contro le partite finite.
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

// Colori console
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

// Leggi data da argomenti
const testDate = process.argv[2];

if (!testDate) {
  console.error(`${colors.red}❌ ERRORE: Devi specificare una data${colors.reset}`);
  console.log(`\nUsage: node test-single-day.js [DATA]`);
  console.log(`Esempio: node test-single-day.js 2025-11-15\n`);
  process.exit(1);
}

// Valida formato data
if (!/^\d{4}-\d{2}-\d{2}$/.test(testDate)) {
  console.error(`${colors.red}❌ ERRORE: Formato data non valido. Usa YYYY-MM-DD${colors.reset}`);
  process.exit(1);
}

const testMoment = moment(testDate);
if (!testMoment.isValid()) {
  console.error(`${colors.red}❌ ERRORE: Data non valida${colors.reset}`);
  process.exit(1);
}

// Verifica che sia una data passata
if (testMoment.isAfter(moment())) {
  console.error(`${colors.red}❌ ERRORE: Devi specificare una data PASSATA (oggi è ${moment().format('YYYY-MM-DD')})${colors.reset}`);
  process.exit(1);
}

/**
 * Normalizza il nome della predizione
 */
function normalizePrediction(pred) {
  if (!pred) return null;
  
  const p = pred.toLowerCase().trim();
  
  // 1X2
  if (p === '1' || p === 'home' || p === 'home win') return '1';
  if (p === 'x' || p === 'draw') return 'X';
  if (p === '2' || p === 'away' || p === 'away win') return '2';
  
  // Double Chance
  if (p === '1x' || p === 'home/draw') return '1X';
  if (p === '12' || p === 'home/away') return '12';
  if (p === 'x2' || p === 'draw/away') return 'X2';
  
  // Over/Under
  if (p.includes('over')) {
    const match = p.match(/(\d+\.?\d*)/);
    if (match) return `Over ${match[1]}`;
  }
  if (p.includes('under')) {
    const match = p.match(/(\d+\.?\d*)/);
    if (match) return `Under ${match[1]}`;
  }
  
  // Goal/NoGoal
  if (p.includes('gg') || p.includes('goal/goal') || p.includes('btts')) return 'GG';
  if (p.includes('ng') || p.includes('nogoal') || p.includes('no goal')) return 'NG';
  
  return pred;
}

/**
 * Verifica se la predizione è corretta
 */
function checkPrediction(prediction, homeScore, awayScore) {
  const pred = normalizePrediction(prediction);
  
  if (homeScore === null || awayScore === null) {
    return { status: 'UNKNOWN', reason: 'Match not finished' };
  }
  
  // 1X2
  if (pred === '1') return { status: homeScore > awayScore ? 'WIN' : 'LOSS', reason: `Result: ${homeScore}-${awayScore}` };
  if (pred === 'X') return { status: homeScore === awayScore ? 'WIN' : 'LOSS', reason: `Result: ${homeScore}-${awayScore}` };
  if (pred === '2') return { status: homeScore < awayScore ? 'WIN' : 'LOSS', reason: `Result: ${homeScore}-${awayScore}` };
  
  // Double Chance
  if (pred === '1X') return { status: homeScore >= awayScore ? 'WIN' : 'LOSS', reason: `Result: ${homeScore}-${awayScore}` };
  if (pred === '12') return { status: homeScore !== awayScore ? 'WIN' : 'LOSS', reason: `Result: ${homeScore}-${awayScore}` };
  if (pred === 'X2') return { status: homeScore <= awayScore ? 'WIN' : 'LOSS', reason: `Result: ${homeScore}-${awayScore}` };
  
  // Over/Under
  if (pred?.includes('Over')) {
    const threshold = parseFloat(pred.split(' ')[1]);
    const total = homeScore + awayScore;
    return { status: total > threshold ? 'WIN' : 'LOSS', reason: `Total goals: ${total} (threshold: ${threshold})` };
  }
  if (pred?.includes('Under')) {
    const threshold = parseFloat(pred.split(' ')[1]);
    const total = homeScore + awayScore;
    return { status: total < threshold ? 'WIN' : 'LOSS', reason: `Total goals: ${total} (threshold: ${threshold})` };
  }
  
  // Goal/NoGoal
  if (pred === 'GG') {
    const gg = homeScore > 0 && awayScore > 0;
    return { status: gg ? 'WIN' : 'LOSS', reason: `Both scored: ${gg}` };
  }
  if (pred === 'NG') {
    const ng = homeScore === 0 || awayScore === 0;
    return { status: ng ? 'WIN' : 'LOSS', reason: `Clean sheet: ${ng}` };
  }
  
  return { status: 'UNKNOWN', reason: `Unknown prediction type: ${pred}` };
}

/**
 * Test principale
 */
async function testSingleDay() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${colors.bright}${colors.cyan}🎯 TEST RACCOMANDAZIONI - ${testDate}${colors.reset}`);
  console.log(`${'='.repeat(80)}\n`);
  
  try {
    // 1. Fetch fixtures per la data
    console.log(`${colors.blue}📊 Fetching fixtures...${colors.reset}`);
    const fixturesResponse = await fetch(`${API_URL}/api/fixtures/sm/range?startDate=${testDate}&endDate=${testDate}`);
    
    if (!fixturesResponse.ok) {
      throw new Error(`Failed to fetch fixtures: ${fixturesResponse.status}`);
    }
    
    const fixturesData = await fixturesResponse.json();
    const fixtures = fixturesData.fixtures || []; // ⚠️ FIX: era .data, ma è .fixtures
    
    console.log(`${colors.green}✓ Trovate ${fixtures.length} partite totali${colors.reset}`);
    
    if (fixtures.length === 0) {
      console.log(`${colors.yellow}⚠️ Nessuna partita trovata per ${testDate}${colors.reset}\n`);
      return;
    }
    
    // Filtra solo partite finite
    const finishedFixtures = fixtures.filter(f => f.status === 'FT' && f.score);
    console.log(`${colors.green}✓ ${finishedFixtures.length} partite finite${colors.reset}\n`);
    
    if (finishedFixtures.length === 0) {
      console.log(`${colors.yellow}⚠️ Nessuna partita finita per ${testDate}${colors.reset}\n`);
      return;
    }
    
    // 2. Per ogni fixture, ottieni raccomandazioni
    const results = {
      total: 0,
      wins: 0,
      losses: 0,
      unknown: 0,
      recommendations: [],
    };
    
    for (const fixture of finishedFixtures) {
      const matchInfo = `${fixture.homeTeam?.name} vs ${fixture.awayTeam?.name}`;
      
      // Ottieni score
      const homeScore = fixture.score?.home ?? null;
      const awayScore = fixture.score?.away ?? null;
      
      console.log(`${colors.cyan}⚽ ${matchInfo}${colors.reset}`);
      console.log(`   Score: ${homeScore ?? '?'}-${awayScore ?? '?'} (${fixture.status})`);
      
      // Ottieni raccomandazioni
      try {
        const recsResponse = await fetch(`${API_URL}/api/betting-recommendations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fixtureId: fixture.id,
            homeTeamId: fixture.homeTeam?.id,
            awayTeamId: fixture.awayTeam?.id,
            leagueId: fixture.league?.id,
            seasonId: fixture.league?.season,
            homeTeamName: fixture.homeTeam?.name,
            awayTeamName: fixture.awayTeam?.name,
            fixtureDate: fixture.date,
            maxDate: testDate, // Importante per backtest
          }),
        });
        
        if (!recsResponse.ok) {
          console.log(`   ${colors.red}✗ Failed to get recommendations (${recsResponse.status})${colors.reset}\n`);
          continue;
        }
        
        const recsData = await recsResponse.json();
        
        // ⚠️ FIX: gestisci sia formato array che oggetto con .recommendations
        let recommendations = [];
        if (Array.isArray(recsData)) {
          recommendations = recsData;
        } else if (recsData.recommendations) {
          recommendations = recsData.recommendations;
        }
        
        if (recommendations.length === 0) {
          console.log(`   ${colors.yellow}⚠️ No recommendations generated${colors.reset}\n`);
          continue;
        }
        
        // Verifica ogni raccomandazione
        for (const rec of recommendations) {
          results.total++;
          
          const check = checkPrediction(rec.prediction, homeScore, awayScore);
          
          const statusIcon = check.status === 'WIN' ? '✓' : check.status === 'LOSS' ? '✗' : '?';
          const statusColor = check.status === 'WIN' ? colors.green : check.status === 'LOSS' ? colors.red : colors.yellow;
          
          console.log(`   ${statusColor}${statusIcon} ${rec.prediction} @ ${rec.odds?.toFixed(2) || '?'}${colors.reset}`);
          console.log(`      Confidence: ${rec.confidence}% | Value: ${rec.valueRating}⭐ | EV: ${(rec.expectedValue * 100).toFixed(1)}%`);
          console.log(`      ${check.reason}`);
          
          if (check.status === 'WIN') results.wins++;
          else if (check.status === 'LOSS') results.losses++;
          else results.unknown++;
          
          results.recommendations.push({
            match: matchInfo,
            prediction: rec.prediction,
            odds: rec.odds,
            confidence: rec.confidence,
            valueRating: rec.valueRating,
            expectedValue: rec.expectedValue,
            result: check.status,
            reason: check.reason,
            homeScore,
            awayScore,
          });
        }
        
        console.log('');
        
      } catch (error) {
        console.log(`   ${colors.red}✗ Error: ${error.message}${colors.reset}\n`);
      }
    }
    
    // 3. Report finale
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${colors.bright}${colors.magenta}📊 REPORT FINALE${colors.reset}`);
    console.log(`${'='.repeat(80)}\n`);
    
    console.log(`${colors.cyan}Totale raccomandazioni: ${results.total}${colors.reset}`);
    console.log(`${colors.green}✓ Vinte: ${results.wins} (${results.total > 0 ? ((results.wins / results.total) * 100).toFixed(1) : 0}%)${colors.reset}`);
    console.log(`${colors.red}✗ Perse: ${results.losses} (${results.total > 0 ? ((results.losses / results.total) * 100).toFixed(1) : 0}%)${colors.reset}`);
    console.log(`${colors.yellow}? Non verificabili: ${results.unknown}${colors.reset}`);
    
    if (results.total > 0) {
      const winRate = (results.wins / results.total) * 100;
      const avgOdds = results.recommendations.reduce((sum, r) => sum + (r.odds || 0), 0) / results.total;
      const avgConfidence = results.recommendations.reduce((sum, r) => sum + r.confidence, 0) / results.total;
      
      console.log(`\n${colors.cyan}Statistiche:${colors.reset}`);
      console.log(`   Win Rate: ${winRate.toFixed(1)}%`);
      console.log(`   Quota media: ${avgOdds.toFixed(2)}`);
      console.log(`   Confidence media: ${avgConfidence.toFixed(1)}%`);
      
      // ROI teorico
      const totalStake = results.total * 10; // 10€ per bet
      const totalReturn = results.recommendations.reduce((sum, r) => {
        return sum + (r.result === 'WIN' ? 10 * (r.odds || 0) : 0);
      }, 0);
      const roi = ((totalReturn - totalStake) / totalStake) * 100;
      
      console.log(`\n${colors.cyan}ROI simulato (10€/bet):${colors.reset}`);
      console.log(`   Stake totale: ${totalStake.toFixed(2)}€`);
      console.log(`   Return totale: ${totalReturn.toFixed(2)}€`);
      console.log(`   Profitto: ${roi >= 0 ? colors.green : colors.red}${(totalReturn - totalStake).toFixed(2)}€ (${roi.toFixed(1)}%)${colors.reset}`);
    }
    
    console.log(`\n${'='.repeat(80)}\n`);
    
  } catch (error) {
    console.error(`\n${colors.red}❌ ERRORE: ${error.message}${colors.reset}\n`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Esegui test
testSingleDay().catch(console.error);
