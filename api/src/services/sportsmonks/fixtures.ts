import { getSportsmonksClient } from './client';
import { redis } from '../../lib/redis';

/**
 * Sportsmonks Fixtures Service
 * Replaces API-Football fixtures service
 */

export interface FixtureTeam {
  id: number;
  name: string;
  logo?: string;
}

export interface FixtureScore {
  home: number | null;
  away: number | null;
}

export interface Fixture {
  id: number;
  date: string;
  timestamp: number;
  homeTeam: FixtureTeam;
  awayTeam: FixtureTeam;
  score: FixtureScore;
  status: string;
  statusShort: string;
  league: {
    id: number;
    name: string;
    country: string;
    logo?: string;
    season: number;
  };
  venue?: {
    id?: number;
    name?: string;
    city?: string;
  };
}

/**
 * Transform Sportsmonks fixture to our standard format
 */
function transformFixture(smFixture: any): Fixture {
  const participants = smFixture.participants || [];
  const homeTeam = participants.find((p: any) => p.meta?.location === 'home');
  const awayTeam = participants.find((p: any) => p.meta?.location === 'away');
  
  // 🔍 Parsing scores from Sportsmonks v3 API
  const scores = smFixture.scores || [];
  
  let homeScore = null;
  let awayScore = null;
  
  // Sportsmonks v3: gli score sono array di oggetti con structure:
  // { participant_id, score: { goals, participant: 'home'/'away' }, description: 'CURRENT'/'2ND_HALF'/etc }
  
  if (scores.length > 0) {
    // Cerca prima il punteggio CURRENT (partita finita/in corso)
    const currentScores = scores.filter((s: any) => s.description === 'CURRENT');
    
    if (currentScores.length > 0) {
      // Trova home e away da CURRENT
      const homeScoreObj = currentScores.find((s: any) => s.score?.participant === 'home');
      const awayScoreObj = currentScores.find((s: any) => s.score?.participant === 'away');
      
      homeScore = homeScoreObj?.score?.goals ?? null;
      awayScore = awayScoreObj?.score?.goals ?? null;
    }
    
    // Se non ci sono CURRENT, prova con 2ND_HALF (fine partita)
    if (homeScore === null || awayScore === null) {
      const secondHalfScores = scores.filter((s: any) => s.description === '2ND_HALF');
      
      if (secondHalfScores.length > 0) {
        const homeScoreObj = secondHalfScores.find((s: any) => s.score?.participant === 'home');
        const awayScoreObj = secondHalfScores.find((s: any) => s.score?.participant === 'away');
        
        homeScore = homeScoreObj?.score?.goals ?? null;
        awayScore = awayScoreObj?.score?.goals ?? null;
      }
    }
  }
  
  return {
    id: smFixture.id,
    date: smFixture.starting_at,
    timestamp: new Date(smFixture.starting_at).getTime() / 1000,
    homeTeam: {
      id: homeTeam?.id || 0,
      name: homeTeam?.name || 'Unknown',
      logo: homeTeam?.image_path,
    },
    awayTeam: {
      id: awayTeam?.id || 0,
      name: awayTeam?.name || 'Unknown',
      logo: awayTeam?.image_path,
    },
    score: {
      home: homeScore,
      away: awayScore,
    },
    status: smFixture.state?.state || 'Unknown',
    statusShort: smFixture.state?.short_name || smFixture.state?.short || 'NS',
    league: {
      id: smFixture.league?.id || smFixture.league_id || 0,
      name: smFixture.league?.name || 'Unknown',
      country: smFixture.league?.country?.name || 'Unknown',
      logo: smFixture.league?.image_path,
      season: smFixture.season?.id || smFixture.season_id || 0,
    },
    venue: smFixture.venue ? {
      id: smFixture.venue.id,
      name: smFixture.venue.name,
      city: smFixture.venue.city_name,
    } : undefined,
  };
}

/**
 * Get fixtures by date
 */
export async function getFixturesByDate(date: string, leagueId?: number, leagueIds?: number[]): Promise<Fixture[]> {
  const cacheKey = `sportsmonks:fixtures:date:${date}${leagueId ? `:${leagueId}` : ''}${leagueIds ? `:${leagueIds.join(',')}` : ''}`;
  
  try {
    // Check cache (1 hour for past dates, 10 minutes for today/future)
    const isToday = date === new Date().toISOString().split('T')[0];
    const ttl = isToday ? 600 : 3600;
    
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ Fixtures cache hit for date ${date}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching fixtures from Sportsmonks for date ${date} (with pagination)`);
    const client = getSportsmonksClient();
    
    // Use the /fixtures/between endpoint to get ALL fixtures including future ones
    const params: any = {
      include: 'participants;league.country;scores;state;venue;lineups',
      per_page: 100, // Max per page
    };
    
    if (leagueId) {
      params.filters = `leagueId:${leagueId}`;
    } else if (leagueIds && leagueIds.length > 0) {
      // Use fixtureLeagues filter for multiple leagues
      params.filters = `fixtureLeagues:${leagueIds.join(',')}`;
    }
    
    // Paginate through all results
    let allFixtures: any[] = [];
    let currentPage = 1;
    let hasMorePages = true;
    
    while (hasMorePages) {
      params.page = currentPage;
      
      console.log(`📄 Fetching page ${currentPage}...`);
      const response = await client.get<any>(`/fixtures/between/${date}/${date}`, params);
      
      if (response.message) {
        console.log(`⚠️ Sportsmonks API message: ${response.message}`);
        break;
      }
      
      const pageFixtures = response.data || [];
      allFixtures = allFixtures.concat(pageFixtures);
      
      // Check if there are more pages
      const pagination = response.pagination;
      if (pagination && pagination.has_more) {
        currentPage++;
        console.log(`✅ Page ${currentPage - 1} fetched (${pageFixtures.length} fixtures). Loading next page...`);
      } else {
        hasMorePages = false;
        console.log(`✅ Page ${currentPage} fetched (${pageFixtures.length} fixtures). No more pages.`);
      }
    }
    
    const fixtures = allFixtures.map(transformFixture);
    
    console.log(`✅ Found ${fixtures.length} total fixtures for ${date} (${currentPage} pages)`);
    
    // Cache
    await redis?.setex(cacheKey, ttl, JSON.stringify(fixtures));
    
    return fixtures;
  } catch (error: any) {
    console.error(`❌ Error fetching fixtures by date:`, error.message);
    return [];
  }
}

/**
 * Get fixtures by date range
 */
export async function getFixturesByDateRange(startDate: string, endDate: string, leagueId?: number, leagueIds?: number[]): Promise<Fixture[]> {
  const cacheKey = `sportsmonks:fixtures:range:${startDate}:${endDate}${leagueId ? `:${leagueId}` : ''}${leagueIds ? `:${leagueIds.join(',')}` : ''}`;
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ Fixtures cache hit for range ${startDate} to ${endDate}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching fixtures from Sportsmonks between ${startDate} and ${endDate} (with pagination)`);
    const client = getSportsmonksClient();
    
    const params: any = {
      include: 'participants;league.country;scores;state;venue;lineups',
      per_page: 100, // Max per page
    };
    
    if (leagueId) {
      params.filters = `leagueId:${leagueId}`;
    } else if (leagueIds && leagueIds.length > 0) {
      // Use fixtureLeagues filter for multiple leagues
      params.filters = `fixtureLeagues:${leagueIds.join(',')}`;
    }
    
    // Paginate through all results
    let allFixtures: any[] = [];
    let currentPage = 1;
    let hasMorePages = true;
    
    while (hasMorePages) {
      params.page = currentPage;
      
      console.log(`📄 Fetching page ${currentPage} for range ${startDate}-${endDate}...`);
      const response = await client.get<any>(`/fixtures/between/${startDate}/${endDate}`, params);
      
      if (response.message) {
        console.log(`⚠️ Sportsmonks API message: ${response.message}`);
        break;
      }
      
      const pageFixtures = response.data || [];
      allFixtures = allFixtures.concat(pageFixtures);
      
      // Check if there are more pages
      const pagination = response.pagination;
      if (pagination && pagination.has_more) {
        currentPage++;
        console.log(`✅ Page ${currentPage - 1} fetched (${pageFixtures.length} fixtures). Loading next page...`);
      } else {
        hasMorePages = false;
        console.log(`✅ Page ${currentPage} fetched (${pageFixtures.length} fixtures). No more pages.`);
      }
    }
    
    const fixtures = allFixtures.map(transformFixture);
    
    console.log(`✅ Found ${fixtures.length} total fixtures between ${startDate} and ${endDate} (${currentPage} pages)`);
    
    // Cache for 30 minutes
    await redis?.setex(cacheKey, 1800, JSON.stringify(fixtures));
    
    return fixtures;
  } catch (error: any) {
    console.error(`❌ Error fetching fixtures by date range:`, error.message);
    return [];
  }
}

/**
 * Get fixture by ID
 */
export async function getFixtureById(fixtureId: number): Promise<Fixture | null> {
  const cacheKey = `sportsmonks:fixture:${fixtureId}`;
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ Fixture cache hit for ID ${fixtureId}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching fixture ${fixtureId} from Sportsmonks`);
    const client = getSportsmonksClient();
    
    const response = await client.get<any>(
      `/fixtures/${fixtureId}`,
      {
        include: 'participants;league.country;scores;state;venue;lineups',
      }
    );
    
    if (response.message || !response.data) {
      console.log(`⚠️ Fixture ${fixtureId} not found`);
      return null;
    }
    
    const fixture = transformFixture(response.data);
    
    console.log(`✅ Found fixture: ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`);
    
    // Cache for 30 minutes
    await redis?.setex(cacheKey, 1800, JSON.stringify(fixture));
    
    return fixture;
  } catch (error: any) {
    console.error(`❌ Error fetching fixture by ID:`, error.message);
    return null;
  }
}

/**
 * Get live fixtures (livescores)
 */
export async function getLiveFixtures(leagueId?: number): Promise<Fixture[]> {
  const cacheKey = `sportsmonks:fixtures:live${leagueId ? `:${leagueId}` : ''}`;
  
  try {
    // Very short cache for live data (30 seconds)
    const cached = await redis?.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    console.log(`🔴 Fetching live fixtures from Sportsmonks`);
    const client = getSportsmonksClient();
    
    const params: any = {
      include: 'participants;league.country;scores;state;venue;lineups',
    };
    
    if (leagueId) {
      params.filters = `leagueId:${leagueId}`;
    }
    
    const response = await client.get<any>('/livescores/inplay', params);
    
    if (response.message) {
      console.log(`⚠️ Sportsmonks API message: ${response.message}`);
      return [];
    }
    
    const fixtures = (response.data || []).map(transformFixture);
    
    console.log(`✅ Found ${fixtures.length} live fixtures`);
    
    // Cache for 30 seconds
    await redis?.setex(cacheKey, 30, JSON.stringify(fixtures));
    
    return fixtures;
  } catch (error: any) {
    console.error(`❌ Error fetching live fixtures:`, error.message);
    return [];
  }
}

/**
 * Get upcoming fixtures for a team
 */
export async function getUpcomingFixturesByTeam(teamId: number, limit: number = 10): Promise<Fixture[]> {
  const cacheKey = `sportsmonks:fixtures:team:${teamId}:upcoming:${limit}`;
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ Upcoming fixtures cache hit for team ${teamId}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching upcoming fixtures for team ${teamId}`);
    const client = getSportsmonksClient();
    
    const response = await client.get<any>(
      `/fixtures/upcoming/team/${teamId}`,
      {
        include: 'participants;league.country;scores;state;venue;lineups',
      }
    );
    
    if (response.message) {
      console.log(`⚠️ Sportsmonks API message: ${response.message}`);
      return [];
    }
    
    const fixtures = (response.data || []).slice(0, limit).map(transformFixture);
    
    console.log(`✅ Found ${fixtures.length} upcoming fixtures for team ${teamId}`);
    
    // Cache for 1 hour
    await redis?.setex(cacheKey, 3600, JSON.stringify(fixtures));
    
    return fixtures;
  } catch (error: any) {
    console.error(`❌ Error fetching upcoming fixtures by team:`, error.message);
    return [];
  }
}

export const fixturesService = {
  getFixturesByDate,
  getFixturesByDateRange,
  getFixtureById,
  getLiveFixtures,
  getUpcomingFixturesByTeam,
};
