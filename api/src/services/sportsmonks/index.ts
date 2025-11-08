/**
 * Sportsmonks Service Index
 * Unified export point for all Sportsmonks services
 */

export * from './client';
export * from './fixtures';
export * from './teams';
export * from './leagues';
export * from './odds';
export * from './fixture-mapper';
export * from './statistics';
export * from './injuries';
export * from './lineups';
export * from './team-mapping';

// Re-export services as named exports for convenience
export { fixturesService } from './fixtures';
export { teamsService } from './teams';
export { leaguesService } from './leagues';
export { fetchOddsByFixtureId, fetchOddsByTeamNames } from './odds';
export { findFixtureByTeamNames } from './fixture-mapper';
