import { getSportsmonksClient } from './client';
import { redis } from '../../lib/redis';

/**
 * Normalize team name for matching
 * Removes common suffixes, special characters, and standardizes the format
 */
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(fc|cf|sc|afc|bfc|cfc|dfc|efc|ffc|gfc|hfc|ifc|jfc|kfc|lfc|mfc|nfc|ofc|pfc|qfc|rfc|sfc|tfc|ufc|vfc|wfc|xfc|yfc|zfc)$/i, '')
    .replace(/\s+(united|city|town|athletic|rovers|wanderers|albion|hotspur)$/i, '')
    .replace(/[.\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate similarity score between two team names (0-1)
 * Uses basic string matching and common word comparison
 */
function calculateSimilarity(name1: string, name2: string): number {
  const norm1 = normalizeTeamName(name1);
  const norm2 = normalizeTeamName(name2);
  
  // Exact match after normalization
  if (norm1 === norm2) return 1.0;
  
  // Check if one contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.9;
  
  // Split into words and compare
  const words1 = norm1.split(' ');
  const words2 = norm2.split(' ');
  
  // Count matching words
  let matchingWords = 0;
  for (const word1 of words1) {
    if (words2.some(word2 => word1 === word2 || word1.includes(word2) || word2.includes(word1))) {
      matchingWords++;
    }
  }
  
  // Calculate ratio of matching words
  const maxWords = Math.max(words1.length, words2.length);
  return matchingWords / maxWords;
}

export interface FixtureMatch {
  fixtureId: number;
  homeTeamName: string;
  awayTeamName: string;
  matchDate: string;
  similarity: number;
}

/**
 * Search for a fixture on Sportsmonks by team names and approximate date
 * @param homeTeamName - Home team name from API-Football
 * @param awayTeamName - Away team name from API-Football
 * @param date - Match date (YYYY-MM-DD format)
 * @returns Fixture ID if found, null otherwise
 */
export async function findFixtureByTeamNames(
  homeTeamName: string,
  awayTeamName: string,
  date?: string
): Promise<FixtureMatch | null> {
  const cacheKey = `sportsmonks:fixture-map:${homeTeamName}:${awayTeamName}:${date || 'any'}`;
  
  try {
    // Check cache first (24 hours TTL)
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ Fixture mapping cache hit for ${homeTeamName} vs ${awayTeamName}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Searching Sportsmonks fixture for: ${homeTeamName} vs ${awayTeamName}`);
    const client = getSportsmonksClient();
    
    // Search by home team name first
    const searchQuery = homeTeamName.split(' ')[0]; // Use first word for broader search
    let fixtures: any[] = [];
    let response: any = null;
    
    if (date) {
      // Search fixtures by date range (±2 days to account for timezone differences)
      const searchDate = new Date(date);
      const startDate = new Date(searchDate);
      startDate.setDate(startDate.getDate() - 2);
      const endDate = new Date(searchDate);
      endDate.setDate(endDate.getDate() + 2);
      
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      
      console.log(`📅 Searching fixtures between ${startStr} and ${endStr}`);
      
      response = await client.get<any>(
        '/fixtures/between/' + startStr + '/' + endStr,
        {
          include: 'participants',
        }
      );
      
      fixtures = response.data || [];
    } else {
      // Search by team name
      console.log(`🔎 Searching fixtures by team name: ${searchQuery}`);
      response = await client.get<any>(
        '/fixtures/search/' + encodeURIComponent(searchQuery),
        {
          include: 'participants',
        }
      );
      
      // Check if we got an error message (free plan limitation)
      if (response.message) {
        console.log(`⚠️ Sportsmonks API message: ${response.message}`);
        return null;
      }
      
      fixtures = response.data || [];
    }

    // Check if we got an error message (free plan limitation)
    if (!fixtures && response && response.message) {
      console.log(`⚠️ Sportsmonks API message: ${response.message}`);
      if (response.subscription) {
        console.log(`📋 Current plan:`, response.subscription[0]?.plans?.map((p: any) => p.plan).join(', '));
      }
      return null;
    }

    if (!fixtures || fixtures.length === 0) {
      console.log(`⚠️ No fixtures found for ${homeTeamName} vs ${awayTeamName}`);
      return null;
    }

    console.log(`📊 Found ${fixtures.length} potential fixtures, analyzing...`);

    // Find best matching fixture
    let bestMatch: FixtureMatch | null = null;
    let bestScore = 0;

    for (const fixture of fixtures) {
      // Extract team names from participants
      const participants = fixture.participants || [];
      if (participants.length !== 2) continue;

      // Identify home and away teams
      const homeTeam = participants.find((p: any) => p.meta?.location === 'home');
      const awayTeam = participants.find((p: any) => p.meta?.location === 'away');
      
      if (!homeTeam || !awayTeam) continue;

      const sportsmonksHome = homeTeam.name;
      const sportsmonksAway = awayTeam.name;

      // Calculate similarity scores
      const homeSimilarity = calculateSimilarity(homeTeamName, sportsmonksHome);
      const awaySimilarity = calculateSimilarity(awayTeamName, sportsmonksAway);
      const avgSimilarity = (homeSimilarity + awaySimilarity) / 2;

      console.log(`  📌 ${sportsmonksHome} vs ${sportsmonksAway}: ${(avgSimilarity * 100).toFixed(1)}% match`);

      // Require at least 60% similarity for both teams
      if (homeSimilarity >= 0.6 && awaySimilarity >= 0.6 && avgSimilarity > bestScore) {
        bestScore = avgSimilarity;
        bestMatch = {
          fixtureId: fixture.id,
          homeTeamName: sportsmonksHome,
          awayTeamName: sportsmonksAway,
          matchDate: fixture.starting_at || fixture.starting_at_timestamp,
          similarity: avgSimilarity,
        };
      }
    }

    if (bestMatch && bestScore >= 0.7) {
      console.log(`✅ Found match: ${bestMatch.homeTeamName} vs ${bestMatch.awayTeamName} (${(bestScore * 100).toFixed(1)}% confidence)`);
      console.log(`   Sportsmonks Fixture ID: ${bestMatch.fixtureId}`);
      
      // Cache for 24 hours
      await redis?.setex(cacheKey, 86400, JSON.stringify(bestMatch));
      
      return bestMatch;
    } else {
      console.log(`⚠️ No confident match found (best score: ${(bestScore * 100).toFixed(1)}%)`);
      return null;
    }
  } catch (error: any) {
    console.error(`❌ Error searching fixture on Sportsmonks:`, {
      message: error.message,
      status: error.response?.status,
    });
    return null;
  }
}

/**
 * Clear fixture mapping cache
 */
export async function clearFixtureMappingCache(homeTeamName: string, awayTeamName: string, date?: string): Promise<void> {
  const cacheKey = `sportsmonks:fixture-map:${homeTeamName}:${awayTeamName}:${date || 'any'}`;
  await redis?.del(cacheKey);
  console.log(`🗑️ Cleared fixture mapping cache for ${homeTeamName} vs ${awayTeamName}`);
}
