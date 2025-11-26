const moment = require('moment-timezone');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configurazione - usa le date dal backtest-multiple.js
const START_DATE = process.argv[2] || '2025-09-01';
const END_DATE = process.argv[3] || '2025-11-25';

// Colori
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Funzione per estrarre tutte le raccomandazioni dal backtest
function extractBacktestRecommendations(output) {
  const recommendations = new Map();
  
  // Rimuovi codici colore ANSI prima del parsing
  const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '');
  
  // Pattern per estrarre data e raccomandazione
  // Formato reale: "📅 Elaborazione 2025-09-13..." poi "    ✓ FSV Mainz 05 vs RB Leipzig: X2 @1.52 (0-1)"
  const sections = cleanOutput.split(/(?=📅\s+Elaborazione\s+\d{4}-\d{2}-\d{2})/);
  
  for (const section of sections) {
    // Estrai data
    const dateMatch = section.match(/📅\s+Elaborazione\s+(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    
    const date = dateMatch[1];
    
    // Cerca raccomandazione (indentata con 4 spazi): "    ✓ Teams: BET @ODDS" o "    ✗ Teams: BET @ODDS"
    const recMatch = section.match(/\s+[✓✗]\s+([^:]+):\s+([^\s@]+)\s+@([\d.]+)/);
    
    if (recMatch) {
      const teams = recMatch[1].trim();
      const prediction = recMatch[2].trim();
      const odds = parseFloat(recMatch[3]);
      
      recommendations.set(date, {
        teams,
        prediction,
        odds
      });
    } else if (section.includes('Nessuna partita trovata') || section.includes('Nessun evento con raccomandazioni')) {
      // Nessuna raccomandazione per questo giorno
      recommendations.set(date, null);
    }
  }
  
  return recommendations;
}

// Funzione per estrarre raccomandazione da uptest
function extractUptestRecommendation(output) {
  // Rimuovi codici colore ANSI
  const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '');
  
  const matchPattern = /1\.\s+([^\n]+)\n[^\n]*\n[^\n]*\n[^\n]*⚽\s+Scommessa:\s+([^\s@]+)\s+@([\d.]+)/;
  const match = cleanOutput.match(matchPattern);
  
  if (match) {
    return {
      teams: match[1].trim(),
      prediction: match[2].trim(),
      odds: parseFloat(match[3])
    };
  }
  
  if (cleanOutput.includes('Nessuna schedina trovata') || cleanOutput.includes('Nessun evento con raccomandazioni valide')) {
    return null;
  }
  
  return null;
}

// Main
async function main() {
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  🔬 VERIFICATION: UPTEST vs BACKTEST ALIGNMENT${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}  Period: ${START_DATE} to ${END_DATE}${colors.reset}\n`);
  
  // STEP 1: Esegui backtest UNA VOLTA SOLA per tutto il periodo
  console.log(`${colors.blue}${colors.bright}📊 Step 1: Running backtest-multiple for entire period...${colors.reset}`);
  console.log(`${colors.yellow}   (This will take a few minutes - backtest runs ONCE for all dates)${colors.reset}\n`);
  
  const backtestStart = Date.now();
  const { stdout: backtestOutput } = await execAsync('node backtest-multiple.js', { 
    maxBuffer: 50 * 1024 * 1024,
    timeout: 600000 // 10 minuti max
  });
  const backtestDuration = ((Date.now() - backtestStart) / 1000).toFixed(1);
  
  console.log(`${colors.green}✓ Backtest completed in ${backtestDuration}s${colors.reset}\n`);
  
  // Debug: mostra prime righe output backtest
  console.log(`${colors.blue}📝 Backtest output sample (first 500 chars):${colors.reset}`);
  console.log(backtestOutput.substring(0, 500).replace(/\x1b\[[0-9;]*m/g, ''));
  console.log(`${colors.blue}...${colors.reset}\n`);
  
  // STEP 2: Estrai tutte le raccomandazioni dal backtest
  console.log(`${colors.blue}📋 Step 2: Extracting recommendations from backtest...${colors.reset}`);
  const backtestRecs = extractBacktestRecommendations(backtestOutput);
  console.log(`${colors.green}✓ Extracted ${backtestRecs.size} dates from backtest${colors.reset}`);
  
  // Debug: mostra prime 5 date
  if (backtestRecs.size > 0) {
    console.log(`${colors.blue}   Sample dates found:${colors.reset}`);
    let count = 0;
    for (const [date, rec] of backtestRecs.entries()) {
      if (count++ >= 5) break;
      const recStr = rec ? `${rec.teams} - ${rec.prediction} @${rec.odds}` : 'NO REC';
      console.log(`   - ${date}: ${recStr}`);
    }
  }
  console.log();
  
  // STEP 3: Esegui uptest per ogni data trovata nel backtest
  console.log(`${colors.blue}${colors.bright}🔮 Step 3: Running uptest for each date (${backtestRecs.size} dates)...${colors.reset}`);
  console.log(`${colors.yellow}   (Each uptest runs independently)${colors.reset}\n`);
  
  const results = [];
  let completed = 0;
  
  for (const [date, backtestRec] of backtestRecs.entries()) {
    completed++;
    const uptestStart = Date.now();
    console.log(`${colors.cyan}[${completed}/${backtestRecs.size}] Testing ${date}...${colors.reset}`);
    
    // Debug: mostra cosa ha trovato backtest
    const backtestStr = backtestRec ? `${backtestRec.teams.substring(0, 30)} - ${backtestRec.prediction}` : 'NO REC';
    console.log(`  ${colors.blue}Backtest: ${backtestStr}${colors.reset}`);
    
    try {
      const { stdout: uptestOutput } = await execAsync(`node uptest-multiple.js ${date}`, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120000
      });
      
      const uptestDuration = ((Date.now() - uptestStart) / 1000).toFixed(1);
      const uptestRec = extractUptestRecommendation(uptestOutput);
      
      // Debug: mostra cosa ha trovato uptest
      const uptestStr = uptestRec ? `${uptestRec.teams.substring(0, 30)} - ${uptestRec.prediction}` : 'NO REC';
      console.log(`  ${colors.blue}Uptest:   ${uptestStr} (${uptestDuration}s)${colors.reset}`);
      
      // Confronta
      if (!uptestRec && !backtestRec) {
        console.log(`  ${colors.yellow}⚠️  Both empty (ALIGNED)${colors.reset}`);
        results.push({ date, aligned: true, reason: 'both_empty' });
      } else if (!uptestRec) {
        console.log(`  ${colors.red}❌ DISALIGNED: uptest empty, backtest has ${backtestRec.teams}${colors.reset}`);
        results.push({ date, aligned: false, reason: 'uptest_empty', backtestRec });
      } else if (!backtestRec) {
        console.log(`  ${colors.red}❌ DISALIGNED: backtest empty, uptest has ${uptestRec.teams}${colors.reset}`);
        results.push({ date, aligned: false, reason: 'backtest_empty', uptestRec });
      } else {
        const teamsMatch = uptestRec.teams === backtestRec.teams;
        const predictionMatch = uptestRec.prediction === backtestRec.prediction;
        const oddsMatch = Math.abs(uptestRec.odds - backtestRec.odds) < 0.01;
        
        if (teamsMatch && predictionMatch && oddsMatch) {
          console.log(`  ${colors.green}✓ ALIGNED: ${uptestRec.prediction} @${uptestRec.odds}${colors.reset}`);
          results.push({ date, aligned: true, uptestRec, backtestRec });
        } else {
          console.log(`  ${colors.red}❌ DISALIGNED:${colors.reset}`);
          console.log(`     Uptest:   ${uptestRec.teams} - ${uptestRec.prediction} @${uptestRec.odds}`);
          console.log(`     Backtest: ${backtestRec.teams} - ${backtestRec.prediction} @${backtestRec.odds}`);
          results.push({ 
            date, 
            aligned: false, 
            reason: !teamsMatch ? 'different_teams' : !predictionMatch ? 'different_prediction' : 'different_odds',
            uptestRec, 
            backtestRec 
          });
        }
      }
    } catch (error) {
      console.error(`  ${colors.red}❌ Error: ${error.message}${colors.reset}`);
      results.push({ date, aligned: false, reason: 'error', error: error.message });
    }
  }
  
  // Summary
  console.log(`\n${colors.bright}${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  📊 SUMMARY${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
  
  const aligned = results.filter(r => r.aligned).length;
  const disaligned = results.filter(r => !r.aligned).length;
  const total = results.length;
  const alignmentRate = ((aligned / total) * 100).toFixed(1);
  
  console.log(`${colors.bright}Total days tested: ${total}${colors.reset}`);
  console.log(`${colors.green}✓ Aligned: ${aligned} (${alignmentRate}%)${colors.reset}`);
  console.log(`${colors.red}✗ Disaligned: ${disaligned} (${(100 - alignmentRate).toFixed(1)}%)${colors.reset}\n`);
  
  if (disaligned > 0) {
    console.log(`${colors.yellow}Disaligned dates:${colors.reset}`);
    results.filter(r => !r.aligned).forEach(r => {
      console.log(`  ${colors.red}${r.date}${colors.reset} - ${r.reason}`);
      if (r.uptestRec) console.log(`    Uptest: ${r.uptestRec.teams} - ${r.uptestRec.prediction}`);
      if (r.backtestRec) console.log(`    Backtest: ${r.backtestRec.teams} - ${r.backtestRec.prediction}`);
    });
  }
  
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);
  
  if (alignmentRate >= 95) {
    console.log(`${colors.green}${colors.bright}🎉 EXCELLENT ALIGNMENT (${alignmentRate}%)${colors.reset}\n`);
    process.exit(0);
  } else if (alignmentRate >= 80) {
    console.log(`${colors.yellow}${colors.bright}⚠️  GOOD ALIGNMENT (${alignmentRate}%), but needs improvement${colors.reset}\n`);
    process.exit(1);
  } else {
    console.log(`${colors.red}${colors.bright}❌ POOR ALIGNMENT (${alignmentRate}%), fix required${colors.reset}\n`);
    process.exit(2);
  }
}

main().catch(err => {
  console.error(`${colors.red}Fatal error: ${err.message}${colors.reset}`);
  process.exit(3);
});
