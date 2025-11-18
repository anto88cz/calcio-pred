/**
 * ANALISI QUALITÀ PREDIZIONI BASE - NO PARAMETERS TWEAKING
 * 
 * Obiettivo: Capire se il problema è nelle predizioni stesse,
 * non nei parametri di betting strategy.
 * 
 * Confronto tra periodi:
 * - Set-Nov 2025 (funziona)
 * - Q1 2025 (fallisce)
 * - Q2 2024 (fallisce)
 * 
 * Focus: Accuracy delle SINGOLE PREDIZIONI, non delle multiple
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Importa il predittore ML dall'API
import { mlPredictionAlgorithm } from './api/dist/services/ml-prediction/ml-algorithm.service.js';

const API_KEY = 'rFgklB2zqD1vDWJbAIGGXNvdXOy6EYmxctwN3Vu5wucIfeXX4Q6oIhZUZGrT';

// Periodi da analizzare
const PERIODS = [
  {
    name: 'Set-Nov 2025',
    startDate: '2025-09-01',
    endDate: '2025-11-09',
    expected: 'POSITIVE'
  },
  {
    name: 'Q1 2025',
    startDate: '2025-01-01',
    endDate: '2025-02-28',
    expected: 'NEGATIVE'
  },
  {
    name: 'Q2 2024',
    startDate: '2024-04-01',
    endDate: '2024-05-31',
    expected: 'NEGATIVE'
  }
];

// Leghe target (come nel backtest)
const TARGET_LEAGUES = [8, 384, 564, 135, 207];

/**
 * Fetch fixtures per periodo
 */
async function fetchFixturesForPeriod(startDate, endDate) {
  console.log(`\n📥 Fetching fixtures ${startDate} → ${endDate}...`);
  
  const fixtures = [];
  
  for (const leagueId of TARGET_LEAGUES) {
    try {
      const response = await fetch(
        `https://api.sportsmonks.com/v3/football/fixtures?api_token=${API_KEY}&filters=fixtureLeagues:${leagueId}&filters=fixtureStartingAtBetween:${startDate},${endDate}`,
        { headers: { 'Accept': 'application/json' } }
      );
      
      if (!response.ok) continue;
      
      const data = await response.json();
      if (data.data && data.data.length > 0) {
        fixtures.push(...data.data);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 350));
      
    } catch (error) {
      console.error(`Error fetching league ${leagueId}:`, error.message);
    }
  }
  
  console.log(`✅ Found ${fixtures.length} fixtures`);
  return fixtures;
}

/**
 * Analizza qualità predizioni per un periodo
 */
async function analyzePredictionsQuality(period) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 ANALYZING: ${period.name}`);
  console.log(`   ${period.startDate} → ${period.endDate}`);
  console.log(`   Expected: ${period.expected}`);
  console.log(`${'='.repeat(80)}`);
  
  const fixtures = await fetchFixturesForPeriod(period.startDate, period.endDate);
  
  // Filtra solo partite finite
  const finishedFixtures = fixtures.filter(f => 
    f.state?.short === 'FT' && 
    f.scores?.length > 0
  );
  
  console.log(`\n🎯 Analyzing ${finishedFixtures.length} finished matches...`);
  
  const results = {
    total: 0,
    correct: 0,
    wrong: 0,
    byPrediction: {
      '1': { total: 0, correct: 0 },
      'X': { total: 0, correct: 0 },
      '2': { total: 0, correct: 0 },
      '12': { total: 0, correct: 0 },
      '1X': { total: 0, correct: 0 },
      'X2': { total: 0, correct: 0 }
    },
    byLeague: {},
    byOddsRange: {
      'low (1.0-1.5)': { total: 0, correct: 0 },
      'medium (1.5-2.0)': { total: 0, correct: 0 },
      'high (2.0+)': { total: 0, correct: 0 }
    },
    failurePatterns: {
      predictedHome_wasX: 0,
      predictedHome_wasAway: 0,
      predicted12_wasX: 0,
      predicted1X_wasAway: 0,
      predictedX2_wasHome: 0
    }
  };
  
  let processedCount = 0;
  
  for (const fixture of finishedFixtures) {
    try {
      // Ottieni scores
      const homeScore = fixture.scores?.find(s => s.description === 'CURRENT' && s.score?.participant === 'home')?.score?.goals;
      const awayScore = fixture.scores?.find(s => s.description === 'CURRENT' && s.score?.participant === 'away')?.score?.goals;
      
      if (homeScore === undefined || awayScore === undefined) continue;
      
      const actualResult = homeScore > awayScore ? '1' : homeScore < awayScore ? '2' : 'X';
      
      // Ottieni predizione ML
      const prediction = await mlPredictionAlgorithm.predictMatch({
        fixtureId: fixture.id,
        homeTeamId: fixture.participants[0].id,
        awayTeamId: fixture.participants[1].id,
        seasonId: fixture.season_id,
        leagueId: fixture.league_id,
        fixtureDate: new Date(fixture.starting_at)
      });
      
      // Determina predicted outcome (max prob)
      const probs = prediction.predictions;
      const predicted = probs.homeWin > probs.draw && probs.homeWin > probs.awayWin ? '1' :
                       probs.awayWin > probs.draw && probs.awayWin > probs.homeWin ? '2' : 'X';
      
      // Check correttezza (solo 1, X, 2 - no doppie chance per ora)
      const isCorrect = predicted === actualResult;
      
      // Update stats
      results.total++;
      if (isCorrect) {
        results.correct++;
      } else {
        results.wrong++;
        
        // Failure patterns
        if (predicted === '1' && actualResult === 'X') results.failurePatterns.predictedHome_wasX++;
        if (predicted === '1' && actualResult === '2') results.failurePatterns.predictedHome_wasAway++;
        if (predicted === 'X' && actualResult !== 'X') results.failurePatterns.predicted12_wasX++;
      }
      
      // By prediction type
      if (!results.byPrediction[predicted]) {
        results.byPrediction[predicted] = { total: 0, correct: 0 };
      }
      results.byPrediction[predicted].total++;
      if (isCorrect) results.byPrediction[predicted].correct++;
      
      // By league
      const leagueId = fixture.league_id;
      if (!results.byLeague[leagueId]) {
        results.byLeague[leagueId] = { total: 0, correct: 0, name: '' };
      }
      results.byLeague[leagueId].total++;
      if (isCorrect) results.byLeague[leagueId].correct++;
      
      // Progress
      processedCount++;
      if (processedCount % 10 === 0) {
        console.log(`   Processed ${processedCount}/${finishedFixtures.length}...`);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      // Skip errori
      console.error(`   Error processing fixture ${fixture.id}:`, error.message);
      continue;
    }
  }
  
  return results;
}

/**
 * Print results
 */
function printResults(period, results) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📈 RESULTS: ${period.name}`);
  console.log(`${'='.repeat(80)}`);
  
  const accuracy = results.total > 0 ? (results.correct / results.total * 100).toFixed(1) : 0;
  
  console.log(`\n✅ OVERALL ACCURACY: ${accuracy}% (${results.correct}/${results.total})`);
  console.log(`   Expected: ${period.expected}`);
  
  if (period.expected === 'POSITIVE' && accuracy < 70) {
    console.log(`   ⚠️ WARNING: Low accuracy in period that should work!`);
  }
  if (period.expected === 'NEGATIVE' && accuracy > 70) {
    console.log(`   ⚠️ WARNING: High accuracy in period that fails! Problem is in COMBINING.`);
  }
  
  console.log(`\n📊 BY PREDICTION TYPE:`);
  for (const [type, stats] of Object.entries(results.byPrediction)) {
    if (stats.total === 0) continue;
    const acc = (stats.correct / stats.total * 100).toFixed(1);
    console.log(`   ${type.padEnd(4)}: ${acc}% (${stats.correct}/${stats.total})`);
  }
  
  console.log(`\n📊 BY ODDS RANGE:`);
  for (const [range, stats] of Object.entries(results.byOddsRange)) {
    if (stats.total === 0) continue;
    const acc = (stats.correct / stats.total * 100).toFixed(1);
    console.log(`   ${range.padEnd(20)}: ${acc}% (${stats.correct}/${stats.total})`);
  }
  
  console.log(`\n❌ FAILURE PATTERNS:`);
  console.log(`   Predicted Home → Draw:  ${results.failurePatterns.predictedHome_wasX}`);
  console.log(`   Predicted Home → Away:  ${results.failurePatterns.predictedHome_wasAway}`);
  console.log(`   Predicted 12 → Draw:    ${results.failurePatterns.predicted12_wasX}`);
  console.log(`   Predicted 1X → Away:    ${results.failurePatterns.predicted1X_wasAway}`);
  console.log(`   Predicted X2 → Home:    ${results.failurePatterns.predictedX2_wasHome}`);
  
  console.log(`\n📊 BY LEAGUE:`);
  const leagueNames = {
    8: 'Championship',
    384: 'Serie B',
    564: 'Premier League',
    135: 'Serie A',
    207: 'Turkey Super Lig'
  };
  
  for (const [leagueId, stats] of Object.entries(results.byLeague)) {
    if (stats.total === 0) continue;
    const acc = (stats.correct / stats.total * 100).toFixed(1);
    const name = leagueNames[leagueId] || `League ${leagueId}`;
    console.log(`   ${name.padEnd(25)}: ${acc}% (${stats.correct}/${stats.total})`);
  }
}

/**
 * Main analysis
 */
async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  BASE PREDICTIONS QUALITY ANALYSIS                            ║
║  No parameters tweaking - Understanding root causes           ║
╚═══════════════════════════════════════════════════════════════╝
  `);
  
  const allResults = [];
  
  for (const period of PERIODS) {
    const results = await analyzePredictionsQuality(period);
    printResults(period, results);
    allResults.push({ period: period.name, results });
    
    // Pausa tra periodi
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Confronto finale
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 COMPARATIVE ANALYSIS`);
  console.log(`${'='.repeat(80)}`);
  
  console.log(`\nPeriod                 | Accuracy | Draw Accuracy | "12" → Draw failures`);
  console.log(`-`.repeat(80));
  
  for (const { period, results } of allResults) {
    const accuracy = (results.correct / results.total * 100).toFixed(1);
    const drawAcc = results.byPrediction['X']?.total > 0 
      ? (results.byPrediction['X'].correct / results.byPrediction['X'].total * 100).toFixed(1)
      : 'N/A';
    const draw12Failures = results.failurePatterns.predicted12_wasX;
    
    console.log(`${period.padEnd(22)} | ${accuracy.padEnd(8)} | ${String(drawAcc).padEnd(13)} | ${draw12Failures}`);
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`💡 CONCLUSION:`);
  console.log(`${'='.repeat(80)}`);
  console.log(`
If accuracy is SIMILAR across periods (±5%):
  → Problem is in COMBINING predictions (betting strategy)
  → Need to rethink how we select/combine events
  
If accuracy is VERY DIFFERENT (>10% gap):
  → Problem is in BASE PREDICTIONS
  → Predictor is not robust across seasons
  → Need to improve feature engineering
  `);
}

main().catch(console.error);
