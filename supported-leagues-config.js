/**
 * SUPPORTED LEAGUES FOR TESTING
 * Sync with api/src/config/supported-leagues.ts
 */

const SUPPORTED_LEAGUES = [
  'Serie A',
  'Premier League',
  'Bundesliga',
  'Ligue 1',
  'La Liga',
  'Eredivisie',
  'Champions League',
  'Europa League',
  'Jupiler Pro League',
  'Danimarca Superliga',
  'J1 League',
  'China Super League',
  'Portogallo - Primeira Liga',
  'Turkey Super Lig',
];

function isLeagueSupported(leagueName) {
  return SUPPORTED_LEAGUES.some(supported => 
    leagueName.toLowerCase().includes(supported.toLowerCase()) ||
    supported.toLowerCase().includes(leagueName.toLowerCase())
  );
}

module.exports = {
  SUPPORTED_LEAGUES,
  isLeagueSupported,
};
