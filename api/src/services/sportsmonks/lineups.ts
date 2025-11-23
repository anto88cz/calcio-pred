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
 * Deduce formation from formation_field data
 * formation_field format: "line:position" (e.g., "2:3")
 * Lines: 1=GK, 2=DEF, 3=MID, 4=FWD
 */
function deduceFormation(starters: any[]): string {
  if (starters.length !== 11) {
    return 'Unknown';
  }
  
  // Count players per line (excluding goalkeeper)
  const lineCounts = new Map<number, number>();
  
  starters.forEach((player: any) => {
    const formationField = player.formation_field;
    if (!formationField || typeof formationField !== 'string') return;
    
    const parts = formationField.split(':');
    if (parts.length !== 2) return;
    
    const line = parseInt(parts[0], 10);
    if (isNaN(line) || line < 1) return;
    
    lineCounts.set(line, (lineCounts.get(line) || 0) + 1);
  });
  
  // Extract counts for DEF-MID-FWD (lines 2-3-4)
  const defenders = lineCounts.get(2) || 0;
  const midfielders = lineCounts.get(3) || 0;
  const forwards = lineCounts.get(4) || 0;
  
  // Validate total (should be 10 excluding GK)
  const totalOutfield = defenders + midfielders + forwards;
  if (totalOutfield !== 10) {
    console.log(`⚠️ Invalid formation: ${defenders}-${midfielders}-${forwards} (total ${totalOutfield})`);
    return 'Unknown';
  }
  
  return `${defenders}-${midfielders}-${forwards}`;
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
    
    // Sportsmonks v3: lineups è un array flat di giocatori
    // Ogni record ha: { player_id, team_id, type_id, formation_field, ... }
    // type_id: 11 = starter, 12 = substitute
    const lineups = response.data.lineups;
    
    if (!Array.isArray(lineups) || lineups.length === 0) {
      console.log(`⚠️ Empty lineups array for fixture ${fixtureId}`);
      return {
        fixtureId,
        home: null,
        away: null,
      };
    }
    
    // Group players by team_id
    const teamsMap = new Map<number, {
      teamId: number;
      starters: any[];
      substitutes: any[];
    }>();
    
    lineups.forEach((player: any) => {
      const teamId = player.team_id;
      if (!teamsMap.has(teamId)) {
        teamsMap.set(teamId, {
          teamId,
          starters: [],
          substitutes: [],
        });
      }
      
      const team = teamsMap.get(teamId)!;
      
      // type_id: 11 = starter (starting-lineup), 12 = substitute (bench)
      if (player.type_id === 11) {
        team.starters.push(player);
      } else if (player.type_id === 12) {
        team.substitutes.push(player);
      }
    });
    
    // Parse team lineups
    const parseTeamLineup = (team: {
      teamId: number;
      starters: any[];
      substitutes: any[];
    }): LineupInfo => {
      const startingXI: PlayerLineupInfo[] = team.starters.map((p: any) => ({
        playerId: p.player_id,
        playerName: p.player_name || 'Unknown',
        jerseyNumber: p.jersey_number,
        position: p.formation_field || 'Unknown',
        formationPosition: p.formation_position,
        captain: false, // Sportsmonks v3 non fornisce captain flag nelle lineups
      }));
      
      const substitutes: PlayerLineupInfo[] = team.substitutes.map((p: any) => ({
        playerId: p.player_id,
        playerName: p.player_name || 'Unknown',
        jerseyNumber: p.jersey_number,
        position: p.position_id ? `Position ${p.position_id}` : 'Unknown',
        formationPosition: p.formation_position,
        captain: false,
      }));
      
      // Deduce formation from formation_field
      // formation_field format: "line:position" (e.g., "2:3" = defender, center)
      const formation = deduceFormation(team.starters);
      
      // Lineup is confirmed if we have full starting XI
      const confirmed = team.starters.length === 11;
      
      return {
        formation,
        confirmed,
        startingXI,
        substitutes,
      };
    };
    
    // Get teams (first 2 teams in map should be home/away)
    const teams = Array.from(teamsMap.values());
    
    if (teams.length < 2) {
      console.log(`⚠️ Only ${teams.length} team found in lineups for fixture ${fixtureId}`);
      return {
        fixtureId,
        home: teams[0] ? parseTeamLineup(teams[0]) : null,
        away: null,
      };
    }
    
    // Parse both teams
    // Note: Sportsmonks doesn't specify which is home/away in lineups
    // We assume first team is home, second is away (may need to cross-check with participants)
    const result: FixtureLineups = {
      fixtureId,
      home: parseTeamLineup(teams[0]),
      away: parseTeamLineup(teams[1]),
    };
    
    console.log(`✅ Found lineups for fixture ${fixtureId} - Home: ${result.home?.confirmed ? 'confirmed' : 'not available'} (${result.home?.startingXI.length} starters), Away: ${result.away?.confirmed ? 'confirmed' : 'not available'} (${result.away?.startingXI.length} starters)`);
    
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
