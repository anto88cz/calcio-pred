/**
 * Team ID Mapping Service
 * 
 * Maps team IDs between different providers (API-Football vs Sportsmonks)
 * Uses team name matching with caching
 */

import { redis } from '../../lib/redis';
import { getSportsmonksClient } from './client';
import logger from '../../utils/logger';

interface TeamMapping {
  apiFootballId: number;
  sportsmonksId: number;
  name: string;
  country: string;
}

/**
 * Search team by name on Sportsmonks and return ID
 */
export async function searchTeamByName(teamName: string): Promise<number | null> {
  try {
    const cacheKey = `team:mapping:${teamName.toLowerCase()}`;
    
    // Check cache first
    const cached = await redis?.get(cacheKey);
    if (cached) {
      logger.debug({ teamName, sportsmonksId: cached }, 'Team ID found in cache');
      return parseInt(cached, 10);
    }
    
    // Search on Sportsmonks
    const client = getSportsmonksClient();
    const response = await client.get<any>(
      `/teams/search/${encodeURIComponent(teamName)}`
    );
    
    if (response.data && response.data.length > 0) {
      // Take first result (most relevant)
      const team = response.data[0];
      const sportsmonksId = team.id;
      
      logger.info({
        teamName,
        sportsmonksId,
        sportsmonksName: team.name,
      }, '✅ Team found on Sportsmonks');
      
      // Cache for 30 days
      await redis?.setex(cacheKey, 30 * 24 * 3600, sportsmonksId.toString());
      
      return sportsmonksId;
    }
    
    logger.warn({ teamName }, '⚠️ Team not found on Sportsmonks');
    return null;
  } catch (error: any) {
    logger.error({ error: error.message, teamName }, '❌ Error searching team');
    return null;
  }
}

/**
 * Get Sportsmonks team ID from API-Football ID
 * Uses database or team name search
 */
export async function getSportsmonksTeamId(
  apiFootballId: number,
  teamName?: string
): Promise<number | null> {
  try {
    const cacheKey = `team:mapping:apifootball:${apiFootballId}`;
    
    // Check cache
    const cached = await redis?.get(cacheKey);
    if (cached) {
      logger.debug({ apiFootballId, sportsmonksId: cached }, 'Team mapping found in cache');
      return parseInt(cached, 10);
    }
    
    // If we have team name, search by name
    if (teamName) {
      const sportsmonksId = await searchTeamByName(teamName);
      
      if (sportsmonksId) {
        // Cache the mapping
        await redis?.setex(cacheKey, 30 * 24 * 3600, sportsmonksId.toString());
        return sportsmonksId;
      }
    }
    
    logger.warn({
      apiFootballId,
      teamName,
    }, '⚠️ Could not map team ID - name required');
    
    return null;
  } catch (error: any) {
    logger.error({ error: error.message, apiFootballId }, '❌ Error mapping team ID');
    return null;
  }
}

/**
 * Batch get team IDs for multiple teams
 */
export async function batchGetSportsmonksTeamIds(
  teams: Array<{ apiFootballId: number; name: string }>
): Promise<Map<number, number>> {
  const mapping = new Map<number, number>();
  
  for (const team of teams) {
    const sportsmonksId = await getSportsmonksTeamId(team.apiFootballId, team.name);
    if (sportsmonksId) {
      mapping.set(team.apiFootballId, sportsmonksId);
    }
  }
  
  return mapping;
}
