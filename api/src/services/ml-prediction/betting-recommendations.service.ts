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
}

export interface BettingRecommendations {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  recommendations: BettingRecommendation[];
  topPicks: BettingRecommendation[]; // Top 3 suggerimenti
  lastUpdated: Date;
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

export class BettingRecommendationsService {
  
  /**
   * Genera raccomandazioni di scommessa basate su ML prediction e odds
   */
  generateRecommendations(
    fixtureId: number,
    homeTeam: string,
    awayTeam: string,
    mlData: MLPredictionData,
    odds: OddsData
  ): BettingRecommendations {
    const recommendations: BettingRecommendation[] = [];
    
    // 1. RISULTATO ESATTO (1X2)
    recommendations.push(...this.generate1X2Recommendations(mlData, odds, homeTeam, awayTeam));
    
    // 2. DOPPIA CHANCE
    recommendations.push(...this.generateDoubleChanceRecommendations(mlData, odds, homeTeam, awayTeam));
    
    // 3. GOAL/NO GOAL (BTTS)
    recommendations.push(...this.generateGoalNoGoalRecommendations(mlData, odds, homeTeam, awayTeam));
    
    // 4. OVER/UNDER
    recommendations.push(...this.generateOverUnderRecommendations(mlData, odds));
    
    // 5. MULTIGOAL
    recommendations.push(...this.generateMultigoalRecommendations(mlData, odds, homeTeam, awayTeam));
    
    // 6. COMBO (combinazioni)
    recommendations.push(...this.generateComboRecommendations(mlData, odds, homeTeam, awayTeam));
    
    // OTTIMIZZAZIONE: Filtra in base ai risultati backtest
    // - Goal/NoGoal: 81.8% win rate → priorità massima
    // - Multigoal: 63.6% win rate → mantieni
    // - Over/Under: 0% win rate → ELIMINA completamente
    // - Combo: 20% win rate → solo se EV > 20%
    // - Risultato: 37.5% → solo se EV > 5%
    
    let validRecommendations = recommendations.filter(r => {
      // ELIMINA tutti gli Over/Under (0% win rate)
      if (r.type === 'over_under') return false;
      
      // Goal/NoGoal: sempre validi se confidence > 40%
      if (r.type === 'goal_nogoal' && r.confidence >= 40) return true;
      
      // Multigoal: sempre validi se confidence > 45%
      if (r.type === 'multigoal' && r.confidence >= 45) return true;
      
      // Combo: solo se EV eccezionale > 20%
      if (r.type === 'combo' && r.expectedValue > 0.20) return true;
      
      // Risultato/Doppia: solo se EV > 5% o rating >= 3
      if ((r.type === 'result' || r.type === 'double_chance') && 
          (r.expectedValue > 0.05 || r.valueRating >= 3)) return true;
      
      return false;
    });
    
    // FILTRO ANTI-CONTRADDIZIONI
    validRecommendations = this.filterConflictingRecommendations(validRecommendations);
    
    // Ordina per valore atteso decrescente
    validRecommendations.sort((a, b) => b.expectedValue - a.expectedValue);
    
    // Top 3 picks - diversificati per categoria
    const topPicks = this.selectDiversifiedTopPicks(validRecommendations, 3);
    
    return {
      fixtureId,
      homeTeam,
      awayTeam,
      recommendations: validRecommendations,
      topPicks,
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
    
    // 1X (Casa o Pareggio)
    const prob1X = mlData.predictions.homeWin + mlData.predictions.draw;
    const odds1X = this.calculateDoubleChanceOdds(odds.home, odds.draw);
    const ev1X = this.calculateEV(prob1X, odds1X);
    
    if (prob1X > 0.50) {
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
    
    if (prob12 > 0.60 && mlData.predictions.draw < 0.30) {
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
    
    if (probX2 > 0.50) {
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
   */
  private generateGoalNoGoalRecommendations(
    mlData: MLPredictionData,
    odds: OddsData,
    homeTeam: string,
    awayTeam: string
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
   * DISABILITATO: 0% win rate nel backtest
   */
  private generateOverUnderRecommendations(
    _mlData: MLPredictionData,
    _odds: OddsData
  ): BettingRecommendation[] {
    // ELIMINATO: Over/Under ha avuto 0% di successo nel backtest
    return [];
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
  private generateMultigoalRecommendations(
    mlData: MLPredictionData,
    odds: OddsData,
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
