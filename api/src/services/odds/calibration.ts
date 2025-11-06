/**
 * Market Odds Calibration Service
 * Blend model predictions with market odds for improved accuracy
 */

import logger from '../../utils/logger';
import { calculationConfig } from '../../config';
import type { MarketOdds } from '../odds';

export interface CalibrationResult {
  // Calibrated probabilities (model + market blend)
  prob1: number;
  probX: number;
  prob2: number;
  over25: number;
  under25: number;
  
  // Original model probabilities
  modelProb1: number;
  modelProbX: number;
  modelProb2: number;
  modelOver25: number;
  modelUnder25: number;
  
  // Market probabilities (for comparison)
  marketProb1: number;
  marketProbX: number;
  marketProb2: number;
  marketOver25: number;
  marketUnder25: number;
  
  // Calibration metadata
  calibrated: boolean;
  blendWeight: number; // Weight used for market (e.g., 0.30 = 30% market, 70% model)
  confidenceBoost: number; // Boost applied to confidence (0-0.10)
  agreement: number; // Agreement between model and market (0-1, where 1 = perfect agreement)
  
  // Value bet detection
  valueBets: ValueBet[];
}

export interface ValueBet {
  market: string; // '1', 'X', '2', 'Over2.5', 'Under2.5'
  modelProb: number;
  marketProb: number;
  difference: number; // modelProb - marketProb
  marketOdds: number;
  expectedValue: number; // (modelProb * marketOdds) - 1
  recommended: boolean;
}

export class CalibrationService {
  /**
   * Calibrate predictions with market odds
   * @param modelPredictions Model's 1X2 and O/U predictions
   * @param marketOdds Market odds from bookmakers
   */
  calibrate(
    modelPredictions: {
      prob1: number;
      probX: number;
      prob2: number;
      over25: number;
      under25: number;
    },
    marketOdds: MarketOdds | null
  ): CalibrationResult {
    // If no market odds available, return model predictions
    if (!marketOdds || !calculationConfig.oddsCalibrationEnabled) {
      return {
        prob1: modelPredictions.prob1,
        probX: modelPredictions.probX,
        prob2: modelPredictions.prob2,
        over25: modelPredictions.over25,
        under25: modelPredictions.under25,
        modelProb1: modelPredictions.prob1,
        modelProbX: modelPredictions.probX,
        modelProb2: modelPredictions.prob2,
        modelOver25: modelPredictions.over25,
        modelUnder25: modelPredictions.under25,
        marketProb1: 0.33,
        marketProbX: 0.33,
        marketProb2: 0.33,
        marketOver25: 0.5,
        marketUnder25: 0.5,
        calibrated: false,
        blendWeight: 0,
        confidenceBoost: 0,
        agreement: 0,
        valueBets: [],
      };
    }

    // Blend model and market probabilities
    const blendWeight = calculationConfig.oddsBlendWeight; // Default 0.30 (30% market, 70% model)
    const modelWeight = 1 - blendWeight;

    const calibratedProb1 = modelWeight * modelPredictions.prob1 + blendWeight * marketOdds.prob1;
    const calibratedProbX = modelWeight * modelPredictions.probX + blendWeight * marketOdds.probX;
    const calibratedProb2 = modelWeight * modelPredictions.prob2 + blendWeight * marketOdds.prob2;
    const calibratedOver25 = modelWeight * modelPredictions.over25 + blendWeight * marketOdds.over25;
    const calibratedUnder25 = modelWeight * modelPredictions.under25 + blendWeight * marketOdds.under25;

    // Calculate agreement between model and market
    const diff1 = Math.abs(modelPredictions.prob1 - marketOdds.prob1);
    const diffX = Math.abs(modelPredictions.probX - marketOdds.probX);
    const diff2 = Math.abs(modelPredictions.prob2 - marketOdds.prob2);
    const avgDiff = (diff1 + diffX + diff2) / 3;

    // Confidence boost if model and market agree
    let confidenceBoost = 0;
    if (avgDiff < calculationConfig.oddsConfidenceBoostThreshold) {
      // Agreement within 5% -> boost confidence by up to 10%
      confidenceBoost = 0.10 * (1 - (avgDiff / calculationConfig.oddsConfidenceBoostThreshold));
    }

    // Value bet detection
    const valueBets = this.detectValueBets(
      modelPredictions,
      marketOdds,
      calculationConfig.oddsMinDifferenceForValueBet
    );

    logger.info({
      model: {
        prob1: (modelPredictions.prob1 * 100).toFixed(1) + '%',
        probX: (modelPredictions.probX * 100).toFixed(1) + '%',
        prob2: (modelPredictions.prob2 * 100).toFixed(1) + '%',
      },
      market: {
        prob1: (marketOdds.prob1 * 100).toFixed(1) + '%',
        probX: (marketOdds.probX * 100).toFixed(1) + '%',
        prob2: (marketOdds.prob2 * 100).toFixed(1) + '%',
      },
      calibrated: {
        prob1: (calibratedProb1 * 100).toFixed(1) + '%',
        probX: (calibratedProbX * 100).toFixed(1) + '%',
        prob2: (calibratedProb2 * 100).toFixed(1) + '%',
      },
      avgDifference: (avgDiff * 100).toFixed(2) + '%',
      confidenceBoost: (confidenceBoost * 100).toFixed(1) + '%',
      valueBets: valueBets.length,
    }, 'Market calibration applied');

    return {
      prob1: calibratedProb1,
      probX: calibratedProbX,
      prob2: calibratedProb2,
      over25: calibratedOver25,
      under25: calibratedUnder25,
      modelProb1: modelPredictions.prob1,
      modelProbX: modelPredictions.probX,
      modelProb2: modelPredictions.prob2,
      modelOver25: modelPredictions.over25,
      modelUnder25: modelPredictions.under25,
      marketProb1: marketOdds.prob1,
      marketProbX: marketOdds.probX,
      marketProb2: marketOdds.prob2,
      marketOver25: marketOdds.over25,
      marketUnder25: marketOdds.under25,
      calibrated: true,
      blendWeight,
      confidenceBoost,
      agreement: 1 - avgDiff, // Agreement: 1 = perfect, 0 = complete disagreement
      valueBets,
    };
  }

  /**
   * Detect value bets where model significantly differs from market
   */
  private detectValueBets(
    modelPredictions: {
      prob1: number;
      probX: number;
      prob2: number;
      over25: number;
      under25: number;
    },
    marketOdds: MarketOdds,
    minDifference: number
  ): ValueBet[] {
    const valueBets: ValueBet[] = [];

    // Check 1X2 markets
    const markets: Array<{
      key: string;
      modelProb: number;
      marketProb: number;
      marketOdds: number;
    }> = [
      { key: '1', modelProb: modelPredictions.prob1, marketProb: marketOdds.prob1, marketOdds: marketOdds.rawOdds.home },
      { key: 'X', modelProb: modelPredictions.probX, marketProb: marketOdds.probX, marketOdds: marketOdds.rawOdds.draw },
      { key: '2', modelProb: modelPredictions.prob2, marketProb: marketOdds.prob2, marketOdds: marketOdds.rawOdds.away },
    ];

    // Check Over/Under 2.5 markets
    if (marketOdds.rawOdds.over25 && marketOdds.rawOdds.under25) {
      markets.push(
        { key: 'Over2.5', modelProb: modelPredictions.over25, marketProb: marketOdds.over25, marketOdds: marketOdds.rawOdds.over25 },
        { key: 'Under2.5', modelProb: modelPredictions.under25, marketProb: marketOdds.under25, marketOdds: marketOdds.rawOdds.under25 }
      );
    }

    for (const market of markets) {
      const difference = market.modelProb - market.marketProb;
      
      // Value bet if model probability is significantly higher than market
      if (difference >= minDifference) {
        const expectedValue = (market.modelProb * market.marketOdds) - 1;
        
        valueBets.push({
          market: market.key,
          modelProb: market.modelProb,
          marketProb: market.marketProb,
          difference,
          marketOdds: market.marketOdds,
          expectedValue,
          recommended: expectedValue > 0.05, // Recommend if EV > 5%
        });
      }
    }

    if (valueBets.length > 0) {
      logger.info({
        valueBets: valueBets.map(vb => ({
          market: vb.market,
          modelProb: (vb.modelProb * 100).toFixed(1) + '%',
          marketProb: (vb.marketProb * 100).toFixed(1) + '%',
          difference: (vb.difference * 100).toFixed(1) + '%',
          ev: (vb.expectedValue * 100).toFixed(1) + '%',
          recommended: vb.recommended,
        })),
      }, 'Value bets detected');
    }

    return valueBets;
  }
}

// Singleton
export const calibrationService = new CalibrationService();
