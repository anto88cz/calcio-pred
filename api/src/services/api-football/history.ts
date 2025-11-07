/**
 * Modulo History - Gestione storico partite per calcoli
 */

import { fixturesService } from './fixtures';
import { statisticsService as _statisticsService, FixtureStatistics } from './statistics';
import { prisma } from '../../lib/prisma';
import redis from '../../lib/redis';
import logger from '../../utils/logger';
import type { APIFootballFixture } from '../../types';
import { config } from '../../config';

export interface MatchHistoryData {
  fixtureId: number;
  date: Date;
  homeTeamId: number;
  homeTeamName: string;
  awayTeamId: number;
  awayTeamName: string;
  homeGoals: number;
  awayGoals: number;
  isHome: boolean; // TRUE se la squadra per cui stiamo calcolando giocava in casa
  leagueId: number;
  leagueName: string;
  season: number;
  // Expected Goals (xG) - Dati reali quando disponibili
  xg_home?: number | null;
  xg_away?: number | null;
  xga_home?: number | null;
  xga_away?: number | null;
  // Statistiche opzionali
  statistics?: FixtureStatistics[];
}

export class HistoryService {
  /**
   * Get storico partite per squadra
   * Ritorna solo partite ufficiali concluse DELLA STAGIONE CORRENTE
   * 
   * IMPORTANTE: Non usa più limit fisso, prende TUTTE le partite della stagione
   * Questo permette calcoli più accurati di form, trend, statistiche
   * 
   * @param teamId - ID squadra
   * @param season - Stagione (es: 2024 per 2024-2025)
   * @param limit - DEPRECATO ma mantenuto per backward compatibility, ignorato se 0
   */
  async getTeamHistory(
    teamId: number,
    season: number,
    limit: number = 0 // Default 0 = prendi TUTTA la stagione
  ): Promise<MatchHistoryData[]> {
    try {
      // ⚡ CACHE: Riduce API calls drasticamente (TTL: 1 ora)
      const cacheKey = `history:team:${teamId}:season:${season}:limit:${limit}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        logger.debug({ teamId, season, limit, cacheHit: true }, 'History cache HIT');
        const parsed = JSON.parse(cached) as MatchHistoryData[];
        // Deserializza Date objects
        parsed.forEach(m => { m.date = new Date(m.date); });
        return parsed;
      }

      logger.info({ teamId, season, useFullSeason: limit === 0 }, 'Fetching team history (cache MISS)');

      // Prendi TUTTE le partite della stagione (filtro solo per season, non limit)
      const fixtures = await fixturesService.getFixturesByTeam(teamId, season, {});

      if (!fixtures || fixtures.length === 0) {
        logger.warn({ teamId, season }, 'No fixtures found for team');
        return [];
      }

      // Filtra solo partite ufficiali e concluse
      const officialFixtures = fixturesService.filterOfficialFixtures(fixtures);
      const finishedFixtures = fixturesService.filterFinishedFixtures(officialFixtures);
      const validFixtures = fixturesService.filterValidFixtures(finishedFixtures);

      // Ordina per data (più recenti prima)
      const sortedFixtures = validFixtures.sort((a, b) => 
        b.fixture.timestamp - a.fixture.timestamp
      );

      // Se limit > 0, usa limit per backward compatibility
      // Se limit === 0, prendi TUTTE le partite della stagione corrente
      const finalFixtures = limit > 0 
        ? sortedFixtures.slice(0, limit)
        : sortedFixtures; // TUTTE le partite della stagione

      logger.info({
        teamId,
        season,
        totalMatches: finalFixtures.length,
        mode: limit > 0 ? `limited-${limit}` : 'full-season',
      }, 'Team history fetched from current season');

      // Converti a MatchHistoryData (con xG dal database)
      const history = await this.parseFixturesToHistory(finalFixtures, teamId);

      // ⚡ SALVA IN CACHE (TTL: 3600s = 1 ora)
      await redis.setex(cacheKey, 3600, JSON.stringify(history));
      logger.debug({ teamId, season, cached: history.length }, 'History cached for 1 hour');

      return history;
    } catch (error) {
      logger.error({ error, teamId, season }, 'Failed to fetch team history');
      throw error;
    }
  }

  /**
   * Get storico home/away separato DELLA STAGIONE CORRENTE
   * 
   * @param limit - Se 0, prende tutte le partite della stagione (consigliato)
   */
  async getTeamHistoryByVenue(
    teamId: number,
    season: number,
    isHome: boolean,
    limit: number = 0 // Default 0 = TUTTA la stagione
  ): Promise<MatchHistoryData[]> {
    try {
      logger.info({ teamId, season, isHome, useFullSeason: limit === 0 }, 'Fetching team history by venue');

      // Prendi TUTTA la stagione (limit=0)
      const allHistory = await this.getTeamHistory(teamId, season, 0);

      // Filtra per venue
      const venueHistory = allHistory.filter(match => match.isHome === isHome);

      // Se limit > 0, limita (backward compatibility)
      const finalHistory = limit > 0 
        ? venueHistory.slice(0, limit)
        : venueHistory; // TUTTE le partite home/away della stagione

      logger.info({
        teamId,
        venue: isHome ? 'home' : 'away',
        totalMatches: finalHistory.length,
      }, 'Venue history fetched from current season');

      return finalHistory;
    } catch (error) {
      logger.error({ error, teamId, season, isHome }, 'Failed to fetch team history by venue');
      throw error;
    }
  }

  /**
   * Get storico recente (ultime N partite)
   */
  async getRecentMatches(
    teamId: number,
    season: number,
    count: number = 5
  ): Promise<MatchHistoryData[]> {
    return this.getTeamHistory(teamId, season, count);
  }

  /**
   * Get head to head storico tra due squadre
   */
  async getHeadToHeadHistory(
    team1Id: number,
    team2Id: number,
    limit: number = 10
  ): Promise<MatchHistoryData[]> {
    try {
      logger.info({ team1Id, team2Id, limit }, 'Fetching head to head history');

      const h2hFixtures = await fixturesService.getHeadToHead(team1Id, team2Id, {
        last: limit * 2,
      });

      if (!h2hFixtures || h2hFixtures.length === 0) {
        return [];
      }

      // Filtra e ordina
      const officialFixtures = fixturesService.filterOfficialFixtures(h2hFixtures);
      const finishedFixtures = fixturesService.filterFinishedFixtures(officialFixtures);
      const validFixtures = fixturesService.filterValidFixtures(finishedFixtures);

      const sortedFixtures = validFixtures.sort((a, b) => 
        b.fixture.timestamp - a.fixture.timestamp
      );

      const limitedFixtures = sortedFixtures.slice(0, limit);

      return await this.parseFixturesToHistory(limitedFixtures, team1Id);
    } catch (error) {
      logger.error({ error, team1Id, team2Id }, 'Failed to fetch head to head history');
      throw error;
    }
  }

  /**
   * Converti APIFootballFixture a MatchHistoryData
   * AGGIORNATO: Carica anche i dati xG dal database quando disponibili
   */
  private async parseFixturesToHistory(
    fixtures: APIFootballFixture[],
    perspectiveTeamId?: number
  ): Promise<MatchHistoryData[]> {
    // Raccogli gli IDs delle fixture
    const fixtureApiIds = fixtures.map(f => f.fixture.id);

    // Fetch dati xG dal database in batch
    const fixturesFromDB = await prisma.fixture.findMany({
      where: {
        apiId: { in: fixtureApiIds }
      },
      select: {
        apiId: true,
        // @ts-expect-error - Prisma generated types not yet refreshed in IDE
        xg_home: true,
        xg_away: true,
        xga_home: true,
        xga_away: true,
      }
    });

    // Crea mappa per lookup veloce
    const xgMap = new Map(
      fixturesFromDB.map(f => [f.apiId, f])
    );

    return fixtures.map(fixture => {
      const isHome = perspectiveTeamId 
        ? fixture.teams.home.id === perspectiveTeamId
        : true;

      // Recupera dati xG dal database se disponibili
      const xgData = xgMap.get(fixture.fixture.id);

      return {
        fixtureId: fixture.fixture.id,
        date: new Date(fixture.fixture.date),
        homeTeamId: fixture.teams.home.id,
        homeTeamName: fixture.teams.home.name,
        awayTeamId: fixture.teams.away.id,
        awayTeamName: fixture.teams.away.name,
        homeGoals: fixture.goals.home ?? 0,
        awayGoals: fixture.goals.away ?? 0,
        isHome,
        leagueId: fixture.league.id,
        leagueName: fixture.league.name,
        season: fixture.league.season,
        // Aggiungi xG se disponibili
        // @ts-expect-error - Prisma generated types not yet refreshed in IDE
        xg_home: xgData?.xg_home ?? null,
        // @ts-expect-error
        xg_away: xgData?.xg_away ?? null,
        // @ts-expect-error
        xga_home: xgData?.xga_home ?? null,
        // @ts-expect-error
        xga_away: xgData?.xga_away ?? null,
      };
    });
  }

  /**
   * Calcola statistiche aggregate da storico
   */
  calculateAggregateStats(history: MatchHistoryData[]): {
    totalMatches: number;
    wins: number;
    draws: number;
    losses: number;
    goalsScored: number;
    goalsConceded: number;
    avgGoalsScored: number;
    avgGoalsConceded: number;
    winRate: number;
    cleanSheets: number;
    btts: number; // Both teams to score
    over15: number;
    over25: number;
    over35: number;
  } {
    if (history.length === 0) {
      return {
        totalMatches: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsScored: 0,
        goalsConceded: 0,
        avgGoalsScored: 0,
        avgGoalsConceded: 0,
        winRate: 0,
        cleanSheets: 0,
        btts: 0,
        over15: 0,
        over25: 0,
        over35: 0,
      };
    }

    let wins = 0;
    let draws = 0;
    let losses = 0;
    let goalsScored = 0;
    let goalsConceded = 0;
    let cleanSheets = 0;
    let btts = 0;
    let over15 = 0;
    let over25 = 0;
    let over35 = 0;

    history.forEach(match => {
      const teamGoals = match.isHome ? match.homeGoals : match.awayGoals;
      const oppGoals = match.isHome ? match.awayGoals : match.homeGoals;
      const totalGoals = match.homeGoals + match.awayGoals;

      goalsScored += teamGoals;
      goalsConceded += oppGoals;

      if (teamGoals > oppGoals) wins++;
      else if (teamGoals === oppGoals) draws++;
      else losses++;

      if (oppGoals === 0) cleanSheets++;
      if (match.homeGoals > 0 && match.awayGoals > 0) btts++;
      if (totalGoals > 1.5) over15++;
      if (totalGoals > 2.5) over25++;
      if (totalGoals > 3.5) over35++;
    });

    const totalMatches = history.length;

    return {
      totalMatches,
      wins,
      draws,
      losses,
      goalsScored,
      goalsConceded,
      avgGoalsScored: goalsScored / totalMatches,
      avgGoalsConceded: goalsConceded / totalMatches,
      winRate: wins / totalMatches,
      cleanSheets,
      btts,
      over15,
      over25,
      over35,
    };
  }

  /**
   * Calcola forma recente (ultimi 5 match)
   * Ritorna array di punti: 3 = win, 1 = draw, 0 = loss
   */
  calculateRecentForm(history: MatchHistoryData[], count: number = 5): number[] {
    const recentMatches = history.slice(0, count);
    
    return recentMatches.map(match => {
      const teamGoals = match.isHome ? match.homeGoals : match.awayGoals;
      const oppGoals = match.isHome ? match.awayGoals : match.homeGoals;

      if (teamGoals > oppGoals) return 3; // Win
      if (teamGoals === oppGoals) return 1; // Draw
      return 0; // Loss
    });
  }

  /**
   * Applica time-decay alle partite (più recenti = più peso)
   */
  applyTimeDecay(
    history: MatchHistoryData[],
    decayFactor: number = 0.95
  ): Array<{ match: MatchHistoryData; weight: number }> {
    return history.map((match, index) => ({
      match,
      weight: Math.pow(decayFactor, index), // Peso decresce esponenzialmente
    }));
  }

  /**
   * Verifica qualità dati storici
   */
  assessHistoryQuality(
    homeHistory: MatchHistoryData[],
    awayHistory: MatchHistoryData[]
  ): {
    quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'INSUFFICIENT';
    score: number; // 0-1
    homeMatches: number;
    awayMatches: number;
  } {
    const homeCount = homeHistory.length;
    const awayCount = awayHistory.length;
    const totalCount = homeCount + awayCount;
    const requiredMatches = config.HISTORY_GAMES;

    // Calcola score basato su completezza
    const completeness = Math.min(totalCount / (requiredMatches * 2), 1.0);
    
    // Calcola balance (idealmente 50/50 home/away)
    const balance = 1 - Math.abs(homeCount - awayCount) / (homeCount + awayCount);
    
    // Score finale
    const score = (completeness * 0.7 + balance * 0.3);

    let quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'INSUFFICIENT';
    
    if (score >= 0.9) quality = 'EXCELLENT';
    else if (score >= 0.7) quality = 'GOOD';
    else if (score >= 0.5) quality = 'FAIR';
    else if (score >= 0.3) quality = 'POOR';
    else quality = 'INSUFFICIENT';

    return {
      quality,
      score,
      homeMatches: homeCount,
      awayMatches: awayCount,
    };
  }
}

export const historyService = new HistoryService();
