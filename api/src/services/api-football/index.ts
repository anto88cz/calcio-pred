/**
 * API-FOOTBALL Services
 * Export centrale per tutti i servizi
 */

export { apiFootballClient } from './client';
export { fixturesService, FixturesService } from './fixtures';
export { statisticsService, StatisticsService, type FixtureStatistics, type ExpectedGoalsData } from './statistics';
export { injuriesService, InjuriesService, type PlayerInjuryInfo } from './injuries';
export { lineupsService, LineupsService, type LineupInfo } from './lineups';
export { historyService, HistoryService, type MatchHistoryData } from './history';
export { teamsService, TeamsService, type TeamInfo } from './teams';

// Re-export types
export type { 
  APIFootballFixture,
  APIFootballStatistics,
  APIFootballInjury,
  APIFootballLineup,
} from '../../types';
