import { 
  mlDataFetcher, 
  HeadToHeadMatch, 
  TeamSeasonStats, 
  FixtureXGData,
  FormMatch
} from './data-fetcher.service';

export interface PredictionInput {
  fixtureId: number;
  homeTeamId: number;
  awayTeamId: number;
  seasonId: number;
  leagueId: number;
  fixtureDate?: Date; // 🆕 Optional: fixture date for backtesting
}

export interface PredictionResult {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
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
  analysis: {
    headToHeadAdvantage: 'home' | 'away' | 'neutral';
    formAdvantage: 'home' | 'away' | 'neutral';
    recentFormAdvantage: 'home' | 'away' | 'neutral'; // 🆕 Recent form
    xGAdvantage: 'home' | 'away' | 'neutral';
    strengthDifference: number;
  };
  factors: {
    headToHead: {
      matches: number;
      homeWins: number;
      draws: number;
      awayWins: number;
      avgHomeGoals: number;
      avgAwayGoals: number;
      weight: number;
    };
    recentForm: { // 🆕 Recent form factor
      homeWinRate: number;
      homeGoalsPerGame: number;
      homeConcededPerGame: number;
      homeStreak: number;
      awayWinRate: number;
      awayGoalsPerGame: number;
      awayConcededPerGame: number;
      awayStreak: number;
      weight: number;
    };
    seasonStats: {
      homeStats: Partial<TeamSeasonStats>;
      awayStats: Partial<TeamSeasonStats>;
      weight: number;
    };
    xGData: {
      homeAvgXG: number;
      homeAvgXGA: number;
      awayAvgXG: number;
      awayAvgXGA: number;
      weight: number;
    };
  };
}

export class MLPredictionAlgorithm {
  /**
   * 🌍 Restituisce boost stagionale per probabilità pareggio
   * Q1 (Gen-Feb): +15% | Q2 (Mar-Mag): +5% | Q3 (Giu-Ago): 0% | Q4 (Set-Nov): -5%
   */
  private getSeasonalDrawBoost(fixtureDate: Date | undefined): number {
    if (!fixtureDate) return 1.0; // No adjustment if date unknown
    
    const month = fixtureDate.getMonth() + 1; // 1-12
    
    // 🔴 Q1 FIX: Gen-Mar (winter, MOLTI più pareggi - dati reali mostrano 76% losses su DC)
    if (month <= 3) return 1.30; // Aumentato da 1.15 a 1.30
    
    // Q2: Apr-Mag (spring, moderate draws)
    if (month <= 5) return 1.10; // Aumentato da 1.05
    
    // Q3: Giu-Ago (summer, neutral)
    if (month <= 8) return 1.0;
    
    // Q4: Set-Nov (autumn, fewer draws, optimal form)
    return 0.95;
  }

  /**
   * Genera una predizione completa per una partita
   */
  async predictMatch(input: PredictionInput): Promise<PredictionResult> {
    console.log(`🤖 Starting ML prediction for fixture ${input.fixtureId}`);
    
    // 🆕 BACKTEST FIX: Passa maxDate ai data fetchers
    const maxDate = input.fixtureDate ? new Date(input.fixtureDate) : undefined;
    if (maxDate) {
      console.log(`   🕐 BACKTEST MODE: maxDate=${maxDate.toISOString().split('T')[0]}`);
    }

    // Recupera tutti i dati necessari
    const [h2hMatches, homeStats, awayStats, homeXGMatches, awayXGMatches, homeForm, awayForm] = await Promise.all([
      mlDataFetcher.getHeadToHeadData(input.homeTeamId, input.awayTeamId, maxDate),
      mlDataFetcher.getTeamSeasonStats(input.homeTeamId, input.seasonId, input.leagueId),
      mlDataFetcher.getTeamSeasonStats(input.awayTeamId, input.seasonId, input.leagueId),
      mlDataFetcher.getTeamRecentXGMatches(input.homeTeamId, input.seasonId, 10, maxDate),
      mlDataFetcher.getTeamRecentXGMatches(input.awayTeamId, input.seasonId, 10, maxDate),
      mlDataFetcher.getTeamRecentForm(input.homeTeamId, input.seasonId, 7, maxDate), // 🆕 Recent form
      mlDataFetcher.getTeamRecentForm(input.awayTeamId, input.seasonId, 7, maxDate), // 🆕 Recent form
    ]);

    // Analizza i testa a testa
    const h2hAnalysis = this.analyzeHeadToHead(h2hMatches, input.homeTeamId, input.awayTeamId);

    // 🆕 Analizza la forma recente (ultime 7 partite)
    const formAnalysis = this.analyzeRecentForm(homeForm, awayForm);

    // Analizza le statistiche stagionali
    const statsAnalysis = this.analyzeSeasonStats(homeStats, awayStats);

    // Analizza i dati xG
    const xGAnalysis = this.analyzeXGData(
      homeXGMatches, 
      awayXGMatches, 
      input.homeTeamId, 
      input.awayTeamId
    );

    // Calcola le probabilità finali usando un sistema di pesi RIVISTO
    const prediction = this.calculateFinalPrediction(
      h2hAnalysis,
      formAnalysis, // 🆕 Recent form
      statsAnalysis,
      xGAnalysis,
      maxDate // 🌍 Pass fixture date for seasonal adjustments
    );

    // Calcola il punteggio atteso
    const expectedScore = this.calculateExpectedScore(
      h2hAnalysis,
      formAnalysis, // 🆕 Recent form
      statsAnalysis,
      xGAnalysis
    );

    // Determina la confidence della predizione
    const confidence = this.calculateConfidence(
      h2hAnalysis,
      formAnalysis, // 🆕 Recent form
      statsAnalysis,
      xGAnalysis,
      homeXGMatches,
      awayXGMatches,
      maxDate // 🌍 Pass fixture date for seasonal adjustments
    );

    // Analisi qualitativa
    const analysis = {
      headToHeadAdvantage: this.determineAdvantage(
        h2hAnalysis.homeWinRate,
        h2hAnalysis.awayWinRate
      ),
      formAdvantage: this.determineAdvantage(
        statsAnalysis.homeStrength,
        statsAnalysis.awayStrength
      ),
      recentFormAdvantage: this.determineAdvantage( // 🆕 Recent form advantage
        formAnalysis.homeWinRate,
        formAnalysis.awayWinRate
      ),
      xGAdvantage: this.determineAdvantage(
        xGAnalysis.homeXGDiff,
        xGAnalysis.awayXGDiff
      ),
      strengthDifference: statsAnalysis.homeStrength - statsAnalysis.awayStrength,
    };

    const result: PredictionResult = {
      fixtureId: input.fixtureId,
      homeTeam: `Team ${input.homeTeamId}`,
      awayTeam: `Team ${input.awayTeamId}`,
      predictions: prediction,
      expectedScore,
      confidence,
      analysis,
      factors: {
        headToHead: {
          matches: h2hAnalysis.totalMatches,
          homeWins: h2hAnalysis.homeWins,
          draws: h2hAnalysis.draws,
          awayWins: h2hAnalysis.awayWins,
          avgHomeGoals: h2hAnalysis.avgHomeGoals,
          avgAwayGoals: h2hAnalysis.avgAwayGoals,
          weight: h2hAnalysis.weight,
        },
        recentForm: { // 🆕 Recent form data
          homeWinRate: formAnalysis.homeWinRate,
          homeGoalsPerGame: formAnalysis.homeGoalsPerGame,
          homeConcededPerGame: formAnalysis.homeConcededPerGame,
          homeStreak: formAnalysis.homeStreak,
          awayWinRate: formAnalysis.awayWinRate,
          awayGoalsPerGame: formAnalysis.awayGoalsPerGame,
          awayConcededPerGame: formAnalysis.awayConcededPerGame,
          awayStreak: formAnalysis.awayStreak,
          weight: formAnalysis.weight,
        },
        seasonStats: {
          homeStats: homeStats || {},
          awayStats: awayStats || {},
          weight: statsAnalysis.weight,
        },
        xGData: {
          homeAvgXG: xGAnalysis.homeAvgXG,
          homeAvgXGA: xGAnalysis.homeAvgXGA,
          awayAvgXG: xGAnalysis.awayAvgXG,
          awayAvgXGA: xGAnalysis.awayAvgXGA,
          weight: xGAnalysis.weight,
        },
      },
    };

    console.log(`✅ ML prediction completed for fixture ${input.fixtureId}`);
    return result;
  }

  /**
   * Analizza i dati dei testa a testa
   */
  private analyzeHeadToHead(
    matches: HeadToHeadMatch[], 
    homeTeamId: number, 
    awayTeamId: number
  ) {
    if (matches.length === 0) {
      return {
        totalMatches: 0,
        homeWins: 0,
        draws: 0,
        awayWins: 0,
        homeWinRate: 0.33,
        drawRate: 0.27,
        awayWinRate: 0.33,
        avgHomeGoals: 0,
        avgAwayGoals: 0,
        weight: 0,
      };
    }

    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;
    let totalHomeGoals = 0;
    let totalAwayGoals = 0;

    // Analizza ogni partita
    matches.forEach((match) => {
      const isHomeActuallyHome = match.homeTeamId === homeTeamId;
      
      const actualHomeScore = isHomeActuallyHome ? match.homeScore : match.awayScore;
      const actualAwayScore = isHomeActuallyHome ? match.awayScore : match.homeScore;

      totalHomeGoals += actualHomeScore;
      totalAwayGoals += actualAwayScore;

      if (actualHomeScore > actualAwayScore) {
        homeWins++;
      } else if (actualHomeScore < actualAwayScore) {
        awayWins++;
      } else {
        draws++;
      }
    });

    const totalMatches = matches.length;
    const homeWinRate = homeWins / totalMatches;
    const drawRate = draws / totalMatches;
    const awayWinRate = awayWins / totalMatches;

    // 🎯 PESO RIDOTTO: Max 10% invece di 30%
    // Il peso aumenta con il numero di partite, ma si satura a 10%
    let weight = 0;
    if (totalMatches >= 10) {
      weight = 0.10; // 10+ partite: peso massimo 10%
    } else if (totalMatches >= 5) {
      weight = 0.05; // 5-9 partite: peso medio 5%
    } else if (totalMatches >= 2) {
      weight = 0.02; // 2-4 partite: peso basso 2%
    }
    // 0-1 partite: peso 0%

    console.log(`   H2H: ${totalMatches} matches → weight ${(weight * 100).toFixed(0)}%`);

    return {
      totalMatches,
      homeWins,
      draws,
      awayWins,
      homeWinRate,
      drawRate,
      awayWinRate,
      avgHomeGoals: totalHomeGoals / totalMatches,
      avgAwayGoals: totalAwayGoals / totalMatches,
      weight,
    };
  }

  /**
   * 🆕 Analizza la forma recente (ultime 7 partite)
   */
  private analyzeRecentForm(homeMatches: FormMatch[], awayMatches: FormMatch[]) {
    const analyzeTeamForm = (matches: FormMatch[]) => {
      if (matches.length === 0) {
        return {
          winRate: 0.35,
          goalsPerGame: 1.3,
          concededPerGame: 1.3,
          streak: 0,
        };
      }

      const wins = matches.filter(m => m.result === 'win').length;
      const totalGoalsScored = matches.reduce((sum, m) => sum + m.goalsScored, 0);
      const totalConceded = matches.reduce((sum, m) => sum + m.goalsConceded, 0);

      // Calcola streak (serie di vittorie/sconfitte consecutive)
      let streak = 0;
      const lastResult = matches[0]?.result;
      if (lastResult) {
        for (const match of matches) {
          if (match.result === lastResult && lastResult !== 'draw') {
            streak += (lastResult === 'win' ? 1 : -1);
          } else {
            break;
          }
        }
      }

      return {
        winRate: wins / matches.length,
        goalsPerGame: totalGoalsScored / matches.length,
        concededPerGame: totalConceded / matches.length,
        streak,
      };
    };

    const homeForm = analyzeTeamForm(homeMatches);
    const awayForm = analyzeTeamForm(awayMatches);

    // Peso fisso 35% - sempre disponibile (se ci sono dati)
    const weight = (homeMatches.length > 0 && awayMatches.length > 0) ? 0.35 : 0.15;

    console.log(`   Recent Form: home ${homeMatches.length} matches (${(homeForm.winRate * 100).toFixed(0)}% WR, streak ${homeForm.streak}), away ${awayMatches.length} matches (${(awayForm.winRate * 100).toFixed(0)}% WR, streak ${awayForm.streak}) → weight ${(weight * 100).toFixed(0)}%`);

    return {
      homeWinRate: homeForm.winRate,
      homeGoalsPerGame: homeForm.goalsPerGame,
      homeConcededPerGame: homeForm.concededPerGame,
      homeStreak: homeForm.streak,
      awayWinRate: awayForm.winRate,
      awayGoalsPerGame: awayForm.goalsPerGame,
      awayConcededPerGame: awayForm.concededPerGame,
      awayStreak: awayForm.streak,
      weight,
    };
  }

  /**
   * Analizza le statistiche stagionali
   */
  private analyzeSeasonStats(
    homeStats: TeamSeasonStats | null, 
    awayStats: TeamSeasonStats | null
  ) {
    // Valori di default se non ci sono statistiche
    const defaultStats = {
      avgGoalsScored: 1.3,
      avgGoalsConceded: 1.3,
      winRate: 0.35,
      shotsPerGame: 12,
      shotsOnTargetPerGame: 4,
    };

    const home = homeStats || defaultStats;
    const away = awayStats || defaultStats;

    // Calcola la forza di ogni squadra (0-100)
    const homeStrength = this.calculateTeamStrength(home);
    const awayStrength = this.calculateTeamStrength(away);

    // Aggiusta per il vantaggio casalingo (circa +10% di forza per la casa)
    const adjustedHomeStrength = homeStrength * 1.1;

    // 🎯 PESO RIDOTTO: 30% invece di 40%
    const weight = (homeStats && awayStats) ? 0.30 : 0.15;

    return {
      homeStrength: adjustedHomeStrength,
      awayStrength,
      homeAttack: home.avgGoalsScored || 1.3,
      homeDefense: home.avgGoalsConceded || 1.3,
      awayAttack: away.avgGoalsScored || 1.3,
      awayDefense: away.avgGoalsConceded || 1.3,
      weight,
    };
  }

  /**
   * Calcola la forza complessiva di una squadra (0-100)
   */
  private calculateTeamStrength(stats: any): number {
    const avgGoalsScored = stats.avgGoalsScored || 1.3;
    const avgGoalsConceded = stats.avgGoalsConceded || 1.3;
    const winRate = stats.winRate || 0.35;

    // Normalizza i valori
    const attackScore = Math.min(avgGoalsScored / 3, 1) * 40; // max 40 punti
    const defenseScore = Math.min((3 - avgGoalsConceded) / 3, 1) * 35; // max 35 punti
    const winScore = winRate * 25; // max 25 punti

    return attackScore + defenseScore + winScore;
  }

  /**
   * Analizza i dati xG recenti
   */
  private analyzeXGData(
    homeMatches: FixtureXGData[], 
    awayMatches: FixtureXGData[],
    homeTeamId: number,
    _awayTeamId: number
  ) {
    const homeXGStats = this.calculateXGStats(homeMatches, homeTeamId);
    const awayXGStats = this.calculateXGStats(awayMatches, _awayTeamId);

    // 🎯 PESO RIDOTTO: 25% invece di 30%
    const weight = (homeMatches.length > 0 && awayMatches.length > 0) ? 0.25 : 0.10;

    return {
      homeAvgXG: homeXGStats.avgXG,
      homeAvgXGA: homeXGStats.avgXGA,
      awayAvgXG: awayXGStats.avgXG,
      awayAvgXGA: awayXGStats.avgXGA,
      homeXGDiff: homeXGStats.avgXG - homeXGStats.avgXGA,
      awayXGDiff: awayXGStats.avgXG - awayXGStats.avgXGA,
      weight,
    };
  }

  /**
   * Calcola statistiche xG medie per una squadra
   */
  private calculateXGStats(matches: FixtureXGData[], teamId: number) {
    if (matches.length === 0) {
      return { avgXG: 1.3, avgXGA: 1.3 };
    }

    let totalXG = 0;
    let totalXGA = 0;

    matches.forEach((match) => {
      const isHome = match.homeTeamId === teamId;
      totalXG += isHome ? match.homeXG : match.awayXG;
      totalXGA += isHome ? match.awayXG : match.homeXG;
    });

    return {
      avgXG: totalXG / matches.length,
      avgXGA: totalXGA / matches.length,
    };
  }

  /**
   * Calcola la predizione finale combinando tutti i fattori
   * 🌍 SEASONAL FIX: Applica boost pareggio basato su stagionalità
   * 🎯 NUOVO SISTEMA PESI: Form 35%, Stats 30%, xG 25%, H2H 10%
   */
  private calculateFinalPrediction(
    h2hAnalysis: any,
    formAnalysis: any, // 🆕 Recent form
    statsAnalysis: any,
    xGAnalysis: any,
    fixtureDate?: Date
  ) {
    // 🎯 NUOVI PESI: Form 35%, Stats 30%, xG 25%, H2H 10%
    const totalWeight = h2hAnalysis.weight + formAnalysis.weight + statsAnalysis.weight + xGAnalysis.weight;
    const h2hW = h2hAnalysis.weight / totalWeight;
    const formW = formAnalysis.weight / totalWeight; // 🆕
    const statsW = statsAnalysis.weight / totalWeight;
    const xGW = xGAnalysis.weight / totalWeight;

    console.log(`   💡 Weight distribution: H2H ${(h2hW * 100).toFixed(0)}%, Form ${(formW * 100).toFixed(0)}%, Stats ${(statsW * 100).toFixed(0)}%, xG ${(xGW * 100).toFixed(0)}%`);

    // Calcola probabilità da h2h
    const h2hProbs = {
      home: h2hAnalysis.homeWinRate,
      draw: h2hAnalysis.drawRate,
      away: h2hAnalysis.awayWinRate,
    };

    // 🆕 Calcola probabilità dalla forma recente
    const formWinRateDiff = formAnalysis.homeWinRate - formAnalysis.awayWinRate;
    const formProbs = this.formToProbs(formWinRateDiff, formAnalysis.homeStreak, formAnalysis.awayStreak);

    // Calcola probabilità dalle statistiche stagionali
    const strengthDiff = statsAnalysis.homeStrength - statsAnalysis.awayStrength;
    const statsProbs = this.strengthToProbs(strengthDiff);

    // Calcola probabilità dai dati xG
    const xGDiff = xGAnalysis.homeXGDiff - xGAnalysis.awayXGDiff;
    const xGProbs = this.xGDiffToProbs(xGDiff);

    // 🆕 Combina TUTTI E 4 i fattori con i pesi
    let homeWin = (h2hProbs.home * h2hW) + (formProbs.home * formW) + (statsProbs.home * statsW) + (xGProbs.home * xGW);
    let draw = (h2hProbs.draw * h2hW) + (formProbs.draw * formW) + (statsProbs.draw * statsW) + (xGProbs.draw * xGW);
    let awayWin = (h2hProbs.away * h2hW) + (formProbs.away * formW) + (statsProbs.away * statsW) + (xGProbs.away * xGW);

    // 🌍 SEASONAL FIX: Apply draw boost based on season
    const drawBoost = this.getSeasonalDrawBoost(fixtureDate);
    if (drawBoost !== 1.0) {
      // Boost draw probability
      draw = draw * drawBoost;
      
      // Redistribute excess to home/away proportionally
      const excessOrDeficit = draw - (draw / drawBoost);
      const redistributeFactor = excessOrDeficit / (homeWin + awayWin);
      homeWin = homeWin - (homeWin * redistributeFactor);
      awayWin = awayWin - (awayWin * redistributeFactor);
      
      console.log(`   🌍 Seasonal draw adjustment: boost=${drawBoost.toFixed(2)}, draw ${((draw / drawBoost) * 100).toFixed(1)}% → ${(draw * 100).toFixed(1)}%`);
    }

    // Normalizza per assicurarsi che sommino a 1
    const total = homeWin + draw + awayWin;

    return {
      homeWin: Math.round((homeWin / total) * 100) / 100,
      draw: Math.round((draw / total) * 100) / 100,
      awayWin: Math.round((awayWin / total) * 100) / 100,
    };
  }

  /**
   * 🆕 Converte il differenziale di win rate in probabilità 1X2
   * Integra anche l'effetto degli streak (momentum)
   */
  private formToProbs(winRateDiff: number, homeStreak: number, awayStreak: number) {
    // Base: win rate differenziale (-100 a +100)
    // +50 = home molto più forte, -50 = away molto più forte
    
    // Applica momentum bonus (+/-5% per streak di 3+)
    let adjustedDiff = winRateDiff;
    if (homeStreak >= 3) adjustedDiff += 5; // Home in striscia positiva
    if (homeStreak <= -3) adjustedDiff -= 5; // Home in striscia negativa
    if (awayStreak >= 3) adjustedDiff -= 5; // Away in striscia positiva
    if (awayStreak <= -3) adjustedDiff += 5; // Away in striscia negativa
    
    // Normalizza a [-1, 1]
    const normalized = Math.max(-1, Math.min(1, adjustedDiff / 50));
    
    // Converti in probabilità con sigmoid
    const homeAdvantage = 0.5 + (normalized * 0.35); // Range [0.15, 0.85]
    const drawProb = 0.25; // Base draw probability (forma recente non predice bene i pareggi)
    
    return {
      home: homeAdvantage * (1 - drawProb),
      draw: drawProb,
      away: (1 - homeAdvantage) * (1 - drawProb),
    };
  }

  /**
   * Converte differenza di forza in probabilità
   */
  private strengthToProbs(strengthDiff: number) {
    // Usa una funzione logistica per convertire la differenza in probabilità
    const sigmoid = (x: number) => 1 / (1 + Math.exp(-x / 20));
    
    const homeAdvantage = sigmoid(strengthDiff);
    const drawProb = 0.27; // Baseline per pareggio
    
    return {
      home: homeAdvantage * (1 - drawProb),
      draw: drawProb,
      away: (1 - homeAdvantage) * (1 - drawProb),
    };
  }

  /**
   * Converte differenza xG in probabilità
   */
  private xGDiffToProbs(xGDiff: number) {
    const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
    
    const homeAdvantage = sigmoid(xGDiff);
    const drawProb = 0.25;
    
    return {
      home: homeAdvantage * (1 - drawProb),
      draw: drawProb,
      away: (1 - homeAdvantage) * (1 - drawProb),
    };
  }

  /**
   * Calcola il punteggio atteso
   * 🆕 Integra anche la forma recente (goals per game)
   */
  private calculateExpectedScore(
    h2hAnalysis: any,
    formAnalysis: any, // 🆕
    statsAnalysis: any,
    xGAnalysis: any
  ) {
    const totalWeight = h2hAnalysis.weight + formAnalysis.weight + statsAnalysis.weight + xGAnalysis.weight;
    const h2hW = h2hAnalysis.weight / totalWeight;
    const formW = formAnalysis.weight / totalWeight; // 🆕
    const statsW = statsAnalysis.weight / totalWeight;
    const xGW = xGAnalysis.weight / totalWeight;

    // Media ponderata dei goal attesi (4 fonti)
    const homeGoals = 
      (h2hAnalysis.avgHomeGoals * h2hW) +
      (formAnalysis.homeGoalsPerGame * formW) + // 🆕
      (statsAnalysis.homeAttack * statsW) +
      (xGAnalysis.homeAvgXG * xGW);

    const awayGoals = 
      (h2hAnalysis.avgAwayGoals * h2hW) +
      (formAnalysis.awayGoalsPerGame * formW) + // 🆕
      (statsAnalysis.awayAttack * statsW) +
      (xGAnalysis.awayAvgXG * xGW);

    return {
      home: Math.round(homeGoals * 10) / 10,
      away: Math.round(awayGoals * 10) / 10,
    };
  }

  /**
   * Calcola la confidence della predizione (0-100)
   * 🌍 SEASONAL FIX: Penalizza dati vecchi e Q1 (inverno)
   * 🆕 FORM BOOST: Aggiunge bonus/penalità per streak lunghi
   */
  private calculateConfidence(
    h2hAnalysis: any,
    formAnalysis: any, // 🆕
    statsAnalysis: any,
    xGAnalysis: any,
    homeXGMatches: FixtureXGData[],
    awayXGMatches: FixtureXGData[],
    fixtureDate?: Date
  ): number {
    // La confidence aumenta con:
    // 1. Più dati disponibili (h2h, form, stats, xG)
    // 2. Maggiore concordanza tra i diversi metodi
    // 3. Streak forti e consistenti

    let dataAvailability = 
      (h2hAnalysis.weight > 0 ? 25 : 0) +
      (formAnalysis.weight > 0 ? 25 : 0) + // 🆕
      (statsAnalysis.weight > 0 ? 25 : 0) +
      (xGAnalysis.weight > 0 ? 25 : 0);

    // 🌍 SEASONAL FIX: Penalizza se dati xG troppo vecchi
    if (fixtureDate && (homeXGMatches.length > 0 || awayXGMatches.length > 0)) {
      const allXGMatches = [...homeXGMatches, ...awayXGMatches];
      const avgAge = allXGMatches.reduce((sum, m) => {
        const daysDiff = Math.floor((fixtureDate.getTime() - new Date(m.date).getTime()) / (1000 * 60 * 60 * 24));
        return sum + daysDiff;
      }, 0) / allXGMatches.length;
      
      // Penalizza se dati mediamente >90 giorni vecchi
      if (avgAge > 90) {
        dataAvailability *= 0.5;
        console.log(`   ⚠️ Data quality penalty: avg age ${avgAge.toFixed(0)} days → confidence reduced by 50%`);
      }
    }

    // 🆕 FORM BOOST: Bonus per streak forti (3+ consecutive wins/losses)
    const homeStreakAbs = Math.abs(formAnalysis.homeStreak);
    const awayStreakAbs = Math.abs(formAnalysis.awayStreak);
    
    if (homeStreakAbs >= 3 || awayStreakAbs >= 3) {
      const streakBonus = Math.max(homeStreakAbs, awayStreakAbs) >= 5 ? 10 : 5;
      dataAvailability += streakBonus;
      console.log(`   🔥 Streak bonus: ${Math.max(homeStreakAbs, awayStreakAbs)} consecutive → +${streakBonus}% confidence`);
    }

    // 🌍 SEASONAL FIX: Penalizza Q1 (Gen-Feb) - periodo più imprevedibile
    if (fixtureDate) {
      const month = fixtureDate.getMonth() + 1;
      if (month <= 2) {
        dataAvailability *= 0.8;
        console.log(`   ❄️ Q1 seasonal penalty: confidence reduced by 20% (winter unpredictability)`);
      }
    }

    return Math.round(Math.min(100, dataAvailability)); // Cap a 100%
  }

  /**
   * Determina quale squadra ha il vantaggio
   */
  private determineAdvantage(homeValue: number, awayValue: number): 'home' | 'away' | 'neutral' {
    const diff = Math.abs(homeValue - awayValue);
    
    if (diff < 0.1) return 'neutral';
    return homeValue > awayValue ? 'home' : 'away';
  }
}

export const mlPredictionAlgorithm = new MLPredictionAlgorithm();
