/**
 * ADVANCED AUTO-OPTIMIZATION SYSTEM v2.0
 * 
 * Sistema intelligente che:
 * 1. Analizza un ampio dataset (più match, confidence più bassa per training)
 * 2. Identifica pattern di errore
 * 3. Usa algoritmi di ottimizzazione più sofisticati (grid search + gradient descent)
 * 4. Previene overfitting con train/validation/test split
 * 5. 🔥 FILTRA SOLO CAMPIONATI SUPPORTATI
 */

const fs = require('fs');
const path = require('path');
const { isLeagueSupported } = require('./supported-leagues-config');

// Configurazione avanzata
const CONFIG = {
  TRAIN_DAYS: 14, // 2 settimane training
  VALIDATION_DAYS: 5, // 5 giorni validation
  TEST_DAYS: 3, // 3 giorni test finale
  
  MIN_CONFIDENCE_FOR_TRAINING: 0.25, // Bassa per avere più dati
  MIN_CONFIDENCE_FOR_VALIDATION: 0.35, // Media per validation
  MIN_CONFIDENCE_FOR_TEST: 0.40, // Alta per test finale
  
  MAX_ITERATIONS: 15,
  MIN_IMPROVEMENT: 0.01, // 1% miglioramento minimo
  TARGET_ACCURACY: 0.55, // 55% è realistico per betting
  
  MATCHES_PER_DATE: 20, // Analizza più match per giorno
};

// Parametri ottimizzabili con ranges più ampi
const PARAM_SPACE = {
  FALLBACK_ATTACK: [0.8, 1.0, 1.2, 1.5, 1.8, 2.0, 2.3],
  FALLBACK_DEFENSE: [0.8, 1.0, 1.2, 1.5, 1.8, 2.0, 2.3],
  HOME_ADVANTAGE: [1.0, 1.1, 1.15, 1.2, 1.25, 1.3, 1.4],
  DIXON_COLES_RHO: [-0.20, -0.15, -0.13, -0.10, -0.05, 0.0],
  TIME_DECAY_RATE: [0.05, 0.075, 0.1, 0.15, 0.2, 0.25],
};

class AdvancedOptimizer {
  constructor() {
    this.currentParams = {
      FALLBACK_ATTACK: 1.5,
      FALLBACK_DEFENSE: 1.5,
      HOME_ADVANTAGE: 1.2,
      DIXON_COLES_RHO: -0.13,
      TIME_DECAY_RATE: 0.1,
    };
    
    this.bestParams = { ...this.currentParams };
    this.bestScore = 0;
    this.history = [];
    this.errorAnalysis = {};
  }

  async run() {
    console.log('🚀 ADVANCED AUTO-OPTIMIZATION SYSTEM v2.0\n');
    console.log('='.repeat(90));
    
    // Setup date ranges
    const { train, validation, test } = this.getDateRanges();
    
    console.log('\n📅 Date Ranges:');
    console.log(`   Training:   ${train.start} to ${train.end} (${CONFIG.TRAIN_DAYS} days, min confidence ${CONFIG.MIN_CONFIDENCE_FOR_TRAINING})`);
    console.log(`   Validation: ${validation.start} to ${validation.end} (${CONFIG.VALIDATION_DAYS} days, min confidence ${CONFIG.MIN_CONFIDENCE_FOR_VALIDATION})`);
    console.log(`   Test:       ${test.start} to ${test.end} (${CONFIG.TEST_DAYS} days, min confidence ${CONFIG.MIN_CONFIDENCE_FOR_TEST})`);
    console.log('='.repeat(90));

    // Phase 1: Collect baseline data
    console.log('\n📊 PHASE 1: Baseline Analysis\n');
    const baseline = await this.evaluate(train, validation, this.currentParams);
    
    if (!baseline || baseline.validation.total < 5) {
      console.log('❌ Insufficient data for optimization. Need at least 5 validation matches.');
      console.log('💡 Try: Increase date range or lower confidence threshold.');
      return;
    }

    this.printResults('BASELINE', baseline);
    this.bestScore = this.calculateScore(baseline.validation);
    this.history.push({ iteration: 0, params: {...this.currentParams}, ...baseline });

    // Phase 2: Grid search per trovare zona ottimale
    console.log('\n\n📊 PHASE 2: Grid Search (coarse tuning)\n');
    console.log('Testing parameter combinations to find optimal region...\n');
    
    const gridResults = await this.gridSearch(train, validation);
    
    if (gridResults.improvement > 0) {
      this.currentParams = { ...gridResults.params };
      this.bestScore = gridResults.score;
      console.log(`\n✅ Grid search found improvement: +${(gridResults.improvement * 100).toFixed(1)}%`);
      this.printParams(this.currentParams);
    }

    // Phase 3: Gradient descent per fine tuning
    console.log('\n\n📊 PHASE 3: Fine Tuning (gradient descent)\n');
    
    for (let iter = 1; iter <= CONFIG.MAX_ITERATIONS; iter++) {
      console.log(`\n🔄 Iteration ${iter}/${CONFIG.MAX_ITERATIONS}`);
      
      const improvements = await this.gradientStep(train, validation);
      
      if (improvements.length === 0) {
        console.log('✅ No more improvements found. Stopping.');
        break;
      }

      const best = improvements[0];
      if (best.improvement < CONFIG.MIN_IMPROVEMENT) {
        console.log(`❌ Improvement too small (${(best.improvement * 100).toFixed(2)}%). Stopping.`);
        break;
      }

      this.currentParams = { ...best.params };
      this.bestScore = best.score;
      
      console.log(`✅ Accepted: ${best.param} = ${best.value.toFixed(3)}`);
      console.log(`   Validation Accuracy: ${(best.results.validation.accuracy1X2 * 100).toFixed(1)}%`);
      console.log(`   Improvement: +${(best.improvement * 100).toFixed(1)}%`);

      this.history.push({ iteration: iter, params: {...this.currentParams}, ...best.results });

      // Check overfitting
      const gap = best.results.train.accuracy1X2 - best.results.validation.accuracy1X2;
      if (gap > 0.15) {
        console.log(`   ⚠️ Overfitting warning: ${(gap * 100).toFixed(1)}% train-val gap`);
      }

      if (best.results.validation.accuracy1X2 >= CONFIG.TARGET_ACCURACY) {
        console.log(`\n🎉 Target accuracy reached!`);
        break;
      }
    }

    // Phase 4: Final test su dati mai visti
    console.log('\n\n📊 PHASE 4: Final Test (unseen data)\n');
    
    const testResults = await this.evaluateSet(test.start, test.end, CONFIG.MIN_CONFIDENCE_FOR_TEST);
    
    if (testResults && testResults.total > 0) {
      console.log('🎯 Final Test Results:');
      console.log(`   Matches analyzed: ${testResults.total}`);
      console.log(`   1X2 Accuracy: ${(testResults.accuracy1X2 * 100).toFixed(1)}%`);
      console.log(`   Over/Under Accuracy: ${(testResults.accuracyOver * 100).toFixed(1)}%`);
      console.log(`   BTTS Accuracy: ${(testResults.accuracyBTTS * 100).toFixed(1)}%`);
      console.log(`   Avg Goal Error: ${testResults.avgGoalError.toFixed(2)}`);
    }

    // Final report
    this.printFinalReport(testResults);
  }

  async gridSearch(train, validation) {
    console.log('Testing key parameter combinations...\n');
    
    const testCombos = [
      { FALLBACK_ATTACK: 1.0, FALLBACK_DEFENSE: 1.0 },
      { FALLBACK_ATTACK: 1.5, FALLBACK_DEFENSE: 1.5 },
      { FALLBACK_ATTACK: 2.0, FALLBACK_DEFENSE: 2.0 },
      { HOME_ADVANTAGE: 1.1 },
      { HOME_ADVANTAGE: 1.3 },
      { DIXON_COLES_RHO: -0.20 },
      { DIXON_COLES_RHO: -0.05 },
      { DIXON_COLES_RHO: 0.0 },
    ];

    let bestResult = { improvement: 0 };

    for (const combo of testCombos) {
      const testParams = { ...this.currentParams, ...combo };
      const results = await this.evaluate(train, validation, testParams);
      
      if (!results) continue;

      const score = this.calculateScore(results.validation);
      const improvement = score - this.bestScore;

      const comboStr = Object.entries(combo).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(', ');
      console.log(`   ${comboStr}: ${(results.validation.accuracy1X2 * 100).toFixed(1)}% (${improvement >= 0 ? '+' : ''}${(improvement * 100).toFixed(1)}%)`);

      if (improvement > bestResult.improvement) {
        bestResult = { improvement, params: testParams, score, results };
      }
    }

    return bestResult;
  }

  async gradientStep(train, validation) {
    const improvements = [];

    for (const [param, values] of Object.entries(PARAM_SPACE)) {
      const currentValue = this.currentParams[param];
      const currentIndex = values.indexOf(values.reduce((prev, curr) => 
        Math.abs(curr - currentValue) < Math.abs(prev - currentValue) ? curr : prev
      ));

      // Test vicini
      const testIndices = [currentIndex - 1, currentIndex + 1].filter(i => i >= 0 && i < values.length);

      for (const idx of testIndices) {
        const testValue = values[idx];
        const testParams = { ...this.currentParams, [param]: testValue };
        
        const results = await this.evaluate(train, validation, testParams);
        if (!results) continue;

        const score = this.calculateScore(results.validation);
        const improvement = score - this.bestScore;

        if (improvement > 0) {
          improvements.push({
            param,
            value: testValue,
            params: testParams,
            score,
            improvement,
            results,
          });
        }
      }
    }

    // Ordina per miglioramento
    improvements.sort((a, b) => b.improvement - a.improvement);
    return improvements;
  }

  async evaluate(train, validation, params) {
    const trainResults = await this.evaluateSet(train.start, train.end, CONFIG.MIN_CONFIDENCE_FOR_TRAINING, params);
    if (!trainResults || trainResults.total === 0) return null;

    const valResults = await this.evaluateSet(validation.start, validation.end, CONFIG.MIN_CONFIDENCE_FOR_VALIDATION, params);
    if (!valResults || valResults.total === 0) return null;

    return { train: trainResults, validation: valResults };
  }

  async evaluateSet(startDate, endDate, minConfidence, params = null) {
    const dates = this.getDateArray(new Date(startDate), new Date(endDate));
    
    let agg = {
      total: 0, correct1X2: 0, correctOver: 0, correctBTTS: 0,
      goalErrorSum: 0, homeWins: 0, draws: 0, awayWins: 0,
      errors: { homeOverpredicted: 0, awayOverpredicted: 0, drawMissed: 0 },
    };

    for (const date of dates) {
      const dateStr = this.formatDate(date);
      
      try {
        const response = await fetch(`http://localhost:3001/api/fixtures/sm/range?startDate=${dateStr}&endDate=${dateStr}`);
        if (!response.ok) continue;
        
        const data = await response.json();
        const finished = (data.fixtures || []).filter(f => 
          (f.statusShort === 'FT' || f.statusShort === 'AET') &&
          f.score?.home !== null && f.score?.away !== null
        );
        
        // 🔥 FILTER: Solo campionati supportati
        const supported = finished.filter(f => isLeagueSupported(f.league?.name || ''));

        for (const match of supported.slice(0, CONFIG.MATCHES_PER_DATE)) {
          try {
            const predResp = await fetch('http://localhost:3001/api/predictions/calculate-by-name', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                homeTeamName: match.homeTeam.name,
                awayTeamName: match.awayTeam.name,
                fixtureId: match.id,
              }),
            });

            if (!predResp.ok) continue;
            const pred = await predResp.json();
            
            if (pred.confidence < minConfidence) continue;

            agg.total++;

            const actual = this.getActualResult(match);
            const predicted = this.getPredictedResult(pred);

            if (actual.result === predicted.result) agg.correct1X2++;
            else {
              // Analizza errore
              if (actual.result === 'X') agg.errors.drawMissed++;
              else if (predicted.result === '1' && actual.result !== '1') agg.errors.homeOverpredicted++;
              else if (predicted.result === '2' && actual.result !== '2') agg.errors.awayOverpredicted++;
            }

            if (actual.result === '1') agg.homeWins++;
            else if (actual.result === 'X') agg.draws++;
            else agg.awayWins++;

            agg.goalErrorSum += Math.abs(actual.totalGoals - predicted.expectedGoals);

            if ((actual.totalGoals > 2.5) === (pred.marketUnderOver.over25 > 0.5)) agg.correctOver++;
            if ((actual.btts) === (pred.marketBTTS.yes > 0.5)) agg.correctBTTS++;

          } catch (err) {
            // Skip
          }
        }
      } catch (err) {
        // Skip date
      }
    }

    if (agg.total === 0) return null;

    return {
      total: agg.total,
      accuracy1X2: agg.correct1X2 / agg.total,
      accuracyOver: agg.correctOver / agg.total,
      accuracyBTTS: agg.correctBTTS / agg.total,
      avgGoalError: agg.goalErrorSum / agg.total,
      homeWins: agg.homeWins,
      draws: agg.draws,
      awayWins: agg.awayWins,
      errors: agg.errors,
    };
  }

  getActualResult(match) {
    const home = match.score.home;
    const away = match.score.away;
    return {
      result: home > away ? '1' : home < away ? '2' : 'X',
      totalGoals: home + away,
      btts: home > 0 && away > 0,
    };
  }

  getPredictedResult(pred) {
    const { home, draw, away } = pred.market1X2;
    const result = home > draw && home > away ? '1' : away > draw && away > home ? '2' : 'X';
    return {
      result,
      expectedGoals: pred.poissonParams.lambdaHome + pred.poissonParams.lambdaAway,
    };
  }

  calculateScore(results) {
    // Weighted score: accuracy is most important, but also consider goal error
    const accuracyScore = results.accuracy1X2 * 100;
    const goalErrorPenalty = Math.min(results.avgGoalError * 5, 20); // Max 20 point penalty
    return accuracyScore - goalErrorPenalty;
  }

  getDateRanges() {
    const today = new Date();
    
    const testEnd = new Date(today);
    testEnd.setDate(testEnd.getDate() - 1);
    const testStart = new Date(testEnd);
    testStart.setDate(testStart.getDate() - CONFIG.TEST_DAYS);
    
    const valEnd = new Date(testStart);
    valEnd.setDate(valEnd.getDate() - 1);
    const valStart = new Date(valEnd);
    valStart.setDate(valStart.getDate() - CONFIG.VALIDATION_DAYS);
    
    const trainEnd = new Date(valStart);
    trainEnd.setDate(trainEnd.getDate() - 1);
    const trainStart = new Date(trainEnd);
    trainStart.setDate(trainStart.getDate() - CONFIG.TRAIN_DAYS);

    return {
      train: { start: this.formatDate(trainStart), end: this.formatDate(trainEnd) },
      validation: { start: this.formatDate(valStart), end: this.formatDate(valEnd) },
      test: { start: this.formatDate(testStart), end: this.formatDate(testEnd) },
    };
  }

  getDateArray(start, end) {
    const dates = [];
    const current = new Date(start);
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  printResults(label, results) {
    console.log(`\n${label}:`);
    console.log(`   Training:   ${results.train.total} matches - Accuracy ${(results.train.accuracy1X2 * 100).toFixed(1)}%`);
    console.log(`   Validation: ${results.validation.total} matches - Accuracy ${(results.validation.accuracy1X2 * 100).toFixed(1)}%`);
    console.log(`   Goal Error: ${results.validation.avgGoalError.toFixed(2)}`);
    
    if (results.validation.errors) {
      console.log(`   Errors: Draw missed ${results.validation.errors.drawMissed}, Home overpredicted ${results.validation.errors.homeOverpredicted}, Away overpredicted ${results.validation.errors.awayOverpredicted}`);
    }
  }

  printParams(params) {
    console.log('\n⚙️ Current Parameters:');
    Object.entries(params).forEach(([k, v]) => {
      console.log(`   ${k}: ${v.toFixed(3)}`);
    });
  }

  printFinalReport(testResults) {
    console.log('\n\n' + '='.repeat(90));
    console.log('🏆 OPTIMIZATION COMPLETE - FINAL REPORT');
    console.log('='.repeat(90));

    const bestIter = this.history.reduce((best, curr) => 
      curr.validation.accuracy1X2 > best.validation.accuracy1X2 ? curr : best
    );

    console.log(`\n📊 Best Validation Results (Iteration ${bestIter.iteration}):`);
    console.log(`   Accuracy: ${(bestIter.validation.accuracy1X2 * 100).toFixed(1)}%`);
    console.log(`   Matches: ${bestIter.validation.total}`);
    console.log(`   Goal Error: ${bestIter.validation.avgGoalError.toFixed(2)}`);

    if (testResults) {
      console.log(`\n🎯 Final Test Results (unseen data):`);
      console.log(`   Accuracy: ${(testResults.accuracy1X2 * 100).toFixed(1)}%`);
      console.log(`   Matches: ${testResults.total}`);
      console.log(`   Goal Error: ${testResults.avgGoalError.toFixed(2)}`);
    }

    this.printParams(this.bestParams);

    console.log(`\n📈 Optimization Progress:`);
    this.history.forEach(h => {
      const marker = h.iteration === bestIter.iteration ? '🏆' : '  ';
      console.log(`   ${marker} Iter ${h.iteration}: Val ${(h.validation.accuracy1X2 * 100).toFixed(1)}% (${h.validation.total} matches)`);
    });

    // Save full report
    const report = {
      bestParams: this.bestParams,
      bestValidationAccuracy: bestIter.validation.accuracy1X2,
      testAccuracy: testResults?.accuracy1X2,
      history: this.history,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(__dirname, 'advanced-optimization-report.json'),
      JSON.stringify(report, null, 2)
    );

    console.log('\n💾 Full report saved to: advanced-optimization-report.json');
    
    console.log('\n📝 Recommended Actions:');
    if (bestIter.validation.accuracy1X2 >= 0.50) {
      console.log('   ✅ Good accuracy achieved! Apply these parameters to production.');
      console.log('   📝 Update ml-prediction.service.ts with optimal values.');
    } else {
      console.log('   ⚠️ Accuracy below 50%. Consider:');
      console.log('      - Collecting more historical data');
      console.log('      - Using xG data when available');
      console.log('      - League-specific parameters');
    }
    
    console.log('\n');
  }
}

// Run
const optimizer = new AdvancedOptimizer();
optimizer.run().catch(console.error);
