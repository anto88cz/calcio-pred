import { getSportsmonksClient } from './client';
import { redis } from '../../lib/redis';
import { findFixtureByTeamNames } from './fixture-mapper';

export interface SportsmonksOdds {
  home: number | null;
  draw: number | null;
  away: number | null;
  bookmaker?: string;
}

// ProcessedOdds type matching API-Football format
export interface ProcessedOdds {
  fixtureId: number;
  odds1X2: {
    home: number;
    draw: number;
    away: number;
    prob1: number;
    probX: number;
    prob2: number;
  };
  oddsOverUnder?: {
    over15: number;
    under15: number;
    over25: number;
    under25: number;
    over35: number;
    under35: number;
  };
  oddsBTTS?: {
    yes: number;
    no: number;
  };
  oddsDoubleChance?: {
    homeOrDraw: number; // 1X
    drawOrAway: number; // X2
    homeOrAway: number; // 12
  };
  bookmakerCount: number;
  avgBookmakerCount: number;
  overround: number;
  lastUpdate: string;
}

/**
 * Convert odds to implied probability
 */
function oddsToProb(odds: number): number {
  return 1 / odds;
}

/**
 * Normalize probabilities to remove overround
 */
function normalizeProbs(probs: number[]): number[] {
  const sum = probs.reduce((a, b) => a + b, 0);
  return probs.map(p => p / sum);
}

interface SportsmonksBookmaker {
  id: number;
  name: string;
  bookmaker?: {
    id: number;
    name: string;
  };
}

interface SportsmonksOddsData {
  id: number;
  name: string;
  suspended: boolean;
  bookmaker: SportsmonksBookmaker;
  odds?: Array<{
    label: string;
    value: string;
    probability?: string;
    dp3?: string;
    fractional?: string;
    american?: string;
  }>;
}

interface SportsmonksResponse {
  data: SportsmonksOddsData[];
  subscription?: any;
  rate_limit?: any;
  timezone?: string;
}

/**
 * Fetch odds for a specific fixture from Sportsmonks API
 * @param fixtureId - The Sportsmonks fixture ID
 * @returns Odds object in ProcessedOdds format or null if not available
 */
export async function fetchOddsByFixtureId(fixtureId: number): Promise<ProcessedOdds | null> {
  const cacheKey = `sportsmonks:odds:${fixtureId}`;
  
  try {
    // Check Redis cache first (30 minutes TTL)
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ Sportsmonks odds cache hit for fixture ${fixtureId}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching odds from Sportsmonks for fixture ${fixtureId}...`);
    const client = getSportsmonksClient();
    
    // Fetch fixture with odds included
    const response = await client.get<any>(
      `/fixtures/${fixtureId}`,
      {
        include: 'odds',
      }
    );

    // Extract odds from the response
    const fixtureData = response.data;
    const oddsArray = fixtureData?.odds;

    if (!oddsArray || !Array.isArray(oddsArray) || oddsArray.length === 0) {
      console.log(`⚠️ No odds data available from Sportsmonks for fixture ${fixtureId}`);
      return null;
    }

    console.log(`📊 Sportsmonks returned ${oddsArray.length} odds entries for fixture ${fixtureId}`);

    // ===== 1X2 Market =====
    // Filter for "Fulltime Result" or "Match Winner" markets (1X2)
    const fullTimeOdds = oddsArray.filter((odd: any) =>
      odd.market_description === 'Fulltime Result' ||
      odd.market_description === 'Match Winner' ||
      odd.market_description === '3Way Result'
    );

    if (fullTimeOdds.length === 0) {
      console.log(`⚠️ No fulltime result odds found in Sportsmonks data for fixture ${fixtureId}`);
      return null;
    }

    console.log(`📊 Found ${fullTimeOdds.length} fulltime odds from ${new Set(fullTimeOdds.map((o: any) => o.bookmaker_id)).size} bookmakers`);

    // Group odds by label (Home, Draw, Away) and calculate averages
    const oddsMap: Record<string, number[]> = {
      Home: [],
      Draw: [],
      Away: [],
    };

    for (const odd of fullTimeOdds) {
      const label = odd.label;
      const value = parseFloat(odd.value || odd.dp3 || '0');
      
      if (value > 0 && oddsMap[label]) {
        oddsMap[label].push(value);
      }
    }

    // Calculate average odds
    const home = oddsMap.Home.length > 0 
      ? oddsMap.Home.reduce((a, b) => a + b, 0) / oddsMap.Home.length 
      : 0;
    const draw = oddsMap.Draw.length > 0 
      ? oddsMap.Draw.reduce((a, b) => a + b, 0) / oddsMap.Draw.length 
      : 0;
    const away = oddsMap.Away.length > 0 
      ? oddsMap.Away.reduce((a, b) => a + b, 0) / oddsMap.Away.length 
      : 0;
    
    // Validate that we have at least the home and away odds
    if (!home || !away) {
      console.log(`⚠️ Incomplete odds data from Sportsmonks for fixture ${fixtureId}:`, { home, draw, away });
      return null;
    }

    // Calculate implied probabilities
    const prob1 = oddsToProb(home);
    const probX = draw > 0 ? oddsToProb(draw) : 0;
    const prob2 = oddsToProb(away);
    
    // Normalize probabilities to remove overround
    const [normProb1, normProbX, normProb2] = normalizeProbs([prob1, probX, prob2]);
    
    // Calculate overround (bookmaker margin)
    const overround = prob1 + probX + prob2;
    
    // Count unique bookmakers
    const bookmakerCount = new Set(fullTimeOdds.map((o: any) => o.bookmaker_id)).size;
    
    // ===== OVER/UNDER Market =====
    const overUnderOdds = oddsArray.filter((odd: any) =>
      odd.market_description === 'Goals Over/Under'
    );

    let oddsOverUnder: ProcessedOdds['oddsOverUnder'] | undefined;
    
    if (overUnderOdds.length > 0) {
      console.log(`📊 Found ${overUnderOdds.length} over/under odds`);
      
      // Group by total (1.5, 2.5, 3.5) and label (Over/Under)
      const ouMap: Record<string, { over: number[], under: number[] }> = {
        '1.5': { over: [], under: [] },
        '2.5': { over: [], under: [] },
        '3.5': { over: [], under: [] },
      };
      
      for (const odd of overUnderOdds) {
        const total = odd.total;
        const label = odd.label;
        const value = parseFloat(odd.value || odd.dp3 || '0');
        
        if (value > 0 && ouMap[total]) {
          if (label === 'Over') {
            ouMap[total].over.push(value);
          } else if (label === 'Under') {
            ouMap[total].under.push(value);
          }
        }
      }
      
      // Calculate averages
      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      
      const over15 = avg(ouMap['1.5'].over);
      const under15 = avg(ouMap['1.5'].under);
      const over25 = avg(ouMap['2.5'].over);
      const under25 = avg(ouMap['2.5'].under);
      const over35 = avg(ouMap['3.5'].over);
      const under35 = avg(ouMap['3.5'].under);
      
      if (over25 > 0 && under25 > 0) {
        oddsOverUnder = {
          over15: parseFloat(over15.toFixed(2)) || 0,
          under15: parseFloat(under15.toFixed(2)) || 0,
          over25: parseFloat(over25.toFixed(2)),
          under25: parseFloat(under25.toFixed(2)),
          over35: parseFloat(over35.toFixed(2)) || 0,
          under35: parseFloat(under35.toFixed(2)) || 0,
        };
        console.log(`✅ Over/Under 2.5 - Over: ${over25.toFixed(2)}, Under: ${under25.toFixed(2)}`);
      }
    }
    
    // ===== BTTS Market =====
    const bttsOdds = oddsArray.filter((odd: any) =>
      odd.market_description === 'Both Teams To Score' ||
      odd.market_description === 'Both Teams to Score'
    );

    let oddsBTTS: ProcessedOdds['oddsBTTS'] | undefined;
    
    if (bttsOdds.length > 0) {
      console.log(`📊 Found ${bttsOdds.length} BTTS odds`);
      
      const bttsMap: { yes: number[], no: number[] } = { yes: [], no: [] };
      
      for (const odd of bttsOdds) {
        const label = odd.label;
        const value = parseFloat(odd.value || odd.dp3 || '0');
        
        if (value > 0) {
          if (label === 'Yes') {
            bttsMap.yes.push(value);
          } else if (label === 'No') {
            bttsMap.no.push(value);
          }
        }
      }
      
      const avgYes = bttsMap.yes.length > 0 
        ? bttsMap.yes.reduce((a, b) => a + b, 0) / bttsMap.yes.length 
        : 0;
      const avgNo = bttsMap.no.length > 0 
        ? bttsMap.no.reduce((a, b) => a + b, 0) / bttsMap.no.length 
        : 0;
      
      if (avgYes > 0 && avgNo > 0) {
        oddsBTTS = {
          yes: parseFloat(avgYes.toFixed(2)),
          no: parseFloat(avgNo.toFixed(2)),
        };
        console.log(`✅ BTTS - Yes: ${avgYes.toFixed(2)}, No: ${avgNo.toFixed(2)}`);
      }
    }
    
    // ===== DOUBLE CHANCE Market =====
    const doubleChanceOdds = oddsArray.filter((odd: any) =>
      odd.market_description === 'Double Chance'
    );

    let oddsDoubleChance: ProcessedOdds['oddsDoubleChance'] | undefined;
    
    if (doubleChanceOdds.length > 0) {
      console.log(`📊 Found ${doubleChanceOdds.length} double chance odds`);
      
      const dcMap: { homeOrDraw: number[], drawOrAway: number[], homeOrAway: number[] } = {
        homeOrDraw: [],
        drawOrAway: [],
        homeOrAway: [],
      };
      
      for (const odd of doubleChanceOdds) {
        const label = odd.label;
        const value = parseFloat(odd.value || odd.dp3 || '0');
        
        if (value > 0) {
          // Different bookmakers use different labels
          if (label.includes('Home/Draw') || label.includes('or Draw') && label.includes('Home')) {
            dcMap.homeOrDraw.push(value);
          } else if (label.includes('Draw/Away') || label.includes('or Draw') && !label.includes('Home')) {
            dcMap.drawOrAway.push(value);
          } else if (label.includes('Home/Away') || label.includes('or') && !label.includes('Draw')) {
            dcMap.homeOrAway.push(value);
          }
        }
      }
      
      const avg1X = dcMap.homeOrDraw.length > 0 
        ? dcMap.homeOrDraw.reduce((a, b) => a + b, 0) / dcMap.homeOrDraw.length 
        : 0;
      const avgX2 = dcMap.drawOrAway.length > 0 
        ? dcMap.drawOrAway.reduce((a, b) => a + b, 0) / dcMap.drawOrAway.length 
        : 0;
      const avg12 = dcMap.homeOrAway.length > 0 
        ? dcMap.homeOrAway.reduce((a, b) => a + b, 0) / dcMap.homeOrAway.length 
        : 0;
      
      if (avg1X > 0 && avgX2 > 0 && avg12 > 0) {
        oddsDoubleChance = {
          homeOrDraw: parseFloat(avg1X.toFixed(2)),
          drawOrAway: parseFloat(avgX2.toFixed(2)),
          homeOrAway: parseFloat(avg12.toFixed(2)),
        };
        console.log(`✅ Double Chance - 1X: ${avg1X.toFixed(2)}, X2: ${avgX2.toFixed(2)}, 12: ${avg12.toFixed(2)}`);
      }
    }
    
    const result: ProcessedOdds = {
      fixtureId,
      odds1X2: {
        home: parseFloat(home.toFixed(2)),
        draw: draw > 0 ? parseFloat(draw.toFixed(2)) : 2.00,
        away: parseFloat(away.toFixed(2)),
        prob1: normProb1,
        probX: normProbX,
        prob2: normProb2,
      },
      oddsOverUnder,
      oddsBTTS,
      oddsDoubleChance,
      bookmakerCount,
      avgBookmakerCount: bookmakerCount,
      overround,
      lastUpdate: new Date().toISOString(),
    };

    console.log(`✅ Successfully fetched odds from ${bookmakerCount} bookmakers:`, {
      '1X2': {
        home: result.odds1X2.home,
        draw: result.odds1X2.draw,
        away: result.odds1X2.away,
      },
      'Over/Under': oddsOverUnder ? `2.5 Over: ${oddsOverUnder.over25}` : 'N/A',
      'BTTS': oddsBTTS ? `Yes: ${oddsBTTS.yes}` : 'N/A',
      'Double Chance': oddsDoubleChance ? `1X: ${oddsDoubleChance.homeOrDraw}` : 'N/A',
    });

    // Cache for 30 minutes
    await redis?.setex(cacheKey, 1800, JSON.stringify(result));

    return result;
  } catch (error: any) {
    console.error(`❌ Error fetching odds from Sportsmonks for fixture ${fixtureId}:`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    return null;
  }
}

/**
 * Fetch odds for multiple fixtures in batch
 * @param fixtureIds - Array of fixture IDs
 * @returns Map of fixture IDs to odds
 */
export async function fetchOddsBatch(fixtureIds: number[]): Promise<Map<number, ProcessedOdds>> {
  const results = new Map<number, ProcessedOdds>();
  
  // Fetch odds for each fixture (Sportsmonks doesn't have a batch endpoint for odds)
  await Promise.all(
    fixtureIds.map(async (fixtureId) => {
      const odds = await fetchOddsByFixtureId(fixtureId);
      if (odds) {
        results.set(fixtureId, odds);
      }
    })
  );

  return results;
}

/**
 * Clear odds cache for a specific fixture
 * @param fixtureId - The fixture ID
 */
export async function clearOddsCache(fixtureId: number): Promise<void> {
  const cacheKey = `sportsmonks:odds:${fixtureId}`;
  await redis?.del(cacheKey);
  console.log(`🗑️ Cleared Sportsmonks odds cache for fixture ${fixtureId}`);
}

/**
 * Fetch odds by team names (using fixture mapper)
 * This is the main function to use when you have API-Football team names
 * @param homeTeamName - Home team name from API-Football
 * @param awayTeamName - Away team name from API-Football
 * @param matchDate - Optional match date (YYYY-MM-DD) for better matching
 * @param fixtureId - Optional Sportsmonks fixture ID (if already known, skip mapping)
 * @returns Odds object in ProcessedOdds format or null if not available
 */
export async function fetchOddsByTeamNames(
  homeTeamName: string,
  awayTeamName: string,
  matchDate?: string,
  fixtureId?: number
): Promise<ProcessedOdds | null> {
  try {
    console.log(`🔍 Fetching odds for: ${homeTeamName} vs ${awayTeamName}`);
    
    // If we already have a Sportsmonks fixture ID, use it directly
    if (fixtureId) {
      console.log(`✅ Using provided Sportsmonks fixture ID: ${fixtureId}`);
      return await fetchOddsByFixtureId(fixtureId);
    }
    
    // Step 1: Find the fixture on Sportsmonks by team names
    const fixtureMatch = await findFixtureByTeamNames(homeTeamName, awayTeamName, matchDate);
    
    if (!fixtureMatch) {
      console.log(`⚠️ Could not find matching fixture on Sportsmonks for ${homeTeamName} vs ${awayTeamName}`);
      return null;
    }
    
    console.log(`✅ Found Sportsmonks fixture ${fixtureMatch.fixtureId} with ${(fixtureMatch.similarity * 100).toFixed(1)}% confidence`);
    
    // Step 2: Fetch odds for the found fixture
    const odds = await fetchOddsByFixtureId(fixtureMatch.fixtureId);
    
    if (odds) {
      console.log(`✅ Successfully fetched odds for ${homeTeamName} vs ${awayTeamName}`);
    }
    
    return odds;
  } catch (error: any) {
    console.error(`❌ Error fetching odds by team names:`, {
      homeTeam: homeTeamName,
      awayTeam: awayTeamName,
      error: error.message,
    });
    return null;
  }
}
