/**
 * Modulo Lineups - Gestione formazioni
 */

import { apiFootballClient } from './client';
import logger from '../../utils/logger';
import type { APIFootballLineup } from '../../types';

export interface LineupInfo {
  teamId: number;
  teamName: string;
  formation: string;
  startingXI: Array<{
    playerId: number;
    playerName: string;
    playerNumber: number;
    position: string;
    grid: string | null;
  }>;
  substitutes: Array<{
    playerId: number;
    playerName: string;
    playerNumber: number;
    position: string;
  }>;
  coach: {
    id: number;
    name: string;
  };
}

export class LineupsService {
  /**
   * Get formazioni per fixture
   */
  async getLineupsByFixture(fixtureId: number): Promise<LineupInfo[]> {
    try {
      logger.info({ fixtureId }, 'Fetching lineups by fixture');
      
      const lineups = await apiFootballClient.request<APIFootballLineup[]>(
        '/fixtures/lineups',
        { fixture: fixtureId },
        { cache: true, cacheTTL: 1800 }
      );

      return this.parseLineups(lineups || []);
    } catch (error) {
      logger.error({ error, fixtureId }, 'Failed to fetch lineups by fixture');
      // Non lanciare errore - lineups potrebbero non essere ancora disponibili
      return [];
    }
  }

  /**
   * Parse lineups da formato API
   */
  private parseLineups(apiLineups: APIFootballLineup[]): LineupInfo[] {
    return apiLineups.map(lineup => ({
      teamId: lineup.team.id,
      teamName: lineup.team.name,
      formation: lineup.formation,
      startingXI: lineup.startXI.map(player => ({
        playerId: player.player.id,
        playerName: player.player.name,
        playerNumber: player.player.number,
        position: player.player.pos,
        grid: player.player.grid,
      })),
      substitutes: lineup.substitutes.map(player => ({
        playerId: player.player.id,
        playerName: player.player.name,
        playerNumber: player.player.number,
        position: player.player.pos,
      })),
      coach: {
        id: lineup.coach.id,
        name: lineup.coach.name,
      },
    }));
  }

  /**
   * Verifica se le formazioni sono confermate
   */
  areLineupsConfirmed(lineups: LineupInfo[]): boolean {
    // Lineups confermate se abbiamo entrambe le squadre con 11 titolari
    if (lineups.length !== 2) return false;

    return lineups.every(lineup => 
      lineup.startingXI.length === 11 && 
      lineup.formation !== null
    );
  }

  /**
   * Calcola confidence boost da disponibilità lineup
   */
  calculateLineupConfidence(lineups: LineupInfo[]): number {
    if (lineups.length === 0) return 0.5; // Baseline se non disponibili

    if (this.areLineupsConfirmed(lineups)) {
      return 1.0; // Confidence massima
    }

    // Confidence parziale se abbiamo lineup parziali
    const avgPlayers = lineups.reduce((sum, lineup) => 
      sum + lineup.startingXI.length, 0
    ) / lineups.length;

    return 0.5 + (avgPlayers / 11) * 0.5;
  }

  /**
   * Estrai formazione tattica
   */
  getFormationSystem(formation: string): {
    defenders: number;
    midfielders: number;
    attackers: number;
  } {
    // Parse formazioni tipo "4-3-3", "3-5-2", etc.
    const parts = formation.split('-').map(n => parseInt(n, 10));
    
    if (parts.length !== 3) {
      // Default 4-4-2
      return { defenders: 4, midfielders: 4, attackers: 2 };
    }

    return {
      defenders: parts[0],
      midfielders: parts[1],
      attackers: parts[2],
    };
  }

  /**
   * Identifica key players per posizione
   */
  identifyKeyPlayers(lineup: LineupInfo): {
    goalkeeper: any | null;
    defenders: any[];
    midfielders: any[];
    attackers: any[];
  } {
    const players = {
      goalkeeper: null as any,
      defenders: [] as any[],
      midfielders: [] as any[],
      attackers: [] as any[],
    };

    lineup.startingXI.forEach(player => {
      const pos = player.position.toUpperCase();
      
      if (pos === 'G') {
        players.goalkeeper = player;
      } else if (pos === 'D') {
        players.defenders.push(player);
      } else if (pos === 'M') {
        players.midfielders.push(player);
      } else if (pos === 'F') {
        players.attackers.push(player);
      }
    });

    return players;
  }

  /**
   * Compara formazioni con storico squadra
   */
  compareWithUsualFormation(
    currentFormation: string,
    usualFormation: string
  ): {
    isSame: boolean;
    similarity: number;
  } {
    if (currentFormation === usualFormation) {
      return { isSame: true, similarity: 1.0 };
    }

    // Calcola similarità strutturale
    const current = this.getFormationSystem(currentFormation);
    const usual = this.getFormationSystem(usualFormation);

    const defDiff = Math.abs(current.defenders - usual.defenders);
    const midDiff = Math.abs(current.midfielders - usual.midfielders);
    const attDiff = Math.abs(current.attackers - usual.attackers);

    const totalDiff = defDiff + midDiff + attDiff;
    const similarity = Math.max(0, 1 - (totalDiff / 6)); // Max diff = 6

    return {
      isSame: false,
      similarity,
    };
  }

  /**
   * Verifica formazione offensiva vs difensiva
   */
  isOffensiveFormation(formation: string): boolean {
    const system = this.getFormationSystem(formation);
    return system.attackers >= 3; // 3+ attaccanti = formazione offensiva
  }

  isDefensiveFormation(formation: string): boolean {
    const system = this.getFormationSystem(formation);
    return system.defenders >= 5; // 5+ difensori = formazione difensiva
  }
}

export const lineupsService = new LineupsService();
