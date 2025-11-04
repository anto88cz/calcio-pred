/**
 * Modulo Teams - Gestione squadre
 */

import { apiFootballClient } from './client';
import logger from '../../utils/logger';

export interface TeamInfo {
  id: number;
  name: string;
  code: string | null;
  country: string;
  founded: number | null;
  logo: string;
  venue: {
    id: number | null;
    name: string | null;
    address: string | null;
    city: string | null;
    capacity: number | null;
    surface: string | null;
  };
}

export class TeamsService {
  /**
   * Get info squadra per ID
   */
  async getTeamById(teamId: number): Promise<TeamInfo | null> {
    try {
      logger.info({ teamId }, 'Fetching team by ID');
      
      const teams = await apiFootballClient.request<any[]>(
        '/teams',
        { id: teamId },
        { cache: true, cacheTTL: 86400 } // Cache 24h (dati statici)
      );

      if (!teams || teams.length === 0) {
        return null;
      }

      return this.parseTeam(teams[0]);
    } catch (error) {
      logger.error({ error, teamId }, 'Failed to fetch team by ID');
      throw error;
    }
  }

  /**
   * Get squadre per nome (ricerca)
   */
  async searchTeamsByName(name: string): Promise<TeamInfo[]> {
    try {
      logger.info({ name }, 'Searching teams by name');
      
      const teams = await apiFootballClient.request<any[]>(
        '/teams',
        { search: name },
        { cache: true, cacheTTL: 86400 }
      );

      return (teams || []).map(team => this.parseTeam(team));
    } catch (error) {
      logger.error({ error, name }, 'Failed to search teams by name');
      throw error;
    }
  }

  /**
   * Get squadre per paese
   */
  async getTeamsByCountry(country: string): Promise<TeamInfo[]> {
    try {
      logger.info({ country }, 'Fetching teams by country');
      
      const teams = await apiFootballClient.request<any[]>(
        '/teams',
        { country },
        { cache: true, cacheTTL: 86400 }
      );

      return (teams || []).map(team => this.parseTeam(team));
    } catch (error) {
      logger.error({ error, country }, 'Failed to fetch teams by country');
      throw error;
    }
  }

  /**
   * Get squadre per lega e stagione
   */
  async getTeamsByLeague(leagueId: number, season: number): Promise<TeamInfo[]> {
    try {
      logger.info({ leagueId, season }, 'Fetching teams by league');
      
      const teams = await apiFootballClient.request<any[]>(
        '/teams',
        { league: leagueId, season },
        { cache: true, cacheTTL: 86400 }
      );

      return (teams || []).map(team => this.parseTeam(team));
    } catch (error) {
      logger.error({ error, leagueId, season }, 'Failed to fetch teams by league');
      throw error;
    }
  }

  /**
   * Parse team da formato API
   */
  private parseTeam(apiTeam: any): TeamInfo {
    return {
      id: apiTeam.team.id,
      name: apiTeam.team.name,
      code: apiTeam.team.code,
      country: apiTeam.team.country,
      founded: apiTeam.team.founded,
      logo: apiTeam.team.logo,
      venue: {
        id: apiTeam.venue?.id || null,
        name: apiTeam.venue?.name || null,
        address: apiTeam.venue?.address || null,
        city: apiTeam.venue?.city || null,
        capacity: apiTeam.venue?.capacity || null,
        surface: apiTeam.venue?.surface || null,
      },
    };
  }

  /**
   * Batch get per multiple squadre
   */
  async getTeamsByIds(teamIds: number[]): Promise<Map<number, TeamInfo>> {
    const teamsMap = new Map<number, TeamInfo>();

    for (const teamId of teamIds) {
      try {
        const team = await this.getTeamById(teamId);
        if (team) {
          teamsMap.set(teamId, team);
        }
      } catch (error) {
        logger.error({ error, teamId }, 'Failed to fetch team in batch');
        // Continue con altri team
      }
    }

    return teamsMap;
  }
}

export const teamsService = new TeamsService();
