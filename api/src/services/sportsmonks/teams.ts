import { getSportsmonksClient } from './client';
import { redis } from '../../lib/redis';

/**
 * Sportsmonks Teams Service
 * Replaces API-Football teams service
 */

export interface Team {
  id: number;
  name: string;
  logo?: string;
  country?: string;
  founded?: number;
  venue?: {
    id?: number;
    name?: string;
    capacity?: number;
    city?: string;
  };
}

export interface TeamStatistics {
  teamId: number;
  leagueId: number;
  seasonId: number;
  form?: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  position?: number;
  homeStats?: {
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
  };
  awayStats?: {
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
  };
}

/**
 * Transform Sportsmonks team to our standard format
 */
function transformTeam(smTeam: any): Team {
  return {
    id: smTeam.id,
    name: smTeam.name,
    logo: smTeam.image_path,
    country: smTeam.country?.name,
    founded: smTeam.founded,
    venue: smTeam.venue ? {
      id: smTeam.venue.id,
      name: smTeam.venue.name,
      capacity: smTeam.venue.capacity,
      city: smTeam.venue.city_name,
    } : undefined,
  };
}

/**
 * Get team by ID
 */
export async function getTeamById(teamId: number): Promise<Team | null> {
  const cacheKey = `sportsmonks:team:${teamId}`;
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ Team cache hit for ID ${teamId}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching team ${teamId} from Sportsmonks`);
    const client = getSportsmonksClient();
    
    const response = await client.get<any>(
      `/teams/${teamId}`,
      {
        include: 'country;venue',
      }
    );
    
    if (response.message || !response.data) {
      console.log(`⚠️ Team ${teamId} not found`);
      return null;
    }
    
    const team = transformTeam(response.data);
    
    console.log(`✅ Found team: ${team.name}`);
    
    // Cache for 24 hours (team info doesn't change often)
    await redis?.setex(cacheKey, 86400, JSON.stringify(team));
    
    return team;
  } catch (error: any) {
    console.error(`❌ Error fetching team by ID:`, error.message);
    return null;
  }
}

/**
 * Get team statistics for a season
 */
export async function getTeamStatistics(teamId: number, seasonId: number): Promise<TeamStatistics | null> {
  const cacheKey = `sportsmonks:team:${teamId}:stats:${seasonId}`;
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ Team statistics cache hit for team ${teamId}, season ${seasonId}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching statistics for team ${teamId}, season ${seasonId}`);
    const client = getSportsmonksClient();
    
    const response = await client.get<any>(
      `/teams/${teamId}`,
      {
        include: 'statistics',
        filters: `seasonId:${seasonId}`,
      }
    );
    
    if (response.message || !response.data || !response.data.statistics) {
      console.log(`⚠️ Statistics not found for team ${teamId}, season ${seasonId}`);
      return null;
    }
    
    const stats = response.data.statistics[0]; // Get first season stats
    if (!stats) return null;
    
    const statistics: TeamStatistics = {
      teamId,
      leagueId: stats.league_id || 0,
      seasonId: stats.season_id || seasonId,
      played: stats.total?.played || 0,
      wins: stats.total?.wins || 0,
      draws: stats.total?.draws || 0,
      losses: stats.total?.losses || 0,
      goalsFor: stats.total?.goals_for || 0,
      goalsAgainst: stats.total?.goals_against || 0,
      goalDifference: (stats.total?.goals_for || 0) - (stats.total?.goals_against || 0),
      points: stats.total?.points || 0,
      position: stats.position,
      homeStats: stats.home ? {
        played: stats.home.played || 0,
        wins: stats.home.wins || 0,
        draws: stats.home.draws || 0,
        losses: stats.home.losses || 0,
        goalsFor: stats.home.goals_for || 0,
        goalsAgainst: stats.home.goals_against || 0,
      } : undefined,
      awayStats: stats.away ? {
        played: stats.away.played || 0,
        wins: stats.away.wins || 0,
        draws: stats.away.draws || 0,
        losses: stats.away.losses || 0,
        goalsFor: stats.away.goals_for || 0,
        goalsAgainst: stats.away.goals_against || 0,
      } : undefined,
    };
    
    console.log(`✅ Found statistics for team ${teamId}`);
    
    // Cache for 1 hour
    await redis?.setex(cacheKey, 3600, JSON.stringify(statistics));
    
    return statistics;
  } catch (error: any) {
    console.error(`❌ Error fetching team statistics:`, error.message);
    return null;
  }
}

/**
 * Search teams by name
 */
export async function searchTeamsByName(name: string): Promise<Team[]> {
  const cacheKey = `sportsmonks:teams:search:${name.toLowerCase()}`;
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ Team search cache hit for "${name}"`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Searching teams by name: ${name}`);
    const client = getSportsmonksClient();
    
    const response = await client.get<any>(
      `/teams/search/${encodeURIComponent(name)}`,
      {
        include: 'country;venue',
      }
    );
    
    if (response.message) {
      console.log(`⚠️ Sportsmonks API message: ${response.message}`);
      return [];
    }
    
    const teams = (response.data || []).map(transformTeam);
    
    console.log(`✅ Found ${teams.length} teams matching "${name}"`);
    
    // Cache for 24 hours
    await redis?.setex(cacheKey, 86400, JSON.stringify(teams));
    
    return teams;
  } catch (error: any) {
    console.error(`❌ Error searching teams:`, error.message);
    return [];
  }
}

export const teamsService = {
  getTeamById,
  getTeamStatistics,
  searchTeamsByName,
};
