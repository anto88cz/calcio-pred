/**
 * Modulo Injuries - Gestione infortuni e assenze
 */

import { apiFootballClient } from './client';
import logger from '../../utils/logger';
import type { APIFootballInjury } from '../../types';

export interface PlayerInjuryInfo {
  playerId: number;
  playerName: string;
  playerPhoto: string;
  type: string; // 'Injury', 'Suspended', 'Missing', 'Doubtful'
  reason: string;
  teamId: number;
  teamName: string;
  fixtureId: number;
  fixtureDate: string;
  position?: string; // Goalkeeper, Defender, Midfielder, Attacker
}

export interface TeamInjuriesAnalysis {
  teamId: number;
  teamName: string;
  players: PlayerInjuryInfo[];
  totalInjuries: number;
  severityScore: number; // 0-100 (higher = worse)
  impactFactor: {
    attacking: number; // Multiplier for lambda (0.7 = -30%)
    defensive: number; // Multiplier for xGA (1.2 = +20% more goals conceded)
  };
}

export interface InjuriesImpactAnalysis {
  home: TeamInjuriesAnalysis;
  away: TeamInjuriesAnalysis;
  homeAdvantage: boolean;
  awayAdvantage: boolean;
  balanced: boolean;
  impactDescription: string;
}

export class InjuriesService {
  /**
   * Get infortuni per fixture
   */
  async getInjuriesByFixture(fixtureId: number): Promise<PlayerInjuryInfo[]> {
    try {
      logger.info({ fixtureId }, 'Fetching injuries by fixture');
      
      const injuries = await apiFootballClient.request<APIFootballInjury[]>(
        '/injuries',
        { fixture: fixtureId },
        { cache: true, cacheTTL: 3600 }
      );

      return this.parseInjuries(injuries || []);
    } catch (error) {
      logger.error({ error, fixtureId }, 'Failed to fetch injuries by fixture');
      throw error;
    }
  }

  /**
   * Get infortuni per squadra
   */
  async getInjuriesByTeam(
    teamId: number,
    season: number,
    leagueId?: number
  ): Promise<PlayerInjuryInfo[]> {
    try {
      logger.info({ teamId, season, leagueId }, 'Fetching injuries by team');
      
      const params: any = {
        team: teamId,
        season,
      };

      if (leagueId) {
        params.league = leagueId;
      }

      const injuries = await apiFootballClient.request<APIFootballInjury[]>(
        '/injuries',
        params,
        { cache: true, cacheTTL: 3600 }
      );

      return this.parseInjuries(injuries || []);
    } catch (error) {
      logger.error({ error, teamId, season }, 'Failed to fetch injuries by team');
      throw error;
    }
  }

  /**
   * Get infortuni per lega e stagione
   */
  async getInjuriesByLeague(
    leagueId: number,
    season: number
  ): Promise<PlayerInjuryInfo[]> {
    try {
      logger.info({ leagueId, season }, 'Fetching injuries by league');
      
      const injuries = await apiFootballClient.request<APIFootballInjury[]>(
        '/injuries',
        { league: leagueId, season },
        { cache: true, cacheTTL: 3600 }
      );

      return this.parseInjuries(injuries || []);
    } catch (error) {
      logger.error({ error, leagueId, season }, 'Failed to fetch injuries by league');
      throw error;
    }
  }

  /**
   * Parse injuries da formato API
   */
  private parseInjuries(apiInjuries: APIFootballInjury[]): PlayerInjuryInfo[] {
    return apiInjuries.map(injury => ({
      playerId: injury.player.id,
      playerName: injury.player.name,
      playerPhoto: injury.player.photo,
      type: injury.player.type,
      reason: injury.player.reason,
      teamId: injury.team.id,
      teamName: injury.team.name,
      fixtureId: injury.fixture.id,
      fixtureDate: injury.fixture.date,
    }));
  }

  /**
   * Filtra infortuni per tipo
   */
  filterByType(
    injuries: PlayerInjuryInfo[],
    types: Array<'Injury' | 'Suspended' | 'Missing' | 'Doubtful'>
  ): PlayerInjuryInfo[] {
    return injuries.filter(injury => types.includes(injury.type as any));
  }

  /**
   * Calcola impatto infortuni su confidence
   * Ritorna un valore 0-1 (1 = nessun impatto, 0 = impatto massimo)
   */
  calculateInjuryImpact(
    injuries: PlayerInjuryInfo[],
    _keyPositions: string[] = ['Goalkeeper', 'Attacker', 'Midfielder']
  ): number {
    if (injuries.length === 0) return 1.0;

    // Peso per tipo infortunio
    const typeWeights: Record<string, number> = {
      'Injury': 0.3,        // Infortunio certo
      'Suspended': 0.3,     // Squalifica
      'Missing': 0.2,       // Assenza generica
      'Doubtful': 0.1,      // Dubbio
    };

    let totalImpact = 0;

    injuries.forEach(injury => {
      const weight = typeWeights[injury.type] || 0.1;
      totalImpact += weight;
    });

    // Normalizza (max 5 infortuni importanti = confidence 0)
    const normalizedImpact = Math.min(totalImpact / 1.5, 1.0);
    
    return 1.0 - normalizedImpact;
  }

  /**
   * Raggruppa infortuni per squadra
   */
  groupByTeam(injuries: PlayerInjuryInfo[]): Map<number, PlayerInjuryInfo[]> {
    const grouped = new Map<number, PlayerInjuryInfo[]>();

    injuries.forEach(injury => {
      const existing = grouped.get(injury.teamId) || [];
      existing.push(injury);
      grouped.set(injury.teamId, existing);
    });

    return grouped;
  }

  /**
   * Verifica se ci sono infortuni critici (portiere o più di 3 giocatori)
   */
  hasCriticalInjuries(injuries: PlayerInjuryInfo[]): boolean {
    // Conta infortuni certi (non doubtful)
    const seriousInjuries = injuries.filter(
      inj => inj.type === 'Injury' || inj.type === 'Suspended'
    );

    // Critico se più di 3 infortuni seri
    if (seriousInjuries.length > 3) return true;

    // Critico se portiere infortunato (cerca keyword nel reason)
    const goalkeeperInjured = seriousInjuries.some(
      inj => inj.reason.toLowerCase().includes('goalkeeper') || 
             inj.playerName.toLowerCase().includes('goalkeeper')
    );

    return goalkeeperInjured;
  }

  /**
   * ADVANCED: Analyze injuries impact for match prediction
   * Returns impact factors for lambda adjustments
   */
  async analyzeMatchInjuriesImpact(
    homeTeamId: number,
    awayTeamId: number,
    fixtureId?: number,
    season?: number
  ): Promise<InjuriesImpactAnalysis | null> {
    try {
      let homeInjuries: PlayerInjuryInfo[] = [];
      let awayInjuries: PlayerInjuryInfo[] = [];

      if (fixtureId) {
        // Fetch by fixture
        const allInjuries = await this.getInjuriesByFixture(fixtureId);
        homeInjuries = allInjuries.filter(inj => inj.teamId === homeTeamId);
        awayInjuries = allInjuries.filter(inj => inj.teamId === awayTeamId);
      } else if (season) {
        // Fetch by team
        [homeInjuries, awayInjuries] = await Promise.all([
          this.getInjuriesByTeam(homeTeamId, season),
          this.getInjuriesByTeam(awayTeamId, season),
        ]);
      }

      // Enhance with position detection
      homeInjuries = this.enhanceWithPositions(homeInjuries);
      awayInjuries = this.enhanceWithPositions(awayInjuries);

      // Calculate analysis for both teams
      const homeAnalysis = this.calculateTeamInjuriesAnalysis(homeTeamId, 'Home Team', homeInjuries);
      const awayAnalysis = this.calculateTeamInjuriesAnalysis(awayTeamId, 'Away Team', awayInjuries);

      // Determine advantages
      const severityDiff = Math.abs(homeAnalysis.severityScore - awayAnalysis.severityScore);
      const homeAdvantage = awayAnalysis.severityScore > homeAnalysis.severityScore && severityDiff > 15;
      const awayAdvantage = homeAnalysis.severityScore > awayAnalysis.severityScore && severityDiff > 15;
      const balanced = severityDiff <= 15;

      // Generate description
      const impactDescription = this.generateImpactDescription(
        homeAnalysis,
        awayAnalysis,
        homeAdvantage,
        awayAdvantage,
        balanced
      );

      logger.info({
        homeTeamId,
        awayTeamId,
        homeSeverity: homeAnalysis.severityScore,
        awaySeverity: awayAnalysis.severityScore,
        homeAdvantage,
        awayAdvantage,
      }, 'Injuries impact analysis complete');

      return {
        home: homeAnalysis,
        away: awayAnalysis,
        homeAdvantage,
        awayAdvantage,
        balanced,
        impactDescription,
      };
    } catch (error) {
      logger.error({ error, homeTeamId, awayTeamId }, 'Failed to analyze match injuries impact');
      return null;
    }
  }

  /**
   * Calculate team injuries analysis with severity and impact factors
   */
  private calculateTeamInjuriesAnalysis(
    teamId: number,
    teamName: string,
    injuries: PlayerInjuryInfo[]
  ): TeamInjuriesAnalysis {
    const severityScore = this.calculateSeverityScore(injuries);
    const impactFactor = this.calculateLambdaImpactFactor(injuries);

    return {
      teamId,
      teamName,
      players: injuries,
      totalInjuries: injuries.length,
      severityScore,
      impactFactor,
    };
  }

  /**
   * Calculate severity score (0-100) based on positions and count
   */
  private calculateSeverityScore(injuries: PlayerInjuryInfo[]): number {
    if (injuries.length === 0) return 0;

    // Filter serious injuries only
    const seriousInjuries = injuries.filter(
      inj => inj.type === 'Injury' || inj.type === 'Suspended'
    );

    if (seriousInjuries.length === 0) return 0;

    let totalScore = 0;
    const positionWeights: Record<string, number> = {
      Attacker: 30,    // Top scorer = huge impact
      Goalkeeper: 25,  // Goalkeeper = critical
      Defender: 20,    // Key defender = important
      Midfielder: 15,  // Midfielder = moderate
      Unknown: 10,
    };

    for (const injury of seriousInjuries) {
      const position = injury.position || 'Unknown';
      const weight = positionWeights[position] || 10;
      totalScore += weight;
    }

    // Cap at 100
    return Math.min(100, totalScore);
  }

  /**
   * Calculate lambda impact factors based on missing players
   * Returns multipliers for attacking lambda and defensive lambda
   */
  private calculateLambdaImpactFactor(injuries: PlayerInjuryInfo[]): {
    attacking: number;
    defensive: number;
  } {
    let attackingMultiplier = 1.0;
    let defensiveMultiplier = 1.0;

    // Filter serious injuries only
    const seriousInjuries = injuries.filter(
      inj => inj.type === 'Injury' || inj.type === 'Suspended'
    );

    for (const injury of seriousInjuries) {
      const position = injury.position || 'Unknown';

      switch (position) {
        case 'Attacker':
          // Missing striker = -30% attacking power
          attackingMultiplier *= 0.70;
          break;
        case 'Goalkeeper':
          // Missing goalkeeper = +20% goals conceded
          defensiveMultiplier *= 1.20;
          break;
        case 'Defender':
          // Missing key defender = +15% goals conceded
          defensiveMultiplier *= 1.15;
          break;
        case 'Midfielder':
          // Missing midfielder = -10% attacking, +10% defensive
          attackingMultiplier *= 0.90;
          defensiveMultiplier *= 1.10;
          break;
      }
    }

    // Cap multipliers to reasonable ranges
    attackingMultiplier = Math.max(0.5, Math.min(1.0, attackingMultiplier)); // 50% min
    defensiveMultiplier = Math.max(1.0, Math.min(1.5, defensiveMultiplier)); // 150% max

    return {
      attacking: attackingMultiplier,
      defensive: defensiveMultiplier,
    };
  }

  /**
   * Enhance injuries with position detection from reason/name
   */
  private enhanceWithPositions(injuries: PlayerInjuryInfo[]): PlayerInjuryInfo[] {
    return injuries.map(injury => {
      if (injury.position) return injury;

      // Try to detect position from reason or name
      const text = `${injury.reason} ${injury.playerName}`.toLowerCase();

      if (text.includes('goalkeeper') || text.includes('portiere') || text.includes('gk')) {
        injury.position = 'Goalkeeper';
      } else if (text.includes('defender') || text.includes('difensore') || text.includes('defence')) {
        injury.position = 'Defender';
      } else if (text.includes('midfielder') || text.includes('centrocampista') || text.includes('midfield')) {
        injury.position = 'Midfielder';
      } else if (text.includes('attacker') || text.includes('striker') || text.includes('forward') || text.includes('attaccante')) {
        injury.position = 'Attacker';
      } else {
        injury.position = 'Unknown';
      }

      return injury;
    });
  }

  /**
   * Generate human-readable impact description in Italian
   */
  private generateImpactDescription(
    home: TeamInjuriesAnalysis,
    away: TeamInjuriesAnalysis,
    homeAdvantage: boolean,
    awayAdvantage: boolean,
    balanced: boolean
  ): string {
    if (balanced) {
      if (home.totalInjuries === 0 && away.totalInjuries === 0) {
        return '✅ Entrambe le squadre sono al completo. Nessun impatto da infortuni.';
      }
      return `⚖️ Situazione equilibrata: ${home.totalInjuries} infortuni (casa) vs ${away.totalInjuries} (trasferta).`;
    }

    if (homeAdvantage) {
      const attackImpact = ((1 - away.impactFactor.attacking) * 100).toFixed(0);
      return `🏠 Vantaggio Casa: ${away.teamName} ha ${away.totalInjuries} infortuni gravi (severity: ${away.severityScore}). Attacco penalizzato del -${attackImpact}%.`;
    }

    if (awayAdvantage) {
      const attackImpact = ((1 - home.impactFactor.attacking) * 100).toFixed(0);
      return `✈️ Vantaggio Trasferta: ${home.teamName} ha ${home.totalInjuries} infortuni gravi (severity: ${home.severityScore}). Attacco penalizzato del -${attackImpact}%.`;
    }

    return '📊 Situazione infortuni analizzata.';
  }
}

export const injuriesService = new InjuriesService();
