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
}

export const injuriesService = new InjuriesService();
