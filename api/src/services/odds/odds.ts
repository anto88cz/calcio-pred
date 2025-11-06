/**
 * The Odds API Service
 * Fetcha quote di mercato per calibrazione predizioni
 */

import axios, { AxiosInstance } from 'axios';
import { config } from '../../config';
import logger from '../../utils/logger';
import { cacheGet, cacheSet } from '../../lib/redis';

export interface OddsOutcome {
  name: string;
  price: number; // Decimal odds (e.g., 1.50, 2.20, etc.)
}

export interface OddsMarket {
  key: string; // 'h2h' or 'totals'
  outcomes: OddsOutcome[];
}

export interface Bookmaker {
  key: string;
  title: string;
  markets: OddsMarket[];
}

export interface OddsData {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

export interface MarketOdds {
  prob1: number;  // Home win probability (0-1)
  probX: number;  // Draw probability (0-1)
  prob2: number;  // Away win probability (0-1)
  over25: number; // Over 2.5 probability (0-1)
  under25: number; // Under 2.5 probability (0-1)
  rawOdds: {
    home: number;
    draw: number;
    away: number;
    over25?: number;
    under25?: number;
  };
  bookmakerCount: number;
  overround: number; // Bookmaker margin (e.g., 1.05 = 5% margin)
}

export class OddsService {
  private client: AxiosInstance;
  private enabled: boolean;

  constructor() {
    this.enabled = !!config.ODDS_API_KEY;
    
    if (!this.enabled) {
      logger.warn('Odds API key not configured - market calibration disabled');
    }

    this.client = axios.create({
      baseURL: config.ODDS_API_BASE,
      timeout: 10000,
      params: {
        apiKey: config.ODDS_API_KEY,
        regions: config.ODDS_API_REGIONS,
        markets: config.ODDS_API_MARKETS,
        oddsFormat: 'decimal',
      },
    });
  }

  /**
   * Check if odds service is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Fetch odds for a specific match by team names
   * @param homeTeam Home team name
   * @param awayTeam Away team name
   * @param sportKey Sport identifier (e.g., 'soccer_uefa_champs_league')
   */
  async fetchOddsByTeams(
    homeTeam: string,
    awayTeam: string,
    sportKey: string = config.ODDS_API_SPORT
  ): Promise<MarketOdds | null> {
    if (!this.enabled) {
      logger.debug('Odds API disabled - skipping fetch');
      return null;
    }

    try {
      // Generate cache key
      const cacheKey = `odds:${sportKey}:${homeTeam}:${awayTeam}`;
      
      // Check cache
      const cached = await cacheGet<MarketOdds>(cacheKey);
      if (cached) {
        logger.debug({ cacheKey }, 'Odds cache hit');
        return cached;
      }

      logger.info({ homeTeam, awayTeam, sportKey }, 'Fetching odds from The Odds API');

      // Fetch odds for sport
      const response = await this.client.get<OddsData[]>(`/v4/sports/${sportKey}/odds`);
      
      if (!response.data || response.data.length === 0) {
        logger.warn({ homeTeam, awayTeam }, 'No odds data available');
        return null;
      }

      // Find match by team names (fuzzy matching)
      const match = response.data.find(event => {
        const homeMatch = this.fuzzyMatch(event.home_team, homeTeam);
        const awayMatch = this.fuzzyMatch(event.away_team, awayTeam);
        return homeMatch && awayMatch;
      });

      if (!match) {
        logger.warn({ homeTeam, awayTeam }, 'Match not found in odds data');
        return null;
      }

      // Process odds
      const marketOdds = this.processOdds(match);
      
      if (!marketOdds) {
        logger.warn({ homeTeam, awayTeam }, 'Could not process odds data');
        return null;
      }

      // Cache result
      await cacheSet(cacheKey, marketOdds, config.ODDS_API_CACHE_TTL);

      logger.info({
        homeTeam,
        awayTeam,
        bookmakers: marketOdds.bookmakerCount,
        prob1: (marketOdds.prob1 * 100).toFixed(1) + '%',
        probX: (marketOdds.probX * 100).toFixed(1) + '%',
        prob2: (marketOdds.prob2 * 100).toFixed(1) + '%',
        overround: ((marketOdds.overround - 1) * 100).toFixed(2) + '%',
      }, 'Odds fetched successfully');

      return marketOdds;

    } catch (error: any) {
      if (error.response?.status === 429) {
        logger.error('Odds API rate limit exceeded');
      } else if (error.response?.status === 401) {
        logger.error('Odds API authentication failed - check API key');
      } else {
        logger.error({ error: error.message }, 'Error fetching odds');
      }
      return null;
    }
  }

  /**
   * Process raw odds data into normalized market odds
   */
  private processOdds(match: OddsData): MarketOdds | null {
    if (!match.bookmakers || match.bookmakers.length === 0) {
      return null;
    }

    // Collect all h2h (1X2) odds from bookmakers
    const h2hOdds: { home: number; draw: number; away: number }[] = [];
    const totalsOdds: { over25?: number; under25?: number }[] = [];

    for (const bookmaker of match.bookmakers) {
      // H2H Market (1X2)
      const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
      if (h2hMarket && h2hMarket.outcomes.length === 3) {
        const homeOutcome = h2hMarket.outcomes.find(o => o.name === match.home_team);
        const drawOutcome = h2hMarket.outcomes.find(o => o.name === 'Draw');
        const awayOutcome = h2hMarket.outcomes.find(o => o.name === match.away_team);

        if (homeOutcome && drawOutcome && awayOutcome) {
          h2hOdds.push({
            home: homeOutcome.price,
            draw: drawOutcome.price,
            away: awayOutcome.price,
          });
        }
      }

      // Totals Market (Over/Under 2.5)
      const totalsMarket = bookmaker.markets.find(m => m.key === 'totals');
      if (totalsMarket) {
        const over25 = totalsMarket.outcomes.find(o => o.name === 'Over' && o.price)?.price;
        const under25 = totalsMarket.outcomes.find(o => o.name === 'Under' && o.price)?.price;
        
        if (over25 || under25) {
          totalsOdds.push({ over25, under25 });
        }
      }
    }

    if (h2hOdds.length === 0) {
      logger.warn('No valid h2h odds found');
      return null;
    }

    // Calculate average odds across bookmakers
    const avgOdds = {
      home: h2hOdds.reduce((sum, o) => sum + o.home, 0) / h2hOdds.length,
      draw: h2hOdds.reduce((sum, o) => sum + o.draw, 0) / h2hOdds.length,
      away: h2hOdds.reduce((sum, o) => sum + o.away, 0) / h2hOdds.length,
    };

    // Calculate average totals odds
    const validTotals = totalsOdds.filter(t => t.over25 && t.under25);
    const avgTotals = validTotals.length > 0 ? {
      over25: validTotals.reduce((sum, t) => sum + (t.over25 || 0), 0) / validTotals.length,
      under25: validTotals.reduce((sum, t) => sum + (t.under25 || 0), 0) / validTotals.length,
    } : undefined;

    // Convert odds to implied probabilities
    const impliedProb1 = 1 / avgOdds.home;
    const impliedProbX = 1 / avgOdds.draw;
    const impliedProb2 = 1 / avgOdds.away;
    const totalImplied = impliedProb1 + impliedProbX + impliedProb2;

    // Calculate overround (bookmaker margin)
    const overround = totalImplied;

    // Remove overround by normalizing to 100%
    const prob1 = impliedProb1 / totalImplied;
    const probX = impliedProbX / totalImplied;
    const prob2 = impliedProb2 / totalImplied;

    // Process totals (Over/Under 2.5)
    let over25 = 0.5;
    let under25 = 0.5;
    
    if (avgTotals && avgTotals.over25 && avgTotals.under25) {
      const impliedOver = 1 / avgTotals.over25;
      const impliedUnder = 1 / avgTotals.under25;
      const totalImpliedOU = impliedOver + impliedUnder;
      
      over25 = impliedOver / totalImpliedOU;
      under25 = impliedUnder / totalImpliedOU;
    }

    return {
      prob1,
      probX,
      prob2,
      over25,
      under25,
      rawOdds: {
        home: avgOdds.home,
        draw: avgOdds.draw,
        away: avgOdds.away,
        over25: avgTotals?.over25,
        under25: avgTotals?.under25,
      },
      bookmakerCount: h2hOdds.length,
      overround,
    };
  }

  /**
   * Fuzzy match team names (handles variations)
   */
  private fuzzyMatch(name1: string, name2: string): boolean {
    const normalize = (s: string) => 
      s.toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9]/g, '');
    
    const n1 = normalize(name1);
    const n2 = normalize(name2);
    
    // Exact match
    if (n1 === n2) return true;
    
    // Contains match
    if (n1.includes(n2) || n2.includes(n1)) return true;
    
    // Common abbreviations
    const abbrevMap: Record<string, string[]> = {
      'manchestercity': ['mancity', 'mcfc'],
      'manchesterunited': ['manunited', 'mufc'],
      'tottenhamhotspur': ['tottenham', 'spurs'],
      'brightonandhovealbion': ['brighton'],
    };
    
    for (const [full, abbrevs] of Object.entries(abbrevMap)) {
      if ((n1 === full && abbrevs.includes(n2)) || 
          (n2 === full && abbrevs.includes(n1))) {
        return true;
      }
    }
    
    return false;
  }
}

// Singleton
export const oddsService = new OddsService();
