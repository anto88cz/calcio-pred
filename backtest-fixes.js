// 🔧 FIX PER PROBLEMI IDENTIFICATI NEL BACKTEST
// Basato sull'analisi delle 5 schedine perse

/**
 * PROBLEMA 1: SOTTOVALUTAZIONE SQUADRA CASA (3/5 sconfitte - 60%)
 * ================================================================
 * Situazione: Predizioni X2 falliscono perché la squadra casa vince
 * 
 * Casi:
 * - Eyüpspor vs Kasımpaşa (2-0) - Predetto X2 @1.52
 * - Nottingham Forest vs Porto (2-0) - Predetto X2 @1.52
 * - Fatih Karagümrük vs Konyaspor (2-0) - Predetto X2 @1.45
 * 
 * ROOT CAUSE:
 * Il fattore homeAdvantage è troppo basso, specialmente per leghe turche
 * e Championship dove il vantaggio casa è molto più marcato.
 * 
 * SOLUZIONE:
 * 1. Aumentare homeAdvantage per Turkey Super Lig: 1.16 → 1.20
 * 2. Aumentare homeAdvantage per Championship: 1.12 → 1.15
 * 3. Ridurre confidence per predizioni X2 quando casa ha rating simile/superiore
 */

/**
 * PROBLEMA 2: PAREGGI NON IDENTIFICATI (2/5 sconfitte - 40%)
 * ===========================================================
 * Situazione: Predizioni 12 falliscono per pareggio non previsto
 * 
 * Casi:
 * - Portsmouth vs Watford (2-2) - Predetto 12 @1.33
 * - Real Oviedo vs Osasuna (0-0) - Predetto 12 @1.37
 * 
 * ROOT CAUSE:
 * Il sistema non identifica correttamente quando due squadre sono equilibrate.
 * Serve aumentare la probabilità di pareggio quando:
 * - Rating simili (differenza < 5%)
 * - Quote 12 basse (< 1.40 indica equilibrio dal mercato)
 * 
 * SOLUZIONE:
 * 1. Aumentare drawProbability quando squadre sono bilanciate
 * 2. Penalizzare predizioni 12 con quote < 1.40
 * 3. Bonus confidence per predizioni X quando rating_diff < 5%
 */

// ============================================================================
// IMPLEMENTAZIONE FIX
// ============================================================================

// 1. AGGIORNAMENTO SUPPORTED-LEAGUES.TS
const UPDATED_HOME_ADVANTAGES = {
  'Turkey Super Lig': 1.20,     // Da 1.16 → 1.20 (+3.4%)
  'Championship': 1.15,          // Da 1.12 → 1.15 (+2.7%)
  'Serie B': 1.12,               // Da 1.10 → 1.12 (+1.8%)
  'Premier League': 1.13,        // Da 1.12 → 1.13 (+0.9%)
};

// 2. NUOVO THRESHOLD PER IDENTIFICARE EQUILIBRIO
const BALANCE_DETECTION = {
  RATING_DIFF_THRESHOLD: 0.05,   // 5% differenza rating
  LOW_ODDS_THRESHOLD: 1.40,      // Quote 12 sotto 1.40 = equilibrio
  DRAW_BOOST_FACTOR: 1.15,       // +15% prob pareggio se equilibrato
  CONFIDENCE_PENALTY_12: 0.85,   // -15% confidence per 12 a quote basse
  CONFIDENCE_BONUS_X: 1.10,      // +10% confidence per X se equilibrato
};

// 3. FUNZIONE DI RILEVAMENTO EQUILIBRIO
function detectBalancedMatch(homeRating, awayRating, odds_1x2) {
  
  const ratingDiff = Math.abs(homeRating - awayRating) / Math.max(homeRating, awayRating);
  const odds12 = odds_1x2 ? Math.min(odds_1x2.home, odds_1x2.away) : null;
  
  const isBalanced = ratingDiff < BALANCE_DETECTION.RATING_DIFF_THRESHOLD ||
                     (odds12 && odds12 < BALANCE_DETECTION.LOW_ODDS_THRESHOLD);
  
  return {
    isBalanced,
    reason: isBalanced 
      ? `Rating simili (diff: ${(ratingDiff * 100).toFixed(1)}%) o quote basse (${odds12?.toFixed(2)})`
      : 'Match sbilanciato',
    adjustments: isBalanced ? {
      drawProbabilityBoost: BALANCE_DETECTION.DRAW_BOOST_FACTOR,
      confidence_12_penalty: BALANCE_DETECTION.CONFIDENCE_PENALTY_12,
      confidence_X_bonus: BALANCE_DETECTION.CONFIDENCE_BONUS_X
    } : null
  };
}

// 4. FUNZIONE PER AGGIUSTARE CONFIDENCE X2
function adjustX2Confidence(baseConfidence, homeRating, awayRating, leagueName) {
  
  // Se casa ha rating superiore/simile, riduci confidence X2
  const ratingRatio = homeRating / awayRating;
  
  // Penalità se casa >= trasferta
  let confidenceMultiplier = 1.0;
  
  if (ratingRatio >= 0.95) {
    confidenceMultiplier = 0.90; // -10% confidence
  }
  
  // Penalità extra per leghe con forte vantaggio casa
  const highHomeAdvantageLeagues = ['Turkey Super Lig', 'Championship', 'Eredivisie'];
  if (highHomeAdvantageLeagues.includes(leagueName) && ratingRatio >= 0.90) {
    confidenceMultiplier *= 0.95; // -5% extra
  }
  
  return baseConfidence * confidenceMultiplier;
}

// ============================================================================
// ESEMPIO DI INTEGRAZIONE NEL MOTORE
// ============================================================================

/**
 * In api/src/services/prediction/engine.ts
 * 
 * 1. Import dei fix:
 * ```typescript
 * import { 
 *   UPDATED_HOME_ADVANTAGES, 
 *   detectBalancedMatch, 
 *   adjustX2Confidence 
 * } from './fixes/backtest-fixes';
 * ```
 * 
 * 2. Applicare homeAdvantage aggiornato (dopo riga ~150):
 * ```typescript
 * const leagueConfig = getLeagueConfig(input.leagueName);
 * const homeAdvantage = UPDATED_HOME_ADVANTAGES[input.leagueName] || 
 *                       leagueConfig.homeAdvantage;
 * poissonResult.lambdaHome *= homeAdvantage;
 * ```
 * 
 * 3. Rilevare equilibrio e aggiustare drawProbability (dopo riga ~400):
 * ```typescript
 * const balanceCheck = detectBalancedMatch(
 *   homeRating, 
 *   awayRating, 
 *   marketOdds?.odds_1x2
 * );
 * 
 * if (balanceCheck.isBalanced) {
 *   probabilities.draw *= balanceCheck.adjustments.drawProbabilityBoost;
 *   // Rinormalizza
 *   const sum = probabilities.home + probabilities.draw + probabilities.away;
 *   probabilities.home /= sum;
 *   probabilities.draw /= sum;
 *   probabilities.away /= sum;
 * }
 * ```
 * 
 * 4. Aggiustare confidence per raccomandazioni X2 (dopo generazione raccomandazioni):
 * ```typescript
 * recommendations = recommendations.map(rec => {
 *   if (rec.market === '1X2' && (rec.selection === 'X2' || rec.selection === '2')) {
 *     rec.confidence = adjustX2Confidence(
 *       rec.confidence,
 *       homeRating,
 *       awayRating,
 *       input.leagueName
 *     );
 *   }
 *   return rec;
 * });
 * ```
 * 
 * 5. Penalizzare predizioni 12 con quote basse:
 * ```typescript
 * if (rec.market === '1X2' && rec.selection === '12' && rec.odds < 1.40) {
 *   rec.confidence *= BALANCE_DETECTION.CONFIDENCE_PENALTY_12;
 * }
 * ```
 */

// ============================================================================
// TEST DI VALIDAZIONE
// ============================================================================

function testFixes() {
  console.log('🧪 TEST FIX BACKTEST\n');
  
  // Test 1: Home advantage aumentato
  console.log('1. HOME ADVANTAGE:');
  console.log(`   Turkey Super Lig: ${UPDATED_HOME_ADVANTAGES['Turkey Super Lig']} (+${((UPDATED_HOME_ADVANTAGES['Turkey Super Lig']/1.16-1)*100).toFixed(1)}%)`);
  console.log(`   Championship: ${UPDATED_HOME_ADVANTAGES['Championship']} (+${((UPDATED_HOME_ADVANTAGES['Championship']/1.12-1)*100).toFixed(1)}%)`);
  
  // Test 2: Rilevamento equilibrio
  console.log('\n2. BALANCE DETECTION:');
  const test1 = detectBalancedMatch(85, 83, { home: 2.10, draw: 3.20, away: 3.50 });
  console.log(`   Rating 85 vs 83: ${test1.isBalanced ? '✓' : '✗'} Balanced - ${test1.reason}`);
  
  const test2 = detectBalancedMatch(90, 80, { home: 1.35, draw: 4.50, away: 8.00 });
  console.log(`   Rating 90 vs 80, quote 1.35: ${test2.isBalanced ? '✓' : '✗'} Balanced - ${test2.reason}`);
  
  // Test 3: Confidence adjustment X2
  console.log('\n3. CONFIDENCE ADJUSTMENT X2:');
  const baseConf = 0.75;
  const adj1 = adjustX2Confidence(baseConf, 85, 88, 'Premier League');
  console.log(`   Casa 85 vs Trasferta 88: ${baseConf.toFixed(2)} → ${adj1.toFixed(2)} (${((adj1/baseConf-1)*100).toFixed(1)}%)`);
  
  const adj2 = adjustX2Confidence(baseConf, 88, 85, 'Turkey Super Lig');
  console.log(`   Casa 88 vs Trasferta 85 (Turkey): ${baseConf.toFixed(2)} → ${adj2.toFixed(2)} (${((adj2/baseConf-1)*100).toFixed(1)}%)`);
  
  console.log('\n✅ Test completati!');
}

// Esegui test se chiamato direttamente
if (require.main === module) {
  testFixes();
}

module.exports = {
  UPDATED_HOME_ADVANTAGES,
  BALANCE_DETECTION,
  detectBalancedMatch,
  adjustX2Confidence,
  testFixes
};
