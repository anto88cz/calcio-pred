/**
 * Modulo Fixtures - Gestione partite
 */

import { apiFootballClient } from './client';
import logger from '../../utils/logger';
import type { APIFootballFixture } from '../../types';

export class FixturesService {
  /**
   * Get fixtures per data specifica
   */
  async getFixturesByDate(date: string): Promise<APIFootballFixture[]> {
    try {
      logger.info({ date }, 'Fetching fixtures by date');
      
      const fixtures = await apiFootballClient.request<APIFootballFixture[]>(
        '/fixtures',
        { date },
        { cache: true, cacheTTL: 3600 }
      );

      return fixtures || [];
    } catch (error) {
      logger.error({ error, date }, 'Failed to fetch fixtures by date');
      throw error;
    }
  }

  /**
   * Get fixtures per range di date
   */
  async getFixturesByDateRange(from: string, to: string): Promise<APIFootballFixture[]> {
    try {
      logger.info({ from, to }, 'Fetching fixtures by date range');
      
      const fixtures = await apiFootballClient.request<APIFootballFixture[]>(
        '/fixtures',
        { from, to },
        { cache: true, cacheTTL: 3600 }
      );

      return fixtures || [];
    } catch (error) {
      logger.error({ error, from, to }, 'Failed to fetch fixtures by date range');
      throw error;
    }
  }

  /**
   * Get fixture specifica per ID
   */
  async getFixtureById(fixtureId: number): Promise<APIFootballFixture | null> {
    try {
      logger.info({ fixtureId }, 'Fetching fixture by ID');
      
      const fixtures = await apiFootballClient.request<APIFootballFixture[]>(
        '/fixtures',
        { id: fixtureId },
        { cache: true, cacheTTL: 1800 }
      );

      return fixtures?.[0] || null;
    } catch (error) {
      logger.error({ error, fixtureId }, 'Failed to fetch fixture by ID');
      throw error;
    }
  }

  /**
   * Get fixtures per squadra e stagione
   * Cache estesa a 24 ore per ridurre rate limit
   */
  async getFixturesByTeam(
    teamId: number,
    season: number,
    options: {
      last?: number;
      next?: number;
      from?: string;
      to?: string;
    } = {}
  ): Promise<APIFootballFixture[]> {
    try {
      logger.info({ teamId, season, options }, 'Fetching fixtures by team');
      
      const params: any = {
        team: teamId,
        season,
        ...options,
      };

      const fixtures = await apiFootballClient.request<APIFootballFixture[]>(
        '/fixtures',
        params,
        { cache: true, cacheTTL: 86400 } // 24 ore per dati storici
      );

      return fixtures || [];
    } catch (error) {
      logger.error({ error, teamId, season }, 'Failed to fetch fixtures by team');
      throw error;
    }
  }

  /**
   * Get fixtures live
   */
  async getLiveFixtures(): Promise<APIFootballFixture[]> {
    try {
      logger.info('Fetching live fixtures');
      
      const fixtures = await apiFootballClient.request<APIFootballFixture[]>(
        '/fixtures',
        { live: 'all' },
        { cache: false } // Non cachare fixtures live
      );

      return fixtures || [];
    } catch (error) {
      logger.error({ error }, 'Failed to fetch live fixtures');
      throw error;
    }
  }

  /**
   * Get head to head tra due squadre
   */
  async getHeadToHead(
    team1Id: number,
    team2Id: number,
    options: {
      last?: number;
      from?: string;
      to?: string;
    } = {}
  ): Promise<APIFootballFixture[]> {
    try {
      logger.info({ team1Id, team2Id, options }, 'Fetching head to head');
      
      const params: any = {
        h2h: `${team1Id}-${team2Id}`,
        ...options,
      };

      const fixtures = await apiFootballClient.request<APIFootballFixture[]>(
        '/fixtures/headtohead',
        params,
        { cache: true, cacheTTL: 7200 }
      );

      return fixtures || [];
    } catch (error) {
      logger.error({ error, team1Id, team2Id }, 'Failed to fetch head to head');
      throw error;
    }
  }

  /**
   * Get fixtures per lega e stagione
   */
  async getFixturesByLeague(
    leagueId: number,
    season: number,
    options: {
      round?: string;
      from?: string;
      to?: string;
    } = {}
  ): Promise<APIFootballFixture[]> {
    try {
      logger.info({ leagueId, season, options }, 'Fetching fixtures by league');
      
      const params: any = {
        league: leagueId,
        season,
        ...options,
      };

      const fixtures = await apiFootballClient.request<APIFootballFixture[]>(
        '/fixtures',
        params,
        { cache: true, cacheTTL: 3600 }
      );

      return fixtures || [];
    } catch (error) {
      logger.error({ error, leagueId, season }, 'Failed to fetch fixtures by league');
      throw error;
    }
  }

  /**
   * Filtra solo partite ufficiali (no amichevoli)
   */
  filterOfficialFixtures(fixtures: APIFootballFixture[]): APIFootballFixture[] {
    return fixtures.filter(fixture => {
      const leagueName = fixture.league.name.toLowerCase();
      // Escludi amichevoli, club friendlies, etc.
      const friendlyKeywords = ['friendly', 'amichevole', 'club friendly', 'international friendly'];
      return !friendlyKeywords.some(keyword => leagueName.includes(keyword));
    });
  }

  /**
   * Filtra solo partite concluse regolarmente
   */
  filterFinishedFixtures(fixtures: APIFootballFixture[]): APIFootballFixture[] {
    return fixtures.filter(fixture => {
      const status = fixture.fixture.status.short;
      // Solo partite concluse regolarmente (FT = Full Time, AET = After Extra Time, PEN = Penalties)
      return ['FT', 'AET', 'PEN'].includes(status);
    });
  }

  /**
   * Filtra partite sospese/cancellate
   */
  filterValidFixtures(fixtures: APIFootballFixture[]): APIFootballFixture[] {
    return fixtures.filter(fixture => {
      const status = fixture.fixture.status.short;
      // Escludi partite cancellate, sospese, posticipate
      const invalidStatuses = ['CANC', 'PST', 'SUSP', 'ABD', 'AWD', 'WO'];
      return !invalidStatuses.includes(status);
    });
  }
}

export const fixturesService = new FixturesService();
