/**
 * Backtesting Framework
 * 
 * Valida accuracy del sistema di predizione su match storici.
 * Calcola metriche chiave: Brier Score, Accuracy, ROI, Calibration
 * 
 * USAGE:
 * const report = await backtester.runBacktest({
 *   startDate: '2024-08-01',
 *   endDate: '2024-11-01',
 *   leagues: [39, 135, 140], // Premier, Serie A, La Liga
 *   limit: 100
 * });
 */

import { predictionEngine } from '../prediction/engine';
import prisma from '../../lib/prisma';
import logger from '../../utils/logger';
import { FixtureStatus } from '@prisma/client';

export interface BacktestConfig {
  startDate: string;      // ISO date
  endDate: string;        // ISO date
  leagues: number[];      // League IDs
  limit?: number;         // Max fixtures to test (default: all)
  strengthFilter?: string; // 'GIOCALA' | 'FORTE' | 'ALL'
}

export interface BacktestResult {
  fixtureId: number;
  date: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  
  // Risultato reale
  actualResult: {
    homeGoals: number;
    awayGoals: number;
    outcome: '1' | 'X' | '2'; // 1=Home, X=Draw, 2=Away
  };
  
  // Predizione
  prediction: {
    prob1: number;
    probX: number;
    prob2: number;
    predictedOutcome: '1' | 'X' | '2';
    confidence: number;
    strength: string;
  };
  
  // Metriche
  correct1X2: boolean;
  brierScore: number;
}

export interface BacktestReport {
  config: BacktestConfig;
  summary: {
    totalMatches: number;
    dateRange: string;
    leagues: string[];
  };
  
  // Accuracy metrics
  accuracy: {
    overall1X2: number;           // % predizioni 1X2 corrette
    byStrength: {
      GIOCALA: number;
      FORTE: number;
      MEDIO: number;
      NEUTRALE: number;
    };
    overUnder25: number;          // % predizioni O/U 2.5 corrette
    btts: number;                 // % predizioni BTTS corrette
  };
  
  // Statistical quality
  brierScore: {
    overall: number;              // Overall Brier Score (target < 0.18)
    by1X2: {
      home: number;
      draw: number;
      away: number;
    };
  };
  
  // Calibration (prob predetta vs reale)
  calibration: {
    buckets: Array<{
      range: string;              // "60-70%"
      predictedProb: number;      // Media prob predetta
      actualFreq: number;         // Frequenza reale
      count: number;
    }>;
    calibrationError: number;     // Mean absolute difference
  };
  
  // ROI simulation
  roi: {
    flatBetting: number;          // Se scommetti 1€ su ogni predizione
    kellyBetting: number;         // Con Kelly Criterion
    strengthFiltered: {           // Solo GIOCALA/FORTE
      flatBetting: number;
      kellyBetting: number;
    };
  };
  
  // Detailed results
  results: BacktestResult[];
  
  // Performance by league
  byLeague: Record<string, {
    matches: number;
    accuracy: number;
    brierScore: number;
  }>;
}

export class Backtester {
  /**
   * Esegue backtest completo
   */
  async runBacktest(config: BacktestConfig): Promise<BacktestReport> {
    logger.info({ config }, '🧪 Starting backtest');
    
    const startTime = Date.now();
    
    // 1. Fetch fixtures storici nel range
    const fixtures = await this.fetchHistoricalFixtures(config);
    
    if (fixtures.length === 0) {
      throw new Error('No fixtures found in date range');
    }
    
    logger.info({ count: fixtures.length }, 'Fixtures loaded for backtesting');
    
    // 2. Calcola predizioni per ogni fixture
    const results: BacktestResult[] = [];
    
    for (let i = 0; i < fixtures.length; i++) {
      const fixture = fixtures[i];
      
      try {
        logger.debug({ 
          progress: `${i + 1}/${fixtures.length}`,
          fixture: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
        }, 'Processing fixture');
        
        const result = await this.backtestSingleFixture(fixture);
        results.push(result);
        
        // Progress log ogni 10 fixtures
        if ((i + 1) % 10 === 0) {
          logger.info({ 
            progress: `${i + 1}/${fixtures.length}`,
            elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
          }, 'Backtest progress');
        }
        
        // Rate limit rispetto (6 sec delay tra predizioni)
        if (i < fixtures.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 6000));
        }
        
      } catch (error) {
        logger.error({ 
          error, 
          fixtureId: fixture.id,
          fixture: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
        }, 'Failed to backtest fixture');
        // Continue con prossimo fixture
      }
    }
    
    // 3. Calcola metriche aggregate
    const report = this.generateReport(config, results, fixtures);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info({ 
      totalMatches: results.length,
      accuracy: `${report.accuracy.overall1X2.toFixed(1)}%`,
      brierScore: report.brierScore.overall.toFixed(3),
      elapsed: `${elapsed}s`,
    }, '✅ Backtest completed');
    
    return report;
  }
  
  /**
   * Fetch fixtures storici finiti (status FT)
   */
  private async fetchHistoricalFixtures(config: BacktestConfig) {
    const fixtures = await prisma.fixture.findMany({
      where: {
        date: {
          gte: new Date(config.startDate),
          lte: new Date(config.endDate),
        },
        leagueId: {
          in: config.leagues,
        },
        status: FixtureStatus.FINISHED, // Usa enum Prisma
        homeGoals: { not: null },
        awayGoals: { not: null },
      },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
      orderBy: {
        date: 'asc',
      },
      take: config.limit || undefined,
    });
    
    return fixtures;
  }
  
  /**
   * Backtest singolo fixture
   */
  private async backtestSingleFixture(fixture: any): Promise<BacktestResult> {
    // Calcola predizione usando dati PRE-MATCH
    const prediction = await predictionEngine.calculatePrediction({
      fixtureId: fixture.id,
      homeTeamId: fixture.homeTeam.apiId,
      awayTeamId: fixture.awayTeam.apiId,
      leagueId: fixture.leagueId,
      season: fixture.leagueSeason,
    });
    
    // Determina outcome reale
    const actualOutcome = 
      fixture.homeGoals > fixture.awayGoals ? '1' :
      fixture.homeGoals < fixture.awayGoals ? '2' : 'X';
    
    // Determina predicted outcome (max prob)
    const probs = {
      '1': prediction.market1X2.final.prob1,
      'X': prediction.market1X2.final.probX,
      '2': prediction.market1X2.final.prob2,
    };
    const predictedOutcome = Object.entries(probs).reduce((a, b) => 
      probs[a[0] as '1' | 'X' | '2'] > probs[b[0] as '1' | 'X' | '2'] ? a : b
    )[0] as '1' | 'X' | '2';
    
    // Calcola Brier Score per questo match
    const brierScore = this.calculateBrierScore(
      { '1': probs['1'], 'X': probs['X'], '2': probs['2'] },
      actualOutcome
    );
    
    return {
      fixtureId: fixture.id,
      date: fixture.date.toISOString().split('T')[0],
      homeTeam: fixture.homeTeam.name,
      awayTeam: fixture.awayTeam.name,
      league: fixture.leagueName,
      
      actualResult: {
        homeGoals: fixture.homeGoals,
        awayGoals: fixture.awayGoals,
        outcome: actualOutcome,
      },
      
      prediction: {
        prob1: probs['1'],
        probX: probs['X'],
        prob2: probs['2'],
        predictedOutcome,
        confidence: prediction.confidence,
        strength: prediction.market1X2.strength,
      },
      
      correct1X2: predictedOutcome === actualOutcome,
      brierScore,
    };
  }
  
  /**
   * Calcola Brier Score
   * Formula: (1/N) * Σ(predicted - actual)^2
   * Range: 0 (perfect) - 1 (worst)
   */
  private calculateBrierScore(
    predicted: { '1': number; 'X': number; '2': number },
    actual: '1' | 'X' | '2'
  ): number {
    const actualVector = {
      '1': actual === '1' ? 1 : 0,
      'X': actual === 'X' ? 1 : 0,
      '2': actual === '2' ? 1 : 0,
    };
    
    const score = 
      Math.pow(predicted['1'] - actualVector['1'], 2) +
      Math.pow(predicted['X'] - actualVector['X'], 2) +
      Math.pow(predicted['2'] - actualVector['2'], 2);
    
    return score / 3; // Normalizza per 3 outcomes
  }
  
  /**
   * Genera report finale
   */
  private generateReport(
    config: BacktestConfig,
    results: BacktestResult[],
    _fixtures: any[]
  ): BacktestReport {
    // Overall accuracy
    const correct = results.filter(r => r.correct1X2).length;
    const accuracy = (correct / results.length) * 100;
    
    // Accuracy by strength
    const byStrength = {
      GIOCALA: this.calculateAccuracyByStrength(results, 'GIOCALA'),
      FORTE: this.calculateAccuracyByStrength(results, 'FORTE'),
      MEDIO: this.calculateAccuracyByStrength(results, 'MEDIO'),
      NEUTRALE: this.calculateAccuracyByStrength(results, 'NEUTRALE'),
    };
    
    // Overall Brier Score
    const avgBrier = results.reduce((sum, r) => sum + r.brierScore, 0) / results.length;
    
    // Brier Score by outcome
    const brierBy1X2 = {
      home: this.calculateBrierByOutcome(results, '1'),
      draw: this.calculateBrierByOutcome(results, 'X'),
      away: this.calculateBrierByOutcome(results, '2'),
    };
    
    // Calibration analysis
    const calibration = this.calculateCalibration(results);
    
    // ROI simulation
    const roi = this.calculateROI(results);
    
    // By league analysis
    const byLeague = this.analyzeByLeague(results);
    
    // Leagues info
    const leagueNames = [...new Set(results.map(r => r.league))];
    
    return {
      config,
      summary: {
        totalMatches: results.length,
        dateRange: `${config.startDate} to ${config.endDate}`,
        leagues: leagueNames,
      },
      accuracy: {
        overall1X2: accuracy,
        byStrength,
        overUnder25: 0, // TODO: Implement
        btts: 0,        // TODO: Implement
      },
      brierScore: {
        overall: avgBrier,
        by1X2: brierBy1X2,
      },
      calibration,
      roi,
      results,
      byLeague,
    };
  }
  
  /**
   * Calcola accuracy per strength level
   */
  private calculateAccuracyByStrength(
    results: BacktestResult[],
    strength: string
  ): number {
    const filtered = results.filter(r => r.prediction.strength === strength);
    if (filtered.length === 0) return 0;
    
    const correct = filtered.filter(r => r.correct1X2).length;
    return (correct / filtered.length) * 100;
  }
  
  /**
   * Calcola Brier Score per outcome specifico
   */
  private calculateBrierByOutcome(
    results: BacktestResult[],
    outcome: '1' | 'X' | '2'
  ): number {
    const filtered = results.filter(r => r.actualResult.outcome === outcome);
    if (filtered.length === 0) return 0;
    
    const avgBrier = filtered.reduce((sum, r) => sum + r.brierScore, 0) / filtered.length;
    return avgBrier;
  }
  
  /**
   * Analizza calibrazione (prob predetta vs frequenza reale)
   */
  private calculateCalibration(results: BacktestResult[]) {
    const buckets = [
      { range: '0-20%', min: 0, max: 0.20 },
      { range: '20-40%', min: 0.20, max: 0.40 },
      { range: '40-60%', min: 0.40, max: 0.60 },
      { range: '60-80%', min: 0.60, max: 0.80 },
      { range: '80-100%', min: 0.80, max: 1.00 },
    ];
    
    const calibrationBuckets = buckets.map(bucket => {
      // Filtra predizioni in questo bucket (usando max prob)
      const inBucket = results.filter(r => {
        const maxProb = Math.max(r.prediction.prob1, r.prediction.probX, r.prediction.prob2);
        return maxProb >= bucket.min && maxProb < bucket.max;
      });
      
      if (inBucket.length === 0) {
        return {
          range: bucket.range,
          predictedProb: (bucket.min + bucket.max) / 2,
          actualFreq: 0,
          count: 0,
        };
      }
      
      const avgPredicted = inBucket.reduce((sum, r) => {
        const maxProb = Math.max(r.prediction.prob1, r.prediction.probX, r.prediction.prob2);
        return sum + maxProb;
      }, 0) / inBucket.length;
      
      const correct = inBucket.filter(r => r.correct1X2).length;
      const actualFreq = correct / inBucket.length;
      
      return {
        range: bucket.range,
        predictedProb: avgPredicted,
        actualFreq,
        count: inBucket.length,
      };
    });
    
    // Calibration error (mean absolute difference)
    const calibrationError = calibrationBuckets
      .filter(b => b.count > 0)
      .reduce((sum, b) => sum + Math.abs(b.predictedProb - b.actualFreq), 0) / 
      calibrationBuckets.filter(b => b.count > 0).length;
    
    return {
      buckets: calibrationBuckets,
      calibrationError,
    };
  }
  
  /**
   * Simula ROI con diverse strategie
   */
  private calculateROI(results: BacktestResult[]) {
    // Flat betting: 1€ su ogni predizione
    const flatBetting = this.simulateFlatBetting(results);
    
    // Kelly betting: stake proporzionale a edge
    const kellyBetting = this.simulateKellyBetting(results);
    
    // Strength filtered (solo GIOCALA/FORTE)
    const strongPredictions = results.filter(r => 
      r.prediction.strength === 'GIOCALA' || r.prediction.strength === 'FORTE'
    );
    
    return {
      flatBetting,
      kellyBetting,
      strengthFiltered: {
        flatBetting: strongPredictions.length > 0 ? this.simulateFlatBetting(strongPredictions) : 0,
        kellyBetting: strongPredictions.length > 0 ? this.simulateKellyBetting(strongPredictions) : 0,
      },
    };
  }
  
  /**
   * Simula flat betting (1€ per bet)
   */
  private simulateFlatBetting(results: BacktestResult[]): number {
    // Assume fair odds: 1 / probability
    let totalStaked = results.length;
    let totalReturned = 0;
    
    results.forEach(r => {
      if (r.correct1X2) {
        // Win: ottieni odds * stake
        const maxProb = Math.max(r.prediction.prob1, r.prediction.probX, r.prediction.prob2);
        const fairOdds = 1 / maxProb;
        totalReturned += fairOdds * 1; // 1€ stake
      }
      // Loss: return = 0
    });
    
    const profit = totalReturned - totalStaked;
    const roi = (profit / totalStaked) * 100;
    
    return roi;
  }
  
  /**
   * Simula Kelly betting
   */
  private simulateKellyBetting(results: BacktestResult[]): number {
    // Kelly Criterion: f = (bp - q) / b
    // f = frazione bankroll da scommettere
    // b = odds - 1
    // p = probabilità predetta
    // q = 1 - p
    
    let bankroll = 100; // Start with 100€
    
    results.forEach(r => {
      const maxProb = Math.max(r.prediction.prob1, r.prediction.probX, r.prediction.prob2);
      const fairOdds = 1 / maxProb;
      const b = fairOdds - 1;
      const p = maxProb;
      const q = 1 - p;
      
      // Kelly fraction (con cap a 10% bankroll per safety)
      const kellyFraction = Math.min(0.10, Math.max(0, (b * p - q) / b));
      const stake = bankroll * kellyFraction;
      
      if (r.correct1X2) {
        // Win
        bankroll += stake * b;
      } else {
        // Loss
        bankroll -= stake;
      }
    });
    
    const profit = bankroll - 100;
    const roi = profit; // Already in %
    
    return roi;
  }
  
  /**
   * Analizza performance per league
   */
  private analyzeByLeague(results: BacktestResult[]) {
    const leagues = [...new Set(results.map(r => r.league))];
    
    const byLeague: Record<string, any> = {};
    
    leagues.forEach(league => {
      const leagueResults = results.filter(r => r.league === league);
      const correct = leagueResults.filter(r => r.correct1X2).length;
      const accuracy = (correct / leagueResults.length) * 100;
      const avgBrier = leagueResults.reduce((sum, r) => sum + r.brierScore, 0) / leagueResults.length;
      
      byLeague[league] = {
        matches: leagueResults.length,
        accuracy,
        brierScore: avgBrier,
      };
    });
    
    return byLeague;
  }
}

// Export singleton
export const backtester = new Backtester();
