import { getSportsmonksClient } from './client';
import { redis } from '../../lib/redis';

/**
 * Sportsmonks Lineups Service
 * Provides confirmed and expected team lineups
 */

export interface PlayerLineupInfo {
  playerId: number;
  playerName: string;
  jerseyNumber?: number;
  position: string;
  formationPosition?: string;
  captain?: boolean;
}

export interface LineupInfo {
  formation: string;
  confirmed: boolean;
  startingXI: PlayerLineupInfo[];
  substitutes: PlayerLineupInfo[];
}

export interface FixtureLineups {
  fixtureId: number;
  home: LineupInfo | null;
  away: LineupInfo | null;
}

/**
 * Get lineups for a specific fixture
 */
export async function getFixtureLineups(fixtureId: number): Promise<FixtureLineups> {
  const cacheKey = `sportsmonks:lineups:${fixtureId}`;
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ Lineups cache hit for fixture ${fixtureId}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching lineups for fixture ${fixtureId}`);
    const client = getSportsmonksClient();
    
    const response = await client.get<any>(
      `/fixtures/${fixtureId}`,
      {
        include: 'lineups',
      }
    );
    
    if (response.message || !response.data || !response.data.lineups) {
      console.log(`⚠️ No lineups available for fixture ${fixtureId}`);
      return {
        fixtureId,
        home: null,
        away: null,
      };
    }
    
    const lineups = response.data.lineups;
    
    const parseLineup = (teamLineup: any): LineupInfo | null => {
      if (!teamLineup) return null;
      
      const startingXI = (teamLineup.details || [])
        .filter((p: any) => p.type?.name === 'starting-lineup')
        .map((p: any): PlayerLineupInfo => ({
          playerId: p.player_id,
          playerName: p.player_name || 'Unknown',
          jerseyNumber: p.jersey_number,
          position: p.position || 'Unknown',
          formationPosition: p.formation_position,
          captain: p.captain || false,
        }));
      
      const substitutes = (teamLineup.details || [])
        .filter((p: any) => p.type?.name === 'bench')
        .map((p: any): PlayerLineupInfo => ({
          playerId: p.player_id,
          playerName: p.player_name || 'Unknown',
          jerseyNumber: p.jersey_number,
          position: p.position || 'Unknown',
          formationPosition: p.formation_position,
          captain: false,
        }));
      
      return {
        formation: teamLineup.formation || 'Unknown',
        confirmed: teamLineup.confirmed || false,
        startingXI,
        substitutes,
      };
    };
    
    const homeLineup = lineups.find((l: any) => l.location === 'home');
    const awayLineup = lineups.find((l: any) => l.location === 'away');
    
    const result: FixtureLineups = {
      fixtureId,
      home: parseLineup(homeLineup),
      away: parseLineup(awayLineup),
    };
    
    console.log(`✅ Found lineups for fixture ${fixtureId} - Home: ${result.home?.confirmed ? 'confirmed' : 'not available'}, Away: ${result.away?.confirmed ? 'confirmed' : 'not available'}`);
    
    // Cache for 2 hours (lineups can change before match)
    await redis?.setex(cacheKey, 7200, JSON.stringify(result));
    
    return result;
  } catch (error: any) {
    console.error(`❌ Error fetching lineups:`, error.message);
    return {
      fixtureId,
      home: null,
      away: null,
    };
  }
}

/**
 * Get squad for a team in a season
 */
export async function getTeamSquad(
  teamId: number,
  seasonId: number
): Promise<PlayerLineupInfo[]> {
  const cacheKey = `sportsmonks:squad:${teamId}:${seasonId}`;
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ Squad cache hit for team ${teamId}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching squad for team ${teamId}, season ${seasonId}`);
    const client = getSportsmonksClient();
    
    const response = await client.get<any>(
      `/squads/seasons/${seasonId}/teams/${teamId}`,
      {
        include: 'player',
      }
    );
    
    if (response.message || !response.data) {
      console.log(`⚠️ No squad data for team ${teamId}`);
      return [];
    }
    
    const squad = (response.data.players || []).map((p: any): PlayerLineupInfo => ({
      playerId: p.player_id,
      playerName: p.player?.display_name || p.player_name || 'Unknown',
      jerseyNumber: p.jersey_number,
      position: p.position?.name || p.detailed_position?.name || 'Unknown',
      captain: p.captain || false,
    }));
    
    console.log(`✅ Found ${squad.length} players in squad for team ${teamId}`);
    
    // Cache for 24 hours
    await redis?.setex(cacheKey, 86400, JSON.stringify(squad));
    
    return squad;
  } catch (error: any) {
    console.error(`❌ Error fetching squad:`, error.message);
    return [];
  }
}

export const lineupsService = {
  getFixtureLineups,
  getTeamSquad,
};
