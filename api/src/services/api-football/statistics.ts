/**
 * Modulo Statistics - Statistiche partite e squadre
 */

import { apiFootballClient } from './client';
import logger from '../../utils/logger';
import { prisma } from '../../lib/prisma';
import type { APIFootballStatistics } from '../../types';

export interface FixtureStatistics {
  team: {
    id: number;
    name: string;
  };
  statistics: {
    shotsOnGoal: number | null;
    shotsOffGoal: number | null;
    totalShots: number | null;
    blockedShots: number | null;
    shotsInsideBox: number | null;
    shotsOutsideBox: number | null;
    fouls: number | null;
    cornerKicks: number | null;
    offsides: number | null;
    ballPossession: number | null;
    yellowCards: number | null;
    redCards: number | null;
    goalkeeperSaves: number | null;
    totalPasses: number | null;
    passesAccurate: number | null;
    passesPercentage: number | null;
  };
}

/**
 * Expected Goals (xG) data per fixture
 */
export interface ExpectedGoalsData {
  home: {
    teamId: number;
    teamName: string;
    xg: number | null;
    xgot: number | null; // xG on Target (facoltativo)
  };
  away: {
    teamId: number;
    teamName: string;
    xg: number | null;
    xgot: number | null;
  };
  missingXg: boolean; // TRUE se xG non disponibili per almeno una squadra
}

export class StatisticsService {
  /**
   * Get statistiche per fixture
   */
  async getFixtureStatistics(fixtureId: number): Promise<FixtureStatistics[]> {
    try {
      logger.info({ fixtureId }, 'Fetching fixture statistics');
      
      const statistics = await apiFootballClient.request<APIFootballStatistics[]>(
        '/fixtures/statistics',
        { fixture: fixtureId },
        { cache: true, cacheTTL: 7200 }
      );

      return this.parseStatistics(statistics || []);
    } catch (error) {
      logger.error({ error, fixtureId }, 'Failed to fetch fixture statistics');
      throw error;
    }
  }

  /**
   * Get Expected Goals (xG) per fixture
   * Estrae "Expected Goals" e "xG on target" da /fixtures/statistics
   */
  async getExpectedGoals(fixtureId: number): Promise<ExpectedGoalsData> {
    try {
      logger.info({ fixtureId }, 'Fetching Expected Goals (xG) data');
      
      const statistics = await apiFootballClient.request<APIFootballStatistics[]>(
        '/fixtures/statistics',
        { fixture: fixtureId },
        { cache: true, cacheTTL: 7200 }
      );

      if (!statistics || statistics.length !== 2) {
        logger.warn({ fixtureId, count: statistics?.length }, 'xG data unavailable or incomplete');
        return this.createEmptyXGData();
      }

      // statistics[0] = home team, statistics[1] = away team
      const homeStats = statistics[0];
      const awayStats = statistics[1];

      const homeXg = this.parseXGValue(homeStats.statistics, 'Expected Goals');
      const homeXgot = this.parseXGValue(homeStats.statistics, 'xG on target');
      const awayXg = this.parseXGValue(awayStats.statistics, 'Expected Goals');
      const awayXgot = this.parseXGValue(awayStats.statistics, 'xG on target');

      const missingXg = homeXg === null || awayXg === null;

      if (missingXg) {
        logger.info({ fixtureId }, 'xG data missing for one or both teams');
      }

      return {
        home: {
          teamId: homeStats.team.id,
          teamName: homeStats.team.name,
          xg: homeXg,
          xgot: homeXgot,
        },
        away: {
          teamId: awayStats.team.id,
          teamName: awayStats.team.name,
          xg: awayXg,
          xgot: awayXgot,
        },
        missingXg,
      };
    } catch (error) {
      logger.error({ error, fixtureId }, 'Failed to fetch Expected Goals data');
      // Ritorna dati vuoti invece di lanciare eccezione
      return this.createEmptyXGData();
    }
  }

  /**
   * Parse xG value da statistiche (gestisce string e number)
   */
  private parseXGValue(
    stats: Array<{ type: string; value: number | string | null }>,
    type: string
  ): number | null {
    const stat = stats.find(s => s.type === type);
    if (!stat || stat.value === null) return null;
    
    const value = typeof stat.value === 'string' ? parseFloat(stat.value) : stat.value;
    return isNaN(value) ? null : value;
  }

  /**
   * Fetch xG reali e salvali nel database (Hybrid Cache)
   * Questa funzione è il cuore del sistema xG Real Hybrid Cache
   */
  async fetchAndCacheXG(fixtureApiId: number): Promise<boolean> {
    try {
      logger.info({ fixtureApiId }, 'Fetching and caching xG data');

      // 1. Trova fixture nel database
      const fixture = await prisma.fixture.findUnique({
        where: { apiId: fixtureApiId }
      });

      if (!fixture) {
        logger.warn({ fixtureApiId }, 'Fixture not found in database');
        return false;
      }

      // 2. Fetch xG da API-FOOTBALL
      const xgData = await this.getExpectedGoals(fixtureApiId);

      // 3. Se dati xG mancanti, non salvare
      if (xgData.missingXg) {
        logger.info({ fixtureApiId }, 'xG data not available from API');
        return false;
      }

      // 4. Salva nel database con timestamp
      await prisma.fixture.update({
        where: { id: fixture.id },
        data: {
          // @ts-expect-error - Prisma generated types not yet refreshed in IDE
          xg_home: xgData.home.xg,
          xg_away: xgData.away.xg,
          xga_home: xgData.away.xg, // xG concessi casa = xG attacco trasferta
          xga_away: xgData.home.xg, // xG concessi trasferta = xG attacco casa
          xg_fetched_at: new Date()
        }
      });

      logger.info({ 
        fixtureApiId, 
        xg_home: xgData.home.xg, 
        xg_away: xgData.away.xg 
      }, 'xG data cached successfully');

      return true;

    } catch (error) {
      logger.error({ error, fixtureApiId }, 'Failed to fetch and cache xG data');
      return false;
    }
  }

  /**
   * Crea oggetto xG vuoto (quando dati non disponibili)
   */
  private createEmptyXGData(): ExpectedGoalsData {
    return {
      home: {
        teamId: 0,
        teamName: '',
        xg: null,
        xgot: null,
      },
      away: {
        teamId: 0,
        teamName: '',
        xg: null,
        xgot: null,
      },
      missingXg: true,
    };
  }

  /**
   * Parse statistiche da formato API a formato strutturato
   */
  private parseStatistics(apiStats: APIFootballStatistics[]): FixtureStatistics[] {
    return apiStats.map(teamStats => {
      const stats = teamStats.statistics;

      return {
        team: {
          id: teamStats.team.id,
          name: teamStats.team.name,
        },
        statistics: {
          shotsOnGoal: this.parseStatValue(stats, 'Shots on Goal'),
          shotsOffGoal: this.parseStatValue(stats, 'Shots off Goal'),
          totalShots: this.parseStatValue(stats, 'Total Shots'),
          blockedShots: this.parseStatValue(stats, 'Blocked Shots'),
          shotsInsideBox: this.parseStatValue(stats, 'Shots insidebox'),
          shotsOutsideBox: this.parseStatValue(stats, 'Shots outsidebox'),
          fouls: this.parseStatValue(stats, 'Fouls'),
          cornerKicks: this.parseStatValue(stats, 'Corner Kicks'),
          offsides: this.parseStatValue(stats, 'Offsides'),
          ballPossession: this.parsePercentage(stats, 'Ball Possession'),
          yellowCards: this.parseStatValue(stats, 'Yellow Cards'),
          redCards: this.parseStatValue(stats, 'Red Cards'),
          goalkeeperSaves: this.parseStatValue(stats, 'Goalkeeper Saves'),
          totalPasses: this.parseStatValue(stats, 'Total passes'),
          passesAccurate: this.parseStatValue(stats, 'Passes accurate'),
          passesPercentage: this.parsePercentage(stats, 'Passes %'),
        },
      };
    });
  }

  /**
   * Estrai valore numerico da statistiche
   */
  private parseStatValue(
    stats: Array<{ type: string; value: number | string | null }>,
    type: string
  ): number | null {
    const stat = stats.find(s => s.type === type);
    if (!stat || stat.value === null) return null;
    
    const value = typeof stat.value === 'string' ? parseInt(stat.value, 10) : stat.value;
    return isNaN(value) ? null : value;
  }

  /**
   * Parse percentuale (rimuove '%' e converte a numero)
   */
  private parsePercentage(
    stats: Array<{ type: string; value: number | string | null }>,
    type: string
  ): number | null {
    const stat = stats.find(s => s.type === type);
    if (!stat || stat.value === null) return null;
    
    const value = typeof stat.value === 'string' 
      ? parseFloat(stat.value.replace('%', ''))
      : stat.value;
    
    return isNaN(value) ? null : value;
  }

  /**
   * Get statistiche squadra per stagione
   */
  async getTeamStatistics(
    teamId: number,
    season: number,
    leagueId?: number
  ): Promise<any> {
    try {
      logger.info({ teamId, season, leagueId }, 'Fetching team statistics');
      
      const params: any = {
        team: teamId,
        season,
      };

      if (leagueId) {
        params.league = leagueId;
      }

      const statistics = await apiFootballClient.request<any>(
        '/teams/statistics',
        params,
        { cache: true, cacheTTL: 7200 }
      );

      return statistics || null;
    } catch (error) {
      logger.error({ error, teamId, season }, 'Failed to fetch team statistics');
      throw error;
    }
  }

  /**
   * Calcola statistiche medie da multiple partite
   */
  calculateAverageStats(matches: FixtureStatistics[][]): {
    avgShotsOnGoal: number;
    avgPossession: number;
    avgCorners: number;
    avgFouls: number;
  } {
    if (matches.length === 0) {
      return {
        avgShotsOnGoal: 0,
        avgPossession: 0,
        avgCorners: 0,
        avgFouls: 0,
      };
    }

    let totalShots = 0;
    let totalPossession = 0;
    let totalCorners = 0;
    let totalFouls = 0;
    let count = 0;

    matches.forEach(matchStats => {
      matchStats.forEach(teamStats => {
        if (teamStats.statistics.shotsOnGoal !== null) {
          totalShots += teamStats.statistics.shotsOnGoal;
          count++;
        }
        if (teamStats.statistics.ballPossession !== null) {
          totalPossession += teamStats.statistics.ballPossession;
        }
        if (teamStats.statistics.cornerKicks !== null) {
          totalCorners += teamStats.statistics.cornerKicks;
        }
        if (teamStats.statistics.fouls !== null) {
          totalFouls += teamStats.statistics.fouls;
        }
      });
    });

    return {
      avgShotsOnGoal: count > 0 ? totalShots / count : 0,
      avgPossession: count > 0 ? totalPossession / count : 0,
      avgCorners: count > 0 ? totalCorners / count : 0,
      avgFouls: count > 0 ? totalFouls / count : 0,
    };
  }
}

export const statisticsService = new StatisticsService();
