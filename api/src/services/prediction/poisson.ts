/**
 * Motore Poisson con correzione Dixon-Coles + xG Integration
 * Calcolo probabilità basato su distribuzione di Poisson
 * Con calibrazione verso Expected Goals (xG) da API-FOOTBALL
 */

import { MatchHistoryData } from '../api-football';
import logger from '../../utils/logger';
import type { PoissonResult } from '../../types';

export interface XGCalibrationData {
  xgHome: number | null;
  xgAway: number | null;
  xgBlendWeight?: number; // Default 0.30 (30%)
}

export class PoissonEngine {
  // Correzione Dixon-Coles: RHO dinamico invece di fisso
  // OLD: private readonly RHO = -0.1;
  
  /**
   * Calcola RHO dinamico basato su lambda totali e caratteristiche del match
   * 
   * @param lambdaHome - Goal attesi casa
   * @param lambdaAway - Goal attesi trasferta
   * @returns RHO ottimale per questo match (0.05 a 0.20 - POSITIVO per RIDURRE 1-1)
   * 
   * Logica:
   * - Match ad alto punteggio (>3.0 gol attesi): RHO più alto (0.15)
   *   → Maggiore correzione per evitare sovrastima di punteggi bassi
   * 
   * - Match a basso punteggio (<2.0 gol attesi): RHO più basso (0.08)
   *   → Correzione più leggera, i punteggi bassi sono già probabili
   * 
   * - Match ad altissimo punteggio (>4.0 gol): RHO molto alto (0.18)
   *   → Forte penalizzazione di 0-0, 1-1 che sono improbabili
   * 
   * - Match molto difensivi (<1.5 gol): RHO minimo (0.05)
   *   → Quasi nessuna correzione, la Poisson pura è già accurata
   * 
   * - Match squilibrati (|λhome - λaway| > 1.5): RHO moderato (0.12)
   *   → Correzione standard con leggero boost per favorito
   * 
   * IMPORTANTE: RHO è POSITIVO perché tau11 = 1 - rho DEVE ridurre 1-1
   */
  private calculateDynamicRho(
    lambdaHome: number, 
    lambdaAway: number
  ): number {
    const totalLambda = lambdaHome + lambdaAway;
    const lambdaDiff = Math.abs(lambdaHome - lambdaAway);
    
    // Match ad altissimo punteggio (>4.0 gol attesi totali)
    // Es: Man City (2.8) vs Brighton (1.5) = 4.3 gol
    if (totalLambda > 4.0) {
      return 0.18; // Forte penalizzazione 0-0, 1-1
    }
    
    // Match ad alto punteggio (3.0-4.0 gol attesi)
    // Es: Liverpool (2.2) vs Newcastle (1.2) = 3.4 gol
    if (totalLambda > 3.0) {
      return 0.15; // Correzione aumentata
    }
    
    // Match molto difensivi (<1.5 gol attesi totali)
    // Es: Atletico Madrid (0.8) vs Getafe (0.6) = 1.4 gol
    if (totalLambda < 1.5) {
      return 0.05; // Correzione minima, 0-0 è già probabile
    }
    
    // Match a basso punteggio (1.5-2.0 gol attesi)
    // Es: Inter (1.3) vs Milan (0.9) = 2.2 gol
    if (totalLambda < 2.0) {
      return 0.08; // Correzione leggera
    }
    
    // Match molto squilibrati (differenza >1.5 gol)
    // Es: Bayern (2.8) vs Augsburg (0.9) = diff 1.9
    if (lambdaDiff > 1.5) {
      return 0.12; // Correzione moderata, favorito dominante
    }
    
    // Match equilibrati o standard (2.0-3.0 gol, diff <1.5)
    // Es: Arsenal (1.6) vs Chelsea (1.3) = 2.9 gol
    return 0.10; // RHO standard (default Dixon-Coles originale)
  }

  /**
   * Calcola probabilità con modello Poisson + xG calibration
   */
  calculate(
    homeHistory: MatchHistoryData[],
    awayHistory: MatchHistoryData[],
    homeAdvantage: number = 0.0, // Fattore casa rimosso
    xgData?: XGCalibrationData
  ): PoissonResult {
    logger.info({ 
      homeMatches: homeHistory.length, 
      awayMatches: awayHistory.length,
      homeAdvantage,
      hasXG: !!xgData && xgData.xgHome !== null && xgData.xgAway !== null
    }, 'Calculating Poisson probabilities');

    // Calcola lambda base da storico
    let lambdaHome = this.calculateLambda(homeHistory, true) + homeAdvantage;
    let lambdaAway = this.calculateLambda(awayHistory, false);

    // Applica calibrazione xG se disponibile
    if (xgData && (xgData.xgHome !== null || xgData.xgAway !== null)) {
      const calibrated = this.calibrateWithXG(lambdaHome, lambdaAway, xgData);
      lambdaHome = calibrated.lambdaHome;
      lambdaAway = calibrated.lambdaAway;
      
      logger.info({
        lambdaHomeOriginal: (lambdaHome - homeAdvantage).toFixed(2),
        lambdaHomeCalibrated: lambdaHome.toFixed(2),
        lambdaAwayOriginal: this.calculateLambda(awayHistory, false).toFixed(2),
        lambdaAwayCalibrated: lambdaAway.toFixed(2),
        xgHome: xgData.xgHome?.toFixed(2),
        xgAway: xgData.xgAway?.toFixed(2),
      }, 'Lambda calibrated with xG');
    }

    logger.debug({ lambdaHome, lambdaAway }, 'Final lambda values');

    // Genera matrice punteggi (0-6 gol per squadra)
    const scoreMatrix = this.generateScoreMatrix(lambdaHome, lambdaAway);

    // Applica correzione Dixon-Coles
    this.applyDixonColesCorrection(scoreMatrix, lambdaHome, lambdaAway);

    // Calcola probabilità 1X2
    const { prob1, probX, prob2 } = this.calculate1X2FromMatrix(scoreMatrix);

    // Calcola Under/Over
    const underOver = this.calculateUnderOverFromMatrix(scoreMatrix);

    // Calcola probabilità per numero esatto di gol
    const exactGoals = this.calculateExactGoalsFromMatrix(scoreMatrix);

    // Calcola BTTS
    const btts = this.calculateBTTSFromMatrix(scoreMatrix);

    // Calcola Doppia Chance
    const doubleChance = this.calculateDoubleChance(prob1, probX, prob2);

    return {
      prob1,
      probX,
      prob2,
      scoreMatrix,
      underOver,
      exactGoals,
      btts,
      doubleChance,
      lambdaHome,
      lambdaAway,
      homeAdvantage,
    };
  }

  /**
   * Calcola lambda (gol attesi) da storico con pesatura avanzata
   * Utilizza sistema a fasce temporali per dare più peso ai dati recenti
   */
  private calculateLambda(
    history: MatchHistoryData[],
    isHome: boolean
  ): number {
    if (history.length === 0) {
      // Default se nessun dato
      return isHome ? 1.5 : 1.2;
    }

    const now = new Date();
    let totalGoals = 0;
    let totalWeight = 0;

    // Sistema a fasce temporali + decay posizione
    history.forEach((match, index) => {
      const goals = match.isHome ? match.homeGoals : match.awayGoals;
      
      // Calcola giorni dalla partita
      const daysSince = (now.getTime() - match.date.getTime()) / (1000 * 60 * 60 * 24);
      
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
      
      // Decay per posizione nell'array (più recenti = maggior peso)
      const positionDecay = Math.pow(0.96, index);
      
      // Peso finale combinato
      const weight = baseWeight * positionDecay;
      
      totalGoals += goals * weight;
      totalWeight += weight;
    });

    const lambda = totalGoals / totalWeight;

    // Limita lambda a valori realistici (0.3 - 4.0)
    return Math.max(0.3, Math.min(4.0, lambda));
  }

  /**
   * Calibra lambda verso xG con blending morbido
   * Formula: lambdaFinal = (1-w)*lambdaHistorical + w*xG
   * w = xgBlendWeight (default 0.30 = 30% xG, 70% storico)
   */
  private calibrateWithXG(
    lambdaHome: number,
    lambdaAway: number,
    xgData: XGCalibrationData
  ): { lambdaHome: number; lambdaAway: number } {
    const blendWeight = xgData.xgBlendWeight ?? 0.30; // Default 30%
    const historicalWeight = 1 - blendWeight;

    let calibratedHome = lambdaHome;
    let calibratedAway = lambdaAway;

    // Calibra home se xG disponibile
    if (xgData.xgHome !== null) {
      calibratedHome = historicalWeight * lambdaHome + blendWeight * xgData.xgHome;
      // Clamp per evitare valori irrealistici
      calibratedHome = Math.max(0.3, Math.min(4.0, calibratedHome));
    }

    // Calibra away se xG disponibile
    if (xgData.xgAway !== null) {
      calibratedAway = historicalWeight * lambdaAway + blendWeight * xgData.xgAway;
      calibratedAway = Math.max(0.3, Math.min(4.0, calibratedAway));
    }

    logger.debug({
      blendWeight,
      homeOriginal: lambdaHome.toFixed(2),
      homeCalibrated: calibratedHome.toFixed(2),
      awayOriginal: lambdaAway.toFixed(2),
      awayCalibrated: calibratedAway.toFixed(2),
    }, 'xG calibration applied');

    return {
      lambdaHome: calibratedHome,
      lambdaAway: calibratedAway,
    };
  }

  /**
   * Genera matrice punteggi con Poisson
   */
  private generateScoreMatrix(
    lambdaHome: number,
    lambdaAway: number
  ): number[][] {
    const maxGoals = 7; // Matrice 7x7 (0-6 gol)
    const matrix: number[][] = [];

    for (let homeGoals = 0; homeGoals < maxGoals; homeGoals++) {
      matrix[homeGoals] = [];
      
      for (let awayGoals = 0; awayGoals < maxGoals; awayGoals++) {
        // P(X=k) = (λ^k * e^-λ) / k!
        const probHome = this.poissonProbability(homeGoals, lambdaHome);
        const probAway = this.poissonProbability(awayGoals, lambdaAway);
        
        // Probabilità congiunta (assumendo indipendenza)
        matrix[homeGoals][awayGoals] = probHome * probAway;
      }
    }

    return matrix;
  }

  /**
   * Calcola probabilità Poisson: P(X=k) = (λ^k * e^-λ) / k!
   */
  private poissonProbability(k: number, lambda: number): number {
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / this.factorial(k);
  }

  /**
   * Fattoriale
   */
  private factorial(n: number): number {
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) {
      result *= i;
    }
    return result;
  }

  /**
   * Estrae i risultati esatti più probabili dalla matrice
   * @param matrix - Matrice score con probabilità
   * @param top - Numero di risultati da restituire (default 5)
   * @returns Array di risultati ordinati per probabilità decrescente
   */
  getMostProbableScores(matrix: number[][], top: number = 5): Array<{
    homeGoals: number;
    awayGoals: number;
    probability: number;
  }> {
    const scores: Array<{
      homeGoals: number;
      awayGoals: number;
      probability: number;
    }> = [];

    // Estrai tutti i punteggi con probabilità
    for (let homeGoals = 0; homeGoals < matrix.length; homeGoals++) {
      for (let awayGoals = 0; awayGoals < matrix[homeGoals].length; awayGoals++) {
        scores.push({
          homeGoals,
          awayGoals,
          probability: matrix[homeGoals][awayGoals],
        });
      }
    }

    // Ordina per probabilità decrescente
    scores.sort((a, b) => b.probability - a.probability);

    // Restituisci top N
    return scores.slice(0, top);
  }

  /**
   * Applica correzione Dixon-Coles per punteggi bassi
   * Corregge la sovrastima di 0-0, 1-0, 0-1, 1-1
   * Usa RHO dinamico calcolato in base a lambda
   */
  private applyDixonColesCorrection(
    matrix: number[][],
    lambdaHome: number,
    lambdaAway: number
  ): void {
    // Calcola RHO dinamico per questo match specifico
    const rho = this.calculateDynamicRho(lambdaHome, lambdaAway);
    
    // Salva le probabilità originali per logging
    const original00 = matrix[0][0];
    const original10 = matrix[1][0];
    const original01 = matrix[0][1];
    const original11 = matrix[1][1];

    // Correzione per (0,0)
    const tau00 = 1 - lambdaHome * lambdaAway * rho;
    matrix[0][0] *= tau00;

    // Correzione per (1,0)
    const tau10 = 1 + lambdaAway * rho;
    matrix[1][0] *= tau10;

    // Correzione per (0,1)
    const tau01 = 1 + lambdaHome * rho;
    matrix[0][1] *= tau01;

    // Correzione per (1,1)
    const tau11 = 1 - rho;
    matrix[1][1] *= tau11;

    // Log dettagliato correzione
    logger.debug({
      lambdaHome: lambdaHome.toFixed(2),
      lambdaAway: lambdaAway.toFixed(2),
      totalLambda: (lambdaHome + lambdaAway).toFixed(2),
      rhoDynamic: rho.toFixed(3),
      corrections: {
        '0-0': {
          original: (original00 * 100).toFixed(2) + '%',
          tau: tau00.toFixed(3),
          corrected: (matrix[0][0] * 100).toFixed(2) + '%',
          delta: ((matrix[0][0] - original00) * 100).toFixed(2) + '%',
        },
        '1-0': {
          original: (original10 * 100).toFixed(2) + '%',
          tau: tau10.toFixed(3),
          corrected: (matrix[1][0] * 100).toFixed(2) + '%',
          delta: ((matrix[1][0] - original10) * 100).toFixed(2) + '%',
        },
        '0-1': {
          original: (original01 * 100).toFixed(2) + '%',
          tau: tau01.toFixed(3),
          corrected: (matrix[0][1] * 100).toFixed(2) + '%',
          delta: ((matrix[0][1] - original01) * 100).toFixed(2) + '%',
        },
        '1-1': {
          original: (original11 * 100).toFixed(2) + '%',
          tau: tau11.toFixed(3),
          corrected: (matrix[1][1] * 100).toFixed(2) + '%',
          delta: ((matrix[1][1] - original11) * 100).toFixed(2) + '%',
        },
      },
    }, 'Dixon-Coles correction applied with dynamic RHO');

    // Normalizza la matrice (somma = 1)
    this.normalizeMatrix(matrix);
  }

  /**
   * Normalizza matrice (somma = 1)
   */
  private normalizeMatrix(matrix: number[][]): void {
    let total = 0;
    
    matrix.forEach(row => {
      row.forEach(prob => {
        total += prob;
      });
    });

    if (total > 0) {
      matrix.forEach((row, i) => {
        row.forEach((prob, j) => {
          matrix[i][j] = prob / total;
        });
      });
    }
  }

  /**
   * Calcola 1X2 da matrice punteggi
   */
  private calculate1X2FromMatrix(
    matrix: number[][]
  ): { prob1: number; probX: number; prob2: number } {
    let prob1 = 0; // Home win
    let probX = 0; // Draw
    let prob2 = 0; // Away win

    matrix.forEach((row, homeGoals) => {
      row.forEach((prob, awayGoals) => {
        if (homeGoals > awayGoals) {
          prob1 += prob;
        } else if (homeGoals === awayGoals) {
          probX += prob;
        } else {
          prob2 += prob;
        }
      });
    });

    return { prob1, probX, prob2 };
  }

  /**
   * Calcola Under/Over da matrice
   */
  private calculateUnderOverFromMatrix(
    matrix: number[][]
  ): { [key: string]: { under: number; over: number } } {
    const thresholds = [0.5, 1.5, 2.5, 3.5, 4.5];
    const underOver: { [key: string]: { under: number; over: number } } = {};

    thresholds.forEach(threshold => {
      let under = 0;
      let over = 0;

      matrix.forEach((row, homeGoals) => {
        row.forEach((prob, awayGoals) => {
          const totalGoals = homeGoals + awayGoals;
          
          if (totalGoals <= threshold) {
            under += prob;
          } else {
            over += prob;
          }
        });
      });

      underOver[threshold.toString()] = { under, over };
    });

    return underOver;
  }

  /**
   * Calcola probabilità per numero esatto di gol totali
   */
  private calculateExactGoalsFromMatrix(
    matrix: number[][]
  ): { [goals: string]: number } {
    const exactGoals: { [goals: string]: number } = {};
    
    // Inizializza contatori per 0-10 gol
    for (let i = 0; i <= 10; i++) {
      exactGoals[i.toString()] = 0;
    }

    matrix.forEach((row, homeGoals) => {
      row.forEach((prob, awayGoals) => {
        const totalGoals = homeGoals + awayGoals;
        if (totalGoals <= 10) {
          exactGoals[totalGoals.toString()] += prob;
        }
      });
    });

    return exactGoals;
  }

  /**
   * Calcola BTTS da matrice
   */
  private calculateBTTSFromMatrix(
    matrix: number[][]
  ): { yes: number; no: number } {
    let yes = 0; // Entrambe segnano
    let no = 0;  // Almeno una non segna

    matrix.forEach((row, homeGoals) => {
      row.forEach((prob, awayGoals) => {
        if (homeGoals > 0 && awayGoals > 0) {
          yes += prob;
        } else {
          no += prob;
        }
      });
    });

    return { yes, no };
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
      '1X': prob1 + probX,
      '12': prob1 + prob2,
      'X2': probX + prob2,
    };
  }

  /**
   * Get punteggi più probabili
   */
  getMostLikelyScores(
    matrix: number[][],
    count: number = 5
  ): Array<{ homeGoals: number; awayGoals: number; probability: number }> {
    const scores: Array<{ homeGoals: number; awayGoals: number; probability: number }> = [];

    matrix.forEach((row, homeGoals) => {
      row.forEach((prob, awayGoals) => {
        scores.push({ homeGoals, awayGoals, probability: prob });
      });
    });

    // Ordina per probabilità decrescente
    scores.sort((a, b) => b.probability - a.probability);

    return scores.slice(0, count);
  }

  /**
   * Calcola expected goals totali
   */
  getExpectedGoals(lambdaHome: number, lambdaAway: number): number {
    return lambdaHome + lambdaAway;
  }

  /**
   * Verifica coerenza lambda (non troppo estremi)
   */
  validateLambdas(lambdaHome: number, lambdaAway: number): {
    valid: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let valid = true;

    // Lambda troppo bassi
    if (lambdaHome < 0.5) {
      warnings.push('Lambda home molto basso (<0.5)');
      valid = false;
    }
    if (lambdaAway < 0.5) {
      warnings.push('Lambda away molto basso (<0.5)');
      valid = false;
    }

    // Lambda troppo alti
    if (lambdaHome > 3.5) {
      warnings.push('Lambda home molto alto (>3.5)');
    }
    if (lambdaAway > 3.5) {
      warnings.push('Lambda away molto alto (>3.5)');
    }

    // Differenza troppo grande
    const diff = Math.abs(lambdaHome - lambdaAway);
    if (diff > 2.0) {
      warnings.push(`Differenza lambda molto grande (${diff.toFixed(2)})`);
    }

    return { valid, warnings };
  }
}

export const poissonEngine = new PoissonEngine();
