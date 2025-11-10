// 🚀 STRATEGIA OTTIMIZZAZIONE ROI AVANZATA
// Basata su analisi backtest: da +15.54% a target +25%+

const optimizationStrategy = {
  // 🎯 FILTRI INTELLIGENTI
  filters: {
    // FILTRO 1: Elimina 4⭐ (ROI -47.4%)
    excludeFourStarRatings: true,
    
    // FILTRO 2: Focus su 2⭐ e 3⭐ (ROI +48% e +26%)
    focusOnHighROIRatings: [2, 3],
    
    // FILTRO 3: Priorità Bundesliga (ROI +28.9%)
    priorityLeagues: ['Bundesliga', 'Serie A'],
    
    // FILTRO 4: Champions League solo se EV > 30%
    championsMinEV: 30,
    
    // FILTRO 5: Doppia Chance come principale (ROI +26.3%)
    betTypePriority: ['double_chance', 'result', 'goal_nogoal']
  },

  // ⚡ OTTIMIZZAZIONI CONFIDENCE
  confidenceAdjustments: {
    // Boost per combinazioni vincenti
    bundesligaBoost: 0.1,        // +10% confidence Bundesliga
    doubleChanceBoost: 0.08,     // +8% confidence Doppia Chance
    twoStarBoost: 0.12,          // +12% confidence per 2⭐ pattern
    
    // Penalità per pattern perdenti
    championsLeaguePenalty: -0.05, // -5% Champions (ROI 0%)
    fourStarPenalty: -0.15,        // -15% per evitare sovraconfidenza
    goalNoGoalPenalty: -0.03       // -3% Goal/NoGoal (ROI basso)
  },

  // 🔬 FILTRI AVANZATI EV
  expectedValueFilters: {
    minEVForBet: 5,              // EV minimo 5%
    minEVForHighStakes: 15,      // EV minimo 15% per puntate alte
    maxEVForRealism: 200,        // EV max 200% (evita outlier impossibili)
    
    // EV dinamico per tipo scommessa
    dynamicEVByType: {
      'double_chance': 3,        // EV minimo 3% (più tollerante)
      'result': 5,               // EV minimo 5%
      'goal_nogoal': 8           // EV minimo 8% (più selettivo)
    }
  },

  // 📊 GESTIONE STAKE INTELLIGENTE
  stakeManagement: {
    // Stake basato su confidence + EV combinati
    baseStake: 1.0,
    
    stakeMultipliers: {
      twoStar: 1.5,              // 150% stake per 2⭐
      threeStar: 1.2,            // 120% stake per 3⭐
      bundesliga: 1.3,           // 130% per Bundesliga
      doubleChance: 1.2,         // 120% per Doppia Chance
      highEV: 1.4                // 140% per EV > 25%
    },
    
    maxStake: 3.0,               // Stake massimo 3 unità
    minStake: 0.5                // Stake minimo 0.5 unità
  },

  // 🎲 FILTRI MERCATO SPECIFICI
  marketFilters: {
    // Goal/NoGoal - Solo condizioni ottimali
    goalNoGoalCriteria: {
      minEV: 10,                 // EV minimo 10%
      maxRating: 3,              // Solo fino a 3⭐
      preferredLeagues: ['Bundesliga', 'Serie A']
    },
    
    // Doppia Chance - Criterio rilassato (è vincente)
    doubleChanceCriteria: {
      minEV: 3,                  // EV minimo 3%
      maxRating: 5,              // Accetta tutti i rating
      allLeagues: true           // Tutti i campionati
    },
    
    // Result 1X2 - Criterio bilanciato
    resultCriteria: {
      minEV: 5,                  // EV minimo 5%
      maxRating: 3,              // Solo 2⭐ e 3⭐
      preferredLeagues: ['Bundesliga', 'Serie A', 'La Liga']
    }
  }
};

// 🧮 FUNZIONE CALCOLO SCORE OTTIMIZZATO
function calculateOptimizedScore(prediction) {
  let score = prediction.baseConfidence;
  
  // Boost per pattern vincenti
  if (prediction.league === 'Bundesliga') score += 0.1;
  if (prediction.league === 'Serie A') score += 0.05;
  if (prediction.betType === 'double_chance') score += 0.08;
  if (prediction.valueRating === 2) score += 0.12;
  if (prediction.valueRating === 3) score += 0.06;
  
  // Penalità per pattern perdenti
  if (prediction.valueRating === 4) score -= 0.15;
  if (prediction.league === 'Champions League' && prediction.expectedValue < 30) score -= 0.05;
  if (prediction.betType === 'goal_nogoal' && prediction.expectedValue < 10) score -= 0.05;
  
  // Boost EV alto
  if (prediction.expectedValue > 25) score += 0.08;
  if (prediction.expectedValue > 50) score += 0.12;
  
  return Math.max(0, Math.min(1, score));
}

// 📈 STIMA MIGLIORAMENTO ROI
console.log('🚀 STRATEGIA OTTIMIZZAZIONE ROI AVANZATA');
console.log('==========================================');
console.log('');
console.log('📊 STATO ATTUALE:');
console.log('   ROI: +15.54%');
console.log('   Win Rate: 56.9%');
console.log('');
console.log('🎯 OBIETTIVI MIGLIORAMENTO:');
console.log('   • Eliminare 4⭐ ratings (ROI -47%)');
console.log('   • Focus su 2⭐ (ROI +48%) e 3⭐ (ROI +26%)');
console.log('   • Priorità Bundesliga (ROI +29%)');
console.log('   • Potenziare Doppia Chance (ROI +26%)');
console.log('   • Filtri EV dinamici per tipo scommessa');
console.log('');
console.log('📈 ROI TARGET STIMATO: +25% - +30%');
console.log('');
console.log('⚡ IMPLEMENTAZIONE:');
console.log('   1. Modificare filtri confidence in betting-recommendations.service.ts');
console.log('   2. Aggiungere boost/penalty per pattern identificati');
console.log('   3. EV dinamico per tipo scommessa');
console.log('   4. Gestione stake intelligente');

module.exports = optimizationStrategy;
