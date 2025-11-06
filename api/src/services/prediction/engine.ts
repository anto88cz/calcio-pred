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
  h2hService,
  type MatchHistoryData,
  type PlayerInjuryInfo,
  type LineupInfo,
  type ExpectedGoalsData,
} from '../api-football';
import { oddsService, calibrationService } from '../odds';
import { config as _config, calculationConfig } from '../../config';
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

      // 4.5. Calcola Form Momentum
      const homeForm = this.calculateFormMomentum(homeHistory, 5);
      const awayForm = this.calculateFormMomentum(awayHistory, 5);
      
      logger.info({
        homeForm: {
          score: homeForm.formScore.toFixed(2),
          factor: homeForm.formFactor.toFixed(2),
          label: homeForm.formLabel,
          results: homeForm.recentResults,
        },
        awayForm: {
          score: awayForm.formScore.toFixed(2),
          factor: awayForm.formFactor.toFixed(2),
          label: awayForm.formLabel,
          results: awayForm.recentResults,
        },
      }, 'Form momentum calculated for both teams');

      // 4.6. Fetch e calcola H2H stats
      const h2hData = await h2hService.fetchH2H(input.homeTeamId, input.awayTeamId, 10);
      const h2hStats = this.calculateH2HStats(h2hData.matches, input.homeTeamId, input.awayTeamId);
      
      logger.info({
        h2hMatches: h2hStats.totalMatches,
        dominance: h2hStats.dominance,
        homeWinRate: (h2hStats.homeWinRate * 100).toFixed(1) + '%',
        h2hFactorHome: h2hStats.h2hFactor.home.toFixed(3),
        h2hFactorAway: h2hStats.h2hFactor.away.toFixed(3),
      }, 'H2H stats calculated');

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

      // 7. Blend risultati
      const blendedResult = blender.blend(
        empiricResult,
        poissonResult,
        calculationConfig.blendEmpiric,
        calculationConfig.blendPoisson
      );

      // 7.5. Market Odds Calibration (se abilitato)
      let marketOdds = null;
      let calibrationResult = null;
      
      if (calculationConfig.oddsCalibrationEnabled && input.homeTeamName && input.awayTeamName) {
        logger.info({ 
          homeTeam: input.homeTeamName, 
          awayTeam: input.awayTeamName 
        }, 'Fetching market odds for calibration');
        
        // Fetch odds
        marketOdds = await oddsService.fetchOddsByTeams(
          input.homeTeamName,
          input.awayTeamName
        );
        
        if (marketOdds) {
          // Apply calibration
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
          
          // Update blended result with calibrated probabilities
          blendedResult.final.prob1 = calibrationResult.prob1;
          blendedResult.final.probX = calibrationResult.probX;
          blendedResult.final.prob2 = calibrationResult.prob2;
          blendedResult.final.underOver['2.5'].over = calibrationResult.over25;
          blendedResult.final.underOver['2.5'].under = calibrationResult.under25;
          
          logger.info({
            calibrated: true,
            confidenceBoost: (calibrationResult.confidenceBoost * 100).toFixed(1) + '%',
            valueBets: calibrationResult.valueBets.length,
          }, 'Market calibration applied');
        } else {
          logger.debug('No market odds available - using model predictions');
        }
      } else if (!calculationConfig.oddsCalibrationEnabled) {
        logger.debug('Market calibration disabled (ODDS_API_KEY not configured)');
      } else {
        logger.debug('Team names not provided - skipping market calibration');
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
        calibrationResult
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
   * Fetch dati storici e popola cache xG
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

      // Fetch xG in parallelo (max 3 contemporanee)
      const { statisticsService } = await import('../api-football');
      const chunks = [];
      for (let i = 0; i < toFetch.length; i += 3) {
        const chunk = toFetch.slice(i, i + 3);
        chunks.push(chunk);
      }

      for (const chunk of chunks) {
        await Promise.all(
          chunk.map(match => 
            statisticsService.fetchAndCacheXG(match.fixtureId)
              .catch(err => logger.warn({ err, fixtureId: match.fixtureId }, 'Failed to cache xG'))
          )
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
   * Calcola Form Momentum (ultimi 5 match)
   * Formula: form_score = Σ(points × weight) / 15 (max)
   * Points: W=3, D=1, L=0
   * Weights: [2.0, 1.5, 1.2, 1.0, 0.8] (più recente = più peso)
   * Form factor: 0.7 + 0.6 * form_score
   * @returns { formScore: 0-1, formFactor: 0.7-1.3, formLabel: string }
   */
  private calculateFormMomentum(
    history: MatchHistoryData[],
    lastN: number = 5
  ): {
    formScore: number;
    formFactor: number;
    formLabel: string;
    recentResults: string; // Es: "W-W-D-L-W"
  } {
    if (history.length === 0) {
      return {
        formScore: 0.5,
        formFactor: 1.0,
        formLabel: 'UNKNOWN',
        recentResults: '-',
      };
    }

    // Prendi ultimi N match
    const recentMatches = history.slice(0, Math.min(lastN, history.length));
    
    // Weight esponenziale (più recente = più peso)
    const weights = [2.0, 1.5, 1.2, 1.0, 0.8];
    
    let totalPoints = 0;
    let maxPossible = 0;
    const results: string[] = [];

    recentMatches.forEach((match, index) => {
      const weight = weights[index] || 0.5;
      
      // Determina risultato (W/D/L)
      let points = 0;
      let result = '';
      
      if (match.isHome) {
        if (match.homeGoals > match.awayGoals) {
          points = 3; // Win
          result = 'W';
        } else if (match.homeGoals === match.awayGoals) {
          points = 1; // Draw
          result = 'D';
        } else {
          points = 0; // Loss
          result = 'L';
        }
      } else {
        if (match.awayGoals > match.homeGoals) {
          points = 3; // Win
          result = 'W';
        } else if (match.awayGoals === match.homeGoals) {
          points = 1; // Draw
          result = 'D';
        } else {
          points = 0; // Loss
          result = 'L';
        }
      }
      
      totalPoints += points * weight;
      maxPossible += 3 * weight; // Max 3 punti per match
      results.push(result);
    });

    // Form score normalizzato (0-1)
    const formScore = maxPossible > 0 ? totalPoints / maxPossible : 0.5;
    
    // Form factor per lambda adjustment (0.7 - 1.3)
    // Formula: 0.7 + 0.6*formScore
    // Se formScore = 0 (crisi totale) → factor = 0.7 (-30%)
    // Se formScore = 0.5 (media) → factor = 1.0 (neutro)
    // Se formScore = 1.0 (perfetto) → factor = 1.3 (+30%)
    const formFactor = 0.7 + 0.6 * formScore;
    
    // Label descrittivo
    let formLabel = '';
    if (formScore >= 0.80) formLabel = 'HOT'; // 🔥
    else if (formScore >= 0.60) formLabel = 'GOOD'; // ⚡
    else if (formScore >= 0.40) formLabel = 'AVERAGE'; // 📊
    else formLabel = 'COLD'; // ❄️
    
    const recentResults = results.join('-') || '-';

    logger.debug({
      recentMatches: recentMatches.length,
      totalPoints: totalPoints.toFixed(2),
      maxPossible: maxPossible.toFixed(2),
      formScore: formScore.toFixed(3),
      formFactor: formFactor.toFixed(3),
      formLabel,
      recentResults,
    }, 'Form momentum calculated');

    return {
      formScore,
      formFactor,
      formLabel,
      recentResults,
    };
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
    homeForm: { formScore: number; formFactor: number; formLabel: string; recentResults: string },
    awayForm: { formScore: number; formFactor: number; formLabel: string; recentResults: string },
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
    calibrationResult?: any
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
      
      // Form Momentum
      formMomentum: {
        home: {
          formScore: homeForm.formScore,
          formFactor: homeForm.formFactor,
          formLabel: homeForm.formLabel,
          recentResults: homeForm.recentResults,
        },
        away: {
          formScore: awayForm.formScore,
          formFactor: awayForm.formFactor,
          formLabel: awayForm.formLabel,
          recentResults: awayForm.recentResults,
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
        homeAdvantage: 0,
      },
      
      formMomentum: {
        home: {
          formScore: 0.5,
          formFactor: 1.0,
          formLabel: 'UNKNOWN',
          recentResults: '-',
        },
        away: {
          formScore: 0.5,
          formFactor: 1.0,
          formLabel: 'UNKNOWN',
          recentResults: '-',
        },
      },
      
      mostProbableScores: [],
      
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
