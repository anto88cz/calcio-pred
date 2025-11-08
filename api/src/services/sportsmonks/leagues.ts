import { getSportsmonksClient } from './client';
import { redis } from '../../lib/redis';

/**
 * Sportsmonks Leagues Service
 * Replaces API-Football leagues service
 */

export interface League {
  id: number;
  name: string;
  type: string;
  logo?: string;
  country: string;
  countryCode?: string;
}

export interface Season {
  id: number;
  year: number;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  leagueId: number;
}

/**
 * Transform Sportsmonks league to our standard format
 */
function transformLeague(smLeague: any): League {
  return {
    id: smLeague.id,
    name: smLeague.name,
    type: smLeague.type || 'league',
    logo: smLeague.image_path,
    country: smLeague.country?.name || 'International',
    countryCode: smLeague.country?.code,
  };
}

/**
 * Transform Sportsmonks season to our standard format
 */
function transformSeason(smSeason: any): Season {
  return {
    id: smSeason.id,
    year: parseInt(smSeason.name) || new Date(smSeason.starting_at).getFullYear(),
    startDate: smSeason.starting_at,
    endDate: smSeason.ending_at,
    isCurrent: smSeason.is_current || false,
    leagueId: smSeason.league_id,
  };
}

/**
 * Get all available leagues
 */
export async function getAllLeagues(): Promise<League[]> {
  const cacheKey = 'sportsmonks:leagues:all';
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ Leagues cache hit`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching all leagues from Sportsmonks`);
    const client = getSportsmonksClient();
    
    const response = await client.get<any>(
      '/leagues',
      {
        include: 'country',
      }
    );
    
    if (response.message) {
      console.log(`⚠️ Sportsmonks API message: ${response.message}`);
      return [];
    }
    
    const leagues = (response.data || []).map(transformLeague);
    
    console.log(`✅ Found ${leagues.length} leagues`);
    
    // Cache for 7 days (leagues don't change often)
    await redis?.setex(cacheKey, 604800, JSON.stringify(leagues));
    
    return leagues;
  } catch (error: any) {
    console.error(`❌ Error fetching leagues:`, error.message);
    return [];
  }
}

/**
 * Get league by ID
 */
export async function getLeagueById(leagueId: number): Promise<League | null> {
  const cacheKey = `sportsmonks:league:${leagueId}`;
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ League cache hit for ID ${leagueId}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching league ${leagueId} from Sportsmonks`);
    const client = getSportsmonksClient();
    
    const response = await client.get<any>(
      `/leagues/${leagueId}`,
      {
        include: 'country',
      }
    );
    
    if (response.message || !response.data) {
      console.log(`⚠️ League ${leagueId} not found`);
      return null;
    }
    
    const league = transformLeague(response.data);
    
    console.log(`✅ Found league: ${league.name}`);
    
    // Cache for 7 days
    await redis?.setex(cacheKey, 604800, JSON.stringify(league));
    
    return league;
  } catch (error: any) {
    console.error(`❌ Error fetching league by ID:`, error.message);
    return null;
  }
}

/**
 * Get seasons for a league
 */
export async function getSeasonsByLeague(leagueId: number): Promise<Season[]> {
  const cacheKey = `sportsmonks:league:${leagueId}:seasons`;
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ Seasons cache hit for league ${leagueId}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching seasons for league ${leagueId}`);
    const client = getSportsmonksClient();
    
    const response = await client.get<any>(
      `/leagues/${leagueId}`,
      {
        include: 'seasons',
      }
    );
    
    if (response.message || !response.data || !response.data.seasons) {
      console.log(`⚠️ Seasons not found for league ${leagueId}`);
      return [];
    }
    
    const seasons = response.data.seasons.map(transformSeason);
    
    console.log(`✅ Found ${seasons.length} seasons for league ${leagueId}`);
    
    // Cache for 24 hours
    await redis?.setex(cacheKey, 86400, JSON.stringify(seasons));
    
    return seasons;
  } catch (error: any) {
    console.error(`❌ Error fetching seasons:`, error.message);
    return [];
  }
}

/**
 * Get current season for a league
 */
export async function getCurrentSeason(leagueId: number): Promise<Season | null> {
  try {
    const seasons = await getSeasonsByLeague(leagueId);
    const currentSeason = seasons.find(s => s.isCurrent);
    
    if (!currentSeason && seasons.length > 0) {
      // Fallback to latest season
      return seasons.sort((a, b) => b.year - a.year)[0];
    }
    
    return currentSeason || null;
  } catch (error: any) {
    console.error(`❌ Error fetching current season:`, error.message);
    return null;
  }
}

/**
 * Get season by ID
 */
export async function getSeasonById(seasonId: number): Promise<Season | null> {
  const cacheKey = `sportsmonks:season:${seasonId}`;
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ Season cache hit for ID ${seasonId}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching season ${seasonId} from Sportsmonks`);
    const client = getSportsmonksClient();
    
    const response = await client.get<any>(`/seasons/${seasonId}`);
    
    if (response.message || !response.data) {
      console.log(`⚠️ Season ${seasonId} not found`);
      return null;
    }
    
    const season = transformSeason(response.data);
    
    console.log(`✅ Found season: ${season.year}`);
    
    // Cache for 24 hours
    await redis?.setex(cacheKey, 86400, JSON.stringify(season));
    
    return season;
  } catch (error: any) {
    console.error(`❌ Error fetching season by ID:`, error.message);
    return null;
  }
}

export const leaguesService = {
  getAllLeagues,
  getLeagueById,
  getSeasonsByLeague,
  getCurrentSeason,
  getSeasonById,
};
