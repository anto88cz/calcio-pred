/**
 * Prediction Engine - Orchestratore principale
 * Coordina Empirico, Poisson, Blending, Confidence, Strength
 */

import { empiricEngine } from './empiric';
import { poissonEngine } from './poisson';
import { blender } from './blender';
import { confidenceCalculator } from './confidence';
import { strengthClassifier } from './strength';
import { xgService } from './xg-service';
import { 
  historyService,
  injuriesService,
  lineupsService,
  statisticsService,
  type MatchHistoryData,
  type PlayerInjuryInfo,
  type LineupInfo,
  type ExpectedGoalsData,
} from '../api-football';
import { config as _config, calculationConfig } from '../../config';
import logger from '../../utils/logger';
import type { PredictionResponse, DataQuality } from '../../types';

export interface PredictionInput {
  fixtureId: number;
  homeTeamId: number;
  awayTeamId: number;
  season: number;
  leagueId: number;
}

export class PredictionEngine {
  /**
   * Calcola predizione completa per una partita
   */
  async calculatePrediction(input: PredictionInput): Promise<PredictionResponse> {
    logger.info({ fixtureId: input.fixtureId }, 'Starting prediction calculation');

    try {
      // 1. Raccogli dati storici
      const { homeHistory, awayHistory } = await this.fetchHistoricalData(input);

      // 2. Raccogli infortuni e lineup
      const injuries = await this.fetchInjuries(input.fixtureId);
      const lineups = await this.fetchLineups(input.fixtureId);

      // 3. Fetch xG data from API-FOOTBALL
      const xgData = await this.fetchExpectedGoals(input.fixtureId);

      // 4. Valuta qualità dati
      const dataQuality = this.assessDataQuality(homeHistory, awayHistory);

      // Se dati insufficienti, ritorna ND
      if (dataQuality === 'INSUFFICIENT') {
        return this.createNDPrediction(input, homeHistory, awayHistory, xgData);
      }

      // 5. Calcola Empirico
      const empiricResult = empiricEngine.calculate(
        homeHistory,
        awayHistory,
        0.95 // decay factor
      );

      // 6. Calcola Poisson (con calibrazione xG)
      const poissonResult = poissonEngine.calculate(
        homeHistory,
        awayHistory,
        calculationConfig.homeAdvGoals,
        xgData ? {
          xgHome: xgData.home.xg,
          xgAway: xgData.away.xg,
          xgBlendWeight: calculationConfig.xgBlendWeight,
        } : undefined
      );

      // 7. Blend risultati
      const blendedResult = blender.blend(
        empiricResult,
        poissonResult,
        calculationConfig.blendEmpiric,
        calculationConfig.blendPoisson
      );

      // 8. Valida coerenza
      const validation = blender.validateResults(blendedResult);
      if (!validation.valid) {
        logger.warn({ warnings: validation.warnings }, 'Validation warnings');
      }

      // 9. Calcola confidence (con xG adjustment)
      const confidence = confidenceCalculator.calculate(
        homeHistory,
        awayHistory,
        injuries,
        lineups,
        calculationConfig.historyGames,
        xgData ? {
          xgHome: xgData.home.xg,
          xgAway: xgData.away.xg,
          lambdaHome: poissonResult.lambdaHome,
          lambdaAway: poissonResult.lambdaAway,
          missingXg: xgData.missingXg,
          lowXgConsistency: false, // Will be checked later if needed
          xgDivergenceThreshold: calculationConfig.xgDivergenceThreshold,
        } : undefined
      );

      // 10. Calcola xG adjustment per mercati
      const xgAdjustment = xgData ? this.calculateXGMarketAdjustment(xgData) : undefined;

      // 11. Classifica forza per ogni mercato (con xG rules)
      const strength = this.classifyAllMarkets(
        blendedResult.final,
        confidence.overall,
        xgAdjustment
      );

      // 12. Salva xG nel database (solo se NON è un ID temporaneo per analisi manuali)
      const isTemporaryFixture = input.fixtureId >= 1000000000;
      if (xgData && !isTemporaryFixture) {
        await this.saveExpectedGoals(input.fixtureId, xgData);
      } else if (isTemporaryFixture) {
        logger.debug({ fixtureId: input.fixtureId }, 'Skipping xG save for temporary fixture (manual analysis)');
      }

      // 13. Costruisci risposta
      return this.buildPredictionResponse(
        input,
        blendedResult,
        confidence,
        strength,
        dataQuality,
        injuries,
        lineups,
        homeHistory.length,
        awayHistory.length,
        poissonResult.lambdaHome,
        poissonResult.lambdaAway,
        poissonResult.homeAdvantage,
        xgData,
        homeHistory,
        awayHistory
      );

    } catch (error) {
      logger.error({ error, fixtureId: input.fixtureId }, 'Prediction calculation failed');
      throw error;
    }
  }

  /**
   * Fetch Expected Goals data from API-FOOTBALL
   */
  private async fetchExpectedGoals(fixtureId: number): Promise<ExpectedGoalsData | null> {
    try {
      logger.debug({ fixtureId }, 'Fetching xG data from API-FOOTBALL');
      const xgData = await statisticsService.getExpectedGoals(fixtureId);
      
      if (xgData.missingXg) {
        logger.warn({ fixtureId }, 'xG data missing or incomplete');
      } else {
        logger.info({ 
          fixtureId, 
          xgHome: xgData.home.xg, 
          xgAway: xgData.away.xg 
        }, 'xG data fetched successfully');
      }
      
      return xgData;
    } catch (error) {
      logger.error({ error, fixtureId }, 'Failed to fetch xG data');
      return null;
    }
  }

  /**
   * Salva xG nel database
   */
  private async saveExpectedGoals(fixtureId: number, xgData: ExpectedGoalsData): Promise<void> {
    try {
      await xgService.saveOrUpdateXG({
        fixtureId,
        xgData,
        providerId: fixtureId, // Using fixtureId as provider_id
      });
      logger.debug({ fixtureId }, 'xG data saved to database');
    } catch (error) {
      logger.error({ error, fixtureId }, 'Failed to save xG data');
      // Non propaga errore - xG è opzionale
    }
  }

  /**
   * Calcola adjustment xG per i mercati Over/Under e BTTS
   */
  private calculateXGMarketAdjustment(xgData: ExpectedGoalsData): {
    xgTotal: number;
    xgHome: number | null;
    xgAway: number | null;
    xgMinTotal: number;
    xgHighThreshold: number;
    shouldDowngrade: boolean;
    shouldUpgrade: boolean;
  } {
    const xgTotal = (xgData.home.xg || 0) + (xgData.away.xg || 0);
    const shouldDowngrade = xgTotal <= calculationConfig.xgMinTotal;
    const shouldUpgrade = 
      (xgData.home.xg !== null && xgData.home.xg >= calculationConfig.xgHighThreshold) ||
      (xgData.away.xg !== null && xgData.away.xg >= calculationConfig.xgHighThreshold);

    logger.debug({
      xgTotal,
      shouldDowngrade,
      shouldUpgrade,
      minTotal: calculationConfig.xgMinTotal,
      highThreshold: calculationConfig.xgHighThreshold,
    }, 'xG market adjustment calculated');

    return {
      xgTotal,
      xgHome: xgData.home.xg,
      xgAway: xgData.away.xg,
      xgMinTotal: calculationConfig.xgMinTotal,
      xgHighThreshold: calculationConfig.xgHighThreshold,
      shouldDowngrade,
      shouldUpgrade,
    };
  }

  /**
   * Fetch dati storici
   */
  private async fetchHistoricalData(input: PredictionInput): Promise<{
    homeHistory: MatchHistoryData[];
    awayHistory: MatchHistoryData[];
  }> {
    logger.debug('Fetching historical data');

    const [homeHistory, awayHistory] = await Promise.all([
      historyService.getTeamHistoryByVenue(
        input.homeTeamId,
        input.season,
        true, // home
        calculationConfig.historyGames
      ),
      historyService.getTeamHistoryByVenue(
        input.awayTeamId,
        input.season,
        false, // away
        calculationConfig.historyGames
      ),
    ]);

    return { homeHistory, awayHistory };
  }

  /**
   * Fetch infortuni
   */
  private async fetchInjuries(fixtureId: number): Promise<PlayerInjuryInfo[]> {
    try {
      return await injuriesService.getInjuriesByFixture(fixtureId);
    } catch (error) {
      logger.warn({ error, fixtureId }, 'Failed to fetch injuries');
      return [];
    }
  }

  /**
   * Fetch lineup
   */
  private async fetchLineups(fixtureId: number): Promise<LineupInfo[]> {
    try {
      return await lineupsService.getLineupsByFixture(fixtureId);
    } catch (error) {
      logger.warn({ error, fixtureId }, 'Failed to fetch lineups');
      return [];
    }
  }

  /**
   * Valuta qualità dati
   */
  private assessDataQuality(
    homeHistory: MatchHistoryData[],
    awayHistory: MatchHistoryData[]
  ): DataQuality {
    const totalMatches = homeHistory.length + awayHistory.length;
    const required = calculationConfig.historyGames * 2;

    const completeness = totalMatches / required;

    if (completeness >= 0.9) return 'EXCELLENT';
    if (completeness >= 0.7) return 'GOOD';
    if (completeness >= 0.5) return 'FAIR';
    if (completeness >= 0.3) return 'POOR';
    return 'INSUFFICIENT';
  }

  /**
   * Classifica forza per tutti i mercati (con regole xG)
   */
  private classifyAllMarkets(
    final: any,
    confidence: number,
    xgAdjustment?: {
      xgTotal: number;
      xgHome: number | null;
      xgAway: number | null;
      xgMinTotal: number;
      xgHighThreshold: number;
      shouldDowngrade: boolean;
      shouldUpgrade: boolean;
    }
  ): {
    strength1X2: any;
    strengthOver05: any;
    strengthOver15: any;
    strengthOver25: any;
    strengthOver35: any;
    strengthOver45: any;
    strengthBtts: any;
    strength1X: any;
    strength12: any;
    strengthX2: any;
  } {
    const thresholds = calculationConfig.thresholds;

    // 1X2: max prob
    const max1X2 = Math.max(final.prob1, final.probX, final.prob2);
    const strength1X2 = strengthClassifier.classify1X2(max1X2, confidence, thresholds);

    // Under/Over (con xG rules)
    const strengthOver05 = xgAdjustment 
      ? strengthClassifier.classifyOverUnder(final.underOver['0.5'].over, confidence, thresholds, true, xgAdjustment)
      : strengthClassifier.classifyBinary(final.underOver['0.5'].over, confidence, thresholds);
    
    const strengthOver15 = xgAdjustment
      ? strengthClassifier.classifyOverUnder(final.underOver['1.5'].over, confidence, thresholds, true, xgAdjustment)
      : strengthClassifier.classifyBinary(final.underOver['1.5'].over, confidence, thresholds);
    
    const strengthOver25 = xgAdjustment
      ? strengthClassifier.classifyOverUnder(final.underOver['2.5'].over, confidence, thresholds, true, xgAdjustment)
      : strengthClassifier.classifyBinary(final.underOver['2.5'].over, confidence, thresholds);
    
    const strengthOver35 = xgAdjustment
      ? strengthClassifier.classifyOverUnder(final.underOver['3.5'].over, confidence, thresholds, true, xgAdjustment)
      : strengthClassifier.classifyBinary(final.underOver['3.5'].over, confidence, thresholds);
    
    const strengthOver45 = xgAdjustment
      ? strengthClassifier.classifyOverUnder(final.underOver['4.5'].over, confidence, thresholds, true, xgAdjustment)
      : strengthClassifier.classifyBinary(final.underOver['4.5'].over, confidence, thresholds);

    // BTTS (con xG rules)
    const isBttsYes = final.btts.yes >= final.btts.no;
    const strengthBtts = xgAdjustment
      ? strengthClassifier.classifyBTTS(Math.max(final.btts.yes, final.btts.no), confidence, thresholds, isBttsYes, xgAdjustment)
      : strengthClassifier.classifyBinary(Math.max(final.btts.yes, final.btts.no), confidence, thresholds);

    // Doppia Chance
    const strength1X = strengthClassifier.classifyDoubleChance(final.doubleChance['1X'], confidence, thresholds);
    const strength12 = strengthClassifier.classifyDoubleChance(final.doubleChance['12'], confidence, thresholds);
    const strengthX2 = strengthClassifier.classifyDoubleChance(final.doubleChance['X2'], confidence, thresholds);

    return {
      strength1X2,
      strengthOver05,
      strengthOver15,
      strengthOver25,
      strengthOver35,
      strengthOver45,
      strengthBtts,
      strength1X,
      strength12,
      strengthX2,
    };
  }

  /**
   * Costruisci response completa
   */
  private buildPredictionResponse(
    input: PredictionInput,
    blendedResult: any,
    confidence: any,
    strength: any,
    dataQuality: DataQuality,
    injuries: PlayerInjuryInfo[],
    lineups: LineupInfo[],
    homeMatchesUsed: number,
    awayMatchesUsed: number,
    lambdaHome: number,
    lambdaAway: number,
    homeAdvantage: number,
    xgData: ExpectedGoalsData | null,
    homeHistory: MatchHistoryData[],
    awayHistory: MatchHistoryData[]
  ): PredictionResponse {
    const { empiric, poisson, final } = blendedResult;
    
    // Calcola xG/xGA medio dalla storia delle partite
    const homeXGAvg = this.calculateAvgXG(homeHistory, true);
    const homeXGAAvg = this.calculateAvgXG(homeHistory, false);
    const awayXGAvg = this.calculateAvgXG(awayHistory, true);
    const awayXGAAvg = this.calculateAvgXG(awayHistory, false);

    return {
      id: 0, // Sarà impostato dal database
      fixtureId: input.fixtureId,
      
      confidence: confidence.overall,
      confidenceLevel: confidence.level,
      
      homeMatchesUsed,
      awayMatchesUsed,
      
      // 1X2
      market1X2: {
        empiric: { prob1: empiric.prob1, probX: empiric.probX, prob2: empiric.prob2 },
        poisson: { prob1: poisson.prob1, probX: poisson.probX, prob2: poisson.prob2 },
        final: { prob1: final.prob1, probX: final.probX, prob2: final.prob2 },
        strength: strength.strength1X2,
      },
      
      // Under/Over
      marketUnderOver: {
        '0.5': {
          empiric: empiric.underOver['0.5'],
          poisson: poisson.underOver['0.5'],
          final: final.underOver['0.5'],
          strength: strength.strengthOver05,
        },
        '1.5': {
          empiric: empiric.underOver['1.5'],
          poisson: poisson.underOver['1.5'],
          final: final.underOver['1.5'],
          strength: strength.strengthOver15,
        },
        '2.5': {
          empiric: empiric.underOver['2.5'],
          poisson: poisson.underOver['2.5'],
          final: final.underOver['2.5'],
          strength: strength.strengthOver25,
        },
        '3.5': {
          empiric: empiric.underOver['3.5'],
          poisson: poisson.underOver['3.5'],
          final: final.underOver['3.5'],
          strength: strength.strengthOver35,
        },
        '4.5': {
          empiric: empiric.underOver['4.5'],
          poisson: poisson.underOver['4.5'],
          final: final.underOver['4.5'],
          strength: strength.strengthOver45,
        },
      },
      
      // BTTS
      marketBTTS: {
        empiric: empiric.btts,
        poisson: poisson.btts,
        final: final.btts,
        strength: strength.strengthBtts,
      },
      
      // Doppia Chance
      marketDoubleChance: {
        '1X': {
          empiric: { prob: empiric.doubleChance['1X'] },
          poisson: { prob: poisson.doubleChance['1X'] },
          final: { prob: final.doubleChance['1X'] },
          strength: strength.strength1X,
        },
        '12': {
          empiric: { prob: empiric.doubleChance['12'] },
          poisson: { prob: poisson.doubleChance['12'] },
          final: { prob: final.doubleChance['12'] },
          strength: strength.strength12,
        },
        'X2': {
          empiric: { prob: empiric.doubleChance['X2'] },
          poisson: { prob: poisson.doubleChance['X2'] },
          final: { prob: final.doubleChance['X2'] },
          strength: strength.strengthX2,
        },
      },
      
      // Poisson params
      poissonParams: {
        lambdaHome,
        lambdaAway,
        homeAdvantage,
      },
      
      // Team xG/xGA stats from historical matches
      teamStats: {
        home: {
          xg: homeXGAvg,
          xga: homeXGAAvg,
        },
        away: {
          xg: awayXGAvg,
          xga: awayXGAAvg,
        },
      },
      
      // xG data (optional)
      ...(xgData && {
        xgModel: {
          home: xgData.home.xg,
          away: xgData.away.xg,
          total: (xgData.home.xg || 0) + (xgData.away.xg || 0),
          xgotHome: xgData.home.xgot,
          xgotAway: xgData.away.xgot,
        },
        xgFlags: {
          missingXg: xgData.missingXg,
        },
      }),
      
      // Metadata
      dataQuality,
      hasInjuries: injuries.length > 0,
      hasLineup: lineups.length === 2,
      provider: 'API-FOOTBALL',
      calculatedAt: new Date(),
      lastUpdate: new Date(),
    };
  }

  /**
   * Crea predizione ND (dati insufficienti)
   */
  private createNDPrediction(
    input: PredictionInput,
    homeHistory: MatchHistoryData[],
    awayHistory: MatchHistoryData[],
    _xgData: ExpectedGoalsData | null
  ): PredictionResponse {
    logger.warn({ fixtureId: input.fixtureId }, 'Creating ND prediction (insufficient data)');

    const ndValue = { prob: 0.33 };
    const ndMarket = { under: 0.5, over: 0.5 };
    
    // Calcola xG/xGA anche per ND (se ci sono almeno alcune partite)
    const homeXGAvg = this.calculateAvgXG(homeHistory, true);
    const homeXGAAvg = this.calculateAvgXG(homeHistory, false);
    const awayXGAvg = this.calculateAvgXG(awayHistory, true);
    const awayXGAAvg = this.calculateAvgXG(awayHistory, false);

    return {
      id: 0,
      fixtureId: input.fixtureId,
      confidence: 0,
      confidenceLevel: 'VERY_LOW',
      homeMatchesUsed: homeHistory.length,
      awayMatchesUsed: awayHistory.length,
      
      market1X2: {
        empiric: { prob1: 0.33, probX: 0.34, prob2: 0.33 },
        poisson: { prob1: 0.33, probX: 0.34, prob2: 0.33 },
        final: { prob1: 0.33, probX: 0.34, prob2: 0.33 },
        strength: 'ND' as any,
      },
      
      marketUnderOver: {
        '0.5': { empiric: ndMarket, poisson: ndMarket, final: ndMarket, strength: 'ND' as any },
        '1.5': { empiric: ndMarket, poisson: ndMarket, final: ndMarket, strength: 'ND' as any },
        '2.5': { empiric: ndMarket, poisson: ndMarket, final: ndMarket, strength: 'ND' as any },
        '3.5': { empiric: ndMarket, poisson: ndMarket, final: ndMarket, strength: 'ND' as any },
        '4.5': { empiric: ndMarket, poisson: ndMarket, final: ndMarket, strength: 'ND' as any },
      },
      
      marketBTTS: {
        empiric: { yes: 0.5, no: 0.5 },
        poisson: { yes: 0.5, no: 0.5 },
        final: { yes: 0.5, no: 0.5 },
        strength: 'ND' as any,
      },
      
      marketDoubleChance: {
        '1X': { empiric: ndValue, poisson: ndValue, final: ndValue, strength: 'ND' as any },
        '12': { empiric: ndValue, poisson: ndValue, final: ndValue, strength: 'ND' as any },
        'X2': { empiric: ndValue, poisson: ndValue, final: ndValue, strength: 'ND' as any },
      },
      
      poissonParams: {
        lambdaHome: 0,
        lambdaAway: 0,
        homeAdvantage: 0,
      },
      
      teamStats: {
        home: {
          xg: homeXGAvg,
          xga: homeXGAAvg,
        },
        away: {
          xg: awayXGAvg,
          xga: awayXGAAvg,
        },
      },
      
      dataQuality: 'INSUFFICIENT',
      hasInjuries: false,
      hasLineup: false,
      provider: 'API-FOOTBALL',
      calculatedAt: new Date(),
      lastUpdate: new Date(),
    };
  }
  
  /**
   * Calcola xG/xGA medio dalla storia delle partite
   * Per ora usa i goal reali come proxy degli xG (in futuro potremmo recuperare xG reali dall'API)
   */
  private calculateAvgXG(history: MatchHistoryData[], forGoals: boolean): number {
    if (history.length === 0) return 0;
    
    const totalXG = history.reduce((sum, match) => {
      // Se forGoals=true, calcola xG (goal fatti)
      // Se forGoals=false, calcola xGA (goal subiti)
      const goals = forGoals 
        ? (match.isHome ? match.homeGoals : match.awayGoals)
        : (match.isHome ? match.awayGoals : match.homeGoals);
      return sum + goals;
    }, 0);
    
    return parseFloat((totalXG / history.length).toFixed(2));
  }
}

export const predictionEngine = new PredictionEngine();
