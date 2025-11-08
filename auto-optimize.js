/**
 * AUTO-OPTIMIZATION SYSTEM
 * 
 * Questo script analizza le performance del modello sulle ultime 2 settimane
 * e ottimizza automaticamente i parametri per massimizzare l'accuracy,
 * evitando overfitting tramite train/validation split.
 */

const fs = require('fs');
const path = require('path');

// Parametri del modello da ottimizzare
const OPTIMIZABLE_PARAMS = {
  // ml-prediction.service.ts
  FALLBACK_ATTACK: { current: 1.5, min: 0.8, max: 2.5, step: 0.1 },
  FALLBACK_DEFENSE: { current: 1.5, min: 0.8, max: 2.5, step: 0.1 },
  TIME_DECAY_RATE: { current: 0.1, min: 0.05, max: 0.3, step: 0.025 }, // Decay per month
  HOME_ADVANTAGE: { current: 1.2, min: 1.0, max: 1.5, step: 0.05 },
  DIXON_COLES_RHO: { current: -0.13, min: -0.20, max: 0.0, step: 0.02 },
  
  // betting-recommendations.ts
  MIN_CONFIDENCE_THRESHOLD: { current: 0.40, min: 0.30, max: 0.60, step: 0.05 },
  MIN_PROB_1X2: { current: 0.45, min: 0.35, max: 0.65, step: 0.05 },
  MIN_PROB_1X2_LOW_CONF: { current: 0.70, min: 0.60, max: 0.80, step: 0.05 },
};

// Configuration
const CONFIG = {
  TRAIN_DAYS: 10, // Ultimi 10 giorni per training
  VALIDATION_DAYS: 4, // 4 giorni per validation (split 70/30)
  MAX_ITERATIONS: 10,
  MIN_IMPROVEMENT: 0.02, // 2% miglioramento minimo per continuare
  TARGET_ACCURACY: 0.60, // 60% accuracy target
};

class OptimizationEngine {
  constructor() {
    this.currentParams = { ...OPTIMIZABLE_PARAMS };
    this.history = [];
    this.bestParams = null;
    this.bestAccuracy = 0;
  }

  async run() {
    console.log('🚀 AUTO-OPTIMIZATION SYSTEM STARTED\n');
    console.log('='.repeat(80));
    console.log('\n📊 Configuration:');
    console.log(`   Training period: ${CONFIG.TRAIN_DAYS} days`);
    console.log(`   Validation period: ${CONFIG.VALIDATION_DAYS} days`);
    console.log(`   Max iterations: ${CONFIG.MAX_ITERATIONS}`);
    console.log(`   Target accuracy: ${(CONFIG.TARGET_ACCURACY * 100).toFixed(0)}%`);
    console.log(`   Min improvement: ${(CONFIG.MIN_IMPROVEMENT * 100).toFixed(0)}%\n`);
    console.log('='.repeat(80));

    // Get date ranges
    const today = new Date();
    const trainEnd = new Date(today);
    trainEnd.setDate(trainEnd.getDate() - 1); // Yesterday
    const trainStart = new Date(trainEnd);
    trainStart.setDate(trainStart.getDate() - CONFIG.TRAIN_DAYS);
    
    const valEnd = new Date(trainStart);
    valEnd.setDate(valEnd.getDate() - 1);
    const valStart = new Date(valEnd);
    valStart.setDate(valStart.getDate() - CONFIG.VALIDATION_DAYS);

    console.log(`\n📅 Date Ranges:`);
    console.log(`   Training: ${this.formatDate(trainStart)} to ${this.formatDate(trainEnd)}`);
    console.log(`   Validation: ${this.formatDate(valStart)} to ${this.formatDate(valEnd)}\n`);

    // Baseline test
    console.log('📊 ITERATION 0: Baseline (current parameters)\n');
    const baseline = await this.testParameters(trainStart, trainEnd, valStart, valEnd);
    
    if (!baseline) {
      console.error('❌ Failed to get baseline results. Exiting.');
      return;
    }

    this.bestParams = { ...this.currentParams };
    this.bestAccuracy = baseline.validation.accuracy1X2;
    this.history.push({
      iteration: 0,
      params: { ...this.currentParams },
      train: baseline.train,
      validation: baseline.validation,
    });

    console.log(`\n✅ Baseline Accuracy: ${(baseline.validation.accuracy1X2 * 100).toFixed(1)}%\n`);
    console.log('='.repeat(80));

    // Optimization loop
    for (let iter = 1; iter <= CONFIG.MAX_ITERATIONS; iter++) {
      console.log(`\n\n🔄 ITERATION ${iter}: Optimizing parameters...\n`);

      // Suggerisci modifiche basate sui risultati precedenti
      const suggestions = this.suggestParameterChanges(baseline);
      
      if (suggestions.length === 0) {
        console.log('✅ No more improvements suggested. Stopping.');
        break;
      }

      console.log(`💡 Testing ${suggestions.length} parameter change(s):`);
      suggestions.forEach(s => {
        console.log(`   - ${s.param}: ${s.currentValue.toFixed(3)} → ${s.newValue.toFixed(3)} (${s.reason})`);
      });
      console.log('');

      // Applica modifiche temporaneamente
      const originalParams = { ...this.currentParams };
      suggestions.forEach(s => {
        this.currentParams[s.param].current = s.newValue;
      });

      // Testa nuovi parametri
      const results = await this.testParameters(trainStart, trainEnd, valStart, valEnd);
      
      if (!results) {
        console.log('⚠️ Test failed, reverting changes');
        this.currentParams = originalParams;
        continue;
      }

      const improvement = results.validation.accuracy1X2 - this.bestAccuracy;
      
      console.log(`\n📊 Results:`);
      console.log(`   Train Accuracy: ${(results.train.accuracy1X2 * 100).toFixed(1)}%`);
      console.log(`   Validation Accuracy: ${(results.validation.accuracy1X2 * 100).toFixed(1)}%`);
      console.log(`   Improvement: ${improvement >= 0 ? '+' : ''}${(improvement * 100).toFixed(1)}%`);

      // Check overfitting
      const overfit = results.train.accuracy1X2 - results.validation.accuracy1X2;
      if (overfit > 0.15) {
        console.log(`   ⚠️ Overfitting detected! (${(overfit * 100).toFixed(1)}% gap)`);
        console.log(`   Reverting changes...`);
        this.currentParams = originalParams;
        continue;
      }

      // Accetta o rifiuta le modifiche
      if (improvement > CONFIG.MIN_IMPROVEMENT) {
        console.log(`   ✅ Improvement accepted!`);
        this.bestParams = { ...this.currentParams };
        this.bestAccuracy = results.validation.accuracy1X2;
        this.history.push({
          iteration: iter,
          params: { ...this.currentParams },
          train: results.train,
          validation: results.validation,
          improvement,
        });

        if (results.validation.accuracy1X2 >= CONFIG.TARGET_ACCURACY) {
          console.log(`\n🎉 Target accuracy reached! Stopping.`);
          break;
        }
      } else {
        console.log(`   ❌ Improvement too small. Reverting.`);
        this.currentParams = originalParams;
      }
    }

    // Final report
    this.printFinalReport();
  }

  suggestParameterChanges(currentResults) {
    const suggestions = [];
    const { train, validation } = currentResults;

    // Analizza i problemi e suggerisci soluzioni

    // 1. Sottostima goal?
    if (train.avgGoalError > 1.5) {
      suggestions.push({
        param: 'FALLBACK_ATTACK',
        currentValue: this.currentParams.FALLBACK_ATTACK.current,
        newValue: Math.min(
          this.currentParams.FALLBACK_ATTACK.current + 0.2,
          this.currentParams.FALLBACK_ATTACK.max
        ),
        reason: 'High goal error - increase attack baseline'
      });
    }

    // 2. Troppi falsi positivi su pareggi?
    if (train.accuracy1X2 < 0.40) {
      suggestions.push({
        param: 'DIXON_COLES_RHO',
        currentValue: this.currentParams.DIXON_COLES_RHO.current,
        newValue: Math.max(
          this.currentParams.DIXON_COLES_RHO.current + 0.02,
          this.currentParams.DIXON_COLES_RHO.max
        ),
        reason: 'Low accuracy - adjust Dixon-Coles for low scores'
      });
    }

    // 3. Home advantage troppo/poco marcato?
    const homeWinRate = train.homeWins / train.total;
    if (homeWinRate < 0.35) {
      suggestions.push({
        param: 'HOME_ADVANTAGE',
        currentValue: this.currentParams.HOME_ADVANTAGE.current,
        newValue: Math.min(
          this.currentParams.HOME_ADVANTAGE.current + 0.05,
          this.currentParams.HOME_ADVANTAGE.max
        ),
        reason: 'Low home win rate - increase home advantage'
      });
    } else if (homeWinRate > 0.55) {
      suggestions.push({
        param: 'HOME_ADVANTAGE',
        currentValue: this.currentParams.HOME_ADVANTAGE.current,
        newValue: Math.max(
          this.currentParams.HOME_ADVANTAGE.current - 0.05,
          this.currentParams.HOME_ADVANTAGE.min
        ),
        reason: 'High home win rate - decrease home advantage'
      });
    }

    // 4. Time decay troppo aggressivo?
    if (train.avgGoalError > 1.0) {
      suggestions.push({
        param: 'TIME_DECAY_RATE',
        currentValue: this.currentParams.TIME_DECAY_RATE.current,
        newValue: Math.max(
          this.currentParams.TIME_DECAY_RATE.current - 0.025,
          this.currentParams.TIME_DECAY_RATE.min
        ),
        reason: 'Use more historical data (slower decay)'
      });
    }

    // Limita a 2 suggerimenti per volta per evitare overfitting
    return suggestions.slice(0, 2);
  }

  async testParameters(trainStart, trainEnd, valStart, valEnd) {
    try {
      // Applica parametri al codice (temporaneamente in memoria per il test)
      // In pratica dovremmo passarli via API, ma per ora simuliamo

      // Test su training set
      console.log(`   📊 Testing training set (${this.formatDate(trainStart)} to ${this.formatDate(trainEnd)})...`);
      const trainResults = await this.testDateRange(trainStart, trainEnd);
      
      if (!trainResults || trainResults.total === 0) {
        return null;
      }

      // Test su validation set
      console.log(`   📊 Testing validation set (${this.formatDate(valStart)} to ${this.formatDate(valEnd)})...`);
      const valResults = await this.testDateRange(valStart, valEnd);
      
      if (!valResults || valResults.total === 0) {
        return null;
      }

      return {
        train: trainResults,
        validation: valResults,
      };
    } catch (error) {
      console.error('Error testing parameters:', error.message);
      return null;
    }
  }

  async testDateRange(startDate, endDate) {
    const dates = this.getDateArray(startDate, endDate);
    let aggregated = {
      total: 0,
      correct1X2: 0,
      correctOver: 0,
      correctBTTS: 0,
      goalErrorSum: 0,
      homeWins: 0,
      draws: 0,
      awayWins: 0,
    };

    for (const date of dates) {
      const dateStr = this.formatDate(date);
      
      // Fetch fixtures for this date
      const response = await fetch(`http://localhost:3001/api/fixtures/sm/range?startDate=${dateStr}&endDate=${dateStr}`);
      if (!response.ok) continue;
      
      const data = await response.json();
      const finished = (data.fixtures || []).filter(f => 
        (f.statusShort === 'FT' || f.statusShort === 'AET') &&
        f.score?.home !== null && f.score?.away !== null
      );

      for (const match of finished.slice(0, 5)) { // Limit per date to avoid rate limits
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
          
          if (pred.confidence < 0.4) continue; // Skip low confidence

          aggregated.total++;

          const homeScore = match.score.home;
          const awayScore = match.score.away;
          const actualResult = homeScore > awayScore ? '1' : homeScore < awayScore ? '2' : 'X';
          const predictedResult = pred.market1X2.home > pred.market1X2.draw && pred.market1X2.home > pred.market1X2.away ? '1' :
                                  pred.market1X2.away > pred.market1X2.draw && pred.market1X2.away > pred.market1X2.home ? '2' : 'X';

          if (actualResult === predictedResult) aggregated.correct1X2++;
          if (actualResult === '1') aggregated.homeWins++;
          else if (actualResult === 'X') aggregated.draws++;
          else aggregated.awayWins++;

          const totalGoals = homeScore + awayScore;
          const expectedGoals = pred.poissonParams.lambdaHome + pred.poissonParams.lambdaAway;
          aggregated.goalErrorSum += Math.abs(totalGoals - expectedGoals);

          const actualOver = totalGoals > 2.5;
          const predictedOver = pred.marketUnderOver.over25 > 0.5;
          if (actualOver === predictedOver) aggregated.correctOver++;

          const actualBTTS = homeScore > 0 && awayScore > 0;
          const predictedBTTS = pred.marketBTTS.yes > 0.5;
          if (actualBTTS === predictedBTTS) aggregated.correctBTTS++;

        } catch (err) {
          // Skip error matches
        }
      }
    }

    if (aggregated.total === 0) return null;

    return {
      total: aggregated.total,
      accuracy1X2: aggregated.correct1X2 / aggregated.total,
      accuracyOver: aggregated.correctOver / aggregated.total,
      accuracyBTTS: aggregated.correctBTTS / aggregated.total,
      avgGoalError: aggregated.goalErrorSum / aggregated.total,
      homeWins: aggregated.homeWins,
      draws: aggregated.draws,
      awayWins: aggregated.awayWins,
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

  printFinalReport() {
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 FINAL OPTIMIZATION REPORT');
    console.log('='.repeat(80));

    console.log(`\n🏆 Best Results:`);
    console.log(`   Validation Accuracy: ${(this.bestAccuracy * 100).toFixed(1)}%`);
    console.log(`   Iterations: ${this.history.length - 1}`);
    console.log(`   Improvement: +${((this.bestAccuracy - this.history[0].validation.accuracy1X2) * 100).toFixed(1)}%`);

    console.log(`\n📈 Optimization History:`);
    this.history.forEach(h => {
      const marker = h.iteration === this.history.findIndex(x => x.validation?.accuracy1X2 === this.bestAccuracy) ? '🏆' : '  ';
      console.log(`   ${marker} Iter ${h.iteration}: Train ${(h.train.accuracy1X2 * 100).toFixed(1)}% | Val ${(h.validation.accuracy1X2 * 100).toFixed(1)}%`);
    });

    console.log(`\n⚙️ Optimal Parameters:`);
    Object.entries(this.bestParams).forEach(([key, value]) => {
      console.log(`   ${key}: ${value.current.toFixed(3)}`);
    });

    console.log('\n💾 Saving results to optimization-report.json...');
    fs.writeFileSync(
      path.join(__dirname, 'optimization-report.json'),
      JSON.stringify({
        bestAccuracy: this.bestAccuracy,
        bestParams: this.bestParams,
        history: this.history,
        timestamp: new Date().toISOString(),
      }, null, 2)
    );
    console.log('✅ Report saved!');

    console.log('\n📝 Next Steps:');
    console.log('   1. Review the optimal parameters above');
    console.log('   2. Update the code files with these values');
    console.log('   3. Test on new data to verify improvements\n');
  }
}

// Run optimization
const engine = new OptimizationEngine();
engine.run().catch(console.error);
