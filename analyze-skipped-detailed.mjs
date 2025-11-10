import axios from 'axios';
import fs from 'fs';

// ==========================================
// CONFIGURAZIONE
// ==========================================
const API_BASE = 'http://localhost:3001';
const BACKTEST_REPORT = './backtest-report-2025-10-10_to_2025-11-09.json';

// ==========================================
// CARICA REPORT BACKTEST
// ==========================================
console.log('🔍 ANALISI DETTAGLIATA PARTITE SALTATE DAL BACKTEST\n');

const report = JSON.parse(fs.readFileSync(BACKTEST_REPORT, 'utf8'));

console.log(`📊 REPORT CARICATO:`);
console.log(`   Periodo: ${report.metadata.startDate} → ${report.metadata.endDate}`);
console.log(`   Partite totali: ${report.metadata.totalMatches}`);
console.log(`   Partite analizzate: ${report.metadata.matchesAnalyzed}`);
console.log(`   Partite saltate: ${report.metadata.matchesSkipped}`);
console.log(`   Skip per dati team: ${report.metadata.skipReasons.noTeams}`);
console.log(`   Skip per nessuna rac: ${report.metadata.skipReasons.noRecs}\n`);

// ==========================================
// ANALISI DELLE RACCOMANDAZIONI ESISTENTI
// ==========================================
console.log('📈 ANALISI STATISTICHE RACCOMANDAZIONI GENERATE:\n');

// Analizza tutte le raccomandazioni per capire i pattern vincenti
const recs = report.allRecommendations;

// Distribuzione per Expected Value
const evRanges = {
  negative: recs.filter(r => r.expectedValue < 0).length,
  low: recs.filter(r => r.expectedValue >= 0 && r.expectedValue < 0.10).length,
  medium: recs.filter(r => r.expectedValue >= 0.10 && r.expectedValue < 0.20).length,
  high: recs.filter(r => r.expectedValue >= 0.20).length
};

console.log('💰 DISTRIBUZIONE EXPECTED VALUE:');
console.log(`   < 0% (Negative): ${evRanges.negative}`);
console.log(`   0-10% (Low): ${evRanges.low}`);
console.log(`   10-20% (Medium): ${evRanges.medium}`);
console.log(`   > 20% (High): ${evRanges.high}\n`);

// Distribuzione per Confidence
const confRanges = {
  low: recs.filter(r => r.confidence < 50).length,
  medium: recs.filter(r => r.confidence >= 50 && r.confidence < 70).length,
  high: recs.filter(r => r.confidence >= 70).length
};

console.log('🎯 DISTRIBUZIONE CONFIDENCE:');
console.log(`   < 50%: ${confRanges.low}`);
console.log(`   50-70%: ${confRanges.medium}`);
console.log(`   > 70%: ${confRanges.high}\n`);

// Distribuzione per Rating
const ratingDist = {
  r1: recs.filter(r => r.valueRating === 1).length,
  r2: recs.filter(r => r.valueRating === 2).length,
  r3: recs.filter(r => r.valueRating === 3).length,
  r4: recs.filter(r => r.valueRating === 4).length
};

console.log('⭐ DISTRIBUZIONE VALUE RATING:');
console.log(`   1⭐: ${ratingDist.r1}`);
console.log(`   2⭐: ${ratingDist.r2}`);
console.log(`   3⭐: ${ratingDist.r3}`);
console.log(`   4⭐: ${ratingDist.r4}\n`);

// ==========================================
// ANALISI SOGLIE MINIME
// ==========================================
console.log('📊 SOGLIE MINIME DELLE RACCOMANDAZIONI GENERATE:\n');

const minEV = Math.min(...recs.map(r => r.expectedValue));
const maxEV = Math.max(...recs.map(r => r.expectedValue));
const avgEV = recs.reduce((sum, r) => sum + r.expectedValue, 0) / recs.length;

const minConf = Math.min(...recs.map(r => r.confidence));
const maxConf = Math.max(...recs.map(r => r.confidence));
const avgConf = recs.reduce((sum, r) => sum + r.confidence, 0) / recs.length;

const minOdds = Math.min(...recs.map(r => r.odds));
const maxOdds = Math.max(...recs.map(r => r.odds));
const avgOdds = recs.reduce((sum, r) => sum + r.odds, 0) / recs.length;

console.log('💰 EXPECTED VALUE:');
console.log(`   Min: ${(minEV * 100).toFixed(2)}%`);
console.log(`   Avg: ${(avgEV * 100).toFixed(2)}%`);
console.log(`   Max: ${(maxEV * 100).toFixed(2)}%\n`);

console.log('🎯 CONFIDENCE:');
console.log(`   Min: ${minConf.toFixed(1)}%`);
console.log(`   Avg: ${avgConf.toFixed(1)}%`);
console.log(`   Max: ${maxConf.toFixed(1)}%\n`);

console.log('📊 ODDS:');
console.log(`   Min: ${minOdds.toFixed(2)}`);
console.log(`   Avg: ${avgOdds.toFixed(2)}`);
console.log(`   Max: ${maxOdds.toFixed(2)}\n`);

// ==========================================
// ANALISI PER TIPO DI RACCOMANDAZIONE
// ==========================================
console.log('📋 ANALISI PER TIPO DI RACCOMANDAZIONE:\n');

const byType = {
  result: recs.filter(r => r.type === 'result'),
  double_chance: recs.filter(r => r.type === 'double_chance'),
  over_under: recs.filter(r => r.type === 'over_under'),
  goal_nogoal: recs.filter(r => r.type === 'goal_nogoal')
};

Object.entries(byType).forEach(([type, typeRecs]) => {
  if (typeRecs.length === 0) return;
  
  const wins = typeRecs.filter(r => r.result === 'win').length;
  const wr = (wins / typeRecs.length * 100).toFixed(1);
  
  const avgEV = typeRecs.reduce((sum, r) => sum + r.expectedValue, 0) / typeRecs.length;
  const avgConf = typeRecs.reduce((sum, r) => sum + r.confidence, 0) / typeRecs.length;
  const avgOdds = typeRecs.reduce((sum, r) => sum + r.odds, 0) / typeRecs.length;
  
  console.log(`🏷️  ${type.toUpperCase()}:`);
  console.log(`   Count: ${typeRecs.length}`);
  console.log(`   WR: ${wr}%`);
  console.log(`   Avg EV: ${(avgEV * 100).toFixed(2)}%`);
  console.log(`   Avg Confidence: ${avgConf.toFixed(1)}%`);
  console.log(`   Avg Odds: ${avgOdds.toFixed(2)}\n`);
});

// ==========================================
// ANALISI PARTITE CON MULTIPLE RACCOMANDAZIONI
// ==========================================
console.log('🔢 PARTITE CON MULTIPLE RACCOMANDAZIONI:\n');

const matchesWithRecs = {};
recs.forEach(r => {
  const key = `${r.match}`;
  if (!matchesWithRecs[key]) {
    matchesWithRecs[key] = [];
  }
  matchesWithRecs[key].push(r);
});

const multiRecMatches = Object.entries(matchesWithRecs).filter(([_, recs]) => recs.length > 1);
const singleRecMatches = Object.entries(matchesWithRecs).filter(([_, recs]) => recs.length === 1);

console.log(`   Partite con 1 sola raccomandazione: ${singleRecMatches.length}`);
console.log(`   Partite con 2+ raccomandazioni: ${multiRecMatches.length}\n`);

if (multiRecMatches.length > 0) {
  console.log('   📝 Esempi partite con multiple raccomandazioni:\n');
  
  multiRecMatches.slice(0, 5).forEach(([match, matchRecs]) => {
    console.log(`      ${match}:`);
    matchRecs.forEach(r => {
      const resultIcon = r.result === 'win' ? '✅' : '❌';
      console.log(`         ${resultIcon} ${r.type} - ${r.id} @ ${r.odds.toFixed(2)} | ${r.valueRating}⭐ | EV: ${(r.expectedValue * 100).toFixed(1)}%`);
    });
    console.log('');
  });
}

// ==========================================
// STIMA DELLE PARTITE SALTATE
// ==========================================
console.log('\n' + '='.repeat(80));
console.log('🔍 ANALISI PARTITE SALTATE (67 PARTITE)');
console.log('='.repeat(80) + '\n');

console.log('💡 IPOTESI SUI MOTIVI DI SKIP:\n');

const totalSkipped = report.metadata.matchesSkipped;
const skipNoRecs = report.metadata.skipReasons.noRecs;
const skipNoTeams = report.metadata.skipReasons.noTeams;

console.log(`📊 BREAKDOWN:`);
console.log(`   Totale saltate: ${totalSkipped}`);
console.log(`   Dati team mancanti: ${skipNoTeams} (${(skipNoTeams / totalSkipped * 100).toFixed(1)}%)`);
console.log(`   Nessuna raccomandazione: ${skipNoRecs} (${(skipNoRecs / totalSkipped * 100).toFixed(1)}%)\n`);

console.log('🤔 POSSIBILI CAUSE "NESSUNA RACCOMANDAZIONE":\n');

console.log('   1. 📊 FILTRI TROPPO STRINGENTI:');
console.log('      - Expected Value > 10%');
console.log('      - Confidence >= 50%');
console.log('      - Value Rating <= 3⭐');
console.log('      - Over/Under: xG thresholds specifici\n');

console.log('   2. 💰 ODDS NON DISPONIBILI O NON CONVENIENTI:');
console.log('      - Sportsmonks potrebbe non avere quote per alcuni match');
console.log('      - Quote troppo basse rispetto alle probabilità ML\n');

console.log('   3. 📉 DATI xG INSUFFICIENTI:');
console.log('      - Team con pochi dati storici');
console.log('      - Nuove promozioni o squadre minori\n');

console.log('   4. ⚖️ MATCH EQUILIBRATI:');
console.log('      - Probabilità troppo vicine tra loro');
console.log('      - Nessun chiaro favorito → EV basso\n');

// ==========================================
// RACCOMANDAZIONI PER AUMENTARE LA COPERTURA
// ==========================================
console.log('='.repeat(80));
console.log('💡 RACCOMANDAZIONI PER AUMENTARE LA COPERTURA');
console.log('='.repeat(80) + '\n');

console.log('🎯 OPZIONI DA CONSIDERARE:\n');

console.log('1. 🔽 ALLENTARE SOGLIE (RISCHIOSO):');
console.log('   - Expected Value: 10% → 8%');
console.log('   - Confidence: 50% → 45%');
console.log('   - Value Rating: 3⭐ → 4⭐');
console.log(`   - ⚠️  Rischio: Potrebbe abbassare il WR attuale (${report.summary.winRate.toFixed(1)}%)\n`);

console.log('2. ⭐ CREARE TIER 4⭐ "LOW CONFIDENCE":');
console.log('   - Tier separato per raccomandazioni con confidence 40-50%');
console.log('   - Utenti possono scegliere se seguirle');
console.log('   - Aumenterebbe copertura senza compromettere qualità tier 2⭐ e 3⭐\n');

console.log('3. 🔍 MIGLIORARE CALCOLO xG:');
console.log('   - Integrare più dati storici');
console.log('   - Considerare fattori stagionali');
console.log('   - Usare API alternative per dati mancanti\n');

console.log('4. 📊 AGGIUNGERE NUOVI MERCATI:');
console.log('   - Corners, Cards (se disponibili quote)');
console.log('   - Asian Handicap');
console.log('   - Antepost (Long-term)\n');

console.log('5. 🎲 PERMETTERE RACCOMANDAZIONI "VALUE BET":');
console.log('   - Anche se EV < 10%, mostrare se odds > 2.5');
console.log('   - Utenti avanzati potrebbero apprezzare\n');

// ==========================================
// ANALISI WIN RATE PER SOGLIA EV
// ==========================================
console.log('='.repeat(80));
console.log('📊 WIN RATE PER SOGLIA EXPECTED VALUE');
console.log('='.repeat(80) + '\n');

const evThresholds = [0, 0.05, 0.08, 0.10, 0.12, 0.15, 0.20];

evThresholds.forEach(threshold => {
  const filtered = recs.filter(r => r.expectedValue >= threshold);
  
  if (filtered.length === 0) return;
  
  const wins = filtered.filter(r => r.result === 'win').length;
  const wr = (wins / filtered.length * 100).toFixed(1);
  
  const profit = filtered.reduce((sum, r) => {
    return sum + (r.result === 'win' ? r.odds - 1 : -1);
  }, 0);
  
  const roi = (profit / filtered.length * 100).toFixed(1);
  
  console.log(`EV >= ${(threshold * 100).toFixed(0)}%: ${filtered.length} recs | WR: ${wr}% | ROI: ${roi}%`);
});

console.log('\n💡 INSIGHT: Se il WR rimane alto anche con EV >= 8%, puoi allentare le soglie\n');

// ==========================================
// SALVATAGGIO REPORT
// ==========================================
const analysis = {
  metadata: {
    source: BACKTEST_REPORT,
    analyzedAt: new Date().toISOString()
  },
  statistics: {
    totalMatches: report.metadata.totalMatches,
    matchesAnalyzed: report.metadata.matchesAnalyzed,
    matchesSkipped: report.metadata.matchesSkipped,
    skipReasons: report.metadata.skipReasons
  },
  recommendations: {
    total: recs.length,
    evDistribution: evRanges,
    confidenceDistribution: confRanges,
    ratingDistribution: ratingDist,
    byType
  },
  thresholds: {
    expectedValue: { min: minEV, avg: avgEV, max: maxEV },
    confidence: { min: minConf, avg: avgConf, max: maxConf },
    odds: { min: minOdds, avg: avgOdds, max: maxOdds }
  },
  coverage: {
    currentCoverage: ((report.metadata.matchesAnalyzed / report.metadata.totalMatches) * 100).toFixed(1) + '%',
    potentialIncrease: 'Stimato +15-25% allentando filtri a EV >= 8% e Confidence >= 45%'
  }
};

fs.writeFileSync('./skipped-matches-analysis.json', JSON.stringify(analysis, null, 2));

console.log('💾 Analisi salvata in: skipped-matches-analysis.json\n');
console.log('✅ Analisi completata!\n');
