import { getSportsmonksClient } from './client';
import { redis } from '../../lib/redis';

/**
 * Sportsmonks Injuries Service
 * Provides player injury and suspension data
 */

export interface PlayerInjuryInfo {
  playerId: number;
  playerName: string;
  reason: string;
  type: 'injury' | 'suspension';
  startDate: string;
  expectedReturn?: string;
}

/**
 * Get sidelined players (injuries/suspensions) for a team
 */
export async function getTeamSidelined(teamId: number): Promise<PlayerInjuryInfo[]> {
  const cacheKey = `sportsmonks:sidelined:${teamId}`;
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ Sidelined cache hit for team ${teamId}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching sidelined players for team ${teamId}`);
    const client = getSportsmonksClient();
    
    const response = await client.get<any>(
      `/teams/${teamId}`,
      {
        include: 'sidelined',
      }
    );
    
    if (response.message || !response.data || !response.data.sidelined) {
      console.log(`⚠️ No sidelined data for team ${teamId}`);
      return [];
    }
    
    const sidelined = response.data.sidelined
      .filter((s: any) => s.category === 'injury' || s.category === 'suspension')
      .map((s: any): PlayerInjuryInfo => ({
        playerId: s.player_id,
        playerName: s.player_name || 'Unknown',
        reason: s.reason || 'Unknown',
        type: s.category === 'suspension' ? 'suspension' : 'injury',
        startDate: s.start_date,
        expectedReturn: s.end_date,
      }));
    
    console.log(`✅ Found ${sidelined.length} sidelined players for team ${teamId}`);
    
    // Cache for 6 hours
    await redis?.setex(cacheKey, 21600, JSON.stringify(sidelined));
    
    return sidelined;
  } catch (error: any) {
    console.error(`❌ Error fetching sidelined players:`, error.message);
    return [];
  }
}

/**
 * Get sidelined players for a specific fixture
 */
export async function getFixtureSidelined(fixtureId: number): Promise<{
  home: PlayerInjuryInfo[];
  away: PlayerInjuryInfo[];
}> {
  const cacheKey = `sportsmonks:fixture-sidelined:${fixtureId}`;
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ Fixture sidelined cache hit for ${fixtureId}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching fixture sidelined for ${fixtureId}`);
    const client = getSportsmonksClient();
    
    // Get fixture to find team IDs
    const fixtureResponse = await client.get<any>(
      `/fixtures/${fixtureId}`,
      {
        include: 'participants',
      }
    );
    
    if (fixtureResponse.message || !fixtureResponse.data) {
      console.log(`⚠️ Fixture not found: ${fixtureId}`);
      return { home: [], away: [] };
    }
    
    const participants = fixtureResponse.data.participants || [];
    const homeTeam = participants.find((p: any) => p.meta?.location === 'home');
    const awayTeam = participants.find((p: any) => p.meta?.location === 'away');
    
    if (!homeTeam || !awayTeam) {
      console.log(`⚠️ Teams not found in fixture ${fixtureId}`);
      return { home: [], away: [] };
    }
    
    const [homeSidelined, awaySidelined] = await Promise.all([
      getTeamSidelined(homeTeam.id),
      getTeamSidelined(awayTeam.id),
    ]);
    
    const result = {
      home: homeSidelined,
      away: awaySidelined,
    };
    
    console.log(`✅ Found sidelined: ${homeSidelined.length} home, ${awaySidelined.length} away`);
    
    // Cache for 6 hours
    await redis?.setex(cacheKey, 21600, JSON.stringify(result));
    
    return result;
  } catch (error: any) {
    console.error(`❌ Error fetching fixture sidelined:`, error.message);
    return { home: [], away: [] };
  }
}

export const injuriesService = {
  getTeamSidelined,
  getFixtureSidelined,
};
