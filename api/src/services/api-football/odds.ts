/**
 * API-Football Odds Service
 * Recupera quote reali dai bookmaker tramite API-Football
 */

import apiFootballClient from './client';
import logger from '../../utils/logger';
import { cacheGet, cacheSet } from '../../lib/redis';

export interface BookmakerOdds {
  id: number;
  name: string;
  bets: {
    id: number;
    name: string; // "Match Winner", "Goals Over/Under", etc.
    values: {
      value: string; // "Home", "Draw", "Away", "Over 2.5", etc.
      odd: string;   // "1.50", "3.20", etc.
    }[];
  }[];
}

export interface FixtureOdds {
  league: {
    id: number;
    name: string;
    country: string;
  };
  fixture: {
    id: number;
    date: string;
  };
  update: string;
  bookmakers: BookmakerOdds[];
}

export interface ProcessedOdds {
  fixtureId: number;
  odds1X2: {
    home: number;      // Quote squadra casa
    draw: number;      // Quote pareggio
    away: number;      // Quote squadra trasferta
    prob1: number;     // Probabilità implicita (0-1)
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
  bookmakerCount: number;
  avgBookmakerCount: number;
  overround: number;   // Margine bookmaker (es. 1.05 = 5%)
  lastUpdate: string;
}

/**
 * Converte quote decimali in probabilità implicita
 */
function oddsToProb(odds: number): number {
  return 1 / odds;
}

/**
 * Normalizza probabilità per rimuovere l'overround
 */
function normalizeProbs(probs: number[]): number[] {
  const sum = probs.reduce((a, b) => a + b, 0);
  return probs.map(p => p / sum);
}

/**
 * Calcola la media di un array di quote
 */
function averageOdds(oddsArray: number[]): number {
  if (oddsArray.length === 0) return 0;
  const sum = oddsArray.reduce((a, b) => a + b, 0);
  return sum / oddsArray.length;
}

/**
 * Fetch odds per fixture ID
 */
export async function fetchOddsByFixtureId(fixtureId: number): Promise<ProcessedOdds | null> {
  try {
    // Check cache first
    const cacheKey = `odds:fixture:${fixtureId}`;
    const cached = await cacheGet<ProcessedOdds>(cacheKey);
    if (cached) {
      logger.debug({ fixtureId }, '💾 Odds cache hit');
      return cached;
    }

    logger.info({ fixtureId }, '🎲 Fetching odds from API-Football');

    // Prova prima con tutti i bookmaker (per massimizzare le possibilità)
    const response = await apiFootballClient.request<{ response: FixtureOdds[] }>(
      `/odds`,
      { fixture: fixtureId }
    );

    if (!response.response || response.response.length === 0) {
      logger.warn({ fixtureId }, '⚠️ No odds data available for fixture');
      return null;
    }

    const fixtureOdds = response.response[0];
    
    if (!fixtureOdds.bookmakers || fixtureOdds.bookmakers.length === 0) {
      logger.warn({ fixtureId }, '⚠️ No bookmakers available');
      return null;
    }

    logger.info({ 
      fixtureId, 
      bookmakerCount: fixtureOdds.bookmakers.length,
      bookmakerNames: fixtureOdds.bookmakers.map(b => b.name).slice(0, 5).join(', ')
    }, '✅ Bookmakers found');

    // Process odds from all bookmakers
    const odds1X2Array: { home: number; draw: number; away: number }[] = [];
    const oddsOver25Array: number[] = [];
    const oddsUnder25Array: number[] = [];
    const oddsOver15Array: number[] = [];
    const oddsUnder15Array: number[] = [];
    const oddsOver35Array: number[] = [];
    const oddsUnder35Array: number[] = [];
    const oddsBTTSYesArray: number[] = [];
    const oddsBTTSNoArray: number[] = [];

    for (const bookmaker of fixtureOdds.bookmakers) {
      // Match Winner (1X2)
      const matchWinner = bookmaker.bets.find(
        b => b.name === 'Match Winner' || b.id === 1
      );
      if (matchWinner && matchWinner.values.length >= 3) {
        const home = parseFloat(matchWinner.values.find(v => v.value === 'Home')?.odd || '0');
        const draw = parseFloat(matchWinner.values.find(v => v.value === 'Draw')?.odd || '0');
        const away = parseFloat(matchWinner.values.find(v => v.value === 'Away')?.odd || '0');
        
        if (home > 0 && draw > 0 && away > 0) {
          odds1X2Array.push({ home, draw, away });
        }
      }

      // Goals Over/Under
      const goalsOU = bookmaker.bets.find(
        b => b.name === 'Goals Over/Under' || b.id === 5
      );
      if (goalsOU) {
        for (const value of goalsOU.values) {
          const odd = parseFloat(value.odd);
          if (odd > 0) {
            if (value.value === 'Over 1.5') oddsOver15Array.push(odd);
            else if (value.value === 'Under 1.5') oddsUnder15Array.push(odd);
            else if (value.value === 'Over 2.5') oddsOver25Array.push(odd);
            else if (value.value === 'Under 2.5') oddsUnder25Array.push(odd);
            else if (value.value === 'Over 3.5') oddsOver35Array.push(odd);
            else if (value.value === 'Under 3.5') oddsUnder35Array.push(odd);
          }
        }
      }

      // Both Teams Score (BTTS)
      const btts = bookmaker.bets.find(
        b => b.name === 'Both Teams Score' || b.id === 8
      );
      if (btts) {
        const yes = parseFloat(btts.values.find(v => v.value === 'Yes')?.odd || '0');
        const no = parseFloat(btts.values.find(v => v.value === 'No')?.odd || '0');
        if (yes > 0) oddsBTTSYesArray.push(yes);
        if (no > 0) oddsBTTSNoArray.push(no);
      }
    }

    // Calculate averages for 1X2
    if (odds1X2Array.length === 0) {
      logger.warn({ fixtureId }, '⚠️ No 1X2 odds available');
      return null;
    }

    const avgHome = averageOdds(odds1X2Array.map(o => o.home));
    const avgDraw = averageOdds(odds1X2Array.map(o => o.draw));
    const avgAway = averageOdds(odds1X2Array.map(o => o.away));

    // Calculate implied probabilities
    const rawProbs = [oddsToProb(avgHome), oddsToProb(avgDraw), oddsToProb(avgAway)];
    const overround = rawProbs.reduce((a, b) => a + b, 0);
    const [prob1, probX, prob2] = normalizeProbs(rawProbs);

    const processed: ProcessedOdds = {
      fixtureId,
      odds1X2: {
        home: avgHome,
        draw: avgDraw,
        away: avgAway,
        prob1,
        probX,
        prob2,
      },
      bookmakerCount: odds1X2Array.length,
      avgBookmakerCount: Math.round(
        (odds1X2Array.length + oddsOver25Array.length + oddsBTTSYesArray.length) / 3
      ),
      overround,
      lastUpdate: fixtureOdds.update,
    };

    // Add Over/Under if available
    if (oddsOver25Array.length > 0 && oddsUnder25Array.length > 0) {
      processed.oddsOverUnder = {
        over15: averageOdds(oddsOver15Array),
        under15: averageOdds(oddsUnder15Array),
        over25: averageOdds(oddsOver25Array),
        under25: averageOdds(oddsUnder25Array),
        over35: averageOdds(oddsOver35Array),
        under35: averageOdds(oddsUnder35Array),
      };
    }

    // Add BTTS if available
    if (oddsBTTSYesArray.length > 0 && oddsBTTSNoArray.length > 0) {
      processed.oddsBTTS = {
        yes: averageOdds(oddsBTTSYesArray),
        no: averageOdds(oddsBTTSNoArray),
      };
    }

    // Cache for 30 minutes (odds change frequently)
    await cacheSet(cacheKey, processed, 1800);

    logger.info({
      fixtureId,
      bookmakers: processed.bookmakerCount,
      home: avgHome.toFixed(2),
      draw: avgDraw.toFixed(2),
      away: avgAway.toFixed(2),
      prob1: (prob1 * 100).toFixed(1) + '%',
      probX: (probX * 100).toFixed(1) + '%',
      prob2: (prob2 * 100).toFixed(1) + '%',
      overround: ((overround - 1) * 100).toFixed(2) + '%',
    }, '✅ Odds fetched and processed');

    return processed;

  } catch (error: any) {
    logger.error({ error: error.message, fixtureId }, '❌ Error fetching odds');
    return null;
  }
}

/**
 * Fetch odds by team names (for manual predictions)
 * Searches for upcoming fixtures matching the teams
 */
export async function fetchOddsByTeams(
  homeTeam: string,
  awayTeam: string,
  leagueId?: number
): Promise<ProcessedOdds | null> {
  try {
    logger.info({ homeTeam, awayTeam, leagueId }, '🔍 Searching odds by team names');

    // Get today's and tomorrow's fixtures
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateStr = today.toISOString().split('T')[0];

    // Search fixtures
    const params: any = {
      date: dateStr,
      team: homeTeam, // API-Football can search by team name
    };

    if (leagueId) {
      params.league = leagueId;
    }

    const response = await apiFootballClient.request<{ response: any[] }>(
      `/fixtures`,
      params
    );

    if (!response.response || response.response.length === 0) {
      logger.warn({ homeTeam, awayTeam }, '⚠️ No fixtures found for teams');
      return null;
    }

    // Find matching fixture
    const fixture = response.response.find((f: any) => {
      const homeMatch = f.teams?.home?.name?.toLowerCase().includes(homeTeam.toLowerCase());
      const awayMatch = f.teams?.away?.name?.toLowerCase().includes(awayTeam.toLowerCase());
      return homeMatch && awayMatch;
    });

    if (!fixture) {
      logger.warn({ homeTeam, awayTeam }, '⚠️ No matching fixture found');
      return null;
    }

    // Fetch odds for this fixture
    return await fetchOddsByFixtureId(fixture.fixture.id);

  } catch (error: any) {
    logger.error({ error: error.message, homeTeam, awayTeam }, '❌ Error searching odds by teams');
    return null;
  }
}

export default {
  fetchOddsByFixtureId,
  fetchOddsByTeams,
};
