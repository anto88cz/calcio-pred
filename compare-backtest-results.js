/**
 * 📊 COMPARE BACKTEST RESULTS
 * 
 * Confronta due risultati di backtest salvati per valutare l'impatto delle modifiche
 * 
 * Usage: node compare-backtest-results.js <file1.json> <file2.json>
 */

const fs = require('fs');
const path = require('path');

// Colori per console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function loadBacktestResult(filename) {
  const filepath = path.join(__dirname, filename);
  
  if (!fs.existsSync(filepath)) {
    console.error(`${colors.red}❌ File non trovato: ${filename}${colors.reset}`);
    process.exit(1);
  }
  
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`${colors.red}❌ Errore nella lettura di ${filename}: ${err.message}${colors.reset}`);
    process.exit(1);
  }
}

function compareResults(result1, result2, label1, label2) {
  console.log('\n' + '='.repeat(120));
  console.log(`${colors.bright}${colors.cyan}📊 CONFRONTO BACKTEST RESULTS${colors.reset}`);
  console.log('='.repeat(120));
  
  // Metadata
  console.log(`\n${colors.bright}📅 PERIODO ANALIZZATO${colors.reset}`);
  console.log(`   ${label1}: ${result1.metadata.startDate} → ${result1.metadata.endDate}`);
  console.log(`   ${label2}: ${result2.metadata.startDate} → ${result2.metadata.endDate}`);
  
  if (result1.metadata.startDate !== result2.metadata.startDate || 
      result1.metadata.endDate !== result2.metadata.endDate) {
    console.log(`   ${colors.yellow}⚠️  I periodi NON coincidono - confronto non accurato${colors.reset}`);
  }
  
  // Summary comparison
  const s1 = result1.summary;
  const s2 = result2.summary;
  
  console.log(`\n${colors.bright}📊 METRICHE PRINCIPALI${colors.reset}`);
  console.log('─'.repeat(120));
  console.log(`${'Metrica'.padEnd(30)} | ${label1.padEnd(25)} | ${label2.padEnd(25)} | ${'Differenza'.padEnd(20)}`);
  console.log('─'.repeat(120));
  
  // Win Rate
  const winRateDiff = s2.winRate - s1.winRate;
  const winRateColor = winRateDiff > 0 ? colors.green : (winRateDiff < 0 ? colors.red : colors.yellow);
  console.log(
    `${'Win Rate'.padEnd(30)} | ` +
    `${s1.winRate.toFixed(1)}%`.padEnd(25) + ' | ' +
    `${s2.winRate.toFixed(1)}%`.padEnd(25) + ' | ' +
    `${winRateColor}${winRateDiff > 0 ? '+' : ''}${winRateDiff.toFixed(1)}%${colors.reset}`
  );
  
  // ROI
  const roiDiff = s2.roi - s1.roi;
  const roiColor = roiDiff > 0 ? colors.green : (roiDiff < 0 ? colors.red : colors.yellow);
  console.log(
    `${'ROI'.padEnd(30)} | ` +
    `${s1.roi.toFixed(2)}%`.padEnd(25) + ' | ' +
    `${s2.roi.toFixed(2)}%`.padEnd(25) + ' | ' +
    `${roiColor}${roiDiff > 0 ? '+' : ''}${roiDiff.toFixed(2)}%${colors.reset}`
  );
  
  // Capitale Finale
  const capitalDiff = s2.finalCapital - s1.finalCapital;
  const capitalColor = capitalDiff > 0 ? colors.green : (capitalDiff < 0 ? colors.red : colors.yellow);
  console.log(
    `${'Capitale Finale'.padEnd(30)} | ` +
    `€${s1.finalCapital.toFixed(2)}`.padEnd(25) + ' | ' +
    `€${s2.finalCapital.toFixed(2)}`.padEnd(25) + ' | ' +
    `${capitalColor}${capitalDiff > 0 ? '+' : ''}€${capitalDiff.toFixed(2)}${colors.reset}`
  );
  
  // Profitto/Perdita
  const plDiff = s2.profitLoss - s1.profitLoss;
  const plColor = plDiff > 0 ? colors.green : (plDiff < 0 ? colors.red : colors.yellow);
  console.log(
    `${'Profitto/Perdita'.padEnd(30)} | ` +
    `€${s1.profitLoss.toFixed(2)}`.padEnd(25) + ' | ' +
    `€${s2.profitLoss.toFixed(2)}`.padEnd(25) + ' | ' +
    `${plColor}${plDiff > 0 ? '+' : ''}€${plDiff.toFixed(2)}${colors.reset}`
  );
  
  // Multiple Giocate
  const multiplesDiff = s2.totalMultiples - s1.totalMultiples;
  const multiplesColor = multiplesDiff !== 0 ? colors.yellow : colors.reset;
  console.log(
    `${'Multiple Giocate'.padEnd(30)} | ` +
    `${s1.totalMultiples}`.padEnd(25) + ' | ' +
    `${s2.totalMultiples}`.padEnd(25) + ' | ' +
    `${multiplesColor}${multiplesDiff > 0 ? '+' : ''}${multiplesDiff}${colors.reset}`
  );
  
  // Vinte
  const wonDiff = s2.totalWon - s1.totalWon;
  const wonColor = wonDiff > 0 ? colors.green : (wonDiff < 0 ? colors.red : colors.yellow);
  console.log(
    `${'Vinte'.padEnd(30)} | ` +
    `${s1.totalWon}`.padEnd(25) + ' | ' +
    `${s2.totalWon}`.padEnd(25) + ' | ' +
    `${wonColor}${wonDiff > 0 ? '+' : ''}${wonDiff}${colors.reset}`
  );
  
  // Perse
  const lostDiff = s2.totalLost - s1.totalLost;
  const lostColor = lostDiff < 0 ? colors.green : (lostDiff > 0 ? colors.red : colors.yellow);
  console.log(
    `${'Perse'.padEnd(30)} | ` +
    `${s1.totalLost}`.padEnd(25) + ' | ' +
    `${s2.totalLost}`.padEnd(25) + ' | ' +
    `${lostColor}${lostDiff > 0 ? '+' : ''}${lostDiff}${colors.reset}`
  );
  
  // Quota Media
  const oddsDiff = s2.avgOdds - s1.avgOdds;
  const oddsColor = oddsDiff !== 0 ? colors.yellow : colors.reset;
  console.log(
    `${'Quota Media'.padEnd(30)} | ` +
    `${s1.avgOdds.toFixed(2)}`.padEnd(25) + ' | ' +
    `${s2.avgOdds.toFixed(2)}`.padEnd(25) + ' | ' +
    `${oddsColor}${oddsDiff > 0 ? '+' : ''}${oddsDiff.toFixed(2)}${colors.reset}`
  );
  
  // Eventi Medi per Multipla
  const eventsDiff = s2.avgEventsPerMultiple - s1.avgEventsPerMultiple;
  const eventsColor = eventsDiff !== 0 ? colors.yellow : colors.reset;
  console.log(
    `${'Eventi Medi per Multipla'.padEnd(30)} | ` +
    `${s1.avgEventsPerMultiple.toFixed(1)}`.padEnd(25) + ' | ' +
    `${s2.avgEventsPerMultiple.toFixed(1)}`.padEnd(25) + ' | ' +
    `${eventsColor}${eventsDiff > 0 ? '+' : ''}${eventsDiff.toFixed(1)}${colors.reset}`
  );
  
  console.log('─'.repeat(120));
  
  // Analisi dettagliata perdite
  console.log(`\n${colors.bright}🔴 ANALISI PERDITE${colors.reset}`);
  
  const losses1 = result1.detailedResults.filter(r => !r.won);
  const losses2 = result2.detailedResults.filter(r => !r.won);
  
  console.log(`   ${label1}: ${losses1.length} perdite`);
  console.log(`   ${label2}: ${losses2.length} perdite`);
  
  if (losses2.length < losses1.length) {
    console.log(`   ${colors.green}✅ ${label2} ha ${losses1.length - losses2.length} perdite in meno${colors.reset}`);
  } else if (losses2.length > losses1.length) {
    console.log(`   ${colors.red}❌ ${label2} ha ${losses2.length - losses1.length} perdite in più${colors.reset}`);
  }
  
  // Conclusione
  console.log(`\n${colors.bright}💡 CONCLUSIONE${colors.reset}`);
  
  let improvements = 0;
  let regressions = 0;
  
  if (winRateDiff > 0) improvements++;
  if (winRateDiff < 0) regressions++;
  
  if (roiDiff > 0) improvements++;
  if (roiDiff < 0) regressions++;
  
  if (capitalDiff > 0) improvements++;
  if (capitalDiff < 0) regressions++;
  
  if (lostDiff < 0) improvements++;
  if (lostDiff > 0) regressions++;
  
  if (improvements > regressions) {
    console.log(`   ${colors.green}✅ ${label2} è MIGLIORE di ${label1}${colors.reset}`);
    console.log(`   ${colors.green}   ${improvements} metriche migliorate vs ${regressions} peggiorate${colors.reset}`);
  } else if (regressions > improvements) {
    console.log(`   ${colors.red}❌ ${label2} è PEGGIORE di ${label1}${colors.reset}`);
    console.log(`   ${colors.red}   ${regressions} metriche peggiorate vs ${improvements} migliorate${colors.reset}`);
  } else {
    console.log(`   ${colors.yellow}⚠️  ${label2} e ${label1} hanno performance SIMILI${colors.reset}`);
  }
  
  console.log('\n' + '='.repeat(120));
}

// Main
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('\n📊 COMPARE BACKTEST RESULTS');
    console.log('━'.repeat(120));
    console.log('\n❌ Usage: node compare-backtest-results.js <file1.json> <file2.json>');
    console.log('\nExample:');
    console.log('  node compare-backtest-results.js backtest-old.json backtest-new.json');
    console.log('\nFile disponibili:');
    
    const files = fs.readdirSync(__dirname).filter(f => f.startsWith('backtest-result-') && f.endsWith('.json'));
    if (files.length > 0) {
      files.forEach(f => console.log(`  - ${f}`));
    } else {
      console.log('  (nessun file trovato)');
    }
    
    process.exit(1);
  }
  
  const [file1, file2] = args;
  const label1 = args[2] || 'PRIMA';
  const label2 = args[3] || 'DOPO';
  
  const result1 = loadBacktestResult(file1);
  const result2 = loadBacktestResult(file2);
  
  compareResults(result1, result2, label1, label2);
}

main();
