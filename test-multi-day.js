const moment = require('moment-timezone');

/**
 * 🎯 TEST MULTI-DAY - Analizza accuratezza raccomandazioni su più giorni
 * 
 * Usage: node test-multi-day.js [START_DATE] [END_DATE]
 * Esempio: node test-multi-day.js 2025-11-15 2025-11-21
 * 
 * Analizza TUTTE le raccomandazioni per un periodo e produce un report
 * dettagliato con pattern, problemi e suggerimenti di miglioramento.
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

// Leggi date da argomenti
const startDate = process.argv[2];
const endDate = process.argv[3];

if (!startDate || !endDate) {
  console.error(`${colors.red}❌ ERRORE: Devi specificare data inizio e fine${colors.reset}`);
  console.log(`\nUsage: node test-multi-day.js [START_DATE] [END_DATE]`);
  console.log(`Esempio: node test-multi-day.js 2025-11-15 2025-11-21\n`);
  process.exit(1);
}

// Valida formato date
if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
  console.error(`${colors.red}❌ ERRORE: Formato data non valido. Usa YYYY-MM-DD${colors.reset}`);
  process.exit(1);
}

const startMoment = moment(startDate);
const endMoment = moment(endDate);

if (!startMoment.isValid() || !endMoment.isValid()) {
  console.error(`${colors.red}❌ ERRORE: Date non valide${colors.reset}`);
  process.exit(1);
}

if (startMoment.isAfter(endMoment)) {
  console.error(`${colors.red}❌ ERRORE: Data inizio deve essere precedente a data fine${colors.reset}`);
  process.exit(1);
}

if (endMoment.isAfter(moment())) {
  console.error(`${colors.red}❌ ERRORE: Data fine deve essere nel PASSATO (oggi è ${moment().format('YYYY-MM-DD')})${colors.reset}`);
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
 * Processa un singolo giorno
 */
async function processSingleDay(date) {
  try {
    const fixturesResponse = await fetch(`${API_URL}/api/fixtures/sm/range?startDate=${date}&endDate=${date}`);
    
    if (!fixturesResponse.ok) {
      console.log(`  ${colors.red}✗ Failed to fetch fixtures for ${date}${colors.reset}`);
      return null;
    }
    
    const fixturesData = await fixturesResponse.json();
    const fixtures = fixturesData.fixtures || [];
    
    if (fixtures.length === 0) {
      console.log(`  ${colors.yellow}⚠️ No fixtures for ${date}${colors.reset}`);
      return null;
    }
    
    // Filtra solo partite finite
    const finishedFixtures = fixtures.filter(f => f.status === 'FT' && f.score);
    
    if (finishedFixtures.length === 0) {
      console.log(`  ${colors.yellow}⚠️ No finished fixtures for ${date}${colors.reset}`);
      return null;
    }
    
    const dayResults = {
      date,
      total: 0,
      wins: 0,
      losses: 0,
      recommendations: [],
    };
    
    // Processa ogni fixture
    for (const fixture of finishedFixtures) {
      const matchInfo = `${fixture.homeTeam?.name} vs ${fixture.awayTeam?.name}`;
      const homeScore = fixture.score?.home ?? null;
      const awayScore = fixture.score?.away ?? null;
      
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
            maxDate: date,
          }),
        });
        
        if (!recsResponse.ok) continue;
        
        const recsData = await recsResponse.json();
        let recommendations = [];
        if (Array.isArray(recsData)) {
          recommendations = recsData;
        } else if (recsData.recommendations) {
          recommendations = recsData.recommendations;
        }
        
        for (const rec of recommendations) {
          dayResults.total++;
          
          const check = checkPrediction(rec.prediction, homeScore, awayScore);
          
          if (check.status === 'WIN') dayResults.wins++;
          else if (check.status === 'LOSS') dayResults.losses++;
          
          dayResults.recommendations.push({
            match: matchInfo,
            league: fixture.league?.name,
            prediction: rec.prediction,
            normalizedPrediction: normalizePrediction(rec.prediction),
            odds: rec.odds,
            confidence: rec.confidence,
            valueRating: rec.valueRating,
            expectedValue: rec.expectedValue,
            result: check.status,
            homeScore,
            awayScore,
            date,
          });
        }
      } catch (error) {
        // Skip errori singoli
      }
    }
    
    return dayResults;
    
  } catch (error) {
    console.log(`  ${colors.red}✗ Error processing ${date}: ${error.message}${colors.reset}`);
    return null;
  }
}

/**
 * Analizza pattern e problemi
 */
function analyzeResults(allResults) {
  const analysis = {
    byPredictionType: {},
    byOddsRange: {},
    byConfidenceRange: {},
    byValueRating: {},
    byLeague: {},
    problemPatterns: [],
  };
  
  // Analizza per tipo predizione
  allResults.forEach(rec => {
    const type = rec.normalizedPrediction;
    if (!analysis.byPredictionType[type]) {
      analysis.byPredictionType[type] = { total: 0, wins: 0, losses: 0, avgOdds: 0, oddsSum: 0 };
    }
    analysis.byPredictionType[type].total++;
    if (rec.result === 'WIN') analysis.byPredictionType[type].wins++;
    if (rec.result === 'LOSS') analysis.byPredictionType[type].losses++;
    analysis.byPredictionType[type].oddsSum += rec.odds || 0;
  });
  
  Object.keys(analysis.byPredictionType).forEach(type => {
    const data = analysis.byPredictionType[type];
    data.avgOdds = data.oddsSum / data.total;
    data.winRate = (data.wins / data.total) * 100;
  });
  
  // Analizza per range quote
  const oddsRanges = [
    { min: 0, max: 1.5, label: '< 1.50' },
    { min: 1.5, max: 2.0, label: '1.50-2.00' },
    { min: 2.0, max: 2.5, label: '2.00-2.50' },
    { min: 2.5, max: 3.0, label: '2.50-3.00' },
    { min: 3.0, max: 999, label: '> 3.00' },
  ];
  
  oddsRanges.forEach(range => {
    const recs = allResults.filter(r => r.odds >= range.min && r.odds < range.max);
    if (recs.length > 0) {
      analysis.byOddsRange[range.label] = {
        total: recs.length,
        wins: recs.filter(r => r.result === 'WIN').length,
        losses: recs.filter(r => r.result === 'LOSS').length,
        winRate: (recs.filter(r => r.result === 'WIN').length / recs.length) * 100,
        avgOdds: recs.reduce((sum, r) => sum + r.odds, 0) / recs.length,
      };
    }
  });
  
  // Analizza per range confidence
  const confRanges = [
    { min: 0, max: 60, label: '< 60%' },
    { min: 60, max: 70, label: '60-70%' },
    { min: 70, max: 80, label: '70-80%' },
    { min: 80, max: 90, label: '80-90%' },
    { min: 90, max: 101, label: '> 90%' },
  ];
  
  confRanges.forEach(range => {
    const recs = allResults.filter(r => r.confidence >= range.min && r.confidence < range.max);
    if (recs.length > 0) {
      analysis.byConfidenceRange[range.label] = {
        total: recs.length,
        wins: recs.filter(r => r.result === 'WIN').length,
        winRate: (recs.filter(r => r.result === 'WIN').length / recs.length) * 100,
      };
    }
  });
  
  // Analizza per value rating
  [1, 2, 3, 4, 5].forEach(stars => {
    const recs = allResults.filter(r => r.valueRating === stars);
    if (recs.length > 0) {
      analysis.byValueRating[`${stars}⭐`] = {
        total: recs.length,
        wins: recs.filter(r => r.result === 'WIN').length,
        winRate: (recs.filter(r => r.result === 'WIN').length / recs.length) * 100,
      };
    }
  });
  
  // Identifica problemi
  Object.entries(analysis.byPredictionType).forEach(([type, data]) => {
    if (data.total >= 5 && data.winRate < 50) {
      analysis.problemPatterns.push({
        type: 'LOW_WIN_RATE_PREDICTION',
        description: `Tipo ${type}: ${data.winRate.toFixed(1)}% win rate (${data.wins}/${data.total})`,
        severity: data.winRate < 30 ? 'HIGH' : 'MEDIUM',
      });
    }
  });
  
  Object.entries(analysis.byOddsRange).forEach(([range, data]) => {
    if (data.total >= 5 && data.winRate < 50) {
      analysis.problemPatterns.push({
        type: 'LOW_WIN_RATE_ODDS',
        description: `Quote ${range}: ${data.winRate.toFixed(1)}% win rate (${data.wins}/${data.total})`,
        severity: data.winRate < 30 ? 'HIGH' : 'MEDIUM',
      });
    }
  });
  
  Object.entries(analysis.byConfidenceRange).forEach(([range, data]) => {
    if (data.total >= 5 && data.winRate < 50) {
      analysis.problemPatterns.push({
        type: 'CONFIDENCE_MISMATCH',
        description: `Confidence ${range}: ${data.winRate.toFixed(1)}% win rate effettivo vs ${range} predetto`,
        severity: 'HIGH',
      });
    }
  });
  
  return analysis;
}

/**
 * Test principale
 */
async function testMultiDay() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${colors.bright}${colors.cyan}🎯 TEST MULTI-DAY - ${startDate} → ${endDate}${colors.reset}`);
  console.log(`${'='.repeat(80)}\n`);
  
  const allDayResults = [];
  const allRecommendations = [];
  
  // Genera lista di date
  const dates = [];
  let current = startMoment.clone();
  while (current.isSameOrBefore(endMoment)) {
    dates.push(current.format('YYYY-MM-DD'));
    current.add(1, 'day');
  }
  
  console.log(`${colors.blue}📅 Analyzing ${dates.length} days...${colors.reset}\n`);
  
  // Processa ogni giorno
  for (const date of dates) {
    process.stdout.write(`${colors.cyan}Processing ${date}...${colors.reset}`);
    const dayResult = await processSingleDay(date);
    
    if (dayResult && dayResult.total > 0) {
      allDayResults.push(dayResult);
      allRecommendations.push(...dayResult.recommendations);
      console.log(` ${colors.green}✓ ${dayResult.wins}/${dayResult.total} wins${colors.reset}`);
    } else {
      console.log(` ${colors.yellow}⚠️ No data${colors.reset}`);
    }
  }
  
  if (allRecommendations.length === 0) {
    console.log(`\n${colors.red}❌ No recommendations found in this period${colors.reset}\n`);
    return;
  }
  
  // Calcola statistiche globali
  const totalRecs = allRecommendations.length;
  const totalWins = allRecommendations.filter(r => r.result === 'WIN').length;
  const totalLosses = allRecommendations.filter(r => r.result === 'LOSS').length;
  const winRate = (totalWins / totalRecs) * 100;
  
  const avgOdds = allRecommendations.reduce((sum, r) => sum + (r.odds || 0), 0) / totalRecs;
  const avgConfidence = allRecommendations.reduce((sum, r) => sum + r.confidence, 0) / totalRecs;
  
  // ROI
  const totalStake = totalRecs * 10;
  const totalReturn = allRecommendations.reduce((sum, r) => {
    return sum + (r.result === 'WIN' ? 10 * (r.odds || 0) : 0);
  }, 0);
  const roi = ((totalReturn - totalStake) / totalStake) * 100;
  
  // Analizza pattern
  const analysis = analyzeResults(allRecommendations);
  
  // Report
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${colors.bright}${colors.magenta}📊 REPORT COMPLETO${colors.reset}`);
  console.log(`${'='.repeat(80)}\n`);
  
  console.log(`${colors.bright}STATISTICHE GLOBALI${colors.reset}`);
  console.log(`Periodo: ${startDate} → ${endDate} (${dates.length} giorni)`);
  console.log(`Giorni con raccomandazioni: ${allDayResults.length}`);
  console.log(`Totale raccomandazioni: ${totalRecs}`);
  console.log(`${colors.green}✓ Vinte: ${totalWins} (${winRate.toFixed(1)}%)${colors.reset}`);
  console.log(`${colors.red}✗ Perse: ${totalLosses} (${((totalLosses / totalRecs) * 100).toFixed(1)}%)${colors.reset}`);
  console.log(`Quota media: ${avgOdds.toFixed(2)}`);
  console.log(`Confidence media: ${avgConfidence.toFixed(1)}%`);
  console.log(`\n${colors.cyan}ROI (10€/bet):${colors.reset}`);
  console.log(`Stake totale: ${totalStake.toFixed(2)}€`);
  console.log(`Return totale: ${totalReturn.toFixed(2)}€`);
  console.log(`Profitto: ${roi >= 0 ? colors.green : colors.red}${(totalReturn - totalStake).toFixed(2)}€ (${roi.toFixed(1)}%)${colors.reset}`);
  
  // Per tipo predizione
  console.log(`\n${colors.bright}ANALISI PER TIPO PREDIZIONE${colors.reset}`);
  Object.entries(analysis.byPredictionType)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([type, data]) => {
      const color = data.winRate >= 50 ? colors.green : colors.red;
      console.log(`${color}${type.padEnd(10)}${colors.reset} | ${data.wins.toString().padStart(3)}/${data.total.toString().padStart(3)} (${data.winRate.toFixed(1).padStart(5)}%) | Avg odds: ${data.avgOdds.toFixed(2)}`);
    });
  
  // Per range quote
  console.log(`\n${colors.bright}ANALISI PER RANGE QUOTE${colors.reset}`);
  Object.entries(analysis.byOddsRange)
    .forEach(([range, data]) => {
      const color = data.winRate >= 50 ? colors.green : colors.red;
      console.log(`${color}${range.padEnd(12)}${colors.reset} | ${data.wins.toString().padStart(3)}/${data.total.toString().padStart(3)} (${data.winRate.toFixed(1).padStart(5)}%)`);
    });
  
  // Per confidence
  console.log(`\n${colors.bright}ANALISI PER CONFIDENCE${colors.reset}`);
  Object.entries(analysis.byConfidenceRange)
    .forEach(([range, data]) => {
      const color = data.winRate >= 50 ? colors.green : colors.red;
      console.log(`${color}${range.padEnd(12)}${colors.reset} | ${data.wins.toString().padStart(3)}/${data.total.toString().padStart(3)} (${data.winRate.toFixed(1).padStart(5)}%)`);
    });
  
  // Per value rating
  console.log(`\n${colors.bright}ANALISI PER VALUE RATING${colors.reset}`);
  Object.entries(analysis.byValueRating)
    .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
    .forEach(([stars, data]) => {
      const color = data.winRate >= 50 ? colors.green : colors.red;
      console.log(`${color}${stars.padEnd(5)}${colors.reset} | ${data.wins.toString().padStart(3)}/${data.total.toString().padStart(3)} (${data.winRate.toFixed(1).padStart(5)}%)`);
    });
  
  // Problemi identificati
  if (analysis.problemPatterns.length > 0) {
    console.log(`\n${colors.bright}${colors.red}⚠️  PROBLEMI IDENTIFICATI${colors.reset}`);
    analysis.problemPatterns
      .sort((a, b) => {
        const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })
      .forEach(problem => {
        const icon = problem.severity === 'HIGH' ? '🔴' : problem.severity === 'MEDIUM' ? '🟡' : '🟢';
        console.log(`${icon} [${problem.severity}] ${problem.type}: ${problem.description}`);
      });
  }
  
  // Suggerimenti
  console.log(`\n${colors.bright}${colors.cyan}💡 SUGGERIMENTI DI MIGLIORAMENTO${colors.reset}`);
  
  if (winRate < 50) {
    console.log(`🔴 Win rate complessivo SOTTO 50% → Sistema non profittevole`);
    console.log(`   → Aumenta MIN_CONFIDENCE o MIN_EXPECTED_VALUE`);
    console.log(`   → Rivedi pesi ML (Recent Form vs H2H vs Stats)`);
  }
  
  if (roi < -10) {
    console.log(`🔴 ROI fortemente negativo → Problema strutturale`);
    console.log(`   → Verifica calibrazione confidence vs win rate effettivo`);
  }
  
  Object.entries(analysis.byPredictionType).forEach(([type, data]) => {
    if (data.total >= 5 && data.winRate < 40) {
      console.log(`🔴 Tipo ${type} ha solo ${data.winRate.toFixed(1)}% win rate → Disabilita o migliora algoritmo`);
    }
  });
  
  Object.entries(analysis.byOddsRange).forEach(([range, data]) => {
    if (data.total >= 5 && data.winRate < 40) {
      console.log(`🟡 Quote ${range} performano male (${data.winRate.toFixed(1)}%) → Aggiungi filtro MIN_ODDS/MAX_ODDS`);
    }
  });
  
  const highConfLowWin = Object.entries(analysis.byConfidenceRange).find(
    ([range, data]) => range.includes('80-90') || range.includes('> 90') && data.total >= 5 && data.winRate < 60
  );
  if (highConfLowWin) {
    console.log(`🔴 Alta confidence ma basso win rate → Sovrastima della confidence`);
    console.log(`   → Riduci peso Recent Form o aggiungi penalità stagionalità`);
  }
  
  if (winRate >= 50 && roi < 0) {
    console.log(`🟡 Win rate buono ma ROI negativo → Quote troppo basse`);
    console.log(`   → Aumenta MIN_ODDS (es. da 1.4 a 1.6)`);
  }
  
  if (winRate >= 55 && roi > 5) {
    console.log(`🟢 Sistema profittevole! Win rate: ${winRate.toFixed(1)}%, ROI: ${roi.toFixed(1)}%`);
    console.log(`   → Mantieni parametri attuali o aumenta stake cautamente`);
  }
  
  console.log(`\n${'='.repeat(80)}\n`);
}

// Esegui test
testMultiDay().catch(console.error);
