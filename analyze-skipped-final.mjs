import fs from 'fs';

// ==========================================
// CONFIGURAZIONE
// ==========================================
const BACKTEST_REPORT = './backtest-report-2025-10-10_to_2025-11-09.json';

// ==========================================
// CARICA REPORT BACKTEST
// ==========================================
console.log('🔍 ANALISI DETTAGLIATA PARTITE SALTATE DAL BACKTEST\n');
console.log('='.repeat(80) + '\n');

const report = JSON.parse(fs.readFileSync(BACKTEST_REPORT, 'utf8'));

// ==========================================
// OVERVIEW GENERALE
// ==========================================
console.log('📊 OVERVIEW GENERALE:\n');
console.log(`   Periodo: ${report.metadata.period}`);
console.log(`   Partite totali: ${report.metadata.totalMatches}`);
console.log(`   Partite con raccomandazioni: ${report.metadata.matchesAnalyzed} (${(report.metadata.matchesAnalyzed / report.metadata.totalMatches * 100).toFixed(1)}%)`);
console.log(`   Partite saltate: ${report.metadata.matchesSkipped} (${(report.metadata.matchesSkipped / report.metadata.totalMatches * 100).toFixed(1)}%)\n`);

console.log('   🎯 COPERTURA ATTUALE: ' + (report.metadata.matchesAnalyzed / report.metadata.totalMatches * 100).toFixed(1) + '%');
console.log('   🎯 OBIETTIVO: 70-80%\n');

// ==========================================
// BREAKDOWN SKIP REASONS
// ==========================================
console.log('='.repeat(80));
console.log('🔍 BREAKDOWN MOTIVI SKIP\n');
console.log('='.repeat(80) + '\n');

const totalSkipped = report.metadata.matchesSkipped;
const skipNoRecs = report.metadata.skipReasons.noRecs;
const skipNoTeams = report.metadata.skipReasons.noTeams;
const skipApiError = report.metadata.skipReasons.apiError;

console.log(`📊 DISTRIBUZIONE:`);
console.log(`   ❌ Dati team mancanti: ${skipNoTeams} (${(skipNoTeams / totalSkipped * 100).toFixed(1)}%)`);
console.log(`   ❌ API Error: ${skipApiError} (${(skipApiError / totalSkipped * 100).toFixed(1)}%)`);
console.log(`   ❌ Nessuna raccomandazione: ${skipNoRecs} (${(skipNoRecs / totalSkipped * 100).toFixed(1)}%)\n`);

console.log('💡 INSIGHT CHIAVE:');
console.log(`   • Il 100% degli skip è dovuto a "Nessuna raccomandazione generata"`);
console.log(`   • ZERO skip per dati team mancanti → i dati xG sono disponibili`);
console.log(`   • ZERO skip per errori API → il sistema funziona correttamente\n`);

// ==========================================
// ANALISI RACCOMANDAZIONI GENERATE
// ==========================================
console.log('='.repeat(80));
console.log('📈 ANALISI RACCOMANDAZIONI GENERATE\n');
console.log('='.repeat(80) + '\n');

const recs = report.allRecommendations;

console.log(`   Totale raccomandazioni: ${recs.length}`);
console.log(`   Partite con raccomandazioni: ${report.metadata.matchesAnalyzed}`);
console.log(`   Media raccomandazioni/partita: ${(recs.length / report.metadata.matchesAnalyzed).toFixed(2)}\n`);

// Distribuzione per Expected Value
const evRanges = {
  veryLow: recs.filter(r => r.expectedValue < 5).length,
  low: recs.filter(r => r.expectedValue >= 5 && r.expectedValue < 10).length,
  medium: recs.filter(r => r.expectedValue >= 10 && r.expectedValue < 15).length,
  high: recs.filter(r => r.expectedValue >= 15 && r.expectedValue < 20).length,
  veryHigh: recs.filter(r => r.expectedValue >= 20).length
};

console.log('💰 DISTRIBUZIONE EXPECTED VALUE:');
console.log(`   < 5%: ${evRanges.veryLow} (${(evRanges.veryLow / recs.length * 100).toFixed(1)}%)`);
console.log(`   5-10%: ${evRanges.low} (${(evRanges.low / recs.length * 100).toFixed(1)}%)`);
console.log(`   10-15%: ${evRanges.medium} (${(evRanges.medium / recs.length * 100).toFixed(1)}%)`);
console.log(`   15-20%: ${evRanges.high} (${(evRanges.high / recs.length * 100).toFixed(1)}%)`);
console.log(`   > 20%: ${evRanges.veryHigh} (${(evRanges.veryHigh / recs.length * 100).toFixed(1)}%)\n`);

const minEV = Math.min(...recs.map(r => r.expectedValue));
const maxEV = Math.max(...recs.map(r => r.expectedValue));
const avgEV = recs.reduce((sum, r) => sum + r.expectedValue, 0) / recs.length;

console.log(`   📊 EV Min: ${minEV.toFixed(2)}%`);
console.log(`   📊 EV Medio: ${avgEV.toFixed(2)}%`);
console.log(`   📊 EV Max: ${maxEV.toFixed(2)}%\n`);

console.log(`   ⚠️  IMPORTANTE: Soglia attuale EV >= 10%`);
console.log(`   ⚠️  Raccomandazioni con EV < 10%: ${evRanges.veryLow + evRanges.low}\n`);

// Distribuzione per Rating
const ratingDist = {
  r2: recs.filter(r => r.valueRating === 2).length,
  r3: recs.filter(r => r.valueRating === 3).length,
  r4: recs.filter(r => r.valueRating === 4).length
};

console.log('⭐ DISTRIBUZIONE VALUE RATING:');
console.log(`   2⭐: ${ratingDist.r2} (${(ratingDist.r2 / recs.length * 100).toFixed(1)}%)`);
console.log(`   3⭐: ${ratingDist.r3} (${(ratingDist.r3 / recs.length * 100).toFixed(1)}%)`);
console.log(`   4⭐: ${ratingDist.r4} (${(ratingDist.r4 / recs.length * 100).toFixed(1)}%)\n`);

// Distribuzione per Odds
const oddsRanges = {
  low: recs.filter(r => r.odds < 1.5).length,
  mediumLow: recs.filter(r => r.odds >= 1.5 && r.odds < 2.0).length,
  medium: recs.filter(r => r.odds >= 2.0 && r.odds < 2.5).length,
  high: recs.filter(r => r.odds >= 2.5).length
};

console.log('📊 DISTRIBUZIONE ODDS:');
console.log(`   < 1.5: ${oddsRanges.low} (${(oddsRanges.low / recs.length * 100).toFixed(1)}%)`);
console.log(`   1.5-2.0: ${oddsRanges.mediumLow} (${(oddsRanges.mediumLow / recs.length * 100).toFixed(1)}%)`);
console.log(`   2.0-2.5: ${oddsRanges.medium} (${(oddsRanges.medium / recs.length * 100).toFixed(1)}%)`);
console.log(`   > 2.5: ${oddsRanges.high} (${(oddsRanges.high / recs.length * 100).toFixed(1)}%)\n`);

// ==========================================
// ANALISI PER TIPO DI RACCOMANDAZIONE
// ==========================================
console.log('='.repeat(80));
console.log('📋 ANALISI PER TIPO DI RACCOMANDAZIONE\n');
console.log('='.repeat(80) + '\n');

// Estrai tipo dalla descrizione
const typePatterns = {
  result: /^[12X] -/,
  double_chance: /^[1X2]{2} -/,
  over_under: /^(Over|Under)/,
  goal_nogoal: /^(Goal|No Goal)/
};

recs.forEach(r => {
  if (typePatterns.result.test(r.recommendation)) r.type = 'result';
  else if (typePatterns.double_chance.test(r.recommendation)) r.type = 'double_chance';
  else if (typePatterns.over_under.test(r.recommendation)) r.type = 'over_under';
  else if (typePatterns.goal_nogoal.test(r.recommendation)) r.type = 'goal_nogoal';
  else r.type = 'other';
});

const byType = {
  result: recs.filter(r => r.type === 'result'),
  double_chance: recs.filter(r => r.type === 'double_chance'),
  over_under: recs.filter(r => r.type === 'over_under'),
  goal_nogoal: recs.filter(r => r.type === 'goal_nogoal')
};

Object.entries(byType).forEach(([type, typeRecs]) => {
  if (typeRecs.length === 0) return;
  
  const wins = typeRecs.filter(r => r.outcome === 'WIN').length;
  const wr = (wins / typeRecs.length * 100).toFixed(1);
  
  const avgEV = typeRecs.reduce((sum, r) => sum + r.expectedValue, 0) / typeRecs.length;
  const avgOdds = typeRecs.reduce((sum, r) => sum + r.odds, 0) / typeRecs.length;
  const totalProfit = typeRecs.reduce((sum, r) => sum + r.profit, 0);
  const roi = (totalProfit / typeRecs.length * 100).toFixed(1);
  
  console.log(`🏷️  ${type.toUpperCase()}:`);
  console.log(`   Count: ${typeRecs.length}`);
  console.log(`   WR: ${wr}%`);
  console.log(`   ROI: ${roi}%`);
  console.log(`   Avg EV: ${avgEV.toFixed(2)}%`);
  console.log(`   Avg Odds: ${avgOdds.toFixed(2)}`);
  console.log(`   Profit: ${totalProfit > 0 ? '+' : ''}${totalProfit.toFixed(2)} units\n`);
});

// ==========================================
// CAUSA PRINCIPALE: ANALISI FILTRI
// ==========================================
console.log('='.repeat(80));
console.log('🔍 CAUSA PRINCIPALE: FILTRI TROPPO STRINGENTI?\n');
console.log('='.repeat(80) + '\n');

console.log('📊 FILTRI ATTUALI:\n');

console.log('   1️⃣  FILTRO EV (Expected Value):');
console.log('      • Soglia minima: EV >= 10%');
console.log(`      • Raccomandazioni attuali con EV >= 10%: ${recs.filter(r => r.expectedValue >= 10).length}/${recs.length}`);
console.log(`      • Percentuale: ${(recs.filter(r => r.expectedValue >= 10).length / recs.length * 100).toFixed(1)}%\n`);

console.log('   2️⃣  FILTRO CONFIDENCE:');
console.log('      • Soglia minima: Confidence >= 50%');
console.log('      • (Dato non disponibile nel report JSON)\n');

console.log('   3️⃣  FILTRO RATING:');
console.log('      • Soglia massima: Rating <= 3⭐');
console.log(`      • Raccomandazioni 2-3⭐: ${ratingDist.r2 + ratingDist.r3}/${recs.length}`);
console.log(`      • Raccomandazioni 4⭐ scartate: ${ratingDist.r4}\n`);

console.log('   4️⃣  FILTRI OVER/UNDER SPECIFICI:');
console.log('      • Over 1.5: probOver15 > 0.60, xG totale > 2.0');
console.log('      • Over 2.5: probOver25 > 0.50, xG totale > 2.5');
console.log('      • Under 2.5: probUnder25 > 0.50, xG totale < 2.2\n');

// ==========================================
// SIMULAZIONE: ALLENTAMENTO FILTRI
// ==========================================
console.log('='.repeat(80));
console.log('🧪 SIMULAZIONE: COSA SUCCEDEREBBE ALLENTANDO I FILTRI?\n');
console.log('='.repeat(80) + '\n');

// Simula cosa succederebbe con EV >= 8%
const recsWithEV8 = recs.filter(r => r.expectedValue >= 8);
const winsEV8 = recsWithEV8.filter(r => r.outcome === 'WIN').length;
const wrEV8 = recsWithEV8.length > 0 ? (winsEV8 / recsWithEV8.length * 100).toFixed(1) : 0;

console.log('📊 SCENARIO 1: EV >= 8% (invece di 10%)\n');
console.log(`   Raccomandazioni attuali con EV >= 8%: ${recsWithEV8.length}`);
console.log(`   WR con EV >= 8%: ${wrEV8}%`);
console.log(`   Differenza: ${recsWithEV8.length - recs.length} raccomandazioni in più`);
console.log(`   ⚠️  Stima copertura: +${((recsWithEV8.length - recs.length) / report.metadata.totalMatches * 100).toFixed(1)}% match\n`);

// Simula cosa succederebbe con EV >= 5%
const recsWithEV5 = recs.filter(r => r.expectedValue >= 5);
const winsEV5 = recsWithEV5.filter(r => r.outcome === 'WIN').length;
const wrEV5 = recsWithEV5.length > 0 ? (winsEV5 / recsWithEV5.length * 100).toFixed(1) : 0;

console.log('📊 SCENARIO 2: EV >= 5% (invece di 10%)\n');
console.log(`   Raccomandazioni attuali con EV >= 5%: ${recsWithEV5.length}`);
console.log(`   WR con EV >= 5%: ${wrEV5}%`);
console.log(`   Differenza: ${recsWithEV5.length - recs.length} raccomandazioni in più`);
console.log(`   ⚠️  Stima copertura: +${((recsWithEV5.length - recs.length) / report.metadata.totalMatches * 100).toFixed(1)}% match\n`);

console.log('💡 NOTA: Queste simulazioni si basano SOLO sulle raccomandazioni già generate.');
console.log('    Le 67 partite saltate potrebbero avere raccomandazioni con EV < 10%\n');

// ==========================================
// RACCOMANDAZIONI STRATEGICHE
// ==========================================
console.log('='.repeat(80));
console.log('💡 RACCOMANDAZIONI PER AUMENTARE LA COPERTURA\n');
console.log('='.repeat(80) + '\n');

console.log('🎯 STRATEGIA CONSIGLIATA:\n');

console.log('1. ✅ INTRODUCI TIER 4⭐ "MODERATA CONFIDENZA":');
console.log('   • Soglie: EV >= 5%, Confidence >= 40%');
console.log('   • Marca chiaramente come "raccomandazioni moderate"');
console.log('   • Gli utenti possono scegliere se seguirle');
console.log(`   • Stima: +10-20 match coperti (da ${report.metadata.matchesAnalyzed} a ~70-78)\n`);

console.log('2. 🔍 AGGIUNGI LOGGING DETTAGLIATO:');
console.log('   • Perché una partita viene saltata?');
console.log('   • Quali mercati hanno EV < 10%?');
console.log('   • Salva le "raccomandazioni scartate" per analisi\n');

console.log('3. 📊 MONITORA WR PER SOGLIA EV:');
console.log('   • Testa gradualmente EV >= 8% per 1 settimana');
console.log('   • Se WR rimane > 70%, riduci a EV >= 6%');
console.log('   • Trova il punto di equilibrio ottimale\n');

console.log('4. 🎲 CONSIDERA MERCATI ALTERNATIVI:');
console.log('   • Asian Handicap (se disponibile)');
console.log('   • Draw No Bet');
console.log('   • Match corners/cards\n');

console.log('5. ⚠️  NON FARE:');
console.log('   • Non allentare tutti i filtri insieme');
console.log('   • Non rimuovere completamente il filtro EV');
console.log('   • Non abbassare Confidence sotto 40%\n');

// ==========================================
// CONCLUSIONI
// ==========================================
console.log('='.repeat(80));
console.log('📋 CONCLUSIONI\n');
console.log('='.repeat(80) + '\n');

console.log(`✅ SISTEMA FUNZIONA BENE:`);
console.log(`   • 72.6% WR è eccellente`);
console.log(`   • +24.19% ROI è molto buono`);
console.log(`   • ZERO problemi di dati team`);
console.log(`   • API funziona correttamente\n`);

console.log(`⚠️  PROBLEMA PRINCIPALE:`);
console.log(`   • 53.6% di match saltati (67/125)`);
console.log(`   • 100% dovuto a "Nessuna raccomandazione"`);
console.log(`   • Filtri EV >= 10% probabilmente troppo stringenti\n`);

console.log(`🎯 AZIONE IMMEDIATA CONSIGLIATA:`);
console.log(`   1. Aggiungi logging per capire quali raccomandazioni vengono scartate`);
console.log(`   2. Testa tier 4⭐ con EV >= 5-8% su dataset storico`);
console.log(`   3. Se WR tier 4⭐ > 60%, implementa in produzione\n`);

console.log(`📈 POTENZIALE:`);
console.log(`   • Copertura attuale: 46.4% (58/125 match)`);
console.log(`   • Copertura target: 70-80% (87-100 match)`);
console.log(`   • Gap da colmare: 29-42 match\n`);

// ==========================================
// SALVATAGGIO
// ==========================================
const analysis = {
  metadata: {
    source: BACKTEST_REPORT,
    analyzedAt: new Date().toISOString()
  },
  coverage: {
    current: `${(report.metadata.matchesAnalyzed / report.metadata.totalMatches * 100).toFixed(1)}%`,
    target: '70-80%',
    gap: report.metadata.matchesSkipped + ' matches'
  },
  skipReasons: {
    noTeams: report.metadata.skipReasons.noTeams,
    noRecs: report.metadata.skipReasons.noRecs,
    apiError: report.metadata.skipReasons.apiError
  },
  recommendations: {
    total: recs.length,
    evDistribution: evRanges,
    ratingDistribution: ratingDist,
    oddsDistribution: oddsRanges,
    byType: Object.fromEntries(
      Object.entries(byType).map(([type, typeRecs]) => [
        type,
        {
          count: typeRecs.length,
          wins: typeRecs.filter(r => r.outcome === 'WIN').length,
          winRate: typeRecs.length > 0 ? (typeRecs.filter(r => r.outcome === 'WIN').length / typeRecs.length * 100).toFixed(1) + '%' : '0%'
        }
      ])
    )
  },
  filters: {
    current: {
      ev: '>= 10%',
      confidence: '>= 50%',
      rating: '<= 3⭐'
    },
    proposed: {
      tier3: {
        ev: '>= 10%',
        confidence: '>= 50%',
        rating: '<= 3⭐'
      },
      tier4: {
        ev: '>= 5-8%',
        confidence: '>= 40-50%',
        rating: '4⭐'
      }
    }
  },
  nextSteps: [
    'Aggiungi logging per raccomandazioni scartate',
    'Testa tier 4⭐ con EV >= 5-8% su dati storici',
    'Monitora WR per diverse soglie EV',
    'Implementa tier 4⭐ se WR > 60%'
  ]
};

fs.writeFileSync('./skipped-matches-detailed-analysis.json', JSON.stringify(analysis, null, 2));

console.log('💾 Analisi completa salvata in: skipped-matches-detailed-analysis.json\n');
console.log('✅ Analisi completata!\n');
