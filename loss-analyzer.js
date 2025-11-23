const moment = require('moment-timezone');

/**
 * 🔍 LOSS ANALYZER - Approccio Matthew Benham
 * 
 * Usage: node loss-analyzer.js [START_DATE] [END_DATE]
 * Esempio: node loss-analyzer.js 2025-02-01 2025-03-31
 * 
 * Analizza le WORST predictions (alta confidence ma LOSS) per trovare
 * pattern nascosti che causano errori sistematici.
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

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

const startDate = process.argv[2];
const endDate = process.argv[3];

if (!startDate || !endDate) {
  console.error(`${colors.red}❌ ERRORE: Specifica data inizio e fine${colors.reset}`);
  console.log(`\nUsage: node loss-analyzer.js [START_DATE] [END_DATE]`);
  console.log(`Esempio: node loss-analyzer.js 2025-02-01 2025-03-31\n`);
  process.exit(1);
}

function normalizePrediction(pred) {
  if (!pred) return null;
  const p = pred.toLowerCase().trim();
  
  if (p === '1' || p === 'home' || p === 'home win') return '1';
  if (p === 'x' || p === 'draw') return 'X';
  if (p === '2' || p === 'away' || p === 'away win') return '2';
  if (p === '1x' || p === 'home/draw') return '1X';
  if (p === '12' || p === 'home/away') return '12';
  if (p === 'x2' || p === 'draw/away') return 'X2';
  
  if (p.includes('over')) {
    const match = p.match(/(\d+\.?\d*)/);
    if (match) return `Over ${match[1]}`;
  }
  if (p.includes('under')) {
    const match = p.match(/(\d+\.?\d*)/);
    if (match) return `Under ${match[1]}`;
  }
  
  if (p.includes('gg') || p.includes('goal/goal') || p.includes('btts')) return 'GG';
  if (p.includes('ng') || p.includes('nogoal') || p.includes('no goal')) return 'NG';
  
  return pred;
}

function checkPrediction(prediction, homeScore, awayScore) {
  const pred = normalizePrediction(prediction);
  
  if (homeScore === null || awayScore === null) {
    return { status: 'UNKNOWN', reason: 'Match not finished' };
  }
  
  if (pred === '1') return { status: homeScore > awayScore ? 'WIN' : 'LOSS', reason: `${homeScore}-${awayScore}` };
  if (pred === 'X') return { status: homeScore === awayScore ? 'WIN' : 'LOSS', reason: `${homeScore}-${awayScore}` };
  if (pred === '2') return { status: homeScore < awayScore ? 'WIN' : 'LOSS', reason: `${homeScore}-${awayScore}` };
  if (pred === '1X') return { status: homeScore >= awayScore ? 'WIN' : 'LOSS', reason: `${homeScore}-${awayScore}` };
  if (pred === '12') return { status: homeScore !== awayScore ? 'WIN' : 'LOSS', reason: `${homeScore}-${awayScore}` };
  if (pred === 'X2') return { status: homeScore <= awayScore ? 'WIN' : 'LOSS', reason: `${homeScore}-${awayScore}` };
  
  if (pred?.includes('Over')) {
    const threshold = parseFloat(pred.split(' ')[1]);
    const total = homeScore + awayScore;
    return { status: total > threshold ? 'WIN' : 'LOSS', reason: `Total: ${total} (threshold: ${threshold})` };
  }
  if (pred?.includes('Under')) {
    const threshold = parseFloat(pred.split(' ')[1]);
    const total = homeScore + awayScore;
    return { status: total < threshold ? 'WIN' : 'LOSS', reason: `Total: ${total} (threshold: ${threshold})` };
  }
  
  if (pred === 'GG') {
    const gg = homeScore > 0 && awayScore > 0;
    return { status: gg ? 'WIN' : 'LOSS', reason: `Both scored: ${gg}` };
  }
  if (pred === 'NG') {
    const ng = homeScore === 0 || awayScore === 0;
    return { status: ng ? 'WIN' : 'LOSS', reason: `Clean sheet: ${ng}` };
  }
  
  return { status: 'UNKNOWN', reason: `Unknown: ${pred}` };
}

async function processSingleDay(date) {
  try {
    const fixturesResponse = await fetch(`${API_URL}/api/fixtures/sm/range?startDate=${date}&endDate=${date}`);
    if (!fixturesResponse.ok) return null;
    
    const fixturesData = await fixturesResponse.json();
    const fixtures = fixturesData.fixtures || [];
    const finishedFixtures = fixtures.filter(f => f.status === 'FT' && f.score);
    
    if (finishedFixtures.length === 0) return null;
    
    const dayResults = [];
    
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
          const check = checkPrediction(rec.prediction, homeScore, awayScore);
          
          dayResults.push({
            date,
            match: matchInfo,
            league: fixture.league?.name,
            homeTeam: fixture.homeTeam?.name,
            awayTeam: fixture.awayTeam?.name,
            prediction: rec.prediction,
            normalizedPrediction: normalizePrediction(rec.prediction),
            odds: rec.odds,
            confidence: rec.confidence,
            valueRating: rec.valueRating,
            expectedValue: rec.expectedValue,
            result: check.status,
            homeScore,
            awayScore,
            reason: check.reason,
            // Metadati per analisi
            isHome: rec.prediction?.includes('1') || rec.prediction?.toLowerCase().includes('home'),
            isAway: rec.prediction?.includes('2') || rec.prediction?.toLowerCase().includes('away'),
            isDraw: rec.prediction?.toLowerCase().includes('x') || rec.prediction?.toLowerCase().includes('draw'),
            isDoubleChance: rec.prediction?.length === 2 && !rec.prediction.includes('GG'),
            month: moment(date).month() + 1,
            dayOfWeek: moment(date).format('dddd'),
          });
        }
      } catch (error) {
        // Skip
      }
    }
    
    return dayResults;
    
  } catch (error) {
    return null;
  }
}

function analyzePatterns(losses) {
  const patterns = {
    byMonth: {},
    byDayOfWeek: {},
    byLeague: {},
    byPredictionType: {},
    byOddsRange: {},
    byConfidenceRange: {},
    byHomeAway: { home: 0, away: 0, neutral: 0 },
    commonFactors: [],
  };
  
  // Analizza per mese
  losses.forEach(loss => {
    if (!patterns.byMonth[loss.month]) patterns.byMonth[loss.month] = 0;
    patterns.byMonth[loss.month]++;
  });
  
  // Analizza per giorno settimana
  losses.forEach(loss => {
    if (!patterns.byDayOfWeek[loss.dayOfWeek]) patterns.byDayOfWeek[loss.dayOfWeek] = 0;
    patterns.byDayOfWeek[loss.dayOfWeek]++;
  });
  
  // Analizza per lega
  losses.forEach(loss => {
    if (!patterns.byLeague[loss.league]) patterns.byLeague[loss.league] = 0;
    patterns.byLeague[loss.league]++;
  });
  
  // Analizza per tipo predizione
  losses.forEach(loss => {
    const type = loss.normalizedPrediction;
    if (!patterns.byPredictionType[type]) patterns.byPredictionType[type] = 0;
    patterns.byPredictionType[type]++;
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
    const count = losses.filter(l => l.odds >= range.min && l.odds < range.max).length;
    if (count > 0) patterns.byOddsRange[range.label] = count;
  });
  
  // Analizza per range confidence
  const confRanges = [
    { min: 0, max: 70, label: '< 70%' },
    { min: 70, max: 80, label: '70-80%' },
    { min: 80, max: 90, label: '80-90%' },
    { min: 90, max: 101, label: '> 90%' },
  ];
  
  confRanges.forEach(range => {
    const count = losses.filter(l => l.confidence >= range.min && l.confidence < range.max).length;
    if (count > 0) patterns.byConfidenceRange[range.label] = count;
  });
  
  // Analizza home/away
  losses.forEach(loss => {
    if (loss.isHome) patterns.byHomeAway.home++;
    else if (loss.isAway) patterns.byHomeAway.away++;
    else patterns.byHomeAway.neutral++;
  });
  
  // Identifica fattori comuni (>20% delle losses)
  const threshold = losses.length * 0.2;
  
  Object.entries(patterns.byPredictionType).forEach(([type, count]) => {
    if (count > threshold) {
      patterns.commonFactors.push({
        factor: 'Prediction Type',
        value: type,
        count,
        percentage: (count / losses.length * 100).toFixed(1),
      });
    }
  });
  
  Object.entries(patterns.byLeague).forEach(([league, count]) => {
    if (count > threshold) {
      patterns.commonFactors.push({
        factor: 'League',
        value: league,
        count,
        percentage: (count / losses.length * 100).toFixed(1),
      });
    }
  });
  
  return patterns;
}

async function analyzeLosses() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${colors.bright}${colors.red}🔍 LOSS ANALYZER - Approccio Matthew Benham${colors.reset}`);
  console.log(`${colors.cyan}Periodo: ${startDate} → ${endDate}${colors.reset}`);
  console.log(`${'='.repeat(80)}\n`);
  
  const allRecommendations = [];
  
  // Genera date
  const dates = [];
  let current = moment(startDate);
  while (current.isSameOrBefore(moment(endDate))) {
    dates.push(current.format('YYYY-MM-DD'));
    current.add(1, 'day');
  }
  
  console.log(`${colors.blue}📅 Collecting data from ${dates.length} days...${colors.reset}\n`);
  
  for (const date of dates) {
    process.stdout.write(`${colors.cyan}Processing ${date}...${colors.reset}\r`);
    const dayResults = await processSingleDay(date);
    if (dayResults) {
      allRecommendations.push(...dayResults);
    }
  }
  
  console.log(`\n${colors.green}✓ Collected ${allRecommendations.length} recommendations${colors.reset}\n`);
  
  const losses = allRecommendations.filter(r => r.result === 'LOSS');
  const wins = allRecommendations.filter(r => r.result === 'WIN');
  
  console.log(`${colors.red}Total losses: ${losses.length}${colors.reset}`);
  console.log(`${colors.green}Total wins: ${wins.length}${colors.reset}`);
  console.log(`Win rate: ${((wins.length / allRecommendations.length) * 100).toFixed(1)}%\n`);
  
  // Trova WORST predictions (alta confidence, ma LOSS)
  const worstPredictions = losses
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 50);
  
  console.log(`${'='.repeat(80)}`);
  console.log(`${colors.bright}${colors.red}🔴 TOP 50 WORST PREDICTIONS${colors.reset} (Alta confidence ma LOSS)`);
  console.log(`${'='.repeat(80)}\n`);
  
  worstPredictions.forEach((loss, i) => {
    console.log(`${colors.red}#${(i + 1).toString().padStart(2)} [${loss.confidence}% conf]${colors.reset} ${loss.match}`);
    console.log(`    ${loss.date} | ${loss.league}`);
    console.log(`    Pred: ${loss.prediction} @ ${loss.odds.toFixed(2)} | Result: ${loss.reason}`);
    console.log(`    Value: ${loss.valueRating}⭐ | EV: ${(loss.expectedValue * 100).toFixed(1)}%`);
    console.log('');
  });
  
  // Analizza pattern
  console.log(`${'='.repeat(80)}`);
  console.log(`${colors.bright}${colors.magenta}📊 PATTERN ANALYSIS${colors.reset}`);
  console.log(`${'='.repeat(80)}\n`);
  
  const patterns = analyzePatterns(worstPredictions);
  
  console.log(`${colors.bright}Per Mese:${colors.reset}`);
  Object.entries(patterns.byMonth)
    .sort((a, b) => b[1] - a[1])
    .forEach(([month, count]) => {
      const monthName = moment().month(parseInt(month) - 1).format('MMMM');
      console.log(`  ${monthName}: ${count} (${(count / worstPredictions.length * 100).toFixed(1)}%)`);
    });
  
  console.log(`\n${colors.bright}Per Giorno Settimana:${colors.reset}`);
  Object.entries(patterns.byDayOfWeek)
    .sort((a, b) => b[1] - a[1])
    .forEach(([day, count]) => {
      console.log(`  ${day}: ${count} (${(count / worstPredictions.length * 100).toFixed(1)}%)`);
    });
  
  console.log(`\n${colors.bright}Per Lega (top 10):${colors.reset}`);
  Object.entries(patterns.byLeague)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([league, count]) => {
      console.log(`  ${league}: ${count} (${(count / worstPredictions.length * 100).toFixed(1)}%)`);
    });
  
  console.log(`\n${colors.bright}Per Tipo Predizione:${colors.reset}`);
  Object.entries(patterns.byPredictionType)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`  ${type}: ${count} (${(count / worstPredictions.length * 100).toFixed(1)}%)`);
    });
  
  console.log(`\n${colors.bright}Per Range Quote:${colors.reset}`);
  Object.entries(patterns.byOddsRange)
    .forEach(([range, count]) => {
      console.log(`  ${range}: ${count} (${(count / worstPredictions.length * 100).toFixed(1)}%)`);
    });
  
  console.log(`\n${colors.bright}Per Range Confidence:${colors.reset}`);
  Object.entries(patterns.byConfidenceRange)
    .forEach(([range, count]) => {
      console.log(`  ${range}: ${count} (${(count / worstPredictions.length * 100).toFixed(1)}%)`);
    });
  
  console.log(`\n${colors.bright}Home vs Away:${colors.reset}`);
  console.log(`  Predizioni Home: ${patterns.byHomeAway.home} (${(patterns.byHomeAway.home / worstPredictions.length * 100).toFixed(1)}%)`);
  console.log(`  Predizioni Away: ${patterns.byHomeAway.away} (${(patterns.byHomeAway.away / worstPredictions.length * 100).toFixed(1)}%)`);
  console.log(`  Predizioni Neutrali (X/DC): ${patterns.byHomeAway.neutral} (${(patterns.byHomeAway.neutral / worstPredictions.length * 100).toFixed(1)}%)`);
  
  // Fattori comuni
  if (patterns.commonFactors.length > 0) {
    console.log(`\n${colors.bright}${colors.yellow}⚠️  FATTORI COMUNI (>20% delle worst losses):${colors.reset}`);
    patterns.commonFactors.forEach(factor => {
      console.log(`  🔴 ${factor.factor}: ${factor.value} → ${factor.count}/${worstPredictions.length} (${factor.percentage}%)`);
    });
  }
  
  // Confronto losses vs wins
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${colors.bright}${colors.cyan}📊 CONFRONTO: LOSSES vs WINS${colors.reset}`);
  console.log(`${'='.repeat(80)}\n`);
  
  const avgLossOdds = losses.reduce((sum, l) => sum + l.odds, 0) / losses.length;
  const avgWinOdds = wins.reduce((sum, w) => sum + w.odds, 0) / wins.length;
  const avgLossConf = losses.reduce((sum, l) => sum + l.confidence, 0) / losses.length;
  const avgWinConf = wins.reduce((sum, w) => sum + w.confidence, 0) / wins.length;
  
  console.log(`${colors.bright}Quota Media:${colors.reset}`);
  console.log(`  Losses: ${avgLossOdds.toFixed(2)}`);
  console.log(`  Wins: ${avgWinOdds.toFixed(2)}`);
  console.log(`  Differenza: ${(avgLossOdds - avgWinOdds).toFixed(2)} ${avgLossOdds > avgWinOdds ? '⚠️ Losses hanno quote più alte' : '✓'}`);
  
  console.log(`\n${colors.bright}Confidence Media:${colors.reset}`);
  console.log(`  Losses: ${avgLossConf.toFixed(1)}%`);
  console.log(`  Wins: ${avgWinConf.toFixed(1)}%`);
  console.log(`  Differenza: ${(avgLossConf - avgWinConf).toFixed(1)}% ${avgLossConf > avgWinConf ? '🔴 SOVRASTIMA!' : '✓'}`);
  
  // Suggerimenti finali
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${colors.bright}${colors.yellow}💡 SUGGERIMENTI BASATI SUI DATI${colors.reset}`);
  console.log(`${'='.repeat(80)}\n`);
  
  if (avgLossConf > avgWinConf) {
    console.log(`🔴 PROBLEMA CRITICO: Le losses hanno confidence SUPERIORE ai wins`);
    console.log(`   → Il sistema è sovraconfidente quando sbaglia`);
    console.log(`   → Rivedi il calcolo della confidence (probabilmente Recent Form peso troppo alto)`);
  }
  
  if (avgLossOdds > avgWinOdds + 0.2) {
    console.log(`🟡 Le losses hanno quote più alte → Quote alte = prediction più rischiose`);
    console.log(`   → Aggiungi penalità confidence per quote >2.0`);
  }
  
  const dcLosses = worstPredictions.filter(l => l.isDoubleChance).length;
  if (dcLosses > worstPredictions.length * 0.6) {
    console.log(`🔴 ${((dcLosses / worstPredictions.length) * 100).toFixed(0)}% delle worst losses sono Double Chance`);
    console.log(`   → La logica di conversione 1X2 → Double Chance è probabilmente sbagliata`);
    console.log(`   → Rivedi come calcoli le probabilità DC o aumenta MIN_CONFIDENCE per DC`);
  }
  
  const topLeague = Object.entries(patterns.byLeague).sort((a, b) => b[1] - a[1])[0];
  if (topLeague && topLeague[1] > worstPredictions.length * 0.25) {
    console.log(`🟡 ${topLeague[0]} rappresenta ${((topLeague[1] / worstPredictions.length) * 100).toFixed(0)}% delle worst losses`);
    console.log(`   → Considera di escludere questa lega o aumentare MIN_CONFIDENCE per essa`);
  }
  
  console.log(`\n${'='.repeat(80)}\n`);
}

analyzeLosses().catch(console.error);
