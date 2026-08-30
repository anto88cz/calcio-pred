/**
 * League Strength Adjustment
 *
 * Aggiusta lambda e confidence in base al campionato.
 *
 * ATTENZIONE agli ID: la tabella e' indicizzata per **ID Sportmonks**, gli
 * stessi di config/supported-leagues.ts. Fino al 2026-08-30 usava gli ID di
 * API-Football (39 = Premier League, 140 = La Liga, ...), rimasti dalla
 * migrazione: nessuno degli ID passati dal sistema corrispondeva, ogni partita
 * cadeva sul default e si prendeva un -15% sul lambda. Silenzioso, perche' il
 * default esisteva apposta per non far fallire nulla.
 *
 * Sul coefficiente lambda: per una partita di campionato vale 1.00. Il lambda
 * e' gia' stimato sullo storico di quelle due squadre dentro quel campionato,
 * quindi moltiplicarlo per un indice di "forza della lega" e' contare due volte
 * la stessa informazione — significava predire il 2% di gol in meno di quanti
 * la Serie A ne segni davvero. Il coefficiente resta diverso da 1 solo per le
 * competizioni europee, dove si incontrano squadre di leghe diverse.
 *
 * Il confidenceFactor invece resta differenziato: quanto sia prevedibile un
 * campionato e quanto siano completi i suoi dati e' un'altra cosa dal livello
 * di gol atteso.
 *
 * USAGE:
 * const strength = getLeagueStrength(leagueId);
 * lambdaAdjusted = lambdaOriginal * strength.coefficient;
 * confidenceAdjusted = confidenceOriginal * strength.confidenceFactor;
 */

import logger from '../../utils/logger';

export interface LeagueStrengthData {
  leagueId: number;
  name: string;
  country: string;
  tier: 'ELITE' | 'TOP' | 'GOOD' | 'MEDIUM' | 'LOWER';
  coefficient: number;        // Lambda adjustment (0.70 - 1.05)
  confidenceFactor: number;   // Confidence adjustment (0.85 - 1.00)
  uefaRank?: number;          // UEFA coefficient rank (optional)
}

const LEAGUE_STRENGTH_DATA: Record<number, LeagueStrengthData> = {
  // === COMPETIZIONI EUROPEE ===
  // Qui il coefficiente ha senso: si affrontano squadre di campionati diversi,
  // e il lambda di ciascuna viene da una lega con un livello differente.
  2: {
    leagueId: 2,
    name: 'UEFA Champions League',
    country: 'Europe',
    tier: 'ELITE',
    coefficient: 1.05,
    confidenceFactor: 1.00,
    uefaRank: 1,
  },
  5: {
    leagueId: 5,
    name: 'UEFA Europa League',
    country: 'Europe',
    tier: 'GOOD',
    coefficient: 0.92,
    confidenceFactor: 0.95,
    uefaRank: 2,
  },

  // === INGHILTERRA ===
  8: {
    leagueId: 8,
    name: 'Premier League',
    country: 'England',
    tier: 'ELITE',
    coefficient: 1.00,
    confidenceFactor: 1.00,
    uefaRank: 1,
  },
  9: {
    leagueId: 9,
    name: 'Championship',
    country: 'England',
    tier: 'GOOD',
    coefficient: 1.00,
    confidenceFactor: 0.92,
  },
  12: {
    leagueId: 12,
    name: 'League One',
    country: 'England',
    tier: 'MEDIUM',
    coefficient: 1.00,
    confidenceFactor: 0.86,
  },
  14: {
    leagueId: 14,
    name: 'League Two',
    country: 'England',
    tier: 'LOWER',
    coefficient: 1.00,
    confidenceFactor: 0.84,
  },

  // === ITALIA ===
  384: {
    leagueId: 384,
    name: 'Serie A',
    country: 'Italy',
    tier: 'TOP',
    coefficient: 1.00,
    confidenceFactor: 0.98,
    uefaRank: 3,
  },
  387: {
    leagueId: 387,
    name: 'Serie B',
    country: 'Italy',
    tier: 'MEDIUM',
    coefficient: 1.00,
    confidenceFactor: 0.88,
  },

  // === SPAGNA ===
  564: {
    leagueId: 564,
    name: 'La Liga',
    country: 'Spain',
    tier: 'ELITE',
    coefficient: 1.00,
    confidenceFactor: 1.00,
    uefaRank: 1,
  },
  567: {
    leagueId: 567,
    name: 'La Liga 2',
    country: 'Spain',
    tier: 'MEDIUM',
    coefficient: 1.00,
    confidenceFactor: 0.88,
  },
  570: {
    leagueId: 570,
    name: 'Copa Del Rey',
    country: 'Spain',
    tier: 'MEDIUM',
    // Coppa: divisioni diverse nello stesso match, ma il lambda per squadra
    // viene dallo storico della squadra, non della competizione.
    coefficient: 1.00,
    confidenceFactor: 0.85,
  },

  // === GERMANIA ===
  82: {
    leagueId: 82,
    name: 'Bundesliga',
    country: 'Germany',
    tier: 'TOP',
    coefficient: 1.00,
    confidenceFactor: 0.97,
    uefaRank: 4,
  },
  85: {
    leagueId: 85,
    name: '2. Bundesliga',
    country: 'Germany',
    tier: 'MEDIUM',
    coefficient: 1.00,
    confidenceFactor: 0.89,
  },

  // === FRANCIA ===
  301: {
    leagueId: 301,
    name: 'Ligue 1',
    country: 'France',
    tier: 'TOP',
    coefficient: 1.00,
    confidenceFactor: 0.96,
    uefaRank: 5,
  },
  304: {
    leagueId: 304,
    name: 'Ligue 2',
    country: 'France',
    tier: 'MEDIUM',
    coefficient: 1.00,
    confidenceFactor: 0.87,
  },

  // === PAESI BASSI ===
  72: {
    leagueId: 72,
    name: 'Eredivisie',
    country: 'Netherlands',
    tier: 'GOOD',
    coefficient: 1.00,
    confidenceFactor: 0.92,
    uefaRank: 7,
  },
  74: {
    leagueId: 74,
    name: 'Eerste Divisie',
    country: 'Netherlands',
    tier: 'LOWER',
    coefficient: 1.00,
    confidenceFactor: 0.85,
  },

  // === PORTOGALLO ===
  462: {
    leagueId: 462,
    name: 'Liga Portugal',
    country: 'Portugal',
    tier: 'GOOD',
    coefficient: 1.00,
    confidenceFactor: 0.93,
    uefaRank: 6,
  },
  465: {
    leagueId: 465,
    name: 'Liga Portugal 2',
    country: 'Portugal',
    tier: 'LOWER',
    coefficient: 1.00,
    confidenceFactor: 0.85,
  },

  // === TURCHIA ===
  600: {
    leagueId: 600,
    name: 'Super Lig',
    country: 'Turkey',
    tier: 'MEDIUM',
    coefficient: 1.00,
    confidenceFactor: 0.88,
    uefaRank: 10,
  },
  603: {
    leagueId: 603,
    name: '1. Lig',
    country: 'Turkey',
    tier: 'LOWER',
    coefficient: 1.00,
    confidenceFactor: 0.85,
  },

  // === BELGIO ===
  208: {
    leagueId: 208,
    name: 'Pro League',
    country: 'Belgium',
    tier: 'GOOD',
    coefficient: 1.00,
    confidenceFactor: 0.90,
    uefaRank: 8,
  },

  // === DANIMARCA ===
  271: {
    leagueId: 271,
    name: 'Superliga',
    country: 'Denmark',
    tier: 'LOWER',
    coefficient: 1.00,
    confidenceFactor: 0.85,
    uefaRank: 18,
  },
};

/**
 * Default coefficient per campionati non mappati
 */
const DEFAULT_STRENGTH: LeagueStrengthData = {
  leagueId: 0,
  name: 'Unknown League',
  country: 'Unknown',
  tier: 'MEDIUM',
  // Neutro sul lambda: una lega non mappata non e' una lega piu' debole, e'
  // una lega di cui non sappiamo niente. Il vecchio 0.85 trasformava un buco
  // di configurazione in un bias sistematico verso Under e pareggio.
  coefficient: 1.00,
  confidenceFactor: 0.90,
};

/**
 * Ottiene i dati di forza di un campionato
 * 
 * @param leagueId - ID del campionato (Sportmonks)
 * @returns LeagueStrengthData con coefficient e confidence factor
 */
export function getLeagueStrength(leagueId: number): LeagueStrengthData {
  const mapped = LEAGUE_STRENGTH_DATA[leagueId];
  if (!mapped) {
    logger.warn({ leagueId }, 'League not mapped in LEAGUE_STRENGTH_DATA - using neutral default');
    return { ...DEFAULT_STRENGTH, leagueId };
  }
  return mapped;
}

/**
 * Applica l'aggiustamento di forza campionato a lambda
 * 
 * @param lambda - Lambda originale
 * @param leagueId - ID campionato
 * @returns Lambda aggiustato
 */
export function applyLeagueStrengthToLambda(lambda: number, leagueId: number): number {
  const strength = getLeagueStrength(leagueId);
  return lambda * strength.coefficient;
}

/**
 * Applica l'aggiustamento di forza campionato a confidence
 * 
 * @param confidence - Confidence originale (0-1)
 * @param leagueId - ID campionato
 * @returns Confidence aggiustata (0-1)
 */
export function applyLeagueStrengthToConfidence(confidence: number, leagueId: number): number {
  const strength = getLeagueStrength(leagueId);
  return confidence * strength.confidenceFactor;
}

/**
 * Verifica se un campionato è mappato
 */
export function isLeagueMapped(leagueId: number): boolean {
  return leagueId in LEAGUE_STRENGTH_DATA;
}

/**
 * Ottiene tutti i campionati mappati (per debugging)
 */
export function getAllMappedLeagues(): LeagueStrengthData[] {
  return Object.values(LEAGUE_STRENGTH_DATA);
}
