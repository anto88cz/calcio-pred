/**
 * Mapper per convertire APIFootballFixture in formato piatto per DB
 */

import type { APIFootballFixture } from '../types';

export interface FlatFixture {
  id?: number; // DB id
  fixtureId: number; // API-FOOTBALL fixture ID (alias for apiId)
  apiId: number; // Same as fixtureId
  date: Date;
  timestamp: number;
  timezone: string;
  homeTeamId: number;
  awayTeamId: number;
  leagueId: number;
  leagueName: string;
  leagueCountry: string;
  season: number;
  round: string;
  status: string;
  statusShort: string;
  elapsed: number | null;
  venue: string | null;
  referee: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
}

export function mapAPIFixtureToFlat(apiFixture: APIFootballFixture): FlatFixture {
  const apiId = apiFixture.fixture.id;
  return {
    fixtureId: apiId, // Alias
    apiId: apiId, // Primary
    date: new Date(apiFixture.fixture.date),
    timestamp: apiFixture.fixture.timestamp,
    timezone: apiFixture.fixture.timezone,
    homeTeamId: apiFixture.teams.home.id,
    awayTeamId: apiFixture.teams.away.id,
    leagueId: apiFixture.league.id,
    leagueName: apiFixture.league.name,
    leagueCountry: apiFixture.league.country,
    season: apiFixture.league.season,
    round: apiFixture.league.round,
    status: apiFixture.fixture.status.long,
    statusShort: apiFixture.fixture.status.short,
    elapsed: apiFixture.fixture.status.elapsed,
    venue: apiFixture.fixture.venue.name,
    referee: apiFixture.fixture.referee,
    homeGoals: apiFixture.goals.home,
    awayGoals: apiFixture.goals.away,
  };
}

export function mapAPIFixturesToFlat(apiFixtures: APIFootballFixture[]): FlatFixture[] {
  return apiFixtures.map(mapAPIFixtureToFlat);
}
