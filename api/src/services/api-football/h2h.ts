/**
 * Head-to-Head (H2H) Service
 * Fetcha e processa gli scontri diretti tra due squadre
 */

import { AxiosInstance } from 'axios';
import logger from '../../utils/logger';

export interface H2HMatch {
  fixtureId: number;
  date: Date;
  homeTeamId: number;
  homeTeamName: string;
  awayTeamId: number;
  awayTeamName: string;
  homeGoals: number;
  awayGoals: number;
  winner: 'HOME' | 'AWAY' | 'DRAW';
}

export interface H2HData {
  matches: H2HMatch[];
  totalMatches: number;
  dateRange: {
    from: Date;
    to: Date;
  };
}

export class H2HService {
  constructor(private client: AxiosInstance) {}

  /**
   * Fetch head-to-head tra due squadre
   * @param homeTeamId ID squadra casa
   * @param awayTeamId ID squadra trasferta
   * @param last Numero massimo di partite (default 10, max ultimi 5 anni)
   */
  async fetchH2H(
    homeTeamId: number,
    awayTeamId: number,
    last: number = 10
  ): Promise<H2HData> {
    try {
      logger.info({ homeTeamId, awayTeamId, last }, 'Fetching H2H data');

      const response = await this.client.get('/fixtures/headtohead', {
        params: {
          h2h: `${homeTeamId}-${awayTeamId}`,
          last,
        },
      });

      if (!response.data?.response) {
        logger.warn({ homeTeamId, awayTeamId }, 'No H2H data returned');
        return {
          matches: [],
          totalMatches: 0,
          dateRange: { from: new Date(), to: new Date() },
        };
      }

      const fixtures = response.data.response;
      const matches: H2HMatch[] = [];
      let oldestDate = new Date();
      let newestDate = new Date(0);

      for (const fixture of fixtures) {
        const fixtureDate = new Date(fixture.fixture.date);
        
        // Skip se non finita
        if (fixture.fixture.status.short !== 'FT') {
          continue;
        }

        // Skip se più vecchia di 5 anni
        const fiveYearsAgo = new Date();
        fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
        if (fixtureDate < fiveYearsAgo) {
          continue;
        }

        const homeGoals = fixture.goals.home;
        const awayGoals = fixture.goals.away;

        let winner: 'HOME' | 'AWAY' | 'DRAW';
        if (homeGoals > awayGoals) {
          winner = 'HOME';
        } else if (awayGoals > homeGoals) {
          winner = 'AWAY';
        } else {
          winner = 'DRAW';
        }

        matches.push({
          fixtureId: fixture.fixture.id,
          date: fixtureDate,
          homeTeamId: fixture.teams.home.id,
          homeTeamName: fixture.teams.home.name,
          awayTeamId: fixture.teams.away.id,
          awayTeamName: fixture.teams.away.name,
          homeGoals,
          awayGoals,
          winner,
        });

        // Track date range
        if (fixtureDate < oldestDate) oldestDate = fixtureDate;
        if (fixtureDate > newestDate) newestDate = fixtureDate;
      }

      // Sort by date descending (most recent first)
      matches.sort((a, b) => b.date.getTime() - a.date.getTime());

      logger.info(
        {
          totalMatches: matches.length,
          dateRange: {
            from: oldestDate.toISOString().split('T')[0],
            to: newestDate.toISOString().split('T')[0],
          },
        },
        'H2H data fetched successfully'
      );

      return {
        matches,
        totalMatches: matches.length,
        dateRange: {
          from: oldestDate,
          to: newestDate,
        },
      };
    } catch (error: any) {
      logger.error(
        {
          error: error.message,
          homeTeamId,
          awayTeamId,
        },
        'Error fetching H2H data'
      );

      // Return empty data on error (non-blocking)
      return {
        matches: [],
        totalMatches: 0,
        dateRange: { from: new Date(), to: new Date() },
      };
    }
  }

  /**
   * Fetch H2H by team names (helper)
   */
  async fetchH2HByNames(
    _homeTeamName: string,
    _awayTeamName: string,
    _last: number = 10
  ): Promise<H2HData | null> {
    // This requires team IDs, which need to be resolved first
    // Implementation would require team search/cache
    logger.warn('fetchH2HByNames not implemented - use fetchH2H with IDs');
    return null;
  }
}

// Singleton instance
import { apiFootballClient } from './client';
export const h2hService = new H2HService(apiFootballClient['client'] as any);