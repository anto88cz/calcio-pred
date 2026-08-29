/**
 * Motore Empirico - Calcolo probabilità da dati storici
 * Analizza ultime N partite con time-decay
 */

import { MatchHistoryData } from '../sportsmonks';
import logger from '../../utils/logger';
import type { EmpiricResult } from '../../types';

export class EmpiricEngine {
  /**
   * Calcola probabilità da storico con time-decay
   */
  calculate(
    homeHistory: MatchHistoryData[],
    awayHistory: MatchHistoryData[],
    decayFactor: number = 0.95
  ): EmpiricResult {
    logger.info({ 
      homeMatches: homeHistory.length, 
      awayMatches: awayHistory.length 
    }, 'Calculating empiric probabilities');

    // Applica time-decay ai match
    const homeWeighted = this.applyTimeDecay(homeHistory, decayFactor);
    const awayWeighted = this.applyTimeDecay(awayHistory, decayFactor);

    // Calcola risultati ponderati
    const homeResults = this.analyzeResults(homeWeighted);
    const awayResults = this.analyzeResults(awayWeighted);

    // Calcola probabilità 1X2
    const { prob1, probX, prob2 } = this.calculate1X2(homeResults, awayResults);

    // Calcola Under/Over
    const underOver = this.calculateUnderOver(homeResults, awayResults);

    // Calcola BTTS
    const btts = this.calculateBTTS(homeResults, awayResults);

    // Calcola Doppia Chance
    const doubleChance = this.calculateDoubleChance(prob1, probX, prob2);

    // Calcola recenza media
    const avgRecency = this.calculateAverageRecency(homeWeighted, awayWeighted);

    return {
      prob1,
      probX,
      prob2,
      underOver,
      btts,
      doubleChance,
      homeMatchesUsed: homeHistory.length,
      awayMatchesUsed: awayHistory.length,
      avgRecency,
    };
  }

  /**
   * Applica time-decay ai match con pesatura a fasce temporali
   * Sistema a 3 fasce:
   * - Recente (0-60 giorni): peso 1.0 (100%)
   * - Medio (60-150 giorni): peso 0.7 (70%) 
   * - Storico (150+ giorni): peso 0.4 (40%)
   * + decay esponenziale all'interno di ogni fascia
   */
  private applyTimeDecay(
    matches: MatchHistoryData[],
    decayFactor: number
  ): Array<{ match: MatchHistoryData; weight: number }> {
    const now = new Date();
    
    return matches.map((match, index) => {
      // Calcola giorni dalla partita
      const matchDate = match.date instanceof Date ? match.date : new Date(match.date);
      const daysSince = (now.getTime() - matchDate.getTime()) / (1000 * 60 * 60 * 24);
      
      // Peso base in base alla fascia temporale
      let baseWeight: number;
      if (daysSince <= 60) {
        // Fascia RECENTE (0-60 giorni): peso massimo
        baseWeight = 1.0;
      } else if (daysSince <= 150) {
        // Fascia MEDIA (60-150 giorni): peso ridotto
        baseWeight = 0.7;
      } else {
        // Fascia STORICA (150+ giorni): peso minimo
        baseWeight = 0.4;
      }
      
      // Applica decay esponenziale per posizione (partite più recenti nell'array)
      const positionDecay = Math.pow(decayFactor, index);
      
      // Peso finale = base * decay posizione
      const finalWeight = baseWeight * positionDecay;
      
      return {
        match,
        weight: finalWeight,
      };
    });
  }

  /**
   * Analizza risultati ponderati
   */
  private analyzeResults(
    weighted: Array<{ match: MatchHistoryData; weight: number }>
  ): {
    wins: number;
    draws: number;
    losses: number;
    goalsScored: number;
    goalsConceded: number;
    totalWeight: number;
    cleanSheets: number;
    btts: number;
    goalDistribution: Map<number, number>; // Distribuzione gol segnati
  } {
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let goalsScored = 0;
    let goalsConceded = 0;
    let totalWeight = 0;
    let cleanSheets = 0;
    let btts = 0;
    const goalDistribution = new Map<number, number>();

    weighted.forEach(({ match, weight }) => {
      const teamGoals = match.isHome ? match.homeGoals : match.awayGoals;
      const oppGoals = match.isHome ? match.awayGoals : match.homeGoals;

      // Accumula con peso
      goalsScored += teamGoals * weight;
      goalsConceded += oppGoals * weight;
      totalWeight += weight;

      // Risultati
      if (teamGoals > oppGoals) wins += weight;
      else if (teamGoals === oppGoals) draws += weight;
      else losses += weight;

      // Clean sheets e BTTS
      if (oppGoals === 0) cleanSheets += weight;
      if (teamGoals > 0 && oppGoals > 0) btts += weight;

      // Distribuzione gol
      const currentCount = goalDistribution.get(teamGoals) || 0;
      goalDistribution.set(teamGoals, currentCount + weight);
    });

    return {
      wins,
      draws,
      losses,
      goalsScored,
      goalsConceded,
      totalWeight,
      cleanSheets,
      btts,
      goalDistribution,
    };
  }

  /**
   * Calcola probabilità 1X2
   */
  private calculate1X2(
    homeResults: ReturnType<typeof this.analyzeResults>,
    awayResults: ReturnType<typeof this.analyzeResults>
  ): { prob1: number; probX: number; prob2: number } {
    // Forza casa (win% casa)
    const homeStrength = homeResults.wins / homeResults.totalWeight;
    
    // Forza trasferta (win% trasferta)
    const awayStrength = awayResults.wins / awayResults.totalWeight;
    
    // Draw tendency
    const homeDrawRate = homeResults.draws / homeResults.totalWeight;
    const awayDrawRate = awayResults.draws / awayResults.totalWeight;
    const avgDrawRate = (homeDrawRate + awayDrawRate) / 2;

    // Probabilità grezze
    let prob1 = homeStrength * (1 - awayStrength);
    let prob2 = awayStrength * (1 - homeStrength);
    let probX = avgDrawRate;

    // Normalizza (somma = 1)
    const total = prob1 + probX + prob2;
    prob1 = prob1 / total;
    probX = probX / total;
    prob2 = prob2 / total;

    return { prob1, probX, prob2 };
  }

  /**
   * Calcola Under/Over per diverse soglie
   */
  private calculateUnderOver(
    homeResults: ReturnType<typeof this.analyzeResults>,
    awayResults: ReturnType<typeof this.analyzeResults>
  ): { [key: string]: { under: number; over: number } } {
    // Media gol attesa = media gol casa + media gol trasferta
    const avgHomeGoals = homeResults.goalsScored / homeResults.totalWeight;
    const avgAwayGoals = awayResults.goalsScored / awayResults.totalWeight;
    const expectedGoals = avgHomeGoals + avgAwayGoals;

    // Varianza (spread dei gol)
    const homeVariance = this.calculateGoalVariance(homeResults.goalDistribution);
    const awayVariance = this.calculateGoalVariance(awayResults.goalDistribution);
    const avgVariance = (homeVariance + awayVariance) / 2;

    // Calcola per ogni soglia
    const thresholds = [0.5, 1.5, 2.5, 3.5, 4.5];
    const underOver: { [key: string]: { under: number; over: number } } = {};

    thresholds.forEach(threshold => {
      // normalCDF(x, mu, sigma) restituisce P(gol <= x), che e' l'UNDER.
      // L'Over e' il complemento.
      const under = this.normalCDF(threshold, expectedGoals, Math.sqrt(avgVariance));

      underOver[threshold.toString()] = {
        under,
        over: 1 - under,
      };
    });

    return underOver;
  }

  /**
   * Calcola BTTS (Both Teams To Score)
   */
  private calculateBTTS(
    homeResults: ReturnType<typeof this.analyzeResults>,
    awayResults: ReturnType<typeof this.analyzeResults>
  ): { yes: number; no: number } {
    // Probabilità che casa segni
    const homeScoreProbability = 1 - (homeResults.goalDistribution.get(0) || 0) / homeResults.totalWeight;
    
    // Probabilità che trasferta segni
    const awayScoreProbability = 1 - (awayResults.goalDistribution.get(0) || 0) / awayResults.totalWeight;

    // BTTS Yes = entrambe segnano
    const bttsYes = homeScoreProbability * awayScoreProbability;
    
    // BTTS No = almeno una non segna
    const bttsNo = 1 - bttsYes;

    return { yes: bttsYes, no: bttsNo };
  }

  /**
   * Calcola Doppia Chance
   */
  private calculateDoubleChance(
    prob1: number,
    probX: number,
    prob2: number
  ): { '1X': number; '12': number; 'X2': number } {
    return {
      '1X': prob1 + probX, // Home win or Draw
      '12': prob1 + prob2, // Home win or Away win
      'X2': probX + prob2, // Draw or Away win
    };
  }

  /**
   * Calcola varianza distribuzione gol
   */
  private calculateGoalVariance(distribution: Map<number, number>): number {
    let totalWeight = 0;
    let sumGoals = 0;

    distribution.forEach((weight, goals) => {
      totalWeight += weight;
      sumGoals += goals * weight;
    });

    const mean = sumGoals / totalWeight;
    let variance = 0;

    distribution.forEach((weight, goals) => {
      variance += weight * Math.pow(goals - mean, 2);
    });

    return variance / totalWeight;
  }

  /**
   * CDF della normale (per approssimare over/under)
   */
  private normalCDF(x: number, mean: number, stdDev: number): number {
    const z = (x - mean) / stdDev;
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    
    return z > 0 ? 1 - prob : prob;
  }

  /**
   * Calcola recenza media (0-1, 1 = molto recente)
   */
  private calculateAverageRecency(
    homeWeighted: Array<{ match: MatchHistoryData; weight: number }>,
    awayWeighted: Array<{ match: MatchHistoryData; weight: number }>
  ): number {
    const allWeights = [...homeWeighted, ...awayWeighted];
    
    if (allWeights.length === 0) return 0;

    const avgWeight = allWeights.reduce((sum, item) => sum + item.weight, 0) / allWeights.length;
    
    return avgWeight;
  }

  /**
   * Calcola confidence dalla qualità dei dati empirici
   */
  calculateDataConfidence(
    homeHistory: MatchHistoryData[],
    awayHistory: MatchHistoryData[],
    requiredMatches: number = 20
  ): number {
    const homeCount = homeHistory.length;
    const awayCount = awayHistory.length;
    const totalCount = homeCount + awayCount;

    // Completezza (0-1)
    const completeness = Math.min(totalCount / (requiredMatches * 2), 1.0);

    // Balance home/away (0-1)
    const balance = totalCount > 0 
      ? 1 - Math.abs(homeCount - awayCount) / totalCount
      : 0;

    // Recenza (verifica che i match siano recenti)
    const now = new Date();
    const recentMatches = [...homeHistory, ...awayHistory].filter(match => {
      const matchDate = match.date instanceof Date ? match.date : new Date(match.date);
      const daysSince = (now.getTime() - matchDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince <= 365; // Ultimi 12 mesi
    });
    const recency = recentMatches.length / totalCount;

    // Confidence finale
    return completeness * 0.4 + balance * 0.3 + recency * 0.3;
  }
}

export const empiricEngine = new EmpiricEngine();
