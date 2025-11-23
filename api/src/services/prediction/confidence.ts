/**
 * Confidence Calculator con xG Adjustment
 * Calcola confidence basato su qualità dati, recenza, stabilità, lineup, infortuni, xG
 */

import { MatchHistoryData, PlayerInjuryInfo, LineupInfo } from '../sportsmonks';
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
   * 2. Recenza dati (0-1) - Sistema a fasce ottimizzato
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
      const matchDate = match.date instanceof Date ? match.date : new Date(match.date);
      const daysSince = (now.getTime() - matchDate.getTime()) / (1000 * 60 * 60 * 24);
      
      // Sistema a fasce temporali ottimizzato
      let recencyScore: number;
      
      if (daysSince <= 30) {
        // Ultimi 30 giorni: peso massimo (100%)
        recencyScore = 1.0;
      } else if (daysSince <= 60) {
        // 30-60 giorni: peso alto (90-100%)
        recencyScore = 1.0 - ((daysSince - 30) / 300); // Decay lento
      } else if (daysSince <= 120) {
        // 60-120 giorni: peso medio (70-90%)
        recencyScore = 0.9 - ((daysSince - 60) / 300);
      } else if (daysSince <= 180) {
        // 120-180 giorni: peso ridotto (50-70%)
        recencyScore = 0.7 - ((daysSince - 120) / 300);
      } else if (daysSince <= 365) {
        // 180-365 giorni: peso basso (20-50%)
        recencyScore = 0.5 - ((daysSince - 180) / 617);
      } else {
        // Oltre 365 giorni: peso minimo (10-20%)
        recencyScore = Math.max(0.1, 0.2 - ((daysSince - 365) / 1825));
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
   * 
   * NUOVO APPROCCIO BRUTALE:
   * - Se NON ci sono lineups: penalità del 20% (0.8) perché non sai chi gioca
   * - Se ci sono lineups incomplete (<11 giocatori): penalità progressiva
   * - Se ci sono lineups complete (11 titolari): bonus pieno (1.0)
   * - Se lineups confermate + formazioni note: bonus extra (1.1)
   * 
   * RAZIONALE:
   * Le lineups sono CRITICHE. Non sapere chi gioca = alta incertezza.
   * Esempio: se Mbappé è infortunato e non lo sai, la tua previsione è spazzatura.
   */
  private calculateLineupStatus(lineups: LineupInfo[]): number {
    if (lineups.length === 0) {
      // NESSUNA lineup disponibile = ALTA incertezza
      // Stai scommettendo senza sapere chi scende in campo
      // Penalità: -20% (0.8 invece di 1.0)
      return 0.80;
    }

    if (lineups.length === 1) {
      // Solo UNA lineup (home o away) = incertezza moderata
      // Sai metà della storia, manca l'altra metà
      const lineup = lineups[0];
      const completeness = Math.min(lineup.startingXI.length / 11, 1.0);
      
      // Penalità: -15% base + recupero parziale se lineup completa
      return 0.85 * completeness;
    }

    // ENTRAMBE le lineups disponibili
    const homeLineup = lineups[0];
    const awayLineup = lineups[1];

    // Calcola completezza media (% giocatori presenti)
    const homeCompleteness = Math.min(homeLineup.startingXI.length / 11, 1.0);
    const awayCompleteness = Math.min(awayLineup.startingXI.length / 11, 1.0);
    const avgCompleteness = (homeCompleteness + awayCompleteness) / 2;

    // Base score: completezza media
    let score = avgCompleteness;

    // BONUS: Lineups confermate (non probabili)
    const bothConfirmed = homeLineup.confirmed && awayLineup.confirmed;
    if (bothConfirmed) {
      score *= 1.05; // +5% se confermate
    }

    // BONUS: Formazioni note (tattica chiara)
    const bothHaveFormation = 
      homeLineup.formation && homeLineup.formation !== 'Unknown' &&
      awayLineup.formation && awayLineup.formation !== 'Unknown';
    
    if (bothHaveFormation) {
      score *= 1.05; // +5% se formazioni note
    }

    // Cap massimo a 1.1 (bonus totale +10% se tutto perfetto)
    return Math.min(score, 1.10);
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
