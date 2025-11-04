/**
 * Blender - Combina risultati Empirico e Poisson
 */

import logger from '../../utils/logger';
import type { EmpiricResult, PoissonResult, BlendedResult } from '../../types';

export class Blender {
  /**
   * Combina Empirico e Poisson con pesi configurabili
   */
  blend(
    empiric: EmpiricResult,
    poisson: PoissonResult,
    empiricWeight: number = 0.6,
    poissonWeight: number = 0.4
  ): BlendedResult {
    logger.info({ empiricWeight, poissonWeight }, 'Blending empiric and Poisson results');

    // Verifica che i pesi sommino a 1
    const totalWeight = empiricWeight + poissonWeight;
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      logger.warn({ totalWeight }, 'Weights do not sum to 1.0, normalizing...');
      empiricWeight = empiricWeight / totalWeight;
      poissonWeight = poissonWeight / totalWeight;
    }

    // Blend 1X2
    const prob1Final = this.blendProbability(empiric.prob1, poisson.prob1, empiricWeight, poissonWeight);
    const probXFinal = this.blendProbability(empiric.probX, poisson.probX, empiricWeight, poissonWeight);
    const prob2Final = this.blendProbability(empiric.prob2, poisson.prob2, empiricWeight, poissonWeight);

    // Normalizza 1X2 (deve sommare a 1)
    const { prob1, probX, prob2 } = this.normalize1X2(prob1Final, probXFinal, prob2Final);

    // Blend Under/Over
    const underOver: { [key: string]: { under: number; over: number } } = {};
    Object.keys(empiric.underOver).forEach(threshold => {
      const empUO = empiric.underOver[threshold];
      const poisUO = poisson.underOver[threshold];

      const under = this.blendProbability(empUO.under, poisUO.under, empiricWeight, poissonWeight);
      const over = this.blendProbability(empUO.over, poisUO.over, empiricWeight, poissonWeight);

      // Normalizza (deve sommare a 1)
      const total = under + over;
      underOver[threshold] = {
        under: under / total,
        over: over / total,
      };
    });

    // Blend BTTS
    const bttsYes = this.blendProbability(empiric.btts.yes, poisson.btts.yes, empiricWeight, poissonWeight);
    const bttsNo = this.blendProbability(empiric.btts.no, poisson.btts.no, empiricWeight, poissonWeight);
    
    // Normalizza BTTS
    const bttsTotal = bttsYes + bttsNo;
    const btts = {
      yes: bttsYes / bttsTotal,
      no: bttsNo / bttsTotal,
    };

    // Blend Doppia Chance
    const dc1X = this.blendProbability(empiric.doubleChance['1X'], poisson.doubleChance['1X'], empiricWeight, poissonWeight);
    const dc12 = this.blendProbability(empiric.doubleChance['12'], poisson.doubleChance['12'], empiricWeight, poissonWeight);
    const dcX2 = this.blendProbability(empiric.doubleChance['X2'], poisson.doubleChance['X2'], empiricWeight, poissonWeight);

    // Verifica coerenza Doppia Chance
    const doubleChance = this.ensureDoubleChanceCoherence(
      { prob1, probX, prob2 },
      { '1X': dc1X, '12': dc12, 'X2': dcX2 }
    );

    return {
      final: {
        prob1,
        probX,
        prob2,
        underOver,
        btts,
        doubleChance,
      },
      empiric,
      poisson,
    };
  }

  /**
   * Blend singola probabilità
   */
  private blendProbability(
    empiricProb: number,
    poissonProb: number,
    empiricWeight: number,
    poissonWeight: number
  ): number {
    return empiricProb * empiricWeight + poissonProb * poissonWeight;
  }

  /**
   * Normalizza 1X2 (somma = 1)
   */
  private normalize1X2(
    prob1: number,
    probX: number,
    prob2: number
  ): { prob1: number; probX: number; prob2: number } {
    const total = prob1 + probX + prob2;

    if (total === 0) {
      // Fallback se tutti 0
      return { prob1: 0.33, probX: 0.34, prob2: 0.33 };
    }

    return {
      prob1: prob1 / total,
      probX: probX / total,
      prob2: prob2 / total,
    };
  }

  /**
   * Assicura coerenza Doppia Chance con 1X2
   * DC deve essere somma delle probabilità corrispondenti
   */
  private ensureDoubleChanceCoherence(
    oneX2: { prob1: number; probX: number; prob2: number },
    _doubleChance: { '1X': number; '12': number; 'X2': number }
  ): { '1X': number; '12': number; 'X2': number } {
    // Ricalcola DC da 1X2 per garantire coerenza
    return {
      '1X': oneX2.prob1 + oneX2.probX,
      '12': oneX2.prob1 + oneX2.prob2,
      'X2': oneX2.probX + oneX2.prob2,
    };
  }

  /**
   * Verifica coerenza generale risultati
   */
  validateResults(result: BlendedResult): {
    valid: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let valid = true;

    // 1. Verifica 1X2 somma a 1
    const sum1X2 = result.final.prob1 + result.final.probX + result.final.prob2;
    if (Math.abs(sum1X2 - 1.0) > 0.01) {
      warnings.push(`1X2 sum is ${sum1X2.toFixed(4)}, should be 1.0`);
      valid = false;
    }

    // 2. Verifica Under/Over somma a 1
    Object.entries(result.final.underOver).forEach(([threshold, uo]) => {
      const sum = uo.under + uo.over;
      if (Math.abs(sum - 1.0) > 0.01) {
        warnings.push(`U/O ${threshold} sum is ${sum.toFixed(4)}, should be 1.0`);
        valid = false;
      }
    });

    // 3. Verifica BTTS somma a 1
    const sumBTTS = result.final.btts.yes + result.final.btts.no;
    if (Math.abs(sumBTTS - 1.0) > 0.01) {
      warnings.push(`BTTS sum is ${sumBTTS.toFixed(4)}, should be 1.0`);
      valid = false;
    }

    // 4. Verifica Doppia Chance coerenza
    const dc1XExpected = result.final.prob1 + result.final.probX;
    if (Math.abs(result.final.doubleChance['1X'] - dc1XExpected) > 0.01) {
      warnings.push(`DC 1X incoherent: ${result.final.doubleChance['1X'].toFixed(4)} vs expected ${dc1XExpected.toFixed(4)}`);
    }

    // 5. Verifica monotonia Over (Over 0.5 >= Over 1.5 >= Over 2.5...)
    const thresholds = ['0.5', '1.5', '2.5', '3.5', '4.5'];
    for (let i = 0; i < thresholds.length - 1; i++) {
      const current = result.final.underOver[thresholds[i]].over;
      const next = result.final.underOver[thresholds[i + 1]].over;
      
      if (current < next) {
        warnings.push(`Over monotonicity violation: O${thresholds[i]} (${current.toFixed(4)}) < O${thresholds[i + 1]} (${next.toFixed(4)})`);
      }
    }

    if (warnings.length > 0) {
      logger.warn({ warnings }, 'Validation warnings found');
    }

    return { valid, warnings };
  }

  /**
   * Correggi monotonia Over (se violata)
   */
  fixOverMonotonicity(
    underOver: { [key: string]: { under: number; over: number } }
  ): { [key: string]: { under: number; over: number } } {
    const thresholds = ['0.5', '1.5', '2.5', '3.5', '4.5'];
    const fixed = { ...underOver };

    // Assicura che Over decresce monotonicamente
    for (let i = 0; i < thresholds.length - 1; i++) {
      const current = fixed[thresholds[i]].over;
      const next = fixed[thresholds[i + 1]].over;

      if (next > current) {
        // Correggi: next = current
        fixed[thresholds[i + 1]].over = current;
        fixed[thresholds[i + 1]].under = 1 - current;
      }
    }

    return fixed;
  }
}

export const blender = new Blender();
