import { getSportsmonksClient } from './client';
import { redis } from '../../lib/redis';

/**
 * Sportsmonks Statistics Service
 * Provides match statistics, team stats, and expected goals data
 */

export interface MatchStatistics {
  teamId: number;
  shots: {
    total: number | null;
    onTarget: number | null;
  };
  possession: number | null;
  passes: {
    total: number | null;
    accurate: number | null;
    percentage: number | null;
  };
  fouls: number | null;
  corners: number | null;
  offsides: number | null;
  yellowCards: number | null;
  redCards: number | null;
  expected_goals: number | null;
}

export interface MatchStatisticsData {
  fixtureId: number;
  home: MatchStatistics;
  away: MatchStatistics;
}

export interface ExpectedGoalsData {
  home: {
    teamId: number;
    teamName: string;
    xg: number | null;
    xgot: number | null;
  };
  away: {
    teamId: number;
    teamName: string;
    xg: number | null;
    xgot: number | null;
  };
  missingXg: boolean;
  // Legacy compatibility
  fixtureId?: number;
  homeXg?: number;
  awayXg?: number;
  totalXg?: number;
}

export interface MatchHistoryData {
  fixtureId: number;
  date: Date | string; // Can be Date or ISO string after JSON serialization
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  goalsHome: number;
  goalsAway: number;
  // Compatibility with old API-Football format
  homeGoals: number;
  awayGoals: number;
  isHome: boolean;
  venue: 'home' | 'away';
  leagueId: number;
  leagueName?: string;
  seasonId: number;
  season: number;
  xgHome?: number;
  xgAway?: number;
  xg_home?: number | null;
  xg_away?: number | null;
  xga_home?: number | null;
  xga_away?: number | null;
}

/**
 * Get statistics for a specific fixture
 */
export async function getFixtureStatistics(fixtureId: number, referenceDate?: Date): Promise<MatchStatisticsData | null> {
  const cacheKey = `sportsmonks:stats:${fixtureId}`;
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ Statistics cache hit for fixture ${fixtureId}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching statistics from Sportsmonks for fixture ${fixtureId}`);
    const client = getSportsmonksClient();
    
    const response = await client.get<any>(
      `/fixtures/${fixtureId}`,
      {
        include: 'statistics',
      }
    );
    
    if (response.message || !response.data || !response.data.statistics) {
      console.log(`⚠️ Statistics not found for fixture ${fixtureId}`);
      return null;
    }
    
    const stats = response.data.statistics;
    
    // Group statistics by team
    const homeStats = stats.filter((s: any) => s.location === 'home');
    const awayStats = stats.filter((s: any) => s.location === 'away');
    
    const getStatValue = (teamStats: any[], type: string): number | null => {
      const stat = teamStats.find((s: any) => s.type?.name === type);
      return stat?.data?.value ? parseFloat(stat.data.value) : null;
    };
    
    const result: MatchStatisticsData = {
      fixtureId,
      home: {
        teamId: homeStats[0]?.participant_id || 0,
        shots: {
          total: getStatValue(homeStats, 'Shots Total'),
          onTarget: getStatValue(homeStats, 'Shots On Target'),
        },
        possession: getStatValue(homeStats, 'Ball Possession'),
        passes: {
          total: getStatValue(homeStats, 'Passes Total'),
          accurate: getStatValue(homeStats, 'Passes Accurate'),
          percentage: getStatValue(homeStats, 'Passes %'),
        },
        fouls: getStatValue(homeStats, 'Fouls'),
        corners: getStatValue(homeStats, 'Corners'),
        offsides: getStatValue(homeStats, 'Offsides'),
        yellowCards: getStatValue(homeStats, 'Yellow Cards'),
        redCards: getStatValue(homeStats, 'Red Cards'),
        expected_goals: getStatValue(homeStats, 'Expected Goals'),
      },
      away: {
        teamId: awayStats[0]?.participant_id || 0,
        shots: {
          total: getStatValue(awayStats, 'Shots Total'),
          onTarget: getStatValue(awayStats, 'Shots On Target'),
        },
        possession: getStatValue(awayStats, 'Ball Possession'),
        passes: {
          total: getStatValue(awayStats, 'Passes Total'),
          accurate: getStatValue(awayStats, 'Passes Accurate'),
          percentage: getStatValue(awayStats, 'Passes %'),
        },
        fouls: getStatValue(awayStats, 'Fouls'),
        corners: getStatValue(awayStats, 'Corners'),
        offsides: getStatValue(awayStats, 'Offsides'),
        yellowCards: getStatValue(awayStats, 'Yellow Cards'),
        redCards: getStatValue(awayStats, 'Red Cards'),
        expected_goals: getStatValue(awayStats, 'Expected Goals'),
      },
    };
    
    console.log(`✅ Found statistics for fixture ${fixtureId}`);
    
    // Cache for 1 hour
    await redis?.setex(cacheKey, 3600, JSON.stringify(result));
    
    return result;
  } catch (error: any) {
    console.error(`❌ Error fetching statistics:`, error.message);
    return null;
  }
}

/**
 * Get expected goals data for a fixture
 * NOTE: Sportsmonks requires xG add-on package. If not available, estimates xG from shots.
 */
export async function getExpectedGoals(fixtureId: number, referenceDate?: Date): Promise<ExpectedGoalsData | null> {
  const stats = await getFixtureStatistics(fixtureId, referenceDate);
  
  if (!stats) {
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
      fixtureId,
      homeXg: 0,
      awayXg: 0,
      totalXg: 0,
    };
  }
  
  // Try to get real xG from statistics (requires xG add-on)
  let homeXg = stats.home.expected_goals;
  let awayXg = stats.away.expected_goals;
  
  // If xG not available, estimate from shots
  // Formula: xG ≈ (shots_on_target * 0.35) + (shots_total * 0.05)
  // This is a rough approximation based on historical conversion rates
  if (homeXg === null && stats.home.shots) {
    const shotsOnTarget = stats.home.shots.onTarget || 0;
    const shotsTotal = stats.home.shots.total || 0;
    homeXg = (shotsOnTarget * 0.35) + (shotsTotal * 0.05);
    console.log(`⚠️ xG not available for home team, estimated from shots: ${homeXg.toFixed(2)}`);
  }
  
  if (awayXg === null && stats.away.shots) {
    const shotsOnTarget = stats.away.shots.onTarget || 0;
    const shotsTotal = stats.away.shots.total || 0;
    awayXg = (shotsOnTarget * 0.35) + (shotsTotal * 0.05);
    console.log(`⚠️ xG not available for away team, estimated from shots: ${awayXg.toFixed(2)}`);
  }
  
  const missingXg = homeXg === null || awayXg === null;
  const homeXgValue = homeXg ?? 0;
  const awayXgValue = awayXg ?? 0;
  
  return {
    home: {
      teamId: stats.home.teamId,
      teamName: '',
      xg: homeXg,
      xgot: null,
    },
    away: {
      teamId: stats.away.teamId,
      teamName: '',
      xg: awayXg,
      xgot: null,
    },
    missingXg,
    fixtureId,
    homeXg: homeXgValue,
    awayXg: awayXgValue,
    totalXg: homeXgValue + awayXgValue,
  };
}

/**
 * Get match history for a team
 * Uses /teams/{id} endpoint with 'latest' include
 * NOTE: Team ID must be Sportsmonks ID, not API-Football ID
 */
export async function getTeamHistory(
  teamId: number,
  seasonId: number,
  limit: number = 20,
  teamName?: string, // Optional: for ID mapping
  referenceDate?: Date // 🆕 Temporal constraint to prevent data leakage
): Promise<MatchHistoryData[]> {
  const cacheKey = `sportsmonks:history:${teamId}:${seasonId}:${limit}`;
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ History cache hit for team ${teamId}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching history for team ${teamId}, season ${seasonId}`);
    console.log(`📋 Parameters: limit=${limit}, teamName="${teamName}"`);
    
    // If teamName provided, try to get Sportsmonks ID
    // SOLO per predizioni manuali dove teamId potrebbe essere API-Football ID
    let sportsmonksTeamId = teamId;
    if (teamName) {
      const { getSportsmonksTeamId } = await import('./team-mapping');
      const mappedId = await getSportsmonksTeamId(teamId, teamName);
      if (mappedId) {
        sportsmonksTeamId = mappedId;
        console.log(`🔄 Mapped team ${teamId} (${teamName}) → Sportsmonks ID: ${sportsmonksTeamId}`);
      } else {
        // 🔧 FIX: Se il mapping fallisce, usa comunque teamId originale
        // Potrebbe essere già un Sportsmonks ID (es. da fixture reale)
        console.log(`⚠️ Mapping failed for ${teamName}, using original ID ${teamId} (might already be Sportsmonks ID)`);
        sportsmonksTeamId = teamId;
      }
    }
    
    const client = getSportsmonksClient();
    
    // 🔧 STRATEGIA ALTERNATIVA per piani limitati:
    // Non possiamo usare /fixtures/between/{start}/{end}/{teamId} (non accessibile)
    // Invece usiamo /fixtures/between per le leghe supportate e filtriamo lato client
    
    // Leghe supportate - stesso array di ALLOWED_LEAGUES
    const ALLOWED_LEAGUES = [8, 384, 564, 82, 301, 72, 2, 5, 271, 600, 462];
    
    // 📊 Recupera fixtures per tutte le leghe supportate e filtra per team
    // Questo è l'unico modo che funziona con il piano European Plan
    let allFixtures: any[] = [];
    
    // ⚠️ LIMITAZIONE API: Il piano non supporta filtri avanzati
    // E l'endpoint /fixtures/between ha un limite di ~90 giorni per richiesta
    // Dobbiamo fare multiple chiamate per coprire 12 mesi
    
    const endDate = referenceDate || new Date();
    const startDate = new Date(endDate); // 🔧 FIX: Calcola startDate DA referenceDate, non da oggi
    startDate.setMonth(startDate.getMonth() - 12); // Vogliamo 12 mesi di dati PRIMA della referenceDate
    
    console.log(`📊 Fetching fixtures from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]} for team ${sportsmonksTeamId}...`);
    console.log(`⚠️ API limit: max 90 days per request, will split into multiple calls`);
    
    // Dividi in blocchi di 90 giorni (3 mesi)
    const CHUNK_DAYS = 90;
    const chunks: Array<{start: Date, end: Date}> = [];
    
    let currentStart = new Date(startDate);
    while (currentStart < endDate) {
      const currentEnd = new Date(currentStart);
      currentEnd.setDate(currentEnd.getDate() + CHUNK_DAYS);
      
      // Non superare endDate
      if (currentEnd > endDate) {
        currentEnd.setTime(endDate.getTime());
      }
      
      chunks.push({
        start: new Date(currentStart),
        end: new Date(currentEnd)
      });
      
      currentStart.setDate(currentStart.getDate() + CHUNK_DAYS + 1);
    }
    
    console.log(`📦 Split into ${chunks.length} chunks of ~90 days each`);
    
    // Recupera fixtures per ogni chunk SEQUENZIALMENTE (per rate limit)
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const startStr = chunk.start.toISOString().split('T')[0];
      const endStr = chunk.end.toISOString().split('T')[0];
      
      console.log(`📥 Fetching chunk ${i + 1}/${chunks.length}: ${startStr} to ${endStr}`);
      
      try {
        const response = await client.get<any>(
          `/fixtures/between/${startStr}/${endStr}`,
          {
            include: 'participants;scores;state;season',
            per_page: 100,
          }
        );
        
        if (response.data && Array.isArray(response.data)) {
          allFixtures = allFixtures.concat(response.data);
          console.log(`✅ Chunk ${i + 1}: ${response.data.length} fixtures`);
          
          // Gestisci paginazione per questo chunk
          let currentPage = 1;
          let hasMorePages = response.pagination?.has_more || false;
          
          while (hasMorePages && currentPage < 3) { // Max 3 pagine per chunk
            currentPage++;
            const pageResponse = await client.get<any>(
              `/fixtures/between/${startStr}/${endStr}`,
              {
                include: 'participants;scores;state;season',
                per_page: 100,
                page: currentPage,
              }
            );
            
            if (pageResponse.data) {
              allFixtures = allFixtures.concat(pageResponse.data);
              console.log(`✅ Chunk ${i + 1}, page ${currentPage}: ${pageResponse.data.length} fixtures`);
            }
            
            hasMorePages = pageResponse.pagination?.has_more || false;
          }
        } else {
          console.log(`⚠️ Chunk ${i + 1}: No data`);
        }
      } catch (error: any) {
        console.error(`❌ Error fetching chunk ${i + 1}:`, error.message);
        // Continua con il prossimo chunk anche se uno fallisce
      }
      
      // Piccola pausa tra i chunk per rate limit (500ms)
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`📊 Retrieved ${allFixtures.length} total fixtures across all chunks`);
    
    // 🔬 DIAGNOSTICO: Conta quante fixture per lega
    const leagueCounts: Record<number, number> = {};
    allFixtures.forEach((f: any) => {
      leagueCounts[f.league_id] = (leagueCounts[f.league_id] || 0) + 1;
    });
    console.log(`📊 Fixtures by league:`, Object.entries(leagueCounts).map(([id, count]) => `${id}:${count}`).join(', '));
    
    // 🔬 DIAGNOSTICO: Analizziamo primi 5 fixtures prima del filtro
    console.log(`\n🔬 ANALYZING first 5 fixtures from ${allFixtures.length} total:`);
    for (let idx = 0; idx < Math.min(5, allFixtures.length); idx++) {
      const f = allFixtures[idx];
      const participants = f.participants || [];
      const hasTeam = participants.some((p: any) => p.id === sportsmonksTeamId);
      const participantIds = participants.map((p: any) => p.id);
      console.log(`  [${idx}] ID:${f.id} league:${f.league_id} state:${f.state?.short || f.state_id} participants:[${participantIds}] hasTeam:${hasTeam}`);
    }
    
    // 🎯 Filtra solo le partite dove gioca la nostra squadra
    // E sono nelle leghe supportate per ridurre rumore
    const teamFixtures = allFixtures.filter((f: any) => {
      const participants = f.participants || [];
      const hasTeam = participants.some((p: any) => p.id === sportsmonksTeamId);
      const isAllowedLeague = ALLOWED_LEAGUES.includes(f.league_id);
      return hasTeam && isAllowedLeague;
    });
    
    console.log(`✅ Found ${teamFixtures.length} fixtures for team ${sportsmonksTeamId} in supported leagues`);
    console.log(`   ALLOWED_LEAGUES: [${ALLOWED_LEAGUES}]`);
    console.log(`   Target team ID: ${sportsmonksTeamId}`);
    
    // Filter by finished state ONLY (not by season - we want all historical data)
    // The seasonId parameter is mainly for league context, not for filtering
    const finishedFixtures = teamFixtures.filter((f: any) => {
      // SOLO partite finite (FT = Full Time, AET = After Extra Time)
      // NON usare state_id perché 5 potrebbe essere "Not Started"!
      const isFinished = f.state?.short === 'FT' || f.state?.short === 'AET';
      return isFinished;
    });
    
    console.log(`🏁 Found ${finishedFixtures.length} finished matches (from ${teamFixtures.length} total team fixtures)`);
    
    // 🆕 TEMPORAL FILTERING: Filter out matches after referenceDate to prevent data leakage
    let temporallyFilteredFixtures = finishedFixtures;
    if (referenceDate) {
      temporallyFilteredFixtures = finishedFixtures.filter((f: any) => {
        const fixtureDate = new Date(f.starting_at);
        const isBeforeReference = fixtureDate < referenceDate;
        return isBeforeReference;
      });
      console.log(`⏰ TEMPORAL FILTER: ${temporallyFilteredFixtures.length}/${finishedFixtures.length} matches before ${referenceDate.toISOString().split('T')[0]}`);
    }
    
    const matchHistory = temporallyFilteredFixtures
      .sort((a: any, b: any) => new Date(b.starting_at).getTime() - new Date(a.starting_at).getTime()) // Most recent first
      .slice(0, limit > 0 ? limit : undefined)
      .map((f: any): MatchHistoryData => {
        // Extract team IDs from participants array
        const participants = f.participants || [];
        const homeTeam = participants.find((p: any) => p.meta?.location === 'home');
        const awayTeam = participants.find((p: any) => p.meta?.location === 'away');
        
        const homeTeamId = homeTeam?.id || f.participant_home_id || 0;
        const awayTeamId = awayTeam?.id || f.participant_away_id || 0;
        
        const isHome = homeTeamId === sportsmonksTeamId;
        
        // Extract scores from scores array
        const scores = f.scores || [];
        const currentScores = scores.filter((s: any) => s.description === 'CURRENT');
        const homeScoreObj = currentScores.find((s: any) => s.score?.participant === 'home');
        const awayScoreObj = currentScores.find((s: any) => s.score?.participant === 'away');
        
        const goalsHome = homeScoreObj?.score?.goals ?? 0;
        const goalsAway = awayScoreObj?.score?.goals ?? 0;
        
        return {
          fixtureId: f.id,
          date: new Date(f.starting_at),
          homeTeamId,
          awayTeamId,
          homeTeamName: homeTeam?.name || '',
          awayTeamName: awayTeam?.name || '',
          goalsHome,
          goalsAway,
          homeGoals: goalsHome,
          awayGoals: goalsAway,
          isHome,
          venue: isHome ? 'home' : 'away',
          leagueId: f.league_id || 0,
          leagueName: f.league?.name,
          seasonId: f.season_id || seasonId,
          season: f.season_id || seasonId,
        };
      });
    
    console.log(`✅ Found ${matchHistory.length} matches in history for team ${teamId} (season ${seasonId || 'all'})`);
    
    // Cache for 1 hour
    await redis?.setex(cacheKey, 3600, JSON.stringify(matchHistory));
    
    return matchHistory;
  } catch (error: any) {
    console.error(`❌ Error fetching team history:`, error.message);
    return [];
  }
}

/**
 * Get head-to-head history between two teams
 */
export async function getHeadToHead(
  homeTeamId: number,
  awayTeamId: number,
  limit: number = 10,
  referenceDate?: Date // 🆕 Temporal constraint to prevent data leakage
): Promise<MatchHistoryData[]> {
  const cacheKey = `sportsmonks:h2h:${homeTeamId}:${awayTeamId}:${limit}`;
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ H2H cache hit for ${homeTeamId} vs ${awayTeamId}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching H2H for teams ${homeTeamId} vs ${awayTeamId}`);
    const client = getSportsmonksClient();
    
    const response = await client.get<any>(
      `/fixtures/head-to-head/${homeTeamId}/${awayTeamId}`,
      {
        include: 'participants;scores',
      }
    );
    
    if (response.message || !response.data) {
      console.log(`⚠️ H2H not found for teams ${homeTeamId} vs ${awayTeamId}`);
      return [];
    }
    
    let filteredFixtures = response.data
      .filter((f: any) => f.state?.short === 'FT');
    
    // 🆕 TEMPORAL FILTERING: Filter out matches after referenceDate to prevent data leakage
    if (referenceDate) {
      const beforeReference = filteredFixtures.filter((f: any) => {
        const fixtureDate = new Date(f.starting_at);
        return fixtureDate < referenceDate;
      });
      console.log(`⏰ H2H TEMPORAL FILTER: ${beforeReference.length}/${filteredFixtures.length} matches before ${referenceDate.toISOString().split('T')[0]}`);
      filteredFixtures = beforeReference;
    }
    
    const fixtures = filteredFixtures
      .slice(0, limit)
      .map((f: any): MatchHistoryData => {
        const participants = f.participants || [];
        const homeTeam = participants.find((p: any) => p.meta?.location === 'home');
        const awayTeam = participants.find((p: any) => p.meta?.location === 'away');
        
        const scores = f.scores || [];
        const isHome = homeTeam?.id === homeTeamId;
        const goalsHome = scores.find((s: any) => s.score?.participant === 'home')?.score?.goals || 0;
        const goalsAway = scores.find((s: any) => s.score?.participant === 'away')?.score?.goals || 0;
        
        return {
          fixtureId: f.id,
          date: new Date(f.starting_at),
          homeTeamId: homeTeam?.id || 0,
          awayTeamId: awayTeam?.id || 0,
          homeTeamName: homeTeam?.name || '',
          awayTeamName: awayTeam?.name || '',
          goalsHome,
          goalsAway,
          homeGoals: goalsHome,
          awayGoals: goalsAway,
          isHome,
          venue: isHome ? 'home' : 'away',
          leagueId: f.league_id || 0,
          leagueName: f.league?.name,
          seasonId: f.season_id || 0,
          season: 0,
        };
      });
    
    console.log(`✅ Found ${fixtures.length} H2H matches`);
    
    // Cache for 24 hours
    await redis?.setex(cacheKey, 86400, JSON.stringify(fixtures));
    
    return fixtures;
  } catch (error: any) {
    console.error(`❌ Error fetching H2H:`, error.message);
    return [];
  }
}

/**
 * Get match history for a team filtered by venue (home/away)
 */
export async function getTeamHistoryByVenue(
  teamId: number,
  seasonId: number,
  isHome: boolean,
  limit: number = 0,
  teamName?: string, // 🆕 Team name for ID mapping
  referenceDate?: Date // 🆕 Temporal constraint to prevent data leakage
): Promise<MatchHistoryData[]> {
  try {
    console.log(`🔍 Fetching ${isHome ? 'home' : 'away'} history for team ${teamId} (${teamName || 'no name'}), season ${seasonId}`);
    
    // Get full team history first (pass teamName for mapping)
    const allHistory = await getTeamHistory(teamId, seasonId, 0, teamName, referenceDate);
    
    // Filter by venue
    const venueHistory = allHistory.filter(match => match.isHome === isHome);
    
    // Apply limit if specified
    const finalHistory = limit > 0 ? venueHistory.slice(0, limit) : venueHistory;
    
    console.log(`✅ Found ${finalHistory.length} ${isHome ? 'home' : 'away'} matches for team ${teamId}`);
    
    return finalHistory;
  } catch (error: any) {
    console.error(`❌ Error fetching venue history:`, error.message);
    return [];
  }
}

export const statisticsService = {
  getFixtureStatistics,
  getExpectedGoals,
  getTeamHistory,
  getTeamHistoryByVenue,
  getHeadToHead,
};
