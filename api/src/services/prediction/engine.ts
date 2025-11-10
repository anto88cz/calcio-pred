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
import { formMomentumCalculator, type FormMomentumResult } from './form-momentum';
import { getLeagueStrength } from './league-strength';
import * as mlPredictor from '../ml-prediction.service'; // 🆕 ML Prediction Service
// 🆕 Sportsmonks services replacing API-Football
import { 
  statisticsService,
  injuriesService,
  lineupsService,
  type MatchHistoryData,
  type PlayerInjuryInfo,
  type LineupInfo,
  type ExpectedGoalsData,
} from '../sportsmonks';
import * as sportsmonksOdds from '../sportsmonks/odds';
import { calibrationService } from '../odds';
import { config as _config, calculationConfig } from '../../config';
import { isLeagueSupported, hasMinimumDataQuality } from '../../config/supported-leagues';
import { prisma } from '../../lib/prisma';
import logger from '../../utils/logger';
import type { PredictionResponse, DataQuality } from '../../types';

export interface PredictionInput {
  fixtureId: number;
  homeTeamId: number;
  awayTeamId: number;
  season: number;
  leagueId: number;
  homeTeamName?: string; // Optional for market odds fetch
  awayTeamName?: string; // Optional for market odds fetch
  leagueName?: string; // 🆕 League name for filtering and league-specific parameters
  referenceDate?: Date; // 🆕 Temporal constraint to prevent data leakage
}

export class PredictionEngine {
  /**
   * Calcola predizione completa per una partita
   * OTTIMIZZATO: Fetch sequenziale con cache aggressiva per evitare rate limit
   */
  async calculatePrediction(input: PredictionInput): Promise<PredictionResponse> {
    logger.info({ fixtureId: input.fixtureId }, 'Starting prediction calculation');

    // 🔥 FILTER: Check if league is supported
    if (input.leagueName && !isLeagueSupported(input.leagueName)) {
      logger.warn({ 
        leagueName: input.leagueName,
        fixtureId: input.fixtureId,
      }, '🔥 League not supported - returning ND prediction');
      
      return this.createNDPrediction(input, [], [], null);
    }

    try {
      // 1. Raccogli dati storici (SEQUENZIALE per rate limit)
      logger.debug('Step 1/5: Fetching historical data');
      const { homeHistory, awayHistory } = await this.fetchHistoricalData(input);
      
      // 🎯 LOG DATI STAGIONE CORRENTE (per diagnostica)
      const currentSeason = input.season;
      const seasonStartDate = new Date(`${currentSeason}-08-01`); // Stagione inizia ad agosto
      
      const homeSeasonMatches = homeHistory.filter(m => new Date(m.date) >= seasonStartDate);
      const awaySeasonMatches = awayHistory.filter(m => new Date(m.date) >= seasonStartDate);
      
      logger.info({
        homeTeam: input.homeTeamId,
        awayTeam: input.awayTeamId,
        homeSeasonMatches: homeSeasonMatches.length,
        awaySeasonMatches: awaySeasonMatches.length,
        homeHistoryTotal: homeHistory.length,
        awayHistoryTotal: awayHistory.length,
        season: `${currentSeason}/${currentSeason + 1}`,
      }, 'Historical data summary');
      
      // NOTA: Non blocchiamo più se ci sono poche partite della stagione corrente.
      // Usiamo invece il check di assessDataQuality che valuta la qualità complessiva
      // dei dati storici (anche di stagioni precedenti se necessario).

      // 2. Fetch xG data (priorità alta - necessario per lambda calibration)
      logger.debug('Step 2/5: Fetching xG data');
      const xgData = await this.fetchExpectedGoals(input.fixtureId, input.referenceDate);

      // 3. Raccogli infortuni e lineup (opzionali - possono fallire)
      logger.debug('Step 3/5: Fetching injuries and lineups');
      const injuries = await this.fetchInjuries(input.fixtureId);
      const lineups = await this.fetchLineups(input.fixtureId);

      // 4. Valuta qualità dati
      const dataQuality = this.assessDataQuality(homeHistory, awayHistory);

      // Se dati insufficienti, ritorna ND
      if (dataQuality === 'INSUFFICIENT') {
        logger.warn({
          homeMatches: homeHistory.length,
          awayMatches: awayHistory.length,
          required: calculationConfig.historyGames * 2,
          completeness: ((homeHistory.length + awayHistory.length) / (calculationConfig.historyGames * 2) * 100).toFixed(1) + '%',
        }, 'Insufficient data for prediction - returning ND');
        return this.createNDPrediction(input, homeHistory, awayHistory, xgData);
      }

      // 4.5. 🏠🛫 Calcola Form Momentum SEPARATO (Home/Away specific)
      // NUOVO: Squadra casa usa solo performance casalinghe, trasferta usa solo performance esterne
      const homeForm = formMomentumCalculator.calculateHomeForm(homeHistory, input.homeTeamId);
      const awayForm = formMomentumCalculator.calculateAwayForm(awayHistory, input.awayTeamId);
      
      logger.info({
        homeForm: {
          type: '🏠 HOME',
          score: homeForm.formScore.toFixed(2),
          factor: homeForm.formFactor.toFixed(2),
          label: homeForm.formLabel,
          results: homeForm.recentResults,
          trend: homeForm.trend,
          windows: `short:${homeForm.windows.short.matches} med:${homeForm.windows.medium.matches} long:${homeForm.windows.long.matches}`,
        },
        awayForm: {
          type: '🛫 AWAY',
          score: awayForm.formScore.toFixed(2),
          factor: awayForm.formFactor.toFixed(2),
          label: awayForm.formLabel,
          results: awayForm.recentResults,
          trend: awayForm.trend,
          windows: `short:${awayForm.windows.short.matches} med:${awayForm.windows.medium.matches} long:${awayForm.windows.long.matches}`,
        },
      }, '🏠🛫 Form momentum calculated (HOME/AWAY specific)');

      // 5. Fetch H2H stats (SEQUENZIALE - ultima API call prima calcoli)
      logger.debug('Step 5/5: Fetching H2H data from Sportsmonks');
      const h2hMatches = await statisticsService.getHeadToHead(input.homeTeamId, input.awayTeamId, 10, input.referenceDate);
      const h2hStats = this.calculateH2HStats(h2hMatches, input.homeTeamId, input.awayTeamId);
      
      logger.info({
        h2hMatches: h2hStats.totalMatches,
        dominance: h2hStats.dominance,
        homeWinRate: (h2hStats.homeWinRate * 100).toFixed(1) + '%',
        h2hFactorHome: h2hStats.h2hFactor.home.toFixed(3),
        h2hFactorAway: h2hStats.h2hFactor.away.toFixed(3),
      }, 'H2H stats calculated');

      // === FASE CALCOLO (nessuna API call, solo matematica) ===
      logger.debug('All data fetched, starting calculations...');

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

      // 6.5. Applica Form Momentum a lambda
      const lambdaHomeOriginal = poissonResult.lambdaHome;
      const lambdaAwayOriginal = poissonResult.lambdaAway;
      
      poissonResult.lambdaHome *= homeForm.formFactor;
      poissonResult.lambdaAway *= awayForm.formFactor;
      
      logger.info({
        home: {
          lambdaOriginal: lambdaHomeOriginal.toFixed(2),
          formFactor: homeForm.formFactor.toFixed(2),
          lambdaAfterForm: poissonResult.lambdaHome.toFixed(2),
          formBoost: ((homeForm.formFactor - 1) * 100).toFixed(1) + '%',
        },
        away: {
          lambdaOriginal: lambdaAwayOriginal.toFixed(2),
          formFactor: awayForm.formFactor.toFixed(2),
          lambdaAfterForm: poissonResult.lambdaAway.toFixed(2),
          formBoost: ((awayForm.formFactor - 1) * 100).toFixed(1) + '%',
        },
      }, 'Lambda adjusted with form momentum');

      // 6.6. Applica H2H factor a lambda
      const lambdaHomeAfterForm = poissonResult.lambdaHome;
      const lambdaAwayAfterForm = poissonResult.lambdaAway;
      
      poissonResult.lambdaHome *= h2hStats.h2hFactor.home;
      poissonResult.lambdaAway *= h2hStats.h2hFactor.away;
      
      logger.info({
        home: {
          lambdaAfterForm: lambdaHomeAfterForm.toFixed(2),
          h2hFactor: h2hStats.h2hFactor.home.toFixed(3),
          lambdaFinal: poissonResult.lambdaHome.toFixed(2),
          h2hBoost: ((h2hStats.h2hFactor.home - 1) * 100).toFixed(1) + '%',
          totalBoost: ((poissonResult.lambdaHome / lambdaHomeOriginal - 1) * 100).toFixed(1) + '%',
        },
        away: {
          lambdaAfterForm: lambdaAwayAfterForm.toFixed(2),
          h2hFactor: h2hStats.h2hFactor.away.toFixed(3),
          lambdaFinal: poissonResult.lambdaAway.toFixed(2),
          h2hBoost: ((h2hStats.h2hFactor.away - 1) * 100).toFixed(1) + '%',
          totalBoost: ((poissonResult.lambdaAway / lambdaAwayOriginal - 1) * 100).toFixed(1) + '%',
        },
      }, 'Lambda adjusted with H2H factor');

      // 6.7. Applica Injuries Impact factor a lambda
      // TODO: Implement analyzeMatchInjuriesImpact in Sportsmonks injuries service
      let injuriesAnalysis = null;
      /*
      const injuriesAnalysis = await injuriesService.analyzeMatchInjuriesImpact(
        input.homeTeamId,
        input.awayTeamId,
        input.fixtureId,
        input.season
      );
      */
      
      let lambdaHomeBeforeInjuries = poissonResult.lambdaHome;
      let lambdaAwayBeforeInjuries = poissonResult.lambdaAway;
      
      if (injuriesAnalysis) {
        // Apply attacking multipliers
        poissonResult.lambdaHome *= injuriesAnalysis.home.impactFactor.attacking;
        poissonResult.lambdaAway *= injuriesAnalysis.away.impactFactor.attacking;
        
        logger.info({
          home: {
            lambdaBeforeInjuries: lambdaHomeBeforeInjuries.toFixed(2),
            injuriesSeverity: injuriesAnalysis.home.severityScore,
            attackingImpact: injuriesAnalysis.home.impactFactor.attacking.toFixed(3),
            lambdaAfterInjuries: poissonResult.lambdaHome.toFixed(2),
            injuriesBoost: ((injuriesAnalysis.home.impactFactor.attacking - 1) * 100).toFixed(1) + '%',
            totalBoostFromOriginal: ((poissonResult.lambdaHome / lambdaHomeOriginal - 1) * 100).toFixed(1) + '%',
          },
          away: {
            lambdaBeforeInjuries: lambdaAwayBeforeInjuries.toFixed(2),
            injuriesSeverity: injuriesAnalysis.away.severityScore,
            attackingImpact: injuriesAnalysis.away.impactFactor.attacking.toFixed(3),
            lambdaAfterInjuries: poissonResult.lambdaAway.toFixed(2),
            injuriesBoost: ((injuriesAnalysis.away.impactFactor.attacking - 1) * 100).toFixed(1) + '%',
            totalBoostFromOriginal: ((poissonResult.lambdaAway / lambdaAwayOriginal - 1) * 100).toFixed(1) + '%',
          },
          impactDescription: injuriesAnalysis.impactDescription,
        }, 'Lambda adjusted with injuries impact');
      } else {
        logger.debug('No injuries analysis available');
      }

      // 6.8. Applica League Strength Adjustment
      const leagueStrength = getLeagueStrength(input.leagueId);
      const lambdaHomeBeforeLeague = poissonResult.lambdaHome;
      const lambdaAwayBeforeLeague = poissonResult.lambdaAway;
      
      poissonResult.lambdaHome *= leagueStrength.coefficient;
      poissonResult.lambdaAway *= leagueStrength.coefficient;
      
      logger.info({
        league: {
          id: input.leagueId,
          name: leagueStrength.name,
          country: leagueStrength.country,
          tier: leagueStrength.tier,
          coefficient: leagueStrength.coefficient.toFixed(2),
        },
        home: {
          lambdaBeforeLeague: lambdaHomeBeforeLeague.toFixed(2),
          lambdaAfterLeague: poissonResult.lambdaHome.toFixed(2),
          leagueAdjustment: ((leagueStrength.coefficient - 1) * 100).toFixed(1) + '%',
          totalBoostFromOriginal: ((poissonResult.lambdaHome / lambdaHomeOriginal - 1) * 100).toFixed(1) + '%',
        },
        away: {
          lambdaBeforeLeague: lambdaAwayBeforeLeague.toFixed(2),
          lambdaAfterLeague: poissonResult.lambdaAway.toFixed(2),
          leagueAdjustment: ((leagueStrength.coefficient - 1) * 100).toFixed(1) + '%',
          totalBoostFromOriginal: ((poissonResult.lambdaAway / lambdaAwayOriginal - 1) * 100).toFixed(1) + '%',
        },
      }, '🏆 League strength adjustment applied');

      // 7. Blend risultati
      const blendedResult = blender.blend(
        empiricResult,
        poissonResult,
        calculationConfig.blendEmpiric,
        calculationConfig.blendPoisson
      );

      // 7.5. Market Odds Calibration con Sportsmonks 🆕
      let marketOdds = null;
      let calibrationResult = null;
      let realOdds = null; // 🆕 Quote reali da mostrare nel frontend
      
      // PRIORITÀ 1: Prova a recuperare quote reali da Sportsmonks usando i nomi delle squadre
      logger.info({ 
        fixtureId: input.fixtureId,
        homeTeam: input.homeTeamName, 
        awayTeam: input.awayTeamName 
      }, '🎲 Fetching real odds from Sportsmonks');
      
      try {
        // Try with fixture ID first if available (most reliable)
        if (input.fixtureId && input.fixtureId > 0) {
          logger.info('🔍 Attempting to fetch odds by Sportsmonks fixture ID...');
          realOdds = await sportsmonksOdds.fetchOddsByFixtureId(input.fixtureId);
        }
        
        // Fallback: try with team names if fixture ID didn't work
        if (!realOdds && input.homeTeamName && input.awayTeamName) {
          logger.info('🔍 Attempting to fetch odds by team names...');
          realOdds = await sportsmonksOdds.fetchOddsByTeamNames(
            input.homeTeamName,
            input.awayTeamName,
            undefined,
            input.fixtureId // Pass fixture ID if available to skip mapping
          );
        }
        
        if (realOdds) {
          logger.info({
            fixtureId: input.fixtureId,
            bookmakers: realOdds.bookmakerCount,
            home: realOdds.odds1X2.home.toFixed(2),
            draw: realOdds.odds1X2.draw.toFixed(2),
            away: realOdds.odds1X2.away.toFixed(2),
          }, '✅ Real odds fetched from Sportsmonks');
          
          // Converti in formato MarketOdds per calibrazione
          marketOdds = {
            prob1: realOdds.odds1X2.prob1,
            probX: realOdds.odds1X2.probX,
            prob2: realOdds.odds1X2.prob2,
            over25: realOdds.oddsOverUnder ? 1 / realOdds.oddsOverUnder.over25 : blendedResult.final.underOver['2.5'].over,
            under25: realOdds.oddsOverUnder ? 1 / realOdds.oddsOverUnder.under25 : blendedResult.final.underOver['2.5'].under,
            rawOdds: {
              home: realOdds.odds1X2.home,
              draw: realOdds.odds1X2.draw,
              away: realOdds.odds1X2.away,
              over25: realOdds.oddsOverUnder?.over25,
              under25: realOdds.oddsOverUnder?.under25,
            },
            bookmakerCount: realOdds.bookmakerCount,
            overround: realOdds.overround,
          };
        } else {
          logger.warn({ fixtureId: input.fixtureId }, '⚠️ No odds found for fixture - using model predictions');
        }
      } catch (error: any) {
        logger.error({ error: error.message }, '❌ Error fetching real odds');
      }
      
      // PRIORITÀ 2: Se non trovate con fixtureId, NON cercare per nome
      // API-Football richiede Team ID (intero), non supporta ricerca per nome
      if (!marketOdds) {
        logger.warn({ 
          homeTeam: input.homeTeamName, 
          awayTeam: input.awayTeamName 
        }, '⚠️ No valid fixtureId - skipping odds fetch (manual predictions cannot fetch real odds)');
        
        // Per predizioni manuali, usiamo solo le quote del modello
        // Le quote reali sono disponibili solo per partite programmate con fixtureId valido
      }
      
      // Se abbiamo le quote di mercato, applica calibrazione
      if (marketOdds) {
        calibrationResult = calibrationService.calibrate(
          {
            prob1: blendedResult.final.prob1,
            probX: blendedResult.final.probX,
            prob2: blendedResult.final.prob2,
            over25: blendedResult.final.underOver['2.5'].over,
            under25: blendedResult.final.underOver['2.5'].under,
          },
          marketOdds
        );
        
        // Update blended result con probabilità calibrate
        blendedResult.final.prob1 = calibrationResult.prob1;
        blendedResult.final.probX = calibrationResult.probX;
        blendedResult.final.prob2 = calibrationResult.prob2;
        blendedResult.final.underOver['2.5'].over = calibrationResult.over25;
        blendedResult.final.underOver['2.5'].under = calibrationResult.under25;
        
        logger.info({
          calibrated: true,
          confidenceBoost: (calibrationResult.confidenceBoost * 100).toFixed(1) + '%',
          valueBets: calibrationResult.valueBets.length,
        }, '✅ Market calibration applied');
      } else {
        logger.debug('No market odds available - using model predictions');
      }

      // 8. Valida coerenza
      const validation = blender.validateResults(blendedResult);
      if (!validation.valid) {
        logger.warn({ warnings: validation.warnings }, 'Validation warnings');
      }

      // 9. Calcola confidence (con xG adjustment e market calibration boost)
      let confidenceOverall = confidenceCalculator.calculate(
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
      ).overall;
      
      // Apply market calibration confidence boost
      if (calibrationResult && calibrationResult.confidenceBoost > 0) {
        const originalConfidence = confidenceOverall;
        confidenceOverall = Math.min(1.0, confidenceOverall + calibrationResult.confidenceBoost);
        
        logger.info({
          originalConfidence: (originalConfidence * 100).toFixed(1) + '%',
          marketBoost: (calibrationResult.confidenceBoost * 100).toFixed(1) + '%',
          finalConfidence: (confidenceOverall * 100).toFixed(1) + '%',
        }, 'Confidence boosted by market agreement');
      }
      
      // Apply league strength confidence adjustment
      const confidenceBeforeLeague = confidenceOverall;
      confidenceOverall *= leagueStrength.confidenceFactor;
      
      logger.info({
        confidenceBeforeLeague: (confidenceBeforeLeague * 100).toFixed(1) + '%',
        leagueConfidenceFactor: leagueStrength.confidenceFactor.toFixed(2),
        confidenceAfterLeague: (confidenceOverall * 100).toFixed(1) + '%',
        adjustment: ((leagueStrength.confidenceFactor - 1) * 100).toFixed(1) + '%',
      }, '🏆 Confidence adjusted by league strength');
      
      const confidence = {
        ...confidenceCalculator.calculate(
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
            lowXgConsistency: false,
            xgDivergenceThreshold: calculationConfig.xgDivergenceThreshold,
          } : undefined
        ),
        overall: confidenceOverall,
      };

      // 10. Calcola xG adjustment per mercati
      const xgAdjustment = xgData ? this.calculateXGMarketAdjustment(xgData) : undefined;

      // 11. Classifica forza per ogni mercato (con xG rules)
      const strength = this.classifyAllMarkets(
        blendedResult.final,
        confidence.overall,
        xgAdjustment
      );

      // 11.5. 🆕 Calcola ML Prediction usando Dixon-Coles + Time-Weighted Analysis
      logger.info('🤖 Calculating ML prediction...');
      const mlPrediction = mlPredictor.predictMatch(
        homeHistory,
        awayHistory,
        h2hMatches,
        input.homeTeamId,
        input.awayTeamId,
        2.7, // League average goals (TODO: make this league-specific)
        input.leagueName // 🆕 Pass league name for league-specific home advantage
      );
      
      logger.info({
        mlPrediction: {
          mostLikely: mlPrediction.mostLikely,
          probabilities: {
            home: `${(mlPrediction.homeWinProb * 100).toFixed(1)}%`,
            draw: `${(mlPrediction.drawProb * 100).toFixed(1)}%`,
            away: `${(mlPrediction.awayWinProb * 100).toFixed(1)}%`,
          },
          expectedGoals: {
            home: mlPrediction.expectedGoalsHome.toFixed(2),
            away: mlPrediction.expectedGoalsAway.toFixed(2),
          },
          confidence: `${(mlPrediction.confidence * 100).toFixed(0)}%`,
          topScores: mlPrediction.scorePredictions.slice(0, 3).map(sp => ({
            score: sp.score,
            prob: `${(sp.probability * 100).toFixed(1)}%`,
          })),
        },
      }, '🤖 ML Prediction completed');

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
        awayHistory,
        homeForm,
        awayForm,
        h2hStats,
        calibrationResult,
        injuriesAnalysis,
        realOdds, // 🆕 Passa le quote reali
        mlPrediction // 🆕 Passa la predizione ML
      );

    } catch (error) {
      logger.error({ error, fixtureId: input.fixtureId }, 'Prediction calculation failed');
      throw error;
    }
  }

  /**
   * Fetch Expected Goals data from API-FOOTBALL
   */
  private async fetchExpectedGoals(fixtureId: number, referenceDate?: Date): Promise<ExpectedGoalsData | null> {
    try {
      logger.debug({ fixtureId }, 'Fetching xG data from API-FOOTBALL');
      const xgData = await statisticsService.getExpectedGoals(fixtureId, referenceDate);
      
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
   * Fetch dati storici (SEQUENZIALE per evitare rate limit)
   * Con cache Redis (TTL: 1 ora) per ridurre chiamate API
   */
  private async fetchHistoricalData(input: PredictionInput): Promise<{
    homeHistory: MatchHistoryData[];
    awayHistory: MatchHistoryData[];
  }> {
    logger.debug('Fetching historical data (sequential) from Sportsmonks');

    // Fetch SEQUENZIALE (non parallelo) per rate limit
    // 🆕 Passa teamName per il mapping ID corretto
    // 🔧 FIX: Usa getTeamHistory invece di getTeamHistoryByVenue per analizzare TUTTE le partite
    const homeHistory = await statisticsService.getTeamHistory(
      input.homeTeamId,
      input.season,
      calculationConfig.historyGames,
      input.homeTeamName, // 🆕 Pass team name for ID mapping
      input.referenceDate // 🆕 Temporal constraint to prevent data leakage
    );

    const awayHistory = await statisticsService.getTeamHistory(
      input.awayTeamId,
      input.season,
      calculationConfig.historyGames,
      input.awayTeamName, // 🆕 Pass team name for ID mapping
      input.referenceDate // 🆕 Temporal constraint to prevent data leakage
    );

    // NUOVO: Popola cache xG per partite storiche (background - non blocca predizione)
    void this.populateXGCache([...homeHistory, ...awayHistory]);

    return { homeHistory, awayHistory };
  }

  /**
   * Popola cache xG per partite storiche (async background)
   */
  private async populateXGCache(history: MatchHistoryData[]): Promise<void> {
    try {
      // Filtra solo partite SENZA xG già cached
      const fixturesNeedingXG = history.filter(match => 
        match.xg_home === null || match.xg_away === null
      );

      if (fixturesNeedingXG.length === 0) {
        logger.debug('All historical matches already have xG data');
        return;
      }

      logger.info({ 
        total: history.length,
        needingXG: fixturesNeedingXG.length 
      }, 'Populating xG cache for historical matches');

      // Limita a max 10 partite per richiesta (evita sovraccarico API)
      const toFetch = fixturesNeedingXG.slice(0, 10);

      // Fetch xG in parallelo (max 3 contemporanee) usando Sportsmonks
      const chunks = [];
      for (let i = 0; i < toFetch.length; i += 3) {
        const chunk = toFetch.slice(i, i + 3);
        chunks.push(chunk);
      }

      for (const chunk of chunks) {
        await Promise.all(
          chunk.map(async match => {
            try {
              const xgData = await statisticsService.getExpectedGoals(match.fixtureId);
              if (xgData) {
                // Update fixture with xG data
                await prisma.fixture.update({
                  where: { apiId: match.fixtureId },
                  data: {
                    xg_home: xgData.homeXg,
                    xg_away: xgData.awayXg,
                  },
                }).catch(() => {}); // Ignore errors silently
              }
            } catch (err) {
              logger.warn({ err, fixtureId: match.fixtureId }, 'Failed to cache xG');
            }
          })
        );
      }

      logger.info({ cached: toFetch.length }, 'xG cache population completed');
    } catch (error) {
      logger.warn({ error }, 'xG cache population failed - continuing without xG');
    }
  }

  /**
   * Fetch infortuni
   */
  private async fetchInjuries(fixtureId: number): Promise<PlayerInjuryInfo[]> {
    try {
      const injuries = await injuriesService.getFixtureSidelined(fixtureId);
      return [...injuries.home, ...injuries.away];
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
      const lineups = await lineupsService.getFixtureLineups(fixtureId);
      const result: LineupInfo[] = [];
      if (lineups.home) result.push(lineups.home);
      if (lineups.away) result.push(lineups.away);
      return result;
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
    
    // NUOVO: Soglie più realistiche basate sul numero minimo di partite
    // Minimo assoluto: 6 partite (3 per squadra)
    // Buono: 10+ partite
    // Ottimo: 20+ partite
    
    if (totalMatches >= 20) return 'EXCELLENT';
    if (totalMatches >= 14) return 'GOOD';
    if (totalMatches >= 10) return 'FAIR';
    if (totalMatches >= 6) return 'POOR';
    
    logger.warn({ 
      totalMatches, 
      homeMatches: homeHistory.length, 
      awayMatches: awayHistory.length 
    }, 'Insufficient data for prediction');
    
    return 'INSUFFICIENT';
  }

  /**
   * Calcola statistiche Head-to-Head e H2H factor
   * @param h2hMatches Scontri diretti (most recent first)
   * @param currentHomeId ID della squadra attualmente casa
   * @param currentAwayId ID della squadra attualmente trasferta
   * @returns H2H stats e factor (0.85-1.15)
   */
  private calculateH2HStats(
    h2hMatches: any[],
    currentHomeId: number,
    currentAwayId: number
  ): {
    totalMatches: number;
    homeWins: number;
    awayWins: number;
    draws: number;
    homeWinRate: number;
    awayWinRate: number;
    avgGoalsHome: number;
    avgGoalsAway: number;
    dominance: 'HOME' | 'AWAY' | 'BALANCED';
    dominanceLevel: number; // 0-1 (0.5 = balanced)
    h2hFactor: {
      home: number; // 0.85-1.15
      away: number; // 0.85-1.15
    };
    recentResults: string; // "W-L-D-W-W" from current home perspective
  } {
    if (!h2hMatches || h2hMatches.length === 0) {
      logger.debug('No H2H data available - returning neutral stats');
      return {
        totalMatches: 0,
        homeWins: 0,
        awayWins: 0,
        draws: 0,
        homeWinRate: 0.33,
        awayWinRate: 0.33,
        avgGoalsHome: 1.5,
        avgGoalsAway: 1.5,
        dominance: 'BALANCED',
        dominanceLevel: 0.5,
        h2hFactor: { home: 1.0, away: 1.0 },
        recentResults: '-',
      };
    }

    let homeWins = 0;
    let awayWins = 0;
    let draws = 0;
    let totalGoalsHome = 0;
    let totalGoalsAway = 0;
    const results: string[] = [];

    // Analizza ogni match H2H
    h2hMatches.forEach(match => {
      const wasHome = match.homeTeamId === currentHomeId;
      const wasAway = match.awayTeamId === currentHomeId;

      if (wasHome) {
        // Current home team era in casa
        totalGoalsHome += match.homeGoals;
        totalGoalsAway += match.awayGoals;

        if (match.winner === 'HOME') {
          homeWins++;
          results.push('W');
        } else if (match.winner === 'AWAY') {
          awayWins++;
          results.push('L');
        } else {
          draws++;
          results.push('D');
        }
      } else if (wasAway) {
        // Current home team era in trasferta (inverti)
        totalGoalsHome += match.awayGoals;
        totalGoalsAway += match.homeGoals;

        if (match.winner === 'AWAY') {
          homeWins++;
          results.push('W');
        } else if (match.winner === 'HOME') {
          awayWins++;
          results.push('L');
        } else {
          draws++;
          results.push('D');
        }
      }
    });

    const totalMatches = h2hMatches.length;
    const homeWinRate = homeWins / totalMatches;
    const awayWinRate = awayWins / totalMatches;
    const avgGoalsHome = totalGoalsHome / totalMatches;
    const avgGoalsAway = totalGoalsAway / totalMatches;

    // Dominance level (0 = away dominant, 0.5 = balanced, 1 = home dominant)
    const dominanceLevel = 0.5 + (homeWinRate - awayWinRate) / 2;

    let dominance: 'HOME' | 'AWAY' | 'BALANCED';
    if (dominanceLevel >= 0.65) {
      dominance = 'HOME';
    } else if (dominanceLevel <= 0.35) {
      dominance = 'AWAY';
    } else {
      dominance = 'BALANCED';
    }

    // H2H Factor calculation (0.85 - 1.15 range)
    // Strong home dominance (>70%) → home +15%, away -15%
    // Balanced → both 1.0
    // Strong away dominance (>70%) → home -15%, away +15%
    const factorRange = 0.15; // Max adjustment ±15%
    const homeFactor = 0.85 + (dominanceLevel * 2 * factorRange);
    const awayFactor = 1.15 - (dominanceLevel * 2 * factorRange);

    const recentResults = results.slice(0, 5).join('-') || '-';

    logger.info({
      totalMatches,
      homeWins,
      awayWins,
      draws,
      homeWinRate: (homeWinRate * 100).toFixed(1) + '%',
      awayWinRate: (awayWinRate * 100).toFixed(1) + '%',
      avgGoalsHome: avgGoalsHome.toFixed(2),
      avgGoalsAway: avgGoalsAway.toFixed(2),
      dominance,
      dominanceLevel: (dominanceLevel * 100).toFixed(1) + '%',
      h2hFactorHome: homeFactor.toFixed(3),
      h2hFactorAway: awayFactor.toFixed(3),
      recentResults,
    }, 'H2H stats calculated');

    return {
      totalMatches,
      homeWins,
      awayWins,
      draws,
      homeWinRate,
      awayWinRate,
      avgGoalsHome,
      avgGoalsAway,
      dominance,
      dominanceLevel,
      h2hFactor: {
        home: homeFactor,
        away: awayFactor,
      },
      recentResults,
    };
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
    awayHistory: MatchHistoryData[],
    homeForm: FormMomentumResult,
    awayForm: FormMomentumResult,
    h2hStats?: {
      totalMatches: number;
      homeWins: number;
      awayWins: number;
      draws: number;
      homeWinRate: number;
      awayWinRate: number;
      avgGoalsHome: number;
      avgGoalsAway: number;
      dominance: 'HOME' | 'AWAY' | 'BALANCED';
      dominanceLevel: number;
      h2hFactor: { home: number; away: number };
      recentResults: string;
    },
    calibrationResult?: any,
    injuriesAnalysis?: {
      home: {
        teamId: number;
        teamName: string;
        players: PlayerInjuryInfo[];
        totalInjuries: number;
        severityScore: number;
        impactFactor: { attacking: number; defensive: number };
      };
      away: {
        teamId: number;
        teamName: string;
        players: PlayerInjuryInfo[];
        totalInjuries: number;
        severityScore: number;
        impactFactor: { attacking: number; defensive: number };
      };
      homeAdvantage: boolean;
      awayAdvantage: boolean;
      balanced: boolean;
      impactDescription: string;
    } | null,
    realOdds?: any, // 🆕 Quote reali da API-Football
    mlPrediction?: ReturnType<typeof mlPredictor.predictMatch> // 🆕 ML Prediction
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
      
      // Form Momentum (MULTI-WINDOW + TREND)
      formMomentum: {
        home: {
          formScore: homeForm.formScore,
          formFactor: homeForm.formFactor,
          formLabel: homeForm.formLabel,
          recentResults: homeForm.recentResults,
          trend: homeForm.trend,
          windows: homeForm.windows,
        },
        away: {
          formScore: awayForm.formScore,
          formFactor: awayForm.formFactor,
          formLabel: awayForm.formLabel,
          recentResults: awayForm.recentResults,
          trend: awayForm.trend,
          windows: awayForm.windows,
        },
      },
      
      // Head-to-Head Stats (optional)
      ...(h2hStats && h2hStats.totalMatches > 0 && {
        h2hAnalysis: {
          totalMatches: h2hStats.totalMatches,
          homeWins: h2hStats.homeWins,
          awayWins: h2hStats.awayWins,
          draws: h2hStats.draws,
          homeWinRate: h2hStats.homeWinRate,
          awayWinRate: h2hStats.awayWinRate,
          avgGoalsHome: h2hStats.avgGoalsHome,
          avgGoalsAway: h2hStats.avgGoalsAway,
          dominance: h2hStats.dominance,
          dominanceLevel: h2hStats.dominanceLevel,
          h2hFactor: {
            home: h2hStats.h2hFactor.home,
            away: h2hStats.h2hFactor.away,
          },
          recentResults: h2hStats.recentResults,
        },
      }),

      // Market Odds Calibration (optional)
      ...(calibrationResult && {
        marketCalibration: {
          calibrated: true,
          modelProbabilities: {
            prob1: calibrationResult.modelProb1,
            probX: calibrationResult.modelProbX,
            prob2: calibrationResult.modelProb2,
          },
          marketProbabilities: {
            prob1: calibrationResult.marketProb1,
            probX: calibrationResult.marketProbX,
            prob2: calibrationResult.marketProb2,
            bookmakerCount: 0, // Will be filled by OddsService if available
            overround: 0,
          },
          calibratedProbabilities: {
            prob1: calibrationResult.prob1,
            probX: calibrationResult.probX,
            prob2: calibrationResult.prob2,
          },
          agreement: calibrationResult.agreement,
          confidenceBoost: calibrationResult.confidenceBoost,
          valueBets: calibrationResult.valueBets || [],
        },
      }),

      // Injuries & Suspensions Analysis (optional)
      ...(injuriesAnalysis && {
        injuriesAnalysis: {
          home: {
            teamId: injuriesAnalysis.home.teamId,
            teamName: injuriesAnalysis.home.teamName,
            players: injuriesAnalysis.home.players,
            totalInjuries: injuriesAnalysis.home.totalInjuries,
            severityScore: injuriesAnalysis.home.severityScore,
            impactFactor: injuriesAnalysis.home.impactFactor,
          },
          away: {
            teamId: injuriesAnalysis.away.teamId,
            teamName: injuriesAnalysis.away.teamName,
            players: injuriesAnalysis.away.players,
            totalInjuries: injuriesAnalysis.away.totalInjuries,
            severityScore: injuriesAnalysis.away.severityScore,
            impactFactor: injuriesAnalysis.away.impactFactor,
          },
          homeAdvantage: injuriesAnalysis.homeAdvantage,
          awayAdvantage: injuriesAnalysis.awayAdvantage,
          balanced: injuriesAnalysis.balanced,
          impactDescription: injuriesAnalysis.impactDescription,
        },
      }),
      
      // 🆕 Quote reali dai bookmaker (se disponibili)
      ...(realOdds && {
        realOdds: {
          odds1X2: {
            home: realOdds.odds1X2.home,
            draw: realOdds.odds1X2.draw,
            away: realOdds.odds1X2.away,
            prob1: realOdds.odds1X2.prob1,
            probX: realOdds.odds1X2.probX,
            prob2: realOdds.odds1X2.prob2,
          },
          ...(realOdds.oddsOverUnder && {
            oddsOverUnder: {
              over15: realOdds.oddsOverUnder.over15,
              under15: realOdds.oddsOverUnder.under15,
              over25: realOdds.oddsOverUnder.over25,
              under25: realOdds.oddsOverUnder.under25,
              over35: realOdds.oddsOverUnder.over35,
              under35: realOdds.oddsOverUnder.under35,
            },
          }),
          ...(realOdds.oddsBTTS && {
            oddsBTTS: {
              yes: realOdds.oddsBTTS.yes,
              no: realOdds.oddsBTTS.no,
            },
          }),
          ...(realOdds.oddsDoubleChance && {
            oddsDoubleChance: {
              '1X': realOdds.oddsDoubleChance.homeOrDraw,
              'X2': realOdds.oddsDoubleChance.drawOrAway,
              '12': realOdds.oddsDoubleChance.homeOrAway,
            },
          }),
          bookmakerCount: realOdds.bookmakerCount,
          overround: realOdds.overround,
          lastUpdate: realOdds.lastUpdate,
        },
      }),
      
      // 🤖 Machine Learning Prediction (Dixon-Coles + Time-Weighted)
      ...(mlPrediction && {
        mlPrediction: {
          probabilities: {
            home: mlPrediction.homeWinProb,
            draw: mlPrediction.drawProb,
            away: mlPrediction.awayWinProb,
          },
          expectedGoals: {
            home: mlPrediction.expectedGoalsHome,
            away: mlPrediction.expectedGoalsAway,
            total: mlPrediction.expectedGoalsHome + mlPrediction.expectedGoalsAway,
          },
          confidence: mlPrediction.confidence,
          mostLikely: mlPrediction.mostLikely,
          topScores: mlPrediction.scorePredictions.slice(0, 5).map(sp => ({
            score: sp.score,
            probability: sp.probability,
          })),
          impliedOdds: {
            home: mlPredictor.probabilityToOdds(mlPrediction.homeWinProb),
            draw: mlPredictor.probabilityToOdds(mlPrediction.drawProb),
            away: mlPredictor.probabilityToOdds(mlPrediction.awayWinProb),
          },
          factors: {
            homeStrength: {
              attack: mlPrediction.factors.homeStrength.attack,
              defense: mlPrediction.factors.homeStrength.defense,
              form: mlPrediction.factors.homeStrength.form,
              xgPerformance: mlPrediction.factors.homeStrength.xgPerformance,
            },
            awayStrength: {
              attack: mlPrediction.factors.awayStrength.attack,
              defense: mlPrediction.factors.awayStrength.defense,
              form: mlPrediction.factors.awayStrength.form,
              xgPerformance: mlPrediction.factors.awayStrength.xgPerformance,
            },
            homeAdvantage: mlPrediction.factors.homeAdvantage,
            formDifferential: mlPrediction.factors.formDifferential,
            h2hAdvantage: mlPrediction.factors.h2hAdvantage,
          },
        },
      }),
      
      // Risultati esatti più probabili (top 5)
      mostProbableScores: poissonEngine.getMostProbableScores(poisson.scoreMatrix, 5),
      
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
      },
      
      teamStats: {
        home: {
          xg: homeXGAvg,
          xga: homeXGAAvg,
          goalsScored: 0,
          goalsConceded: 0,
        },
        away: {
          xg: awayXGAvg,
          xga: awayXGAAvg,
          goalsScored: 0,
          goalsConceded: 0,
        },
      },
      
      formMomentum: {
        home: {
          trend: 'STABLE',
          score: 0,
          recentResults: [],
          confidence: 0,
        },
        away: {
          trend: 'STABLE',
          score: 0,
          recentResults: [],
          confidence: 0,
        },
        momentum: 'NEUTRAL',
      },
      
      recommendations: [],
    };
  }

  /**
   * Calcola xG/xGA medio dalla storia delle partite
   * HYBRID CACHE: Preferisce xG reali quando disponibili (≥10 partite con xG)
   * Altrimenti usa goal reali come proxy (fallback)
   */
  private calculateAvgXG(history: MatchHistoryData[], forGoals: boolean): number {
    if (history.length === 0) return 0;
    
    // Conta quante partite hanno xG reali disponibili
    const matchesWithXG = history.filter(match => {
      if (forGoals) {
        // Per xG offensivi: cerca xg_home o xg_away a seconda del ruolo
        return match.isHome ? match.xg_home != null : match.xg_away != null;
      } else {
        // Per xG difensivi (xGA): cerca xga_home o xga_away
        return match.isHome ? match.xga_home != null : match.xga_away != null;
      }
    });

    const xgAvailable = matchesWithXG.length >= 10; // Soglia minima: 10 partite con xG

    if (xgAvailable) {
      // Usa xG reali dalla cache
      const totalXG = matchesWithXG.reduce((sum, match) => {
        const xgValue = forGoals
          ? (match.isHome ? match.xg_home! : match.xg_away!)
          : (match.isHome ? match.xga_home! : match.xga_away!);
        return sum + xgValue;
      }, 0);

      const avgXG = parseFloat((totalXG / matchesWithXG.length).toFixed(2));
      
      logger.info({
        historyLength: history.length,
        matchesWithXG: matchesWithXG.length,
        forGoals,
        avgXG,
        method: 'REAL_XG'
      }, 'Calculated avg xG using REAL xG data from cache');

      return avgXG;
    } else {
      // Fallback: usa goal reali come proxy
      const totalGoals = history.reduce((sum, match) => {
        const goals = forGoals 
          ? (match.isHome ? match.homeGoals : match.awayGoals)
          : (match.isHome ? match.awayGoals : match.homeGoals);
        return sum + goals;
      }, 0);

      const avgGoals = parseFloat((totalGoals / history.length).toFixed(2));

      logger.warn({
        historyLength: history.length,
        matchesWithXG: matchesWithXG.length,
        threshold: 10,
        forGoals,
        avgGoals,
        method: 'GOAL_PROXY'
      }, 'Insufficient xG data - using goal average as proxy');

      return avgGoals;
    }
  }
}

export const predictionEngine = new PredictionEngine();
