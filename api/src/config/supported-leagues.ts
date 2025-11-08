/**
 * SUPPORTED LEAGUES CONFIGURATION
 * 
 * Lista dei campionati supportati con dati storici sufficienti
 * per analisi ML affidabili (basato su European Plan coverage)
 */

export const SUPPORTED_LEAGUES = {
  // Top 5 European Leagues
  'Serie A': { id: 'serie-a', minDataCompleteness: 0.30, homeAdvantage: 1.08 },
  'Premier League': { id: 'premier-league', minDataCompleteness: 0.35, homeAdvantage: 1.12 },
  'Bundesliga': { id: 'bundesliga', minDataCompleteness: 0.35, homeAdvantage: 1.10 },
  'Ligue 1': { id: 'ligue-1', minDataCompleteness: 0.30, homeAdvantage: 1.08 },
  'La Liga': { id: 'la-liga', minDataCompleteness: 0.30, homeAdvantage: 1.09 },
  
  // Other Major European Leagues
  'Eredivisie': { id: 'eredivisie', minDataCompleteness: 0.25, homeAdvantage: 1.15 },
  'Champions League': { id: 'champions-league', minDataCompleteness: 0.20, homeAdvantage: 1.05 },
  'Europa League': { id: 'europa-league', minDataCompleteness: 0.20, homeAdvantage: 1.08 },
  'Jupiler Pro League': { id: 'jupiler-pro-league', minDataCompleteness: 0.25, homeAdvantage: 1.12 },
  'Danimarca Superliga': { id: 'superliga', minDataCompleteness: 0.25, homeAdvantage: 1.13 },
  
  // Asian & Other Leagues
  'J1 League': { id: 'j1-league', minDataCompleteness: 0.25, homeAdvantage: 1.10 },
  'China Super League': { id: 'super-league', minDataCompleteness: 0.20, homeAdvantage: 1.12 },
  
  // Portuguese & Turkish
  'Portogallo - Primeira Liga': { id: 'liga-portugal', minDataCompleteness: 0.25, homeAdvantage: 1.14 },
  'Turkey Super Lig': { id: 'super-lig', minDataCompleteness: 0.25, homeAdvantage: 1.16 },
} as const;

export type SupportedLeagueName = keyof typeof SUPPORTED_LEAGUES;

/**
 * Verifica se un campionato è supportato
 */
export function isLeagueSupported(leagueName: string): boolean {
  return leagueName in SUPPORTED_LEAGUES;
}

/**
 * Ottieni configurazione per un campionato
 */
export function getLeagueConfig(leagueName: string) {
  return SUPPORTED_LEAGUES[leagueName as SupportedLeagueName] || null;
}

/**
 * Filtra partite per campionati supportati
 */
export function filterSupportedFixtures<T extends { leagueName?: string; league?: { name?: string } }>(
  fixtures: T[]
): T[] {
  return fixtures.filter(fixture => {
    const leagueName = fixture.leagueName || fixture.league?.name;
    return leagueName && isLeagueSupported(leagueName);
  });
}

/**
 * Verifica se una partita ha dati sufficienti per analisi ML
 */
export function hasMinimumDataQuality(
  dataCompleteness: number,
  leagueName: string
): boolean {
  const config = getLeagueConfig(leagueName);
  if (!config) return false;
  
  return dataCompleteness >= config.minDataCompleteness;
}

/**
 * Ottieni home advantage specifico per lega
 */
export function getLeagueHomeAdvantage(leagueName: string): number {
  const config = getLeagueConfig(leagueName);
  return config?.homeAdvantage || 1.1; // Default fallback
}
