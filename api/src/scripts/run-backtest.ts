/**
 * CLI Script per eseguire backtesting
 * 
 * USAGE:
 * npx tsx src/scripts/run-backtest.ts --start 2024-08-01 --end 2024-11-01 --leagues 39,135,140 --limit 50
 * 
 * OPTIONS:
 * --start     Start date (YYYY-MM-DD)
 * --end       End date (YYYY-MM-DD)
 * --leagues   Comma-separated league IDs (e.g., 39,135,140)
 * --limit     Max fixtures to test (optional)
 * --output    Output file path (optional, default: backtest-report.json)
 * --calibration  Attiva la calibrazione sulle quote di mercato (default: off)
 */

import { backtester } from '../services/backtesting/backtester';
import * as fs from 'fs';
import * as path from 'path';

interface CLIArgs {
  start: string;
  end: string;
  leagues: number[];
  limit?: number;
  output?: string;
  marketCalibration: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  
  const parsed: any = {
    start: '2024-08-01',
    end: '2024-11-01',
    leagues: [39], // Premier League default
    limit: undefined,
    output: 'backtest-report.json',
    // Spenta per default: con la calibrazione attiva il 30% della probabilita'
    // finale viene dalla stessa closing line contro cui si misura il ROI.
    marketCalibration: false,
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--start' && args[i + 1]) {
      parsed.start = args[i + 1];
      i++;
    } else if (arg === '--end' && args[i + 1]) {
      parsed.end = args[i + 1];
      i++;
    } else if (arg === '--leagues' && args[i + 1]) {
      parsed.leagues = args[i + 1].split(',').map((id: string) => parseInt(id.trim(), 10));
      i++;
    } else if (arg === '--limit' && args[i + 1]) {
      parsed.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--calibration') {
      parsed.marketCalibration = true;
    } else if (arg === '--output' && args[i + 1]) {
      parsed.output = args[i + 1];
      i++;
    }
  }
  
  return parsed;
}

async function main() {
  console.log('🧪 ========================================');
  console.log('🧪 CALCIO-PRED BACKTESTING FRAMEWORK');
  console.log('🧪 ========================================\n');
  
  const args = parseArgs();
  
  console.log('📋 Configuration:');
  console.log(`   Start Date: ${args.start}`);
  console.log(`   End Date:   ${args.end}`);
  console.log(`   Leagues:    ${args.leagues.join(', ')}`);
  console.log(`   Limit:      ${args.limit || 'No limit'}`);
  console.log(`   Market calibration: ${args.marketCalibration ? 'ON (ROI non interpretabile come misura del modello)' : 'OFF'}`);
  console.log(`   Output:     ${args.output}\n`);
  
  console.log('⏳ Running backtest (this may take a while)...\n');
  
  const startTime = Date.now();
  
  try {
    const report = await backtester.runBacktest({
      startDate: args.start,
      endDate: args.end,
      leagues: args.leagues,
      limit: args.limit,
      marketCalibration: args.marketCalibration,
    });
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Print summary
    console.log('\n🎯 ========================================');
    console.log('🎯 BACKTEST RESULTS');
    console.log('🎯 ========================================\n');
    
    console.log('📊 SUMMARY:');
    console.log(`   Total Matches:  ${report.summary.totalMatches}`);
    console.log(`   Date Range:     ${report.summary.dateRange}`);
    console.log(`   Leagues:        ${report.summary.leagues.join(', ')}`);
    console.log(`   Elapsed Time:   ${elapsed}s\n`);
    
    console.log('✅ ACCURACY:');
    console.log(`   Overall 1X2:    ${report.accuracy.overall1X2.toFixed(2)}%`);
    console.log(`   - GIOCALA:      ${report.accuracy.byStrength.GIOCALA.toFixed(2)}%`);
    console.log(`   - STRONG:       ${report.accuracy.byStrength.STRONG.toFixed(2)}%`);
    console.log(`   - MEDIUM:       ${report.accuracy.byStrength.MEDIUM.toFixed(2)}%`);
    console.log(`   - NEUTRAL:      ${report.accuracy.byStrength.NEUTRAL.toFixed(2)}%\n`);
    
    console.log('📈 BRIER SCORE (lower is better):');
    console.log(`   Overall:        ${report.brierScore.overall.toFixed(4)}`);
    console.log(`   - Home Wins:    ${report.brierScore.by1X2.home.toFixed(4)}`);
    console.log(`   - Draws:        ${report.brierScore.by1X2.draw.toFixed(4)}`);
    console.log(`   - Away Wins:    ${report.brierScore.by1X2.away.toFixed(4)}`);
    
    // Valutazione Brier Score
    if (report.brierScore.overall < 0.18) {
      console.log('   ✅ EXCELLENT (< 0.18)');
    } else if (report.brierScore.overall < 0.20) {
      console.log('   ✅ GOOD (0.18 - 0.20)');
    } else if (report.brierScore.overall < 0.22) {
      console.log('   ⚠️  FAIR (0.20 - 0.22)');
    } else {
      console.log('   ❌ NEEDS IMPROVEMENT (> 0.22)');
    }
    console.log('');
    
    console.log('🎲 CALIBRATION:');
    console.log(`   Calibration Error: ${report.calibration.calibrationError.toFixed(4)}\n`);
    report.calibration.buckets.forEach(bucket => {
      if (bucket.count > 0) {
        const diff = Math.abs(bucket.predictedProb - bucket.actualFreq);
        const diffStr = diff > 0.10 ? `(⚠️  ${(diff * 100).toFixed(1)}% off)` : '';
        console.log(`   ${bucket.range.padEnd(10)} | Predicted: ${(bucket.predictedProb * 100).toFixed(1)}% | Actual: ${(bucket.actualFreq * 100).toFixed(1)}% | Count: ${bucket.count.toString().padStart(3)} ${diffStr}`);
      }
    });
    console.log('');
    
    const mc = report.marketComparison;
    console.log('🏦 MODELLO vs MERCATO (closing line de-viggata, stesse partite):');
    if (mc.matchesWithOdds === 0) {
      console.log('   Nessuna quota di chiusura disponibile - confronto non calcolabile\n');
    } else {
      console.log(`   Partite con quote:  ${mc.matchesWithOdds}`);
      console.log(`   Margine medio book: ${(mc.avgMargin * 100).toFixed(2)}%`);
      console.log('                     modello   mercato    delta');
      console.log(`   Log-loss:         ${mc.model.logLoss.toFixed(4)}    ${mc.market.logLoss.toFixed(4)}    ${mc.delta.logLoss >= 0 ? '+' : ''}${mc.delta.logLoss.toFixed(4)}`);
      console.log(`   Brier:            ${mc.model.brier.toFixed(4)}    ${mc.market.brier.toFixed(4)}    ${mc.delta.brier >= 0 ? '+' : ''}${mc.delta.brier.toFixed(4)}`);
      console.log(`   Accuracy 1X2:     ${mc.model.accuracy.toFixed(2)}%    ${mc.market.accuracy.toFixed(2)}%`);
      console.log(
        mc.beatsMarket
          ? '   ✅ Il modello batte il mercato sul log-loss'
          : '   ❌ Il mercato e\' meglio sul log-loss: nessun edge dimostrato'
      );
      console.log('');
    }

    console.log('💰 ROI SIMULATION:');
    console.log(`   Flat Betting (all):     ${report.roi.flatBetting.toFixed(2)}%`);
    console.log(`   Kelly Betting (all):    ${report.roi.kellyBetting.toFixed(2)}%`);
    console.log(`   Flat (GIOCALA/STRONG):   ${report.roi.strengthFiltered.flatBetting.toFixed(2)}%`);
    console.log(`   Kelly (GIOCALA/STRONG):  ${report.roi.strengthFiltered.kellyBetting.toFixed(2)}%\n`);
    
    console.log('🏆 BY LEAGUE:');
    Object.entries(report.byLeague).forEach(([league, stats]) => {
      console.log(`   ${league.padEnd(30)} | Accuracy: ${stats.accuracy.toFixed(1)}% | Brier: ${stats.brierScore.toFixed(3)} | Matches: ${stats.matches}`);
    });
    console.log('');
    
    // Save report to JSON
    const outputPath = path.join(process.cwd(), args.output || 'backtest-report.json');
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`💾 Full report saved to: ${outputPath}\n`);
    
    console.log('🎯 ========================================');
    console.log('✅ BACKTEST COMPLETED SUCCESSFULLY');
    console.log('🎯 ========================================\n');
    
    // Exit code based on accuracy
    if (report.accuracy.overall1X2 >= 60 && report.brierScore.overall < 0.20) {
      console.log('✅ SYSTEM PERFORMING WELL (60%+ accuracy, Brier < 0.20)');
      process.exit(0);
    } else if (report.accuracy.overall1X2 >= 55) {
      console.log('⚠️  SYSTEM ACCEPTABLE (55%+ accuracy)');
      process.exit(0);
    } else {
      console.log('❌ SYSTEM NEEDS IMPROVEMENT (< 55% accuracy)');
      process.exit(1);
    }
    
  } catch (error: any) {
    console.error('\n❌ BACKTEST FAILED:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

main();
