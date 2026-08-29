/**
 * SUPPORTED LEAGUES CONFIGURATION
 *
 * Lista dei campionati supportati con dati storici sufficienti
 * per analisi ML affidabili (basato su European Plan coverage)
 */

/**
 * ID Sportmonks delle leghe coperte dall'abbonamento (Growth, 21 leghe).
 *
 * Fonte di verita' unica: verificati uno per uno contro /my/leagues e
 * /leagues/{id} il 2026-08-29. NON modificare a mano senza rileggerli dall'API
 * (`npx tsx src/scripts/check-sportmonks-access.ts`): gli ID sbagliati non
 * danno errore, risolvono semplicemente ad ALTRE leghe e il sistema analizza
 * partite di un campionato credendole di un altro.
 *
 * Errori corretti il 2026-08-29 (erano in fixtures.routes.ts e statistics.ts):
 *   271 non e' la Primeira Liga ma la Superliga danese  (Primeira Liga = 462)
 *   462 non e' la Super Lig ma la Liga Portugal         (Super Lig    = 600)
 *   600 non e' la Nations League ma la Super Lig turca
 *   10/11/73/83/303/307/272/463/566/266 non esistevano nel piano:
 *   i valori giusti sono 12/14/74/85/304/208/465/603/567/271
 */
export const ALLOWED_LEAGUES: number[] = [
  8,    // Premier League (England)
  9,    // Championship (England)
  12,   // League One (England)
  14,   // League Two (England)
  384,  // Serie A (Italy)
  387,  // Serie B (Italy)
  564,  // La Liga (Spain)
  567,  // La Liga 2 (Spain)
  570,  // Copa Del Rey (Spain)
  82,   // Bundesliga (Germany)
  85,   // 2. Bundesliga (Germany)
  301,  // Ligue 1 (France)
  304,  // Ligue 2 (France)
  72,   // Eredivisie (Netherlands)
  74,   // Eerste Divisie (Netherlands)
  462,  // Liga Portugal (Portugal)
  465,  // Liga Portugal 2 (Portugal)
  600,  // Super Lig (Turkey)
  603,  // 1. Lig (Turkey)
  208,  // Pro League (Belgium)
  271,  // Superliga (Denmark)
  // Champions/Europa League: fuori dal piano Growth, richiedono il pacchetto
  // "Euro Club Tournaments". Nations League: pacchetto "International Tournaments".
];

export const SUPPORTED_LEAGUES = {
  // Top 5 European Leagues
  'Serie A': { id: 'serie-a', minDataCompleteness: 0.30, homeAdvantage: 1.08 },
  'Serie B': { id: 'serie-b', minDataCompleteness: 0.28, homeAdvantage: 1.15 }, // 🔧 Q1 FIX: 1.12 → 1.15 (+2.7%)
  'Premier League': { id: 'premier-league', minDataCompleteness: 0.35, homeAdvantage: 1.15 }, // 🔧 Q1 FIX: 1.13 → 1.15 (+1.8%)
  'Championship': { id: 'championship', minDataCompleteness: 0.28, homeAdvantage: 1.18 }, // 🔧 Q1 FIX: 1.15 → 1.18 (+2.6%)
  'Bundesliga': { id: 'bundesliga', minDataCompleteness: 0.35, homeAdvantage: 1.10 },
  'Ligue 1': { id: 'ligue-1', minDataCompleteness: 0.30, homeAdvantage: 1.08 },
  'La Liga': { id: 'la-liga', minDataCompleteness: 0.30, homeAdvantage: 1.09 },

    // Other Major European Leagues
  'Eredivisie': { id: 'eredivisie', minDataCompleteness: 0.25, homeAdvantage: 1.15 },
  'Champions League': { id: 'champions-league', minDataCompleteness: 0.20, homeAdvantage: 1.05 },
  'Europa League': { id: 'europa-league', minDataCompleteness: 0.20, homeAdvantage: 1.08 },
  // NB: le chiavi devono essere ESATTAMENTE il nome che restituisce Sportmonks,
  // perche' filterSupportedFixtures fa il match sul nome. Le quattro voci qui
  // sotto erano scritte in forma "umana" ('Jupiler Pro League', 'Danimarca
  // Superliga', 'Portogallo - Primeira Liga', 'Turkey Super Lig') e quindi non
  // matchavano mai: quelle leghe venivano scartate in silenzio dal filtro.
  'Pro League': { id: 'jupiler-pro-league', minDataCompleteness: 0.25, homeAdvantage: 1.12 },
  'Superliga': { id: 'superliga', minDataCompleteness: 0.25, homeAdvantage: 1.13 },

  // Asian Leagues
  'J1 League': { id: 'j1-league', minDataCompleteness: 0.25, homeAdvantage: 1.10 },
  'China Super League': { id: 'super-league', minDataCompleteness: 0.20, homeAdvantage: 1.12 },

  // Other competitive leagues
  'Liga Portugal': { id: 'liga-portugal', minDataCompleteness: 0.25, homeAdvantage: 1.14 },
  'Super Lig': { id: 'super-lig', minDataCompleteness: 0.25, homeAdvantage: 1.20 }, // 🔧 (aumentato da 1.16)

  // Seconde divisioni e coppe aggiunte con il piano Growth (2026-08-29).
  // homeAdvantage NON calibrato: 1.10 e' il fallback generico di
  // getLeagueHomeAdvantage, non un valore stimato sui dati di queste leghe.
  // Va ricalibrato quando ci sara' un backtest affidabile.
  'League One': { id: 'league-one', minDataCompleteness: 0.25, homeAdvantage: 1.10 },
  'League Two': { id: 'league-two', minDataCompleteness: 0.25, homeAdvantage: 1.10 },
  'La Liga 2': { id: 'la-liga-2', minDataCompleteness: 0.25, homeAdvantage: 1.10 },
  'Copa Del Rey': { id: 'copa-del-rey', minDataCompleteness: 0.20, homeAdvantage: 1.10 },
  '2. Bundesliga': { id: '2-bundesliga', minDataCompleteness: 0.25, homeAdvantage: 1.10 },
  'Ligue 2': { id: 'ligue-2', minDataCompleteness: 0.25, homeAdvantage: 1.10 },
  'Eerste Divisie': { id: 'eerste-divisie', minDataCompleteness: 0.25, homeAdvantage: 1.10 },
  'Liga Portugal 2': { id: 'liga-portugal-2', minDataCompleteness: 0.25, homeAdvantage: 1.10 },
  '1. Lig': { id: '1-lig', minDataCompleteness: 0.25, homeAdvantage: 1.10 },
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
 * Filtra partite per campionati supportati.
 *
 * Quando la partita porta con se' l'ID di lega si filtra su quello: e' l'unico
 * criterio non ambiguo, visto che nomi come "Premier League" o "Superliga"
 * esistono in piu' paesi. Il nome resta come fallback per le partite che
 * l'ID non ce l'hanno.
 */
export function filterSupportedFixtures<
  T extends { leagueName?: string; league?: { id?: number; name?: string } }
>(fixtures: T[]): T[] {
  return fixtures.filter(fixture => {
    const leagueId = fixture.league?.id;
    if (typeof leagueId === 'number') {
      return ALLOWED_LEAGUES.includes(leagueId);
    }

    const leagueName = fixture.leagueName || fixture.league?.name;
    return !!leagueName && isLeagueSupported(leagueName);
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
