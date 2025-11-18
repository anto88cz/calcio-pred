import { 
  mlDataFetcher, 
  HeadToHeadMatch, 
  TeamSeasonStats, 
  FixtureXGData 
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
    
    // Q1: Gen-Feb (winter, more draws)
    if (month <= 2) return 1.15;
    
    // Q2: Mar-Mag (spring, moderate draws)
    if (month <= 5) return 1.05;
    
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
    const [h2hMatches, homeStats, awayStats, homeXGMatches, awayXGMatches] = await Promise.all([
      mlDataFetcher.getHeadToHeadData(input.homeTeamId, input.awayTeamId, maxDate),
      mlDataFetcher.getTeamSeasonStats(input.homeTeamId, input.seasonId, input.leagueId),
      mlDataFetcher.getTeamSeasonStats(input.awayTeamId, input.seasonId, input.leagueId),
      mlDataFetcher.getTeamRecentXGMatches(input.homeTeamId, input.seasonId, 10, maxDate),
      mlDataFetcher.getTeamRecentXGMatches(input.awayTeamId, input.seasonId, 10, maxDate),
    ]);

    // Analizza i testa a testa
    const h2hAnalysis = this.analyzeHeadToHead(h2hMatches, input.homeTeamId, input.awayTeamId);

    // Analizza le statistiche stagionali
    const statsAnalysis = this.analyzeSeasonStats(homeStats, awayStats);

    // Analizza i dati xG
    const xGAnalysis = this.analyzeXGData(
      homeXGMatches, 
      awayXGMatches, 
      input.homeTeamId, 
      input.awayTeamId
    );

    // Calcola le probabilità finali usando un sistema di pesi
    const prediction = this.calculateFinalPrediction(
      h2hAnalysis,
      statsAnalysis,
      xGAnalysis,
      maxDate // 🌍 Pass fixture date for seasonal adjustments
    );

    // Calcola il punteggio atteso
    const expectedScore = this.calculateExpectedScore(
      h2hAnalysis,
      statsAnalysis,
      xGAnalysis
    );

    // Determina la confidence della predizione
    const confidence = this.calculateConfidence(
      h2hAnalysis,
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

    // Il peso aumenta con il numero di partite, ma si stabilizza
    const weight = Math.min(totalMatches / 20, 0.3);

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

    const weight = (homeStats && awayStats) ? 0.4 : 0.2;

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

    const weight = (homeMatches.length > 0 && awayMatches.length > 0) ? 0.3 : 0.1;

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
   */
  private calculateFinalPrediction(
    h2hAnalysis: any,
    statsAnalysis: any,
    xGAnalysis: any,
    fixtureDate?: Date
  ) {
    // Normalizza i pesi
    const totalWeight = h2hAnalysis.weight + statsAnalysis.weight + xGAnalysis.weight;
    const h2hW = h2hAnalysis.weight / totalWeight;
    const statsW = statsAnalysis.weight / totalWeight;
    const xGW = xGAnalysis.weight / totalWeight;

    // Calcola probabilità da h2h
    const h2hProbs = {
      home: h2hAnalysis.homeWinRate,
      draw: h2hAnalysis.drawRate,
      away: h2hAnalysis.awayWinRate,
    };

    // Calcola probabilità dalle statistiche stagionali
    const strengthDiff = statsAnalysis.homeStrength - statsAnalysis.awayStrength;
    const statsProbs = this.strengthToProbs(strengthDiff);

    // Calcola probabilità dai dati xG
    const xGDiff = xGAnalysis.homeXGDiff - xGAnalysis.awayXGDiff;
    const xGProbs = this.xGDiffToProbs(xGDiff);

    // Combina con i pesi
    let homeWin = (h2hProbs.home * h2hW) + (statsProbs.home * statsW) + (xGProbs.home * xGW);
    let draw = (h2hProbs.draw * h2hW) + (statsProbs.draw * statsW) + (xGProbs.draw * xGW);
    let awayWin = (h2hProbs.away * h2hW) + (statsProbs.away * statsW) + (xGProbs.away * xGW);

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
   */
  private calculateExpectedScore(
    h2hAnalysis: any,
    statsAnalysis: any,
    xGAnalysis: any
  ) {
    const totalWeight = h2hAnalysis.weight + statsAnalysis.weight + xGAnalysis.weight;
    const h2hW = h2hAnalysis.weight / totalWeight;
    const statsW = statsAnalysis.weight / totalWeight;
    const xGW = xGAnalysis.weight / totalWeight;

    // Media ponderata dei goal attesi
    const homeGoals = 
      (h2hAnalysis.avgHomeGoals * h2hW) +
      (statsAnalysis.homeAttack * statsW) +
      (xGAnalysis.homeAvgXG * xGW);

    const awayGoals = 
      (h2hAnalysis.avgAwayGoals * h2hW) +
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
   */
  private calculateConfidence(
    h2hAnalysis: any,
    statsAnalysis: any,
    xGAnalysis: any,
    homeXGMatches: FixtureXGData[],
    awayXGMatches: FixtureXGData[],
    fixtureDate?: Date
  ): number {
    // La confidence aumenta con:
    // 1. Più dati disponibili (h2h, stats, xG)
    // 2. Maggiore concordanza tra i diversi metodi

    let dataAvailability = 
      (h2hAnalysis.weight > 0 ? 33 : 0) +
      (statsAnalysis.weight > 0 ? 33 : 0) +
      (xGAnalysis.weight > 0 ? 34 : 0);

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

    // 🌍 SEASONAL FIX: Penalizza Q1 (Gen-Feb) - periodo più imprevedibile
    if (fixtureDate) {
      const month = fixtureDate.getMonth() + 1;
      if (month <= 2) {
        dataAvailability *= 0.8;
        console.log(`   ❄️ Q1 seasonal penalty: confidence reduced by 20% (winter unpredictability)`);
      }
    }

    return Math.round(dataAvailability);
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
