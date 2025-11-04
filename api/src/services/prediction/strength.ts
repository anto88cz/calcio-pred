/**
 * Strength Classifier con xG Adjustments
 * Classifica forza predizioni: GIOCALA, STRONG, MEDIUM, NEUTRAL, ND
 * Applica regole xG per declassare/promuovere mercati Over/BTTS
 */

import type { PredictionStrength, StrengthThresholds } from '../../types';
import logger from '../../utils/logger';

export interface XGMarketAdjustment {
  xgHome: number | null;
  xgAway: number | null;
  xgMinTotal: number;      // Default 2.3
  xgHighThreshold: number; // Default 1.8
}

export class StrengthClassifier {
  /**
   * Classifica 1X2
   */
  classify1X2(
    maxProb: number,
    confidence: number,
    thresholds: StrengthThresholds
  ): PredictionStrength {
    const prob = maxProb * 100; // Converti a percentuale

    // GIOCALA: >=80% E confidence >=min
    if (prob >= thresholds.thresholdGiocala && confidence >= thresholds.confidenceMin) {
      return 'GIOCALA';
    }

    // STRONG: >=50%
    if (prob >= thresholds.threshold1X2Strong) {
      return 'STRONG';
    }

    // MEDIUM: 42-49%
    if (prob >= thresholds.threshold1X2Medium) {
      return 'MEDIUM';
    }

    // NEUTRAL: sotto soglie
    return 'NEUTRAL';
  }

  /**
   * Classifica mercati binari (Under/Over, BTTS) - metodo base
   */
  classifyBinary(
    prob: number,
    confidence: number,
    thresholds: StrengthThresholds
  ): PredictionStrength {
    const probPercent = prob * 100;

    // GIOCALA: >=80% E confidence >=min
    if (probPercent >= thresholds.thresholdGiocala && confidence >= thresholds.confidenceMin) {
      return 'GIOCALA';
    }

    // STRONG: >=62%
    if (probPercent >= thresholds.thresholdBinaryStrong) {
      return 'STRONG';
    }

    // MEDIUM: 55-61%
    if (probPercent >= thresholds.thresholdBinaryMedium) {
      return 'MEDIUM';
    }

    return 'NEUTRAL';
  }

  /**
   * Classifica Over/Under con xG adjustment
   * Se xgTotal <= xgMinTotal → declassa di 1 livello
   * Se xgHome >= xgHighThreshold o xgAway >= xgHighThreshold → promuovi Over
   */
  classifyOverUnder(
    prob: number,
    confidence: number,
    thresholds: StrengthThresholds,
    isOver: boolean,
    xgAdjustment?: XGMarketAdjustment
  ): PredictionStrength {
    // Classificazione base
    let strength = this.classifyBinary(prob, confidence, thresholds);

    // Applica adjustment xG se disponibile
    if (xgAdjustment && xgAdjustment.xgHome !== null && xgAdjustment.xgAway !== null) {
      const xgTotal = xgAdjustment.xgHome + xgAdjustment.xgAway;
      const hasHighXG = xgAdjustment.xgHome >= xgAdjustment.xgHighThreshold || 
                        xgAdjustment.xgAway >= xgAdjustment.xgHighThreshold;

      // Regola 1: xG totale basso → declassa Over
      if (isOver && xgTotal <= xgAdjustment.xgMinTotal) {
        strength = this.downgradeStrength(strength);
        logger.debug({
          xgTotal: xgTotal.toFixed(2),
          xgMinTotal: xgAdjustment.xgMinTotal,
          originalStrength: strength,
          adjustedStrength: this.downgradeStrength(strength),
        }, 'Over downgraded due to low xG total');
      }

      // Regola 2: xG alta per almeno una squadra → promuovi Over
      if (isOver && hasHighXG && strength !== 'GIOCALA') {
        strength = this.upgradeStrength(strength);
        logger.debug({
          xgHome: xgAdjustment.xgHome.toFixed(2),
          xgAway: xgAdjustment.xgAway.toFixed(2),
          xgHighThreshold: xgAdjustment.xgHighThreshold,
          originalStrength: this.downgradeStrength(strength),
          adjustedStrength: strength,
        }, 'Over upgraded due to high xG');
      }
    }

    return strength;
  }

  /**
   * Classifica BTTS con xG adjustment
   * Se xgTotal <= xgMinTotal → declassa di 1 livello
   */
  classifyBTTS(
    prob: number,
    confidence: number,
    thresholds: StrengthThresholds,
    isBttsYes: boolean,
    xgAdjustment?: XGMarketAdjustment
  ): PredictionStrength {
    // Classificazione base
    let strength = this.classifyBinary(prob, confidence, thresholds);

    // Applica adjustment xG se disponibile e per BTTS Yes
    if (isBttsYes && xgAdjustment && xgAdjustment.xgHome !== null && xgAdjustment.xgAway !== null) {
      const xgTotal = xgAdjustment.xgHome + xgAdjustment.xgAway;

      // Regola: xG totale basso → declassa BTTS Yes
      if (xgTotal <= xgAdjustment.xgMinTotal) {
        strength = this.downgradeStrength(strength);
        logger.debug({
          xgTotal: xgTotal.toFixed(2),
          xgMinTotal: xgAdjustment.xgMinTotal,
          originalStrength: this.upgradeStrength(strength),
          adjustedStrength: strength,
        }, 'BTTS Yes downgraded due to low xG total');
      }
    }

    return strength;
  }

  /**
   * Declassa forza di 1 livello
   */
  private downgradeStrength(strength: PredictionStrength): PredictionStrength {
    const levels: PredictionStrength[] = ['GIOCALA', 'STRONG', 'MEDIUM', 'NEUTRAL', 'ND'];
    const currentIndex = levels.indexOf(strength);
    
    if (currentIndex < levels.length - 1) {
      return levels[currentIndex + 1];
    }
    
    return strength;
  }

  /**
   * Promuovi forza di 1 livello
   */
  private upgradeStrength(strength: PredictionStrength): PredictionStrength {
    const levels: PredictionStrength[] = ['ND', 'NEUTRAL', 'MEDIUM', 'STRONG', 'GIOCALA'];
    const currentIndex = levels.indexOf(strength);
    
    if (currentIndex < levels.length - 1) {
      return levels[currentIndex + 1];
    }
    
    return strength;
  }

  /**
   * Classifica Doppia Chance
   */
  classifyDoubleChance(
    prob: number,
    confidence: number,
    thresholds: StrengthThresholds
  ): PredictionStrength {
    const probPercent = prob * 100;

    // GIOCALA: >=80% E confidence >=min
    if (probPercent >= thresholds.thresholdGiocala && confidence >= thresholds.confidenceMin) {
      return 'GIOCALA';
    }

    // STRONG: >=75%
    if (probPercent >= thresholds.thresholdDCStrong) {
      return 'STRONG';
    }

    // MEDIUM: 65-74%
    if (probPercent >= thresholds.thresholdDCMedium) {
      return 'MEDIUM';
    }

    return 'NEUTRAL';
  }

  /**
   * Get badge emoji per forza
   */
  getBadge(strength: PredictionStrength): string {
    const badges: Record<PredictionStrength, string> = {
      'GIOCALA': '🟩',
      'STRONG': '🟢',
      'MEDIUM': '🟡',
      'NEUTRAL': '⚪',
      'ND': '🔴',
    };

    return badges[strength];
  }

  /**
   * Get descrizione forza
   */
  getDescription(strength: PredictionStrength): string {
    const descriptions: Record<PredictionStrength, string> = {
      'GIOCALA': 'Predizione molto affidabile (≥80% + alta confidence)',
      'STRONG': 'Predizione forte',
      'MEDIUM': 'Predizione media',
      'NEUTRAL': 'Predizione neutra',
      'ND': 'Dati insufficienti',
    };

    return descriptions[strength];
  }

  /**
   * Verifica se è giocabile (GIOCALA o STRONG)
   */
  isPlayable(strength: PredictionStrength): boolean {
    return strength === 'GIOCALA' || strength === 'STRONG';
  }

  /**
   * Get confidence minima richiesta per badge
   */
  getRequiredConfidence(
    strength: PredictionStrength,
    thresholds: StrengthThresholds
  ): number {
    if (strength === 'GIOCALA') {
      return thresholds.confidenceMin;
    }
    return 0; // Altri badge non richiedono confidence minima
  }
}

export const strengthClassifier = new StrengthClassifier();
