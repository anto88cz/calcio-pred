// 🔍 ANALISI AUTOMATICA BACKTEST Q1 2025
// Identifica problemi sistematici e pattern di fallimento

const fs = require('fs');

// 17 schedine perse da Q1 2025
const LOST_BETS_Q1 = [
  { date: '2025-01-11', match: 'Espanyol vs Leganés', prediction: '12', odds: 1.40, result: '1-1', issue: 'DRAW' },
  { date: '2025-01-18', match: 'Plymouth Argyle vs Queens Park Rangers', prediction: '1X', odds: 1.46, result: '0-1', issue: 'AWAY_WIN' },
  { date: '2025-01-19', match: 'Everton vs Tottenham Hotspur', prediction: 'X2', odds: 1.52, result: '3-2', issue: 'HOME_WIN' },
  { date: '2025-01-21', match: 'Monaco vs Aston Villa', prediction: 'X2', odds: 1.51, result: '1-0', issue: 'HOME_WIN' },
  { date: '2025-01-24', match: 'Spezia vs Sassuolo', prediction: 'X2', odds: 1.49, result: '2-1', issue: 'HOME_WIN' },
  { date: '2025-01-26', match: 'Getafe vs Sevilla', prediction: '12', odds: 1.43, result: '0-0', issue: 'DRAW' },
  { date: '2025-02-01', match: 'Queens Park Rangers vs Blackburn Rovers', prediction: 'X2', odds: 1.48, result: '2-1', issue: 'HOME_WIN' },
  { date: '2025-02-08', match: 'Cesena vs Pisa', prediction: '12', odds: 1.38, result: '1-1', issue: 'DRAW' },
  { date: '2025-02-15', match: 'Nottingham Forest vs Arsenal', prediction: '12', odds: 1.32, result: '0-0', issue: 'DRAW' },
  { date: '2025-02-16', match: 'Cesena vs Salernitana', prediction: 'X2', odds: 1.53, result: '2-0', issue: 'HOME_WIN' },
  { date: '2025-02-22', match: 'Preston North End vs Swansea City', prediction: '12', odds: 1.35, result: '0-0', issue: 'DRAW' },
  { date: '2025-03-06', match: 'Roma vs Athletic Club', prediction: 'X2', odds: 1.55, result: '2-1', issue: 'HOME_WIN' },
  { date: '2025-03-08', match: 'Cagliari vs Genoa', prediction: '12', odds: 1.40, result: '1-1', issue: 'DRAW' },
  { date: '2025-03-15', match: 'Espanyol vs Girona', prediction: '12', odds: 1.36, result: '1-1', issue: 'DRAW' },
  { date: '2025-03-15', match: 'FC Augsburg vs VfL Wolfsburg', prediction: 'X2', odds: 1.55, result: '1-0', issue: 'HOME_WIN' },
  { date: '2025-03-22', match: 'Reggiana vs Sampdoria', prediction: '12', odds: 1.40, result: '2-2', issue: 'DRAW' },
  { date: '2025-03-31', match: 'Hellas Verona vs Parma', prediction: '12', odds: 1.39, result: '0-0', issue: 'DRAW' }
];

function analyzePatterns() {
  console.log('🔍 ANALISI PATTERN SCONFITTE Q1 2025\n');
  console.log('═'.repeat(70));
  
  // 1. ANALISI PER TIPO DI PROBLEMA
  const issueCount = {};
  LOST_BETS_Q1.forEach(bet => {
    issueCount[bet.issue] = (issueCount[bet.issue] || 0) + 1;
  });
  
  console.log('\n📊 DISTRIBUZIONE PROBLEMI:\n');
  Object.entries(issueCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([issue, count]) => {
      const percentage = (count / LOST_BETS_Q1.length * 100).toFixed(1);
      console.log(`   ${issue.padEnd(15)}: ${count}/${LOST_BETS_Q1.length} (${percentage}%)`);
    });
  
  // 2. ANALISI PER TIPO DI PREDIZIONE
  const predictionIssues = {};
  LOST_BETS_Q1.forEach(bet => {
    const key = `${bet.prediction} → ${bet.issue}`;
    predictionIssues[key] = (predictionIssues[key] || 0) + 1;
  });
  
  console.log('\n📈 PREDIZIONI CHE FALLISCONO:\n');
  Object.entries(predictionIssues)
    .sort((a, b) => b[1] - a[1])
    .forEach(([pattern, count]) => {
      console.log(`   ${pattern.padEnd(25)}: ${count} volte`);
    });
  
  // 3. ANALISI QUOTE
  const avgOdds = LOST_BETS_Q1.reduce((sum, bet) => sum + bet.odds, 0) / LOST_BETS_Q1.length;
  const lowOddsBets = LOST_BETS_Q1.filter(bet => bet.odds < 1.40);
  
  console.log('\n💰 ANALISI QUOTE:\n');
  console.log(`   Quota media sconfitte: ${avgOdds.toFixed(2)}`);
  console.log(`   Sconfitte con quote < 1.40: ${lowOddsBets.length}/${LOST_BETS_Q1.length}`);
  
  // 4. IDENTIFICAZIONE DEL PROBLEMA PRINCIPALE
  console.log('\n\n🚨 PROBLEMI IDENTIFICATI:\n');
  console.log('═'.repeat(70));
  
  // PROBLEMA 1: PAREGGI NON PREVISTI (12 fallisce)
  const drawIssues = LOST_BETS_Q1.filter(bet => bet.issue === 'DRAW');
  console.log(`\n1. ⚖️  PAREGGI NON IDENTIFICATI - ${drawIssues.length}/${LOST_BETS_Q1.length} (${(drawIssues.length/LOST_BETS_Q1.length*100).toFixed(1)}%)`);
  console.log('   Problema: Predizioni 12 falliscono per pareggi inaspettati');
  console.log('   Pattern: Quote basse (< 1.40) = alta probabilità di equilibrio');
  console.log('   Partite coinvolte:');
  drawIssues.forEach(bet => {
    console.log(`      - ${bet.match} (${bet.result}) @${bet.odds}`);
  });
  
  // PROBLEMA 2: SOTTOVALUTAZIONE CASA (X2 e 1X falliscono)
  const homeWinIssues = LOST_BETS_Q1.filter(bet => bet.issue === 'HOME_WIN');
  const awayWinIssues = LOST_BETS_Q1.filter(bet => bet.issue === 'AWAY_WIN');
  
  console.log(`\n2. 🏠 SOTTOVALUTAZIONE FATTORE CASA - ${homeWinIssues.length}/${LOST_BETS_Q1.length} (${(homeWinIssues.length/LOST_BETS_Q1.length*100).toFixed(1)}%)`);
  console.log('   Problema: Predizioni X2 falliscono quando la casa vince');
  console.log('   Pattern: homeAdvantage ancora troppo basso');
  console.log('   Partite coinvolte:');
  homeWinIssues.forEach(bet => {
    console.log(`      - ${bet.match} (${bet.result}) predetto ${bet.prediction} @${bet.odds}`);
  });
  
  if (awayWinIssues.length > 0) {
    console.log(`\n3. 🚗 SOTTOVALUTAZIONE TRASFERTA - ${awayWinIssues.length}/${LOST_BETS_Q1.length} (${(awayWinIssues.length/LOST_BETS_Q1.length*100).toFixed(1)}%)`);
    console.log('   Problema: Predizioni 1X falliscono quando la trasferta vince');
    console.log('   Partite coinvolte:');
    awayWinIssues.forEach(bet => {
      console.log(`      - ${bet.match} (${bet.result}) predetto ${bet.prediction} @${bet.odds}`);
    });
  }
  
  // 5. CALCOLO IMPATTO
  console.log('\n\n💸 IMPATTO ECONOMICO:\n');
  console.log('═'.repeat(70));
  
  const totalLost = LOST_BETS_Q1.length;
  const drawLossPercentage = (drawIssues.length / totalLost * 100).toFixed(1);
  const homeLossPercentage = (homeWinIssues.length / totalLost * 100).toFixed(1);
  
  console.log(`\n   Pareggi:        ${drawIssues.length} sconfitte (${drawLossPercentage}%)`);
  console.log(`   Vittorie casa:  ${homeWinIssues.length} sconfitte (${homeLossPercentage}%)`);
  console.log(`   Vittorie trasferta: ${awayWinIssues.length} sconfitte`);
  
  // 6. RACCOMANDAZIONI
  console.log('\n\n💡 RACCOMANDAZIONI FIX:\n');
  console.log('═'.repeat(70));
  
  console.log('\n🔧 FIX PRIORITÀ ALTA:');
  console.log('\n   1. AUMENTARE SOGLIA PAREGGIO');
  console.log('      - Problema: 9/17 sconfitte (53%) sono pareggi non previsti');
  console.log('      - Soluzione: Aumentare drawProbability quando:');
  console.log('        * Quote 12 < 1.40 (molto basse)');
  console.log('        * Rating squadre molto simili (diff < 3%)');
  console.log('      - Implementazione: BALANCE_DETECTION.LOW_ODDS_THRESHOLD = 1.40 → 1.45');
  console.log('      - Implementazione: BALANCE_DETECTION.DRAW_BOOST_FACTOR = 1.15 → 1.25');
  
  console.log('\n   2. PENALIZZARE PREDIZIONI 12 CON QUOTE BASSE');
  console.log('      - Problema: Quote < 1.40 indicano equilibrio ma vengono ignorate');
  console.log('      - Soluzione: Ridurre confidence per 12 con odds < 1.40');
  console.log('      - Implementazione: if (odds < 1.40 && prediction === "12") confidence *= 0.75');
  
  console.log('\n   3. AUMENTARE ANCORA homeAdvantage');
  console.log('      - Problema: 7/17 sconfitte (41%) sono X2 che fallisce per vittoria casa');
  console.log('      - Soluzione: Incrementare ulteriormente homeAdvantage:');
  console.log('        * Championship: 1.15 → 1.18 (+2.6%)');
  console.log('        * Serie B: 1.12 → 1.15 (+2.7%)');
  console.log('        * Premier League: 1.13 → 1.15 (+1.8%)');
  
  console.log('\n🔧 FIX PRIORITÀ MEDIA:');
  console.log('\n   4. FILTRARE PARTITE CON BASSA CONFIDENCE');
  console.log('      - Aumentare MIN_CONFIDENCE da 60% a 65%');
  console.log('      - Aumentare MIN_EXPECTED_VALUE da 10% a 12%');
  
  console.log('\n   5. EVITARE MULTIPLE DA 1 EVENTO CON QUOTE BASSE');
  console.log('      - Se numEvents === 1 && odds < 1.40 → skip');
  console.log('      - Preferire multiple da 2+ eventi per ridurre rischio pareggio');
  
  // 7. CONFRONTO CON BACKTEST PRECEDENTE
  console.log('\n\n📊 CONFRONTO CON BACKTEST SETTEMBRE-NOVEMBRE 2025:\n');
  console.log('═'.repeat(70));
  
  console.log('\n   SETTEMBRE-NOVEMBRE 2025:');
  console.log('      ROI: +683%');
  console.log('      Win Rate: 85.7%');
  console.log('      Sconfitte: 5/35 (14%)');
  console.log('      Problema principale: Sottovalutazione casa (60%)');
  
  console.log('\n   GENNAIO-MARZO 2025 (Q1):');
  console.log('      ROI: -91.94%');
  console.log('      Win Rate: 62.2%');
  console.log('      Sconfitte: 17/45 (38%)');
  console.log('      Problema principale: Pareggi non previsti (53%)');
  
  console.log('\n   DIFFERENZE CHIAVE:');
  console.log('      - Win rate crollato da 85.7% a 62.2% (-23.5pp)');
  console.log('      - Pareggi da problema secondario (40%) a primario (53%)');
  console.log('      - Fattore casa ancora problematico (41% vs 60%)');
  console.log('      - Quote medie più basse in Q1 → più equilibrio');
  
  console.log('\n\n✅ CONCLUSIONE:');
  console.log('═'.repeat(70));
  console.log('\nIl sistema funziona bene su partite sbilanciate (set-nov),');
  console.log('ma FALLISCE su partite equilibrate (gen-mar).');
  console.log('\nIl fix precedente (homeAdvantage) non è sufficiente.');
  console.log('Serve un fix più aggressivo sulla detection dei PAREGGI.');
}

// ESEGUI ANALISI
analyzePatterns();
