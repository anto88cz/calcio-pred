/**
 * Confidence Calculator con xG Adjustment
 * Calcola confidence basato su qualità dati, recenza, stabilità, lineup, infortuni, xG
 */

import { MatchHistoryData, PlayerInjuryInfo, LineupInfo } from '../api-football';
import logger from '../../utils/logger';
import type { ConfidenceFactors, ConfidenceLevel } from '../../types';

export interface XGConfidenceData {
  xgHome: number | null;
  xgAway: number | null;
  lambdaHome: number;
  lambdaAway: number;
  missingXg: boolean;
  lowXgConsistency: boolean;
  xgDivergenceThreshold: number; // Default 0.60 (60%)
}

export class ConfidenceCalculator {
  /**
   * Calcola confidence complessiva con xG adjustment
   */
  calculate(
    homeHistory: MatchHistoryData[],
    awayHistory: MatchHistoryData[],
    injuries: PlayerInjuryInfo[],
    lineups: LineupInfo[],
    requiredMatches: number = 20,
    xgData?: XGConfidenceData
  ): ConfidenceFactors {
    logger.info('Calculating confidence factors');

    // 1. Disponibilità dati
    const dataAvailability = this.calculateDataAvailability(
      homeHistory,
      awayHistory,
      requiredMatches
    );

    // 2. Recenza dati
    const recency = this.calculateRecency(homeHistory, awayHistory);

    // 3. Stabilità risultati
    const stability = this.calculateStability(homeHistory, awayHistory);

    // 4. Status lineup
    const lineupStatus = this.calculateLineupStatus(lineups);

    // 5. Impatto infortuni
    const injuryImpact = this.calculateInjuryImpact(injuries);

    // Confidence finale (media ponderata)
    let overall = 
      dataAvailability * 0.30 +  // 30% disponibilità dati
      recency * 0.20 +            // 20% recenza
      stability * 0.25 +          // 25% stabilità
      lineupStatus * 0.15 +       // 15% lineup
      injuryImpact * 0.10;        // 10% infortuni

    // 6. xG Adjustment
    if (xgData) {
      const xgAdjustment = this.calculateXGAdjustment(xgData);
      overall = Math.max(0, Math.min(1, overall + xgAdjustment));
      
      logger.info({
        xgAdjustment: xgAdjustment.toFixed(3),
        overallBefore: (overall - xgAdjustment).toFixed(3),
        overallAfter: overall.toFixed(3),
      }, 'xG adjustment applied to confidence');
    }

    const level = this.getConfidenceLevel(overall);

    logger.info({ 
      overall: overall.toFixed(3),
      level,
      dataAvailability: dataAvailability.toFixed(3),
      recency: recency.toFixed(3),
      stability: stability.toFixed(3),
      lineupStatus: lineupStatus.toFixed(3),
      injuryImpact: injuryImpact.toFixed(3),
    }, 'Confidence calculated');

    return {
      dataAvailability,
      recency,
      stability,
      lineupStatus,
      injuryImpact,
      overall,
      level,
    };
  }

  /**
   * 1. Disponibilità dati (0-1)
   */
  private calculateDataAvailability(
    homeHistory: MatchHistoryData[],
    awayHistory: MatchHistoryData[],
    required: number
  ): number {
    const homeCount = homeHistory.length;
    const awayCount = awayHistory.length;
    const totalCount = homeCount + awayCount;

    // Completezza (target: required*2 partite totali)
    const completeness = Math.min(totalCount / (required * 2), 1.0);

    // Balance home/away (ideale: 50/50)
    const balance = totalCount > 0
      ? 1 - Math.abs(homeCount - awayCount) / totalCount
      : 0;

    // Score finale
    return completeness * 0.7 + balance * 0.3;
  }

  /**
   * 2. Recenza dati (0-1)
   */
  private calculateRecency(
    homeHistory: MatchHistoryData[],
    awayHistory: MatchHistoryData[]
  ): number {
    const allMatches = [...homeHistory, ...awayHistory];
    
    if (allMatches.length === 0) return 0;

    const now = new Date();
    let totalRecencyScore = 0;

    allMatches.forEach(match => {
      const daysSince = (now.getTime() - match.date.getTime()) / (1000 * 60 * 60 * 24);
      
      // Score decrescente con il tempo
      // 100% se <30 giorni, decresce linearmente fino a 0% a 365 giorni
      let recencyScore: number;
      if (daysSince <= 30) {
        recencyScore = 1.0;
      } else if (daysSince <= 365) {
        recencyScore = 1.0 - ((daysSince - 30) / 335);
      } else {
        recencyScore = 0;
      }

      totalRecencyScore += recencyScore;
    });

    return totalRecencyScore / allMatches.length;
  }

  /**
   * 3. Stabilità risultati (0-1)
   * Misura consistenza: bassa varianza = alta confidence
   */
  private calculateStability(
    homeHistory: MatchHistoryData[],
    awayHistory: MatchHistoryData[]
  ): number {
    const homeStability = this.calculateTeamStability(homeHistory);
    const awayStability = this.calculateTeamStability(awayHistory);

    return (homeStability + awayStability) / 2;
  }

  private calculateTeamStability(history: MatchHistoryData[]): number {
    if (history.length < 3) return 0.5; // Baseline per pochi dati

    // Calcola varianza gol segnati e subiti
    const goals = history.map(m => m.isHome ? m.homeGoals : m.awayGoals);
    const goalsAgainst = history.map(m => m.isHome ? m.awayGoals : m.homeGoals);

    const goalsVariance = this.calculateVariance(goals);
    const goalsAgainstVariance = this.calculateVariance(goalsAgainst);

    // Normalizza varianza (0-9 gol² -> 0-1)
    const normalizedGoalsVar = 1 - Math.min(goalsVariance / 9, 1);
    const normalizedAgainstVar = 1 - Math.min(goalsAgainstVariance / 9, 1);

    // Calcola consistenza risultati (W-D-L pattern)
    const resultsConsistency = this.calculateResultsConsistency(history);

    return normalizedGoalsVar * 0.3 + normalizedAgainstVar * 0.3 + resultsConsistency * 0.4;
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateResultsConsistency(history: MatchHistoryData[]): number {
    if (history.length < 5) return 0.5;

    // Ultimi 5 match: calcola entropia
    const recent = history.slice(0, 5);
    let wins = 0, draws = 0, losses = 0;

    recent.forEach(match => {
      const teamGoals = match.isHome ? match.homeGoals : match.awayGoals;
      const oppGoals = match.isHome ? match.awayGoals : match.homeGoals;

      if (teamGoals > oppGoals) wins++;
      else if (teamGoals === oppGoals) draws++;
      else losses++;
    });

    // Distribuzione uniforme = bassa consistenza
    // Distribuzione concentrata = alta consistenza
    const total = recent.length;
    const probs = [wins / total, draws / total, losses / total].filter(p => p > 0);
    
    // Calcola entropia
    const entropy = -probs.reduce((sum, p) => sum + p * Math.log2(p), 0);
    const maxEntropy = Math.log2(3); // Max per 3 outcomes

    // Inverte: bassa entropia = alta consistenza
    return 1 - (entropy / maxEntropy);
  }

  /**
   * 4. Status lineup (0-1)
   */
  private calculateLineupStatus(lineups: LineupInfo[]): number {
    if (lineups.length === 0) {
      // Nessuna lineup disponibile = baseline
      return 0.5;
    }

    if (lineups.length !== 2) {
      // Lineup parziale
      return 0.6;
    }

    // Verifica lineup complete
    const allComplete = lineups.every(lineup => 
      lineup.startingXI.length === 11 && lineup.formation
    );

    if (allComplete) {
      return 1.0; // Lineup complete confermate
    }

    // Lineup parzialmente complete
    const avgPlayers = lineups.reduce((sum, lineup) => 
      sum + lineup.startingXI.length, 0
    ) / lineups.length;

    return 0.5 + (avgPlayers / 11) * 0.5;
  }

  /**
   * 5. Impatto infortuni (0-1)
   * 1 = nessun impatto, 0 = impatto massimo
   */
  private calculateInjuryImpact(injuries: PlayerInjuryInfo[]): number {
    if (injuries.length === 0) return 1.0; // Nessun infortunio

    // Peso per tipo infortunio
    const typeWeights: Record<string, number> = {
      'Injury': 0.35,       // Infortunio grave
      'Suspended': 0.30,    // Squalifica
      'Missing': 0.20,      // Assenza
      'Doubtful': 0.10,     // Dubbio
    };

    let totalImpact = 0;

    injuries.forEach(injury => {
      const weight = typeWeights[injury.type] || 0.15;
      totalImpact += weight;
    });

    // Normalizza (5 infortuni gravi = confidence 0)
    const normalizedImpact = Math.min(totalImpact / 1.5, 1.0);

    return 1.0 - normalizedImpact;
  }

  /**
   * 6. xG Adjustment (confidence bonus/malus)
   * +0.05 se xG presenti e coerenti
   * -0.05 se xG mancanti o divergenti >60%
   */
  private calculateXGAdjustment(xgData: XGConfidenceData): number {
    // Caso 1: xG completamente mancanti
    if (xgData.missingXg || xgData.xgHome === null || xgData.xgAway === null) {
      logger.debug('xG missing → confidence -0.05');
      return -0.05;
    }

    // Caso 2: xG presente ma flag lowXgConsistency attivo
    if (xgData.lowXgConsistency) {
      logger.debug('xG low consistency → confidence -0.05');
      return -0.05;
    }

    // Caso 3: Verifica divergenza manuale
    const xgTotal = xgData.xgHome + xgData.xgAway;
    const lambdaTotal = xgData.lambdaHome + xgData.lambdaAway;
    const divergence = Math.abs(xgTotal - lambdaTotal) / lambdaTotal;

    if (divergence > xgData.xgDivergenceThreshold) {
      logger.debug({
        xgTotal: xgTotal.toFixed(2),
        lambdaTotal: lambdaTotal.toFixed(2),
        divergence: (divergence * 100).toFixed(1) + '%',
        threshold: (xgData.xgDivergenceThreshold * 100).toFixed(0) + '%',
      }, 'xG divergence > threshold → confidence -0.05');
      return -0.05;
    }

    // Caso 4: xG presenti e coerenti → bonus
    logger.debug({
      xgTotal: xgTotal.toFixed(2),
      lambdaTotal: lambdaTotal.toFixed(2),
      divergence: (divergence * 100).toFixed(1) + '%',
    }, 'xG consistent → confidence +0.05');
    return +0.05;
  }

  /**
   * Classifica confidence level
   */
  private getConfidenceLevel(confidence: number): ConfidenceLevel {
    if (confidence >= 0.85) return 'VERY_HIGH';
    if (confidence >= 0.70) return 'HIGH';
    if (confidence >= 0.50) return 'MEDIUM';
    if (confidence >= 0.30) return 'LOW';
    return 'VERY_LOW';
  }

  /**
   * Verifica se confidence è sufficiente per badge GIOCALA
   */
  isSufficientForGiocala(confidence: number, minThreshold: number = 0.60): boolean {
    return confidence >= minThreshold;
  }
}

export const confidenceCalculator = new ConfidenceCalculator();
