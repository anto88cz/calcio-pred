/**
 * Betting Recommendations Service
 * Genera suggerimenti di giocate basati su analisi ML e quote di mercato
 */

export interface BettingRecommendation {
  id: string;
  type: 'result' | 'double_chance' | 'goal_nogoal' | 'over_under' | 'combo' | 'multigoal';
  name: string;
  description: string;
  prediction: string;
  confidence: number; // 0-100
  valueRating: number; // 1-5 stelle
  odds: number; // Media quote bookmaker
  impliedProbability: number; // Probabilità implicita dalle quote (%)
  modelProbability: number; // Probabilità del nostro modello (%)
  expectedValue: number; // Valore atteso: (modelProb * odds) - 1
  reason: string; // Spiegazione del suggerimento
  stakeMultiplier?: number; // Moltiplicatore stake intelligente (0.5x - 3.0x)
  kellyStake?: number; // Kelly Criterion stake percentage (0-1)
  kellyRecommendation?: 'HIGH' | 'MEDIUM' | 'LOW' | 'AVOID'; // Kelly-based recommendation
}

export interface FilteredRecommendation {
  recommendation: BettingRecommendation;
  filterReason: string; // Motivo per cui è stata scartata
  filterType: 'ev_too_low' | 'confidence_too_low' | 'rating_too_low' | 'league_specific' | 'type_disabled';
}

export interface BettingRecommendations {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  recommendations: BettingRecommendation[];
  topPicks: BettingRecommendation[]; // Top 3 suggerimenti
  lastUpdated: Date;
  filteredRecommendations?: FilteredRecommendation[]; // Raccomandazioni scartate (per debug/analisi)
}

export interface MLPredictionData {
  predictions: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  expectedScore: {
    home: number;
    away: number;
  };
  confidence: number;
  fixtureDate?: Date | string; // 🆕 Per filtri stagionali
  factors: {
    headToHead: {
      avgHomeGoals: number;
      avgAwayGoals: number;
    };
    xGData: {
      homeAvgXG: number;
      homeAvgXGA: number;
      awayAvgXG: number;
      awayAvgXGA: number;
    };
  };
}

export interface OddsData {
  home: number;
  draw: number;
  away: number;
  over05?: number;
  under05?: number;
  over15?: number;
  under15?: number;
  over25?: number;
  under25?: number;
  over35?: number;
  under35?: number;
  btts_yes?: number; // Both Teams To Score - Yes
  btts_no?: number;  // Both Teams To Score - No
}

/**
 * Kelly Criterion Calculator per stake sizing ottimale
 */
class KellyCriterion {
  /**
   * Calcola la frazione ottimale del bankroll da scommettere
   * @param modelProbability Probabilità stimata dal nostro modello (0-1)
   * @param odds Quote del bookmaker 
   * @param kellyFraction Frazione conservativa del Kelly (default: 0.5)
   * @returns Frazione del bankroll da scommettere (0-1)
   */
  static calculateKellyStake(
    modelProbability: number,
    odds: number,
    kellyFraction: number = 0.5
  ): number {
    // Formula Kelly: f = (bp - q) / b
    const b = odds - 1; // Net odds
    const p = modelProbability;
    const q = 1 - p;
    
    const kellyF = (b * p - q) / b;
    
    // Se Kelly negativo, non scommettere
    if (kellyF <= 0) return 0;
    
    // Applica frazione conservativa
    const fractionalKelly = kellyF * kellyFraction;
    
    // Limiti di sicurezza rigorosi
    const minStake = 0.005; // Min 0.5% del bankroll
    const maxStake = 0.15;  // Max 15% del bankroll
    
    return Math.max(minStake, Math.min(maxStake, fractionalKelly));
  }
  
  /**
   * Determina la raccomandazione Kelly basata sulla frazione calcolata
   */
  static getKellyRecommendation(kellyStake: number): 'HIGH' | 'MEDIUM' | 'LOW' | 'AVOID' {
    if (kellyStake >= 0.10) return 'HIGH';    // >= 10%
    if (kellyStake >= 0.05) return 'MEDIUM';  // 5-10%
    if (kellyStake >= 0.01) return 'LOW';     // 1-5%
    return 'AVOID';                           // < 1%
  }
}

export class BettingRecommendationsService {
  
  /**
   * Genera raccomandazioni di scommessa basate su ML prediction e odds
   */
  generateRecommendations(
    fixtureId: number,
    homeTeam: string,
    awayTeam: string,
    mlData: MLPredictionData,
    odds: OddsData,
    league?: string
  ): BettingRecommendations {
    const recommendations: BettingRecommendation[] = [];
    
    // 1. RISULTATO ESATTO (1X2)
    recommendations.push(...this.generate1X2Recommendations(mlData, odds, homeTeam, awayTeam));
    
    // 2. DOPPIA CHANCE
    recommendations.push(...this.generateDoubleChanceRecommendations(mlData, odds, homeTeam, awayTeam));
    
    // 3. GOAL/NO GOAL (BTTS) - NASCOSTO (performance non soddisfacenti)
    // recommendations.push(...this.generateGoalNoGoalRecommendations(mlData, odds, homeTeam, awayTeam));
    
    // 4. OVER/UNDER - NASCOSTO (performance non soddisfacenti)
    // recommendations.push(...this.generateOverUnderRecommendations(mlData, odds));
    
    // 5. MULTIGOAL - DISABILITATO (39.9% win rate nel backtest)
    // recommendations.push(...this.generateMultigoalRecommendations(mlData, odds, homeTeam, awayTeam));

    // 6. COMBO - DISABILITATO (33.3% win rate nel backtest)
    // recommendations.push(...this.generateComboRecommendations(mlData, odds, homeTeam, awayTeam));

    // OTTIMIZZAZIONE ESTREMA: Focus solo su tipi performanti
    // - Risultato 1X2: 58.3% win rate → PRIORITÀ MASSIMA
    // - Doppia Chance: 52.8% win rate → PRIORITÀ ALTA  
    // - Goal/NoGoal: 48.4% win rate → MANTENERE con soglie più alte
    // - Multigoal: 39.9% win rate → DISABILITATO
    // - Over/Under: RIABILITATO con filtri ULTRA-CONSERVATIVI
    // - Combo: 33.3% win rate → DISABILITATO

    // 🚀 FILTRI OTTIMIZZATI BASATI SU BACKTEST ANALYSIS
    // Array per tracciare raccomandazioni scartate
    const filteredOut: FilteredRecommendation[] = [];
    
    let validRecommendations = recommendations.filter(r => {
      // 🚀 ROI OTTIMIZZATO: Filtri basati su analisi performance
      
      // ⚡ OVER/UNDER: FILTRI RILASSATI per permettere più raccomandazioni
      // Soglie base: EV > 3%, confidence >= 50%, rating <= 3⭐
      if (r.type === 'over_under') {
        const passes = r.expectedValue > 0.03 && r.valueRating <= 3 && r.confidence >= 50;
        if (!passes) {
          let reason = 'Over/Under scartato: ';
          if (r.expectedValue <= 0.03) reason += `EV troppo basso (${(r.expectedValue * 100).toFixed(2)}% <= 3%)`;
          else if (r.valueRating > 3) reason += `Rating troppo basso (${r.valueRating}⭐ > 3⭐)`;
          else if (r.confidence < 50) reason += `Confidence troppo bassa (${r.confidence.toFixed(1)}% < 50%)`;
          
          filteredOut.push({
            recommendation: r,
            filterReason: reason,
            filterType: r.expectedValue <= 0.03 ? 'ev_too_low' : r.confidence < 50 ? 'confidence_too_low' : 'rating_too_low'
          });
        }
        return passes;
      }

      // ELIMINA tutti i Multigoal (39.9% win rate - troppo basso)
      if (r.type === 'multigoal') {
        filteredOut.push({
          recommendation: r,
          filterReason: 'Multigoal disabilitato: 39.9% WR nel backtest',
          filterType: 'type_disabled'
        });
        return false;
      }

      // ELIMINA tutti i Combo (33.3% win rate - troppo basso)  
      if (r.type === 'combo') {
        filteredOut.push({
          recommendation: r,
          filterReason: 'Combo disabilitato: 33.3% WR nel backtest',
          filterType: 'type_disabled'
        });
        return false;
      }

      // 🚨 ELIMINA 4⭐ ratings (ROI -47.4% nel backtest)
      if (r.valueRating === 4) {
        filteredOut.push({
          recommendation: r,
          filterReason: '4⭐ scartato: ROI -47.4% nel backtest',
          filterType: 'rating_too_low'
        });
        return false;
      }

      // 🚨 ELIMINA TUTTE LE 5⭐: Win rate 37.5% troppo basso
      // ACCURACY FIX: Rimuovi completamente predictions overconfident
      if (r.valueRating === 5) {
        filteredOut.push({
          recommendation: r,
          filterReason: '5⭐ scartato: WR 37.5% troppo basso',
          filterType: 'rating_too_low'
        });
        return false;
      }

      // 🎯 DOPPIA CHANCE: Priorità massima (ROI +26.3%)
      if (r.type === 'double_chance') {
        // ⚡ CHAMPIONS LEAGUE TACTICAL FIX: Soglie ancora più alte (66.7% → 75%+ win rate)
        const isChampions = league?.includes('Champions') || league?.includes('Europa') || false;
        if (isChampions) {
          // Champions: SOLO confidence >70% (gestisce complessità tattica)
          const passes = r.expectedValue > 0.15 && r.confidence >= 70;
          if (!passes) {
            filteredOut.push({
              recommendation: r,
              filterReason: `Double Chance Champions scartato: EV ${(r.expectedValue * 100).toFixed(2)}% (min 15%) o Confidence ${r.confidence.toFixed(1)}% (min 70%)`,
              filterType: r.expectedValue <= 0.15 ? 'ev_too_low' : 'confidence_too_low'
            });
          }
          return passes;
        }
        
        // 📉 LA LIGA ACCURACY FIX: Soglie ULTRA-conservative (60% → 75%+ win rate)
        const isLaLiga = league?.includes('La Liga') || false;
        if (isLaLiga) {
          // La Liga: SOLO confidence >75% E EV >30% (fix imprevedibilità)
          const passes = r.expectedValue > 0.30 && r.confidence >= 75;
          if (!passes) {
            filteredOut.push({
              recommendation: r,
              filterReason: `Double Chance La Liga scartato: EV ${(r.expectedValue * 100).toFixed(2)}% (min 30%) o Confidence ${r.confidence.toFixed(1)}% (min 75%)`,
              filterType: r.expectedValue <= 0.30 ? 'ev_too_low' : 'confidence_too_low'
            });
          }
          return passes;
        }
        // Altri campionati: soglia normale
        const passes = r.expectedValue > 0.03 && r.confidence >= 40;
        if (!passes) {
          filteredOut.push({
            recommendation: r,
            filterReason: `Double Chance scartato: EV ${(r.expectedValue * 100).toFixed(2)}% (min 3%) o Confidence ${r.confidence.toFixed(1)}% (min 40%)`,
            filterType: r.expectedValue <= 0.03 ? 'ev_too_low' : 'confidence_too_low'
          });
        }
        return passes;
      }

      // 🏆 RISULTATO 1X2: Focus su 2⭐ e 3⭐ (ROI +48% e +26%)
      if (r.type === 'result') {
        // ⚡ CHAMPIONS LEAGUE ACCURACY FIX: Evita risultati fissi (66.7% → skip)
        const isChampions = league?.includes('Champions') || league?.includes('Europa') || false;
        if (isChampions) {
          filteredOut.push({
            recommendation: r,
            filterReason: 'Risultato 1X2 scartato: Champions/Europa League troppo complesse',
            filterType: 'league_specific'
          });
          return false; // Skip tutti i risultati 1X2 in Champions (troppo complessi)
        }
        // Altri campionati: Solo 2⭐ e 3⭐ per risultati
        const passes = (r.valueRating === 2 || r.valueRating === 3) && 
               r.expectedValue > 0.05 && r.confidence >= 45;
        if (!passes) {
          let reason = 'Risultato 1X2 scartato: ';
          if (r.valueRating !== 2 && r.valueRating !== 3) reason += `Rating ${r.valueRating}⭐ (solo 2⭐ e 3⭐ ammessi)`;
          else if (r.expectedValue <= 0.05) reason += `EV ${(r.expectedValue * 100).toFixed(2)}% (min 5%)`;
          else if (r.confidence < 45) reason += `Confidence ${r.confidence.toFixed(1)}% (min 45%)`;
          
          filteredOut.push({
            recommendation: r,
            filterReason: reason,
            filterType: r.expectedValue <= 0.05 ? 'ev_too_low' : r.confidence < 45 ? 'confidence_too_low' : 'rating_too_low'
          });
        }
        return passes;
      }

      // ⚡ GOAL/NOGOAL: RIABILITATO con filtri conservativi
      // Soglie: EV > 5%, confidence >= 55%, rating <= 3⭐
      if (r.type === 'goal_nogoal') {
        const passes = r.expectedValue > 0.05 && r.valueRating <= 3 && r.confidence >= 55;
        if (!passes) {
          let reason = 'Goal/NoGoal scartato: ';
          if (r.expectedValue <= 0.05) reason += `EV troppo basso (${(r.expectedValue * 100).toFixed(2)}% <= 5%)`;
          else if (r.valueRating > 3) reason += `Rating troppo basso (${r.valueRating}⭐ > 3⭐)`;
          else if (r.confidence < 55) reason += `Confidence troppo bassa (${r.confidence.toFixed(1)}% < 55%)`;
          
          filteredOut.push({
            recommendation: r,
            filterReason: reason,
            filterType: r.expectedValue <= 0.05 ? 'ev_too_low' : r.confidence < 55 ? 'confidence_too_low' : 'rating_too_low'
          });
        }
        return passes;
      }

      // Tipo non riconosciuto o non gestito
      filteredOut.push({
        recommendation: r,
        filterReason: `Tipo ${r.type} non gestito dai filtri attuali`,
        filterType: 'type_disabled'
      });
      return false;
    });

    // 🧮 OTTIMIZZAZIONE AVANZATA CON KELLY CRITERION
    validRecommendations = validRecommendations.map(r => {
      let adjustedConfidence = r.confidence;
      let stakeMultiplier = 1.0;
      
      // 🚀 BOOST MASSIMO per pattern PERFETTI identificati nel backtest
      if (r.valueRating === 2) {
        adjustedConfidence += 20; // +20% per 2⭐ (100% win rate!)
        stakeMultiplier = 2.0;    // Stake doppio per 2⭐
      }
      
      if (r.valueRating === 3) {
        adjustedConfidence += 8;  // +8% per 3⭐ (63.3% win rate)
        // Boost extra per campionati top
        if (league?.includes('Bundesliga')) {
          adjustedConfidence += 10; // +10% extra Bundesliga (81.8% win rate)
          stakeMultiplier = 1.5;
        }
        if (league?.includes('Serie A')) {
          adjustedConfidence += 7;  // +7% extra Serie A (76.5% win rate)  
          stakeMultiplier = 1.3;
        }
      }
      
      // 🎯 Boost per tipo scommessa vincente
      if (r.type === 'double_chance') {
        adjustedConfidence += 10; // +10% Doppia Chance (68.6% win rate)
        stakeMultiplier *= 1.2;
      }
      
      if (r.type === 'result') {
        adjustedConfidence += 15; // +15% Risultato 1X2 (80% win rate)
        stakeMultiplier *= 1.4;
      }
      
      // ⚡ EV super-alto
      if (r.expectedValue > 0.50) {
        adjustedConfidence += 15;    // +15% EV molto alto
        stakeMultiplier *= 1.4;
      }
      if (r.expectedValue > 0.75) {
        adjustedConfidence += 20;    // +20% EV estremo
        stakeMultiplier *= 1.6;
      }
      
      // 🚨 Penalità per pattern rischiosi
      if (r.type === 'goal_nogoal') adjustedConfidence -= 5; // Goal/NoGoal meno performante
      if (league?.includes('La Liga') && r.expectedValue < 0.20) adjustedConfidence -= 8;
      if (r.valueRating === 5 && r.expectedValue < 0.75) adjustedConfidence -= 10;
      
      // 🎯 KELLY CRITERION CALCULATION
      const modelProbability = Math.max(0.01, Math.min(0.99, r.modelProbability));
      const kellyStake = KellyCriterion.calculateKellyStake(modelProbability, r.odds, 0.5);
      const kellyRecommendation = KellyCriterion.getKellyRecommendation(kellyStake);
      
      // 🚀 COMBINA Kelly con stake multiplier esistente
      const finalStakeMultiplier = Math.min(3.0, stakeMultiplier * (kellyStake * 10)); // Kelly amplifica multiplier
      
      return {
        ...r,
        confidence: Math.max(0, Math.min(100, adjustedConfidence)),
        stakeMultiplier: Math.max(0.1, finalStakeMultiplier),
        kellyStake: kellyStake,
        kellyRecommendation: kellyRecommendation
      };
    });    // FILTRO ANTI-CONTRADDIZIONI
    validRecommendations = this.filterConflictingRecommendations(validRecommendations);
    
    // Ordina per valore atteso decrescente
    validRecommendations.sort((a, b) => b.expectedValue - a.expectedValue);
    
    // Top 3 picks - diversificati per categoria
    const topPicks = this.selectDiversifiedTopPicks(validRecommendations, 3);
    
    // 📊 Log raccomandazioni filtrate (solo in development)
    if (process.env.NODE_ENV !== 'production' && filteredOut.length > 0) {
      console.log(`\n🔍 [${homeTeam} vs ${awayTeam}] Raccomandazioni scartate: ${filteredOut.length}`);
      
      // Raggruppa per motivo
      const byType: { [key: string]: number } = {};
      filteredOut.forEach(f => {
        byType[f.filterType] = (byType[f.filterType] || 0) + 1;
      });
      
      console.log('   Breakdown:');
      Object.entries(byType).forEach(([type, count]) => {
        console.log(`   - ${type}: ${count}`);
      });
      
      // Mostra alcune raccomandazioni scartate con dettagli
      console.log('\n   Top 3 scartate per EV:');
      filteredOut
        .filter(f => f.filterType === 'ev_too_low')
        .sort((a, b) => b.recommendation.expectedValue - a.recommendation.expectedValue)
        .slice(0, 3)
        .forEach(f => {
          console.log(`   - ${f.recommendation.name}: EV ${(f.recommendation.expectedValue * 100).toFixed(2)}%, Conf ${f.recommendation.confidence.toFixed(1)}%, ${f.recommendation.valueRating}⭐`);
        });
    }
    
    return {
      fixtureId,
      homeTeam,
      awayTeam,
      recommendations: validRecommendations,
      topPicks,
      filteredRecommendations: filteredOut, // Aggiungi raccomandazioni scartate
      lastUpdated: new Date(),
    };
  }
  
  /**
   * Filtra raccomandazioni contraddittorie
   * Esempio: se c'è "1" (vittoria casa), rimuove "X2" (pareggio o trasferta)
   */
  private filterConflictingRecommendations(recommendations: BettingRecommendation[]): BettingRecommendation[] {
    const conflicts: { [key: string]: string[] } = {
      // Conflitti 1X2 vs Doppia Chance e Combo
      '1x2_home': ['1x2_draw', '1x2_away', 'double_x2', 'double_12', 'combo_1_over25', 'combo_1_goal', 'combo_x2_goal'],
      '1x2_draw': ['1x2_home', '1x2_away', 'double_12', 'combo_x_over', 'combo_x_goal'],
      '1x2_away': ['1x2_home', '1x2_draw', 'double_1x', 'double_12', 'combo_2_over25', 'combo_2_goal', 'combo_1x_goal'],
      
      // Doppia Chance in conflitto con risultati singoli inclusi
      'double_1x': ['1x2_away', 'double_x2', 'double_12', 'combo_2_over25', 'combo_2_goal', 'combo_x2_goal'],
      'double_x2': ['1x2_home', 'double_1x', 'double_12', 'combo_1_over25', 'combo_1_goal', 'combo_1x_goal'],
      'double_12': ['1x2_draw', 'double_1x', 'double_x2', 'combo_x_over', 'combo_x_goal'],
      
      // Combo in conflitto con risultati base
      'combo_1_over25': ['1x2_draw', '1x2_away', 'double_x2', 'double_12', 'combo_2_over25', 'combo_x_over', 'combo_x2_goal'],
      'combo_1_goal': ['1x2_draw', '1x2_away', 'double_x2', 'double_12', 'combo_2_goal', 'combo_x_goal', 'combo_x2_goal'],
      'combo_x_over': ['1x2_home', '1x2_away', 'double_12', 'combo_1_over25', 'combo_2_over25'],
      'combo_x_goal': ['1x2_home', '1x2_away', 'double_12', 'combo_1_goal', 'combo_2_goal'],
      'combo_2_over25': ['1x2_home', '1x2_draw', 'double_1x', 'double_12', 'combo_1_over25', 'combo_x_over', 'combo_1x_goal'],
      'combo_2_goal': ['1x2_home', '1x2_draw', 'double_1x', 'double_12', 'combo_1_goal', 'combo_x_goal', 'combo_1x_goal'],
      'combo_1x_goal': ['1x2_away', 'double_x2', 'combo_2_goal', 'combo_2_over25', 'combo_x2_goal'],
      'combo_x2_goal': ['1x2_home', 'double_1x', 'combo_1_goal', 'combo_1_over25', 'combo_1x_goal'],
      
      // Conflitti Goal/NoGoal
      'btts_yes': ['btts_no'],
      'btts_no': ['btts_yes'],
      
      // Conflitti Over/Under stesso threshold
      'over_15': ['under_15'],
      'under_15': ['over_15', 'over_25', 'over_35'],
      'over_25': ['under_25', 'under_15'],
      'under_25': ['over_25', 'over_35'],
      'over_35': ['under_35', 'under_25', 'under_15'],
      'under_35': ['over_35'],
    };
    
    const result: BettingRecommendation[] = [];
    const addedIds = new Set<string>();
    
    // Ordina per EV decrescente per dare priorità alle migliori
    const sorted = [...recommendations].sort((a, b) => b.expectedValue - a.expectedValue);
    
    for (const rec of sorted) {
      // Se già aggiunto, skip
      if (addedIds.has(rec.id)) continue;
      
      // Controlla se è in conflitto con qualcosa già aggiunto
      const conflictsWith = conflicts[rec.id] || [];
      const hasConflict = conflictsWith.some(confId => addedIds.has(confId));
      
      if (!hasConflict) {
        result.push(rec);
        addedIds.add(rec.id);
      }
    }
    
    return result;
  }
  
  /**
   * Seleziona top picks diversificati per categoria
   * Assicura vera diversificazione: 1 per risultato/doppia, 1 per goal, 1 per over/under
   */
  private selectDiversifiedTopPicks(recommendations: BettingRecommendation[], count: number): BettingRecommendation[] {
    const picks: BettingRecommendation[] = [];
    
    // Raggruppa per macro-categoria
    const getMacroCategory = (type: string): string => {
      if (type === 'result' || type === 'double_chance') return 'result_based';
      if (type === 'goal_nogoal') return 'goal_based';
      if (type === 'over_under') return 'total_based';
      if (type === 'combo') return 'combo_based';
      if (type === 'multigoal') return 'multigoal_based';
      return type;
    };
    
    const usedMacroCategories = new Set<string>();
    
    // Prima passata: prendi la migliore per ogni MACRO-categoria
    for (const rec of recommendations) {
      if (picks.length >= count) break;
      
      const macroCategory = getMacroCategory(rec.type);
      
      if (!usedMacroCategories.has(macroCategory)) {
        picks.push(rec);
        usedMacroCategories.add(macroCategory);
      }
    }
    
    // Se non abbiamo abbastanza, aggiungi le migliori rimanenti (senza duplicare macro-categoria)
    if (picks.length < count) {
      for (const rec of recommendations) {
        if (picks.length >= count) break;
        if (!picks.includes(rec)) {
          picks.push(rec);
        }
      }
    }
    
    return picks;
  }
  
  /**
   * Genera raccomandazioni 1X2 (risultato esatto)
   * OTTIMIZZAZIONE v2: Backtest mostra 37.3% win rate
   * - Quote 2.0-3.5 performano meglio
   * - EV alto non garantisce successo
   * - Serve maggiore selettività
   */
  private generate1X2Recommendations(
    mlData: MLPredictionData,
    odds: OddsData,
    homeTeam: string,
    awayTeam: string
  ): BettingRecommendation[] {
    const recs: BettingRecommendation[] = [];
    
    // Vittoria Casa - soglia confidence 0.40 + EV minimo 10%
    if (mlData.predictions.homeWin > 0.40) {
      const ev = this.calculateEV(mlData.predictions.homeWin, odds.home);
      
      // Filtra solo se EV > 10% oppure quote favorevoli (2.0-3.5)
      if (ev > 0.10 || (odds.home >= 2.0 && odds.home <= 3.5)) {
        recs.push({
          id: '1x2_home',
          type: 'result',
          name: '1 - Vittoria Casa',
          description: `${homeTeam} vince la partita`,
          prediction: '1',
          confidence: Math.round(mlData.predictions.homeWin * 100),
          valueRating: this.calculateValueRating(ev),
          odds: odds.home,
          impliedProbability: this.oddsToProb(odds.home),
          modelProbability: mlData.predictions.homeWin * 100,
          expectedValue: ev,
          reason: this.generateReason('home', mlData, ev),
        });
      }
    }
    
    // Pareggio - soglia confidence 0.30 + EV minimo 10%
    if (mlData.predictions.draw > 0.30) {
      const ev = this.calculateEV(mlData.predictions.draw, odds.draw);
      
      // Pareggi sono redditizi solo se alta confidence o buone quote
      if (ev > 0.10 || (mlData.predictions.draw > 0.35 && odds.draw >= 3.0)) {
        recs.push({
          id: '1x2_draw',
          type: 'result',
          name: 'X - Pareggio',
          description: 'La partita termina in pareggio',
          prediction: 'X',
          confidence: Math.round(mlData.predictions.draw * 100),
          valueRating: this.calculateValueRating(ev),
          odds: odds.draw,
          impliedProbability: this.oddsToProb(odds.draw),
          modelProbability: mlData.predictions.draw * 100,
          expectedValue: ev,
          reason: this.generateReason('draw', mlData, ev),
        });
      }
    }
    
    // Vittoria Trasferta - soglia confidence 0.40 + EV minimo 10%
    if (mlData.predictions.awayWin > 0.40) {
      const ev = this.calculateEV(mlData.predictions.awayWin, odds.away);
      
      // Filtra solo se EV > 10% oppure quote favorevoli (2.0-3.5)
      if (ev > 0.10 || (odds.away >= 2.0 && odds.away <= 3.5)) {
        recs.push({
          id: '1x2_away',
          type: 'result',
          name: '2 - Vittoria Trasferta',
          description: `${awayTeam} vince la partita`,
          prediction: '2',
          confidence: Math.round(mlData.predictions.awayWin * 100),
          valueRating: this.calculateValueRating(ev),
          odds: odds.away,
          impliedProbability: this.oddsToProb(odds.away),
          modelProbability: mlData.predictions.awayWin * 100,
          expectedValue: ev,
          reason: this.generateReason('away', mlData, ev),
        });
      }
    }
    
    return recs;
  }
  
  /**
   * Genera raccomandazioni Doppia Chance
   */
  private generateDoubleChanceRecommendations(
    mlData: MLPredictionData,
    odds: OddsData,
    _homeTeam: string,
    _awayTeam: string
  ): BettingRecommendation[] {
    const recs: BettingRecommendation[] = [];
    
    // 🔴 Q1 FIX: Calcola mese una sola volta per tutti i DC
    const month = mlData.fixtureDate ? new Date(mlData.fixtureDate).getMonth() + 1 : 0;
    
    // 1X (Casa o Pareggio)
    const prob1X = mlData.predictions.homeWin + mlData.predictions.draw;
    const odds1X = this.calculateDoubleChanceOdds(odds.home, odds.draw);
    const ev1X = this.calculateEV(prob1X, odds1X);
    
    // 🔴 Q1 FIX: Soglia più alta in inverno (più imprevedibile)
    const threshold1X = (month >= 1 && month <= 3) ? 0.70 : 0.65;
    
    if (prob1X > threshold1X) {
      recs.push({
        id: 'double_1x',
        type: 'double_chance',
        name: '1X - Casa o Pareggio',
        description: `${_homeTeam} non perde`,
        prediction: '1X',
        confidence: Math.round(prob1X * 100),
        valueRating: this.calculateValueRating(ev1X),
        odds: odds1X,
        impliedProbability: this.oddsToProb(odds1X),
        modelProbability: prob1X * 100,
        expectedValue: ev1X,
        reason: `Alta probabilità che ${_homeTeam} non perda (${(prob1X * 100).toFixed(0)}%)`,
      });
    }
    
    // 12 (Casa o Trasferta)
    const prob12 = mlData.predictions.homeWin + mlData.predictions.awayWin;
    const odds12 = this.calculateDoubleChanceOdds(odds.home, odds.away);
    const ev12 = this.calculateEV(prob12, odds12);
    
    // 🔴 Q1 FIX: Soglie più stringenti per 12 (loss analysis: 76% worst losses erano DC)
    const drawThreshold = (month >= 1 && month <= 5) ? 0.35 : 0.30; // Q1-Q2: più conservativo
    const minOdds12 = 1.45; // Evita quote troppo basse (loss analysis: 12 @ 1.40-1.43 perde su pareggi)
    
    if (prob12 > 0.60 && mlData.predictions.draw < drawThreshold && odds12 >= minOdds12) {
      recs.push({
        id: 'double_12',
        type: 'double_chance',
        name: '12 - Casa o Trasferta',
        description: 'Nessun pareggio',
        prediction: '12',
        confidence: Math.round(prob12 * 100),
        valueRating: this.calculateValueRating(ev12),
        odds: odds12,
        impliedProbability: this.oddsToProb(odds12),
        modelProbability: prob12 * 100,
        expectedValue: ev12,
        reason: `Bassa probabilità di pareggio (${(mlData.predictions.draw * 100).toFixed(0)}%)`,
      });
    }
    
    // X2 (Pareggio o Trasferta)
    const probX2 = mlData.predictions.draw + mlData.predictions.awayWin;
    const oddsX2 = this.calculateDoubleChanceOdds(odds.draw, odds.away);
    const evX2 = this.calculateEV(probX2, oddsX2);
    
    // 🔴 Q1 FIX: Soglia MOLTO più alta per X2 (loss analysis: 38/50 worst losses)
    const thresholdX2 = (month >= 1 && month <= 3) ? 0.75 : 0.65;
    
    if (probX2 > thresholdX2) {
      recs.push({
        id: 'double_x2',
        type: 'double_chance',
        name: 'X2 - Pareggio o Trasferta',
        description: `${_awayTeam} non perde`,
        prediction: 'X2',
        confidence: Math.round(probX2 * 100),
        valueRating: this.calculateValueRating(evX2),
        odds: oddsX2,
        impliedProbability: this.oddsToProb(oddsX2),
        modelProbability: probX2 * 100,
        expectedValue: evX2,
        reason: `Alta probabilità che ${_awayTeam} non perda (${(probX2 * 100).toFixed(0)}%)`,
      });
    }
    
    return recs;
  }
  
  /**
   * Genera raccomandazioni Goal/No Goal (BTTS - Both Teams To Score)
   * 
   * FILTRI OTTIMIZZATI dopo backtest:
   * - EV minimo: 15% (aumentato da 12%)
   * - Confidence minima: 60% (aumentato da 50%)
   * - Max 3⭐ rating
   * - Soglia probabilità: 35% (lowered dopo 81.8% WR discovery)
   */
  // @ts-ignore - Metodo non usato ma mantenuto per riferimento futuro
  private _generateGoalNoGoalRecommendations(
    mlData: MLPredictionData,
    odds: OddsData,
    _homeTeam: string,
    _awayTeam: string
  ): BettingRecommendation[] {
    const recs: BettingRecommendation[] = [];
    
    const expectedHome = mlData.expectedScore.home;
    const expectedAway = mlData.expectedScore.away;
    
    // Stima probabilità Goal/No Goal basata su xG
    const homeXG = mlData.factors.xGData.homeAvgXG;
    const awayXG = mlData.factors.xGData.awayAvgXG;
    
    // Probabilità che entrambe segnino (usando distribuzione Poisson semplificata)
    const probHomeSco = 1 - Math.exp(-expectedHome);
    const probAwaySco = 1 - Math.exp(-expectedAway);
    const probBothScore = probHomeSco * probAwaySco;
    const probNoGoal = 1 - probBothScore;
    
    // OTTIMIZZAZIONE: Goal/NoGoal ha 81.8% win rate - abbassa soglie per includerli più spesso
    // Goal (entrambe segnano) - soglia abbassata da 0.40 a 0.35
    if (odds.btts_yes && probBothScore > 0.35) {
      const ev = this.calculateEV(probBothScore, odds.btts_yes);
      recs.push({
        id: 'btts_yes',
        type: 'goal_nogoal',
        name: 'Goal - Entrambe Segnano',
        description: 'Sia casa che trasferta segnano almeno 1 gol',
        prediction: 'GOAL',
        confidence: Math.round(probBothScore * 100),
        valueRating: this.calculateValueRating(ev),
        odds: odds.btts_yes,
        impliedProbability: this.oddsToProb(odds.btts_yes),
        modelProbability: probBothScore * 100,
        expectedValue: ev,
        reason: `Entrambe le squadre hanno buon potenziale offensivo (xG: ${homeXG.toFixed(2)} - ${awayXG.toFixed(2)})`,
      });
    }
    
    // No Goal (almeno una non segna) - soglia abbassata da 0.40 a 0.35
    if (odds.btts_no && probNoGoal > 0.35) {
      const ev = this.calculateEV(probNoGoal, odds.btts_no);
      recs.push({
        id: 'btts_no',
        type: 'goal_nogoal',
        name: 'No Goal - Almeno Una Non Segna',
        description: 'Almeno una squadra non segna',
        prediction: 'NO GOAL',
        confidence: Math.round(probNoGoal * 100),
        valueRating: this.calculateValueRating(ev),
        odds: odds.btts_no,
        impliedProbability: this.oddsToProb(odds.btts_no),
        modelProbability: probNoGoal * 100,
        expectedValue: ev,
        reason: `Difese solide o attacchi poco incisivi (gol attesi: ${expectedHome.toFixed(1)} - ${expectedAway.toFixed(1)})`,
      });
    }
    
    return recs;
  }
  
  /**
   * Genera raccomandazioni Over/Under
   * RIABILITATO con filtri BILANCIATI
   * 
   * Logica:
   * - Over 2.5: xG totale > 2.5 E confidence > 50%
   * - Under 2.5: xG totale < 2.2 E confidence > 50%
   * - Over 1.5: xG totale > 2.0 E confidence > 60%
   * - EV minimo: 7% (abbassato da 9.5% per aumentare copertura)
   */
  // @ts-ignore - Metodo non usato ma mantenuto per riferimento futuro
  private generateOverUnderRecommendations(
    mlData: MLPredictionData,
    odds: OddsData
  ): BettingRecommendation[] {
    const recs: BettingRecommendation[] = [];
    
    const expectedHome = mlData.expectedScore.home;
    const expectedAway = mlData.expectedScore.away;
    const totalExpected = expectedHome + expectedAway;
    
    // Helper: calcola probabilità usando Poisson per totale gol
    const poissonProb = (lambda: number, k: number) => {
      return Math.exp(-lambda) * Math.pow(lambda, k) / this.factorial(k);
    };
    
    // === OVER/UNDER 0.5 ===
    if (odds.over05 && odds.under05) {
      // Over 0.5 (almeno 1 gol)
      const probUnder05 = poissonProb(totalExpected, 0); // P(0 gol)
      const probOver05 = 1 - probUnder05;
      
      // Over 0.5: solo se xG > 2.0 (molto probabile almeno 1 gol)
      if (probOver05 > 0.85 && totalExpected > 2.0) {
        const ev = this.calculateEV(probOver05, odds.over05);
        if (ev > 0.15) {
          recs.push({
            id: 'over_05',
            type: 'over_under',
            name: 'Over 0.5 - Almeno 1 Gol',
            description: 'Almeno un gol nella partita',
            prediction: 'OVER 0.5',
            confidence: Math.round(probOver05 * 100),
            valueRating: this.calculateValueRating(ev),
            odds: odds.over05,
            impliedProbability: this.oddsToProb(odds.over05),
            modelProbability: probOver05 * 100,
            expectedValue: ev,
            reason: `xG totale molto alto (${totalExpected.toFixed(2)}) - almeno 1 gol quasi certo`,
          });
        }
      }
      
      // Under 0.5 (0-0): solo casi estremi con xG < 1.0
      if (probUnder05 > 0.20 && totalExpected < 1.0) {
        const ev = this.calculateEV(probUnder05, odds.under05);
        if (ev > 0.20) { // Soglia EV più alta per Under 0.5 (più rischioso)
          recs.push({
            id: 'under_05',
            type: 'over_under',
            name: 'Under 0.5 - Nessun Gol',
            description: 'Partita finisce 0-0',
            prediction: 'UNDER 0.5',
            confidence: Math.round(probUnder05 * 100),
            valueRating: this.calculateValueRating(ev),
            odds: odds.under05,
            impliedProbability: this.oddsToProb(odds.under05),
            modelProbability: probUnder05 * 100,
            expectedValue: ev,
            reason: `xG totale bassissimo (${totalExpected.toFixed(2)}) - possibile 0-0`,
          });
        }
      }
    }
    
    // === OVER/UNDER 1.5 ===
    if (odds.over15 && odds.under15) {
      // P(0 gol) + P(1 gol)
      const probUnder15 = poissonProb(totalExpected, 0) + poissonProb(totalExpected, 1);
      const probOver15 = 1 - probUnder15;
      
      // Over 1.5: almeno 2 gol - xG > 2.0 (bilanciato)
      if (probOver15 > 0.60 && totalExpected > 2.0) {
        const ev = this.calculateEV(probOver15, odds.over15);
        if (ev > 0.07) { // Abbassato da 9.5% a 7%
          recs.push({
            id: 'over_15',
            type: 'over_under',
            name: 'Over 1.5 - Almeno 2 Gol',
            description: 'Almeno 2 gol nella partita',
            prediction: 'OVER 1.5',
            confidence: Math.round(probOver15 * 100),
            valueRating: this.calculateValueRating(ev),
            odds: odds.over15,
            impliedProbability: this.oddsToProb(odds.over15),
            modelProbability: probOver15 * 100,
            expectedValue: ev,
            reason: `xG totale alto (${totalExpected.toFixed(2)}) - almeno 2 gol molto probabili`,
          });
        }
      }
      
      // Under 1.5: max 1 gol - solo se xG < 1.5
      if (probUnder15 > 0.50 && totalExpected < 1.5) {
        const ev = this.calculateEV(probUnder15, odds.under15);
        if (ev > 0.15) {
          recs.push({
            id: 'under_15',
            type: 'over_under',
            name: 'Under 1.5 - Max 1 Gol',
            description: 'Massimo 1 gol nella partita',
            prediction: 'UNDER 1.5',
            confidence: Math.round(probUnder15 * 100),
            valueRating: this.calculateValueRating(ev),
            odds: odds.under15,
            impliedProbability: this.oddsToProb(odds.under15),
            modelProbability: probUnder15 * 100,
            expectedValue: ev,
            reason: `xG totale basso (${totalExpected.toFixed(2)}) - pochi gol attesi`,
          });
        }
      }
    }
    
    // === OVER/UNDER 2.5 === (IL PIÙ COMUNE)
    if (odds.over25 && odds.under25) {
      // P(0) + P(1) + P(2)
      const probUnder25 = poissonProb(totalExpected, 0) + 
                         poissonProb(totalExpected, 1) + 
                         poissonProb(totalExpected, 2);
      const probOver25 = 1 - probUnder25;
      
      // Over 2.5: almeno 3 gol - xG > 2.5 (bilanciato)
      if (probOver25 > 0.50 && totalExpected > 2.5) {
        const ev = this.calculateEV(probOver25, odds.over25);
        if (ev > 0.07) { // Abbassato da 9.5% a 7%
          recs.push({
            id: 'over_25',
            type: 'over_under',
            name: 'Over 2.5 - Almeno 3 Gol',
            description: 'Almeno 3 gol nella partita',
            prediction: 'OVER 2.5',
            confidence: Math.round(probOver25 * 100),
            valueRating: this.calculateValueRating(ev),
            odds: odds.over25,
            impliedProbability: this.oddsToProb(odds.over25),
            modelProbability: probOver25 * 100,
            expectedValue: ev,
            reason: `xG totale molto alto (${totalExpected.toFixed(2)}) - partita con molti gol attesi`,
          });
        }
      }
      
      // Under 2.5: max 2 gol - xG < 2.2 (bilanciato)
      if (probUnder25 > 0.50 && totalExpected < 2.2) {
        const ev = this.calculateEV(probUnder25, odds.under25);
        if (ev > 0.07) { // Abbassato da 9.5% a 7%
          recs.push({
            id: 'under_25',
            type: 'over_under',
            name: 'Under 2.5 - Max 2 Gol',
            description: 'Massimo 2 gol nella partita',
            prediction: 'UNDER 2.5',
            confidence: Math.round(probUnder25 * 100),
            valueRating: this.calculateValueRating(ev),
            odds: odds.under25,
            impliedProbability: this.oddsToProb(odds.under25),
            modelProbability: probUnder25 * 100,
            expectedValue: ev,
            reason: `xG totale basso (${totalExpected.toFixed(2)}) - partita con pochi gol`,
          });
        }
      }
    }
    
    // === OVER/UNDER 3.5 ===
    if (odds.over35 && odds.under35) {
      // P(0) + P(1) + P(2) + P(3)
      const probUnder35 = poissonProb(totalExpected, 0) + 
                         poissonProb(totalExpected, 1) + 
                         poissonProb(totalExpected, 2) +
                         poissonProb(totalExpected, 3);
      const probOver35 = 1 - probUnder35;
      
      // Over 3.5: almeno 4 gol - SOLO SE xG > 3.8 (molto raro)
      if (probOver35 > 0.45 && totalExpected > 3.8) {
        const ev = this.calculateEV(probOver35, odds.over35);
        if (ev > 0.20) { // Soglia EV più alta per Over 3.5
          recs.push({
            id: 'over_35',
            type: 'over_under',
            name: 'Over 3.5 - Almeno 4 Gol',
            description: 'Almeno 4 gol nella partita',
            prediction: 'OVER 3.5',
            confidence: Math.round(probOver35 * 100),
            valueRating: this.calculateValueRating(ev),
            odds: odds.over35,
            impliedProbability: this.oddsToProb(odds.over35),
            modelProbability: probOver35 * 100,
            expectedValue: ev,
            reason: `xG totale altissimo (${totalExpected.toFixed(2)}) - partita a valanga di gol`,
          });
        }
      }
      
      // Under 3.5: max 3 gol - solo se xG < 2.5
      if (probUnder35 > 0.60 && totalExpected < 2.5) {
        const ev = this.calculateEV(probUnder35, odds.under35);
        if (ev > 0.15) {
          recs.push({
            id: 'under_35',
            type: 'over_under',
            name: 'Under 3.5 - Max 3 Gol',
            description: 'Massimo 3 gol nella partita',
            prediction: 'UNDER 3.5',
            confidence: Math.round(probUnder35 * 100),
            valueRating: this.calculateValueRating(ev),
            odds: odds.under35,
            impliedProbability: this.oddsToProb(odds.under35),
            modelProbability: probUnder35 * 100,
            expectedValue: ev,
            reason: `xG totale contenuto (${totalExpected.toFixed(2)}) - massimo 3 gol`,
          });
        }
      }
    }
    
    return recs;
  }
  
  /**
   * Genera raccomandazioni Multigoal
   * 
   * OTTIMIZZAZIONE: Multigoal ha 52.1% win rate nel backtest - molto affidabile!
   * 
   * Genera diverse tipologie:
   * - Multigoal CASA (squadra casa): 1-2, 1-3, 2-3, 2-4, 3-4, 1-4
   * - Multigoal TRASFERTA (squadra ospite): 1-2, 1-3, 2-3, 2-4, 3-4, 1-4
   * - Multigoal MATCH (totale partita): 2-3, 2-4, 3-4, 3-5, 4-5, 4-6, 1-3, 1-4
   * 
   * Logica intelligente:
   * - Seleziona il range con probabilità più alta per ogni squadra
   * - Include solo range che abbiano senso basato su xG
   * - Soglia confidence: 0.35 (backtest mostra alta affidabilità)
   */
  // @ts-ignore - Metodo non usato ma mantenuto per riferimento futuro
  private generateMultigoalRecommendations(
    mlData: MLPredictionData,
    _odds: OddsData,
    homeTeam: string,
    awayTeam: string
  ): BettingRecommendation[] {
    const recs: BettingRecommendation[] = [];
    
    const homeExpected = mlData.expectedScore.home;
    const awayExpected = mlData.expectedScore.away;
    const totalExpected = homeExpected + awayExpected;
    
    // ========================================
    // MULTIGOAL CASA
    // ========================================
    
    const homeCandidates = [
      { min: 1, max: 2, prob: this.poissonProbBetween(homeExpected, 1, 2) },
      { min: 1, max: 3, prob: this.poissonProbBetween(homeExpected, 1, 3) },
      { min: 1, max: 4, prob: this.poissonProbBetween(homeExpected, 1, 4) },
      { min: 2, max: 3, prob: this.poissonProbBetween(homeExpected, 2, 3) },
      { min: 2, max: 4, prob: this.poissonProbBetween(homeExpected, 2, 4) },
      { min: 3, max: 4, prob: this.poissonProbBetween(homeExpected, 3, 4) },
    ];
    
    // Trova il range con probabilità più alta per casa
    const bestHome = homeCandidates.reduce((best, curr) => 
      curr.prob > best.prob ? curr : best
    );
    
    // Aggiungi raccomandazione se supera soglia
    if (bestHome.prob > 0.35) {
      const estimatedOdds = this.probToFairOdds(bestHome.prob);
      const ev = this.calculateEV(bestHome.prob, estimatedOdds);
      
      recs.push({
        id: `mg_home_${bestHome.min}_${bestHome.max}`,
        type: 'multigoal',
        name: `Multigoal Casa ${bestHome.min}-${bestHome.max}`,
        description: `${homeTeam} segna tra ${bestHome.min} e ${bestHome.max} gol`,
        prediction: `${bestHome.min}-${bestHome.max} CASA`,
        confidence: Math.round(bestHome.prob * 100),
        valueRating: this.calculateValueRating(ev),
        odds: estimatedOdds,
        impliedProbability: this.oddsToProb(estimatedOdds),
        modelProbability: bestHome.prob * 100,
        expectedValue: ev,
        reason: `Gol casa attesi: ${homeExpected.toFixed(2)} - range più probabile`,
      });
    }
    
    // Aggiungi secondo range se ha probabilità decente (>25%)
    const secondBestHome = homeCandidates
      .filter(c => c !== bestHome && c.prob > 0.25)
      .sort((a, b) => b.prob - a.prob)[0];
    
    if (secondBestHome) {
      const estimatedOdds = this.probToFairOdds(secondBestHome.prob);
      const ev = this.calculateEV(secondBestHome.prob, estimatedOdds);
      
      recs.push({
        id: `mg_home_${secondBestHome.min}_${secondBestHome.max}`,
        type: 'multigoal',
        name: `Multigoal Casa ${secondBestHome.min}-${secondBestHome.max}`,
        description: `${homeTeam} segna tra ${secondBestHome.min} e ${secondBestHome.max} gol`,
        prediction: `${secondBestHome.min}-${secondBestHome.max} CASA`,
        confidence: Math.round(secondBestHome.prob * 100),
        valueRating: this.calculateValueRating(ev),
        odds: estimatedOdds,
        impliedProbability: this.oddsToProb(estimatedOdds),
        modelProbability: secondBestHome.prob * 100,
        expectedValue: ev,
        reason: `Gol casa attesi: ${homeExpected.toFixed(2)} - alternativa probabile`,
      });
    }
    
    // ========================================
    // MULTIGOAL TRASFERTA
    // ========================================
    
    const awayCandidates = [
      { min: 1, max: 2, prob: this.poissonProbBetween(awayExpected, 1, 2) },
      { min: 1, max: 3, prob: this.poissonProbBetween(awayExpected, 1, 3) },
      { min: 1, max: 4, prob: this.poissonProbBetween(awayExpected, 1, 4) },
      { min: 2, max: 3, prob: this.poissonProbBetween(awayExpected, 2, 3) },
      { min: 2, max: 4, prob: this.poissonProbBetween(awayExpected, 2, 4) },
      { min: 3, max: 4, prob: this.poissonProbBetween(awayExpected, 3, 4) },
    ];
    
    // Trova il range con probabilità più alta per trasferta
    const bestAway = awayCandidates.reduce((best, curr) => 
      curr.prob > best.prob ? curr : best
    );
    
    if (bestAway.prob > 0.35) {
      const estimatedOdds = this.probToFairOdds(bestAway.prob);
      const ev = this.calculateEV(bestAway.prob, estimatedOdds);
      
      recs.push({
        id: `mg_away_${bestAway.min}_${bestAway.max}`,
        type: 'multigoal',
        name: `Multigoal Trasferta ${bestAway.min}-${bestAway.max}`,
        description: `${awayTeam} segna tra ${bestAway.min} e ${bestAway.max} gol`,
        prediction: `${bestAway.min}-${bestAway.max} TRASFERTA`,
        confidence: Math.round(bestAway.prob * 100),
        valueRating: this.calculateValueRating(ev),
        odds: estimatedOdds,
        impliedProbability: this.oddsToProb(estimatedOdds),
        modelProbability: bestAway.prob * 100,
        expectedValue: ev,
        reason: `Gol trasferta attesi: ${awayExpected.toFixed(2)} - range più probabile`,
      });
    }
    
    // Aggiungi secondo range trasferta se probabile
    const secondBestAway = awayCandidates
      .filter(c => c !== bestAway && c.prob > 0.25)
      .sort((a, b) => b.prob - a.prob)[0];
    
    if (secondBestAway) {
      const estimatedOdds = this.probToFairOdds(secondBestAway.prob);
      const ev = this.calculateEV(secondBestAway.prob, estimatedOdds);
      
      recs.push({
        id: `mg_away_${secondBestAway.min}_${secondBestAway.max}`,
        type: 'multigoal',
        name: `Multigoal Trasferta ${secondBestAway.min}-${secondBestAway.max}`,
        description: `${awayTeam} segna tra ${secondBestAway.min} e ${secondBestAway.max} gol`,
        prediction: `${secondBestAway.min}-${secondBestAway.max} TRASFERTA`,
        confidence: Math.round(secondBestAway.prob * 100),
        valueRating: this.calculateValueRating(ev),
        odds: estimatedOdds,
        impliedProbability: this.oddsToProb(estimatedOdds),
        modelProbability: secondBestAway.prob * 100,
        expectedValue: ev,
        reason: `Gol trasferta attesi: ${awayExpected.toFixed(2)} - alternativa probabile`,
      });
    }
    
    // ========================================
    // MULTIGOAL MATCH (Totale Partita)
    // ========================================
    
    const matchCandidates = [
      { min: 1, max: 3, prob: this.poissonProbBetween(totalExpected, 1, 3) },
      { min: 1, max: 4, prob: this.poissonProbBetween(totalExpected, 1, 4) },
      { min: 2, max: 3, prob: this.poissonProbBetween(totalExpected, 2, 3) },
      { min: 2, max: 4, prob: this.poissonProbBetween(totalExpected, 2, 4) },
      { min: 2, max: 5, prob: this.poissonProbBetween(totalExpected, 2, 5) },
      { min: 3, max: 4, prob: this.poissonProbBetween(totalExpected, 3, 4) },
      { min: 3, max: 5, prob: this.poissonProbBetween(totalExpected, 3, 5) },
      { min: 4, max: 5, prob: this.poissonProbBetween(totalExpected, 4, 5) },
      { min: 4, max: 6, prob: this.poissonProbBetween(totalExpected, 4, 6) },
    ];
    
    // Trova il range con probabilità più alta per match
    const bestMatch = matchCandidates.reduce((best, curr) => 
      curr.prob > best.prob ? curr : best
    );
    
    if (bestMatch.prob > 0.35) {
      const estimatedOdds = this.probToFairOdds(bestMatch.prob);
      const ev = this.calculateEV(bestMatch.prob, estimatedOdds);
      
      recs.push({
        id: `mg_match_${bestMatch.min}_${bestMatch.max}`,
        type: 'multigoal',
        name: `Multigoal Match ${bestMatch.min}-${bestMatch.max}`,
        description: `Totale gol partita tra ${bestMatch.min} e ${bestMatch.max}`,
        prediction: `${bestMatch.min}-${bestMatch.max} MATCH`,
        confidence: Math.round(bestMatch.prob * 100),
        valueRating: this.calculateValueRating(ev),
        odds: estimatedOdds,
        impliedProbability: this.oddsToProb(estimatedOdds),
        modelProbability: bestMatch.prob * 100,
        expectedValue: ev,
        reason: `Gol totali attesi: ${totalExpected.toFixed(2)} - range più probabile`,
      });
    }
    
    // Aggiungi secondo range match se probabile
    const secondBestMatch = matchCandidates
      .filter(c => c !== bestMatch && c.prob > 0.25)
      .sort((a, b) => b.prob - a.prob)[0];
    
    if (secondBestMatch) {
      const estimatedOdds = this.probToFairOdds(secondBestMatch.prob);
      const ev = this.calculateEV(secondBestMatch.prob, estimatedOdds);
      
      recs.push({
        id: `mg_match_${secondBestMatch.min}_${secondBestMatch.max}`,
        type: 'multigoal',
        name: `Multigoal Match ${secondBestMatch.min}-${secondBestMatch.max}`,
        description: `Totale gol partita tra ${secondBestMatch.min} e ${secondBestMatch.max}`,
        prediction: `${secondBestMatch.min}-${secondBestMatch.max} MATCH`,
        confidence: Math.round(secondBestMatch.prob * 100),
        valueRating: this.calculateValueRating(ev),
        odds: estimatedOdds,
        impliedProbability: this.oddsToProb(estimatedOdds),
        modelProbability: secondBestMatch.prob * 100,
        expectedValue: ev,
        reason: `Gol totali attesi: ${totalExpected.toFixed(2)} - alternativa probabile`,
      });
    }
    
    return recs;
  }
  
  /**
   * Genera raccomandazioni Combo
   * OTTIMIZZAZIONE: Solo se EV > 20% (backtest: 20% win rate)
   */
  // @ts-ignore - Metodo non usato ma mantenuto per riferimento futuro
  private generateComboRecommendations(
    mlData: MLPredictionData,
    odds: OddsData,
    homeTeam: string,
    awayTeam: string
  ): BettingRecommendation[] {
    const recs: BettingRecommendation[] = [];
    
    const totalExpected = mlData.expectedScore.home + mlData.expectedScore.away;
    const probOver25 = this.poissonProbOverN(totalExpected, 2.5);
    
    // Combo 1 + Over 2.5
    if (mlData.predictions.homeWin > 0.35 && probOver25 > 0.50) {
      const comboProb = mlData.predictions.homeWin * probOver25;
      const comboOdds = odds.home * 1.5; // Stima combo odds
      const ev = this.calculateEV(comboProb, comboOdds);
      
      recs.push({
        id: 'combo_1_over25',
        type: 'combo',
        name: `Combo: 1 + Over 2.5`,
        description: `${homeTeam} vince E almeno 3 gol totali`,
        prediction: '1 + OVER 2.5',
        confidence: Math.round(comboProb * 100),
        valueRating: this.calculateValueRating(ev),
        odds: comboOdds,
        impliedProbability: this.oddsToProb(comboOdds),
        modelProbability: comboProb * 100,
        expectedValue: ev,
        reason: `Vittoria probabile con gol attesi: ${totalExpected.toFixed(1)}`,
      });
    }
    
    // Combo 2 + Over 2.5
    if (mlData.predictions.awayWin > 0.35 && probOver25 > 0.50) {
      const comboProb = mlData.predictions.awayWin * probOver25;
      const comboOdds = odds.away * 1.5;
      const ev = this.calculateEV(comboProb, comboOdds);
      
      recs.push({
        id: 'combo_2_over25',
        type: 'combo',
        name: `Combo: 2 + Over 2.5`,
        description: `${awayTeam} vince E almeno 3 gol totali`,
        prediction: '2 + OVER 2.5',
        confidence: Math.round(comboProb * 100),
        valueRating: this.calculateValueRating(ev),
        odds: comboOdds,
        impliedProbability: this.oddsToProb(comboOdds),
        modelProbability: comboProb * 100,
        expectedValue: ev,
        reason: `Vittoria probabile con gol attesi: ${totalExpected.toFixed(1)}`,
      });
    }
    
    // Combo 1X + Goal
    const prob1X = mlData.predictions.homeWin + mlData.predictions.draw;
    const probHomeSco = 1 - Math.exp(-mlData.expectedScore.home);
    const probAwaySco = 1 - Math.exp(-mlData.expectedScore.away);
    const probBothScore = probHomeSco * probAwaySco;
    
    if (prob1X > 0.60 && probBothScore > 0.50) {
      const comboProb = prob1X * probBothScore;
      const odds1X = this.calculateDoubleChanceOdds(odds.home, odds.draw);
      const comboOdds = odds1X * (odds.btts_yes || 1.8);
      const ev = this.calculateEV(comboProb, comboOdds);
      
      recs.push({
        id: 'combo_1x_goal',
        type: 'combo',
        name: `Combo: 1X + Goal`,
        description: `${homeTeam} non perde E entrambe segnano`,
        prediction: '1X + GOAL',
        confidence: Math.round(comboProb * 100),
        valueRating: this.calculateValueRating(ev),
        odds: comboOdds,
        impliedProbability: this.oddsToProb(comboOdds),
        modelProbability: comboProb * 100,
        expectedValue: ev,
        reason: `${homeTeam} favorito e match equilibrato in attacco`,
      });
    }
    
    return recs;
  }
  
  // ===================== UTILITY METHODS =====================
  
  /**
   * Calcola Expected Value (EV)
   */
  private calculateEV(probability: number, odds: number): number {
    return (probability * odds) - 1;
  }
  
  /**
   * Calcola rating a stelle (1-5) basato su EV
   * OTTIMIZZATO: backtest mostrava 3⭐ con 50% win rate vs 5⭐ con 32.6%
   * Nuove soglie più conservative per dare 5⭐ solo a vere value bets
   */
  /**
   * Calcola rating di valore basato su Expected Value
   * 
   * THRESHOLDS OTTIMIZZATI (backtest month):
   * - 5⭐: EV ≥ 40% (era 25%) - solo opportunità eccezionali (37.5% win, +34.59% ROI)
   * - 4⭐: EV ≥ 25% (era 15%) - alta profittabilità (36% win rate, serve maggior selettività)
   * - 3⭐: EV ≥ 5% (manteniamo) - buon compromesso (51.8% win rate)
   * - 2⭐: EV ≥ -2% (manteniamo) - accettabile (54.1% win rate)
   * - 1⭐: EV < -2% (manteniamo) - basso valore (59.5% win rate, best!)
   * 
   * Nota: 5⭐ ha win rate basso ma ROI alto grazie alle quote elevate (avg 6.45)
   * Rendendolo più raro, manteniamo solo i casi veramente eccezionali
   */
  private calculateValueRating(ev: number): number {
    if (ev >= 0.40) return 5;  // Era 0.25 - solo EV eccezionali (>40%)
    if (ev >= 0.25) return 4;  // Era 0.15 - alta profittabilità (>25%)
    if (ev >= 0.05) return 3;  // Mantenuto - buon compromesso
    if (ev >= -0.02) return 2; // Mantenuto - accettabile
    return 1;
  }
  
  /**
   * Converte odds decimali in probabilità implicita (%)
   */
  private oddsToProb(odds: number): number {
    return Number(((1 / odds) * 100).toFixed(2));
  }
  
  /**
   * Converte probabilità in fair odds (senza margine)
   */
  private probToFairOdds(prob: number): number {
    return Number((1 / prob).toFixed(2));
  }
  
  /**
   * Calcola odds Doppia Chance combinando due singole
   */
  private calculateDoubleChanceOdds(odds1: number, odds2: number): number {
    const prob1 = 1 / odds1;
    const prob2 = 1 / odds2;
    const combinedProb = prob1 + prob2;
    return Number((1 / combinedProb).toFixed(2));
  }
  
  /**
   * Probabilità Poisson che ci siano più di N gol
   */
  private poissonProbOverN(lambda: number, n: number): number {
    let probUnderN = 0;
    for (let k = 0; k <= Math.floor(n); k++) {
      probUnderN += this.poissonProb(lambda, k);
    }
    return 1 - probUnderN;
  }
  
  /**
   * Probabilità Poisson esatta per k gol
   */
  private poissonProb(lambda: number, k: number): number {
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / this.factorial(k);
  }
  
  /**
   * Probabilità Poisson tra min e max gol (inclusi)
   */
  private poissonProbBetween(lambda: number, min: number, max: number): number {
    let prob = 0;
    for (let k = min; k <= max; k++) {
      prob += this.poissonProb(lambda, k);
    }
    return prob;
  }
  
  /**
   * Fattoriale
   */
  private factorial(n: number): number {
    if (n <= 1) return 1;
    return n * this.factorial(n - 1);
  }
  
  /**
   * Genera spiegazione per raccomandazione 1X2
   */
  private generateReason(outcome: 'home' | 'draw' | 'away', mlData: MLPredictionData, ev: number): string {
    const xgHome = mlData.factors.xGData.homeAvgXG;
    const xgAway = mlData.factors.xGData.awayAvgXG;
    const h2hHomeGoals = mlData.factors.headToHead.avgHomeGoals;
    const h2hAwayGoals = mlData.factors.headToHead.avgAwayGoals;
    
    if (outcome === 'home') {
      if (ev > 0.10) {
        return `Ottimo valore! xG medio casa ${xgHome.toFixed(2)} superiore a trasferta ${xgAway.toFixed(2)}`;
      }
      return `Casa favorita con xG medio ${xgHome.toFixed(2)} e media H2H ${h2hHomeGoals.toFixed(1)} gol`;
    } else if (outcome === 'away') {
      if (ev > 0.10) {
        return `Ottimo valore! xG medio trasferta ${xgAway.toFixed(2)} superiore a casa ${xgHome.toFixed(2)}`;
      }
      return `Trasferta favorita con xG medio ${xgAway.toFixed(2)} e media H2H ${h2hAwayGoals.toFixed(1)} gol`;
    } else {
      return `Equilibrio tra le squadre con probabilità pareggio ${(mlData.predictions.draw * 100).toFixed(0)}%`;
    }
  }
}

export const bettingRecommendationsService = new BettingRecommendationsService();
