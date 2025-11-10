import { getSportsmonksClient } from '../sportsmonks/client';

export interface HeadToHeadMatch {
  id: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  date: string;
  leagueId: number;
}

export interface TeamSeasonStats {
  teamId: number;
  seasonId: number;
  goalsScored: number;
  goalsConceded: number;
  wins: number;
  draws: number;
  losses: number;
  matchesPlayed: number;
  avgGoalsScored: number;
  avgGoalsConceded: number;
  winRate: number;
  cleanSheets: number;
  failedToScore: number;
  shotsPerGame: number;
  shotsOnTargetPerGame: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
}

export interface FixtureXGData {
  fixtureId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeXG: number;
  awayXG: number;
  homeScore: number;
  awayScore: number;
  date: string;
}

export class MLDataFetcherService {
  private client = getSportsmonksClient();

  /**
   * Recupera lo storico dei testa a testa tra due squadre
   */
  async getHeadToHeadData(
    homeTeamId: number, 
    awayTeamId: number,
    maxDate?: Date // 🆕 Optional: max date for backtesting
  ): Promise<HeadToHeadMatch[]> {
    try {
      console.log(`📊 Fetching head-to-head data for teams ${homeTeamId} vs ${awayTeamId}`);
      if (maxDate) {
        console.log(`   🕐 BACKTEST MODE: maxDate=${maxDate.toISOString().split('T')[0]}`);
      }
      
      const response = await this.client.get<any>(
        `/fixtures/head-to-head/${homeTeamId}/${awayTeamId}`,
        {
          include: 'participants;league;scores;state',
        }
      );

      if (!response.data || !Array.isArray(response.data)) {
        console.warn('No head-to-head data found');
        return [];
      }

      const matches: HeadToHeadMatch[] = response.data
        .filter((fixture: any) => {
          // Solo partite finite
          if (fixture.state_id !== 5) return false;
          
          // 🆕 BACKTEST FIX: Filtra per maxDate
          if (maxDate) {
            const fixtureDate = new Date(fixture.starting_at);
            if (fixtureDate >= maxDate) return false;
          }
          
          return true;
        })
        .map((fixture: any) => {
          const homeParticipant = fixture.participants?.find((p: any) => p.meta?.location === 'home');
          const awayParticipant = fixture.participants?.find((p: any) => p.meta?.location === 'away');
          
          const homeScore = fixture.scores?.find((s: any) => 
            s.participant_id === homeParticipant?.id && s.description === 'CURRENT'
          )?.score?.goals || 0;
          
          const awayScore = fixture.scores?.find((s: any) => 
            s.participant_id === awayParticipant?.id && s.description === 'CURRENT'
          )?.score?.goals || 0;

          return {
            id: fixture.id,
            homeTeamId: homeParticipant?.id || 0,
            awayTeamId: awayParticipant?.id || 0,
            homeScore,
            awayScore,
            date: fixture.starting_at,
            leagueId: fixture.league_id,
          };
        })
        .filter((match: HeadToHeadMatch) => match.homeTeamId && match.awayTeamId);

      console.log(`✅ Found ${matches.length} head-to-head matches`);
      return matches;
    } catch (error) {
      console.error('Error fetching head-to-head data:', error);
      return [];
    }
  }

  /**
   * Recupera le statistiche di una squadra per una stagione specifica
   */
  async getTeamSeasonStats(teamId: number, seasonId: number, leagueId?: number): Promise<TeamSeasonStats | null> {
    try {
      console.log(`📊 Fetching season stats for team ${teamId}, season ${seasonId}, league ${leagueId}`);
      
      // Usa l'endpoint statistics/seasons/teams/{teamId} con filtro per seasonId
      // NON filtrare per leagueId perché può causare problemi con l'API
      const response = await this.client.get<any>(
        `/statistics/seasons/teams/${teamId}`,
        {
          include: 'details.type',
          filters: `seasonIds:${seasonId}`,
        }
      );

      console.log(`📦 API Response for team ${teamId}:`, {
        hasData: !!response.data,
        isArray: Array.isArray(response.data),
        length: response.data?.length,
      });

      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        console.warn(`No season statistics found for team ${teamId} in season ${seasonId} (league ${leagueId})`);
        return null;
      }

      // IMPORTANTE: L'API restituisce statistiche per TUTTE le stagioni, non solo quella richiesta
      // Dobbiamo filtrare manualmente per trovare il record con season_id corretto
      const stats = response.data.find((record: any) => record.season_id === seasonId);
      
      if (!stats) {
        console.warn(`No statistics found for team ${teamId} in season ${seasonId} (found ${response.data.length} records for other seasons)`);
        return null;
      }
      
      console.log(`📋 Season Stats record:`, {
        season_id: stats.season_id,
        league_id: stats.league_id,
        has_values: stats.has_values,
        details_count: stats.details?.length || 0,
      });
      
      if (!stats.has_values || !stats.details || stats.details.length === 0) {
        console.warn(`No statistics details found for team ${teamId}`);
        return null;
      }

      const details = stats.details;

      console.log(`📋 Found ${details.length} stat details for team ${teamId}`);

      // Funzione helper per estrarre valori dalle statistiche
      const getStatValue = (code: string, field?: string): number => {
        const stat = details.find((d: any) => d.type?.code === code);
        if (!stat) return 0;
        
        const value = stat.value;
        
        // Se è richiesto un campo specifico e value è un oggetto
        if (field && value && typeof value === 'object') {
          // Supporta sia value.all.count che value.count
          if (value.all && value.all[field] !== undefined) {
            return parseFloat(value.all[field]) || 0;
          }
          if (value[field] !== undefined) {
            return parseFloat(value[field]) || 0;
          }
        }
        
        // Se value è un oggetto con total/count/average
        if (value && typeof value === 'object') {
          if (value.all) {
            if (value.all.total !== undefined) return parseFloat(value.all.total) || 0;
            if (value.all.count !== undefined) return parseFloat(value.all.count) || 0;
            if (value.all.average !== undefined) return parseFloat(value.all.average) || 0;
          }
          if (value.total !== undefined) return parseFloat(value.total) || 0;
          if (value.count !== undefined) return parseFloat(value.count) || 0;
          if (value.average !== undefined) return parseFloat(value.average) || 0;
        }
        
        // Se value è un numero o stringa
        if (typeof value === 'number') return value;
        if (typeof value === 'string') return parseFloat(value) || 0;
        
        return 0;
      };

      // Estrai statistiche usando i code corretti di Sportmonks v3
      const matchesPlayed = getStatValue('games-played', 'total') || getStatValue('matches-played', 'count');
      const goalsScored = getStatValue('goals', 'count') || getStatValue('goals-scored', 'count');
      const goalsConceded = getStatValue('goals-conceded', 'count') || getStatValue('goals-against', 'count');
      const wins = getStatValue('team-wins', 'count') || getStatValue('win', 'count');
      const draws = getStatValue('team-draws', 'count') || getStatValue('draw', 'count');
      const losses = getStatValue('team-lost', 'count') || getStatValue('loss', 'count');
      const cleanSheets = getStatValue('cleansheets', 'count');
      const failedToScore = getStatValue('failed-toscore', 'count');

      console.log(`📊 Extracted stats for team ${teamId}:`, {
        matchesPlayed,
        goalsScored,
        goalsConceded,
        wins,
        draws,
        losses,
      });

      const teamStats: TeamSeasonStats = {
        teamId,
        seasonId,
        goalsScored,
        goalsConceded,
        wins,
        draws,
        losses,
        matchesPlayed,
        avgGoalsScored: matchesPlayed > 0 ? goalsScored / matchesPlayed : 0,
        avgGoalsConceded: matchesPlayed > 0 ? goalsConceded / matchesPlayed : 0,
        winRate: matchesPlayed > 0 ? wins / matchesPlayed : 0,
        cleanSheets,
        failedToScore,
        shotsPerGame: getStatValue('shots-per-game', 'average') || (getStatValue('shots-total', 'count') / Math.max(matchesPlayed, 1)),
        shotsOnTargetPerGame: getStatValue('shots-on-target-per-game', 'average') || (getStatValue('shots-on-target', 'count') / Math.max(matchesPlayed, 1)),
        corners: getStatValue('corners', 'count'),
        fouls: getStatValue('fouls', 'count'),
        yellowCards: getStatValue('yellowcards', 'count') || getStatValue('yellow-cards', 'count'),
        redCards: getStatValue('redcards', 'count') || getStatValue('red-cards', 'count'),
      };

      console.log(`✅ Fetched season stats for team ${teamId}:`, teamStats);
      return teamStats;
    } catch (error) {
      console.error(`Error fetching team season stats for team ${teamId}:`, error);
      return null;
    }
  }

  /**
   * Recupera i dati xG per una fixture specifica
   * Usa include completo per ottenere xgfixture
   */
  async getFixtureXGData(fixtureId: number): Promise<FixtureXGData | null> {
    try {
      console.log(`📊 Fetching xG data for fixture ${fixtureId}`);
      
      // Include completo come da documentazione utente
      const response = await this.client.get<any>(
        `/fixtures/${fixtureId}`,
        {
          include: 'participants;scores;xGFixture',
        }
      );

      if (!response.data) {
        console.warn('No fixture data found');
        return null;
      }

      const fixture = response.data;
      
      const homeParticipant = fixture.participants?.find((p: any) => p.meta?.location === 'home');
      const awayParticipant = fixture.participants?.find((p: any) => p.meta?.location === 'away');
      
      // xgfixture contiene array con type_id: 5304 per expected goals
      const homeXGData = fixture.xgfixture?.find((xg: any) => 
        xg.participant_id === homeParticipant?.id && xg.type_id === 5304
      );
      
      const awayXGData = fixture.xgfixture?.find((xg: any) => 
        xg.participant_id === awayParticipant?.id && xg.type_id === 5304
      );

      const homeScore = fixture.scores?.find((s: any) => 
        s.participant_id === homeParticipant?.id && s.description === 'CURRENT'
      )?.score?.goals || 0;
      
      const awayScore = fixture.scores?.find((s: any) => 
        s.participant_id === awayParticipant?.id && s.description === 'CURRENT'
      )?.score?.goals || 0;

      const xgData: FixtureXGData = {
        fixtureId: fixture.id,
        homeTeamId: homeParticipant?.id || 0,
        awayTeamId: awayParticipant?.id || 0,
        homeXG: homeXGData?.data?.value || 0,
        awayXG: awayXGData?.data?.value || 0,
        homeScore,
        awayScore,
        date: fixture.starting_at,
      };

      console.log(`✅ Fetched xG data for fixture ${fixtureId}`);
      return xgData;
    } catch (error) {
      console.error(`Error fetching xG data for fixture ${fixtureId}:`, error);
      return null;
    }
  }

  /**
   * Recupera le ultime N partite di una squadra con dati xG
   */
  async getTeamRecentXGMatches(
    teamId: number, 
    seasonId: number, 
    limit: number = 10,
    maxDate?: Date // 🆕 Optional: max date for backtesting
  ): Promise<FixtureXGData[]> {
    try {
      console.log(`📊 Fetching recent xG matches for team ${teamId}, season ${seasonId}`);
      if (maxDate) {
        console.log(`   🕐 BACKTEST MODE: maxDate=${maxDate.toISOString().split('T')[0]}`);
      }
      
      // Step 1: Ottieni le ultime partite del team (senza xG, che non è supportato in /teams)
      const response = await this.client.get<any>(
        `/teams/${teamId}`,
        {
          include: 'latest.participants;latest.scores;latest.state',
        }
      );

      console.log(`📦 API Response for team ${teamId} latest matches`);

      if (!response.data || !response.data.latest || !Array.isArray(response.data.latest)) {
        console.warn(`No recent matches found for team ${teamId}`);
        return [];
      }

      const matches = response.data.latest;
      
      // Filtra solo partite finite (state_id === 5) + maxDate filter
      const finishedMatches = matches
        .filter((fixture: any) => {
          // Solo partite finite
          if (fixture.state_id !== 5) return false;
          
          // 🆕 BACKTEST FIX: Filtra per maxDate
          if (maxDate) {
            const fixtureDate = new Date(fixture.starting_at);
            if (fixtureDate >= maxDate) return false;
          }
          
          return true;
        })
        .sort((a: any, b: any) => new Date(b.starting_at).getTime() - new Date(a.starting_at).getTime())
        .slice(0, limit);
      
      console.log(`📋 Found ${finishedMatches.length} finished matches for team ${teamId}`);

      // Step 2: Per ogni partita, recupera i dati xG con una chiamata separata
      const xgMatches: FixtureXGData[] = [];
      
      for (const fixture of finishedMatches) {
        try {
          const xgData = await this.getFixtureXGData(fixture.id);
          if (xgData) {
            xgMatches.push(xgData);
            console.log(`  ✅ Fixture ${fixture.id}: homeXG=${xgData.homeXG.toFixed(2)}, awayXG=${xgData.awayXG.toFixed(2)}`);
          }
        } catch (error) {
          console.warn(`  ⚠️ Could not fetch xG for fixture ${fixture.id}`);
        }
      }

      console.log(`✅ Found ${xgMatches.length} matches with xG data for team ${teamId}`);

      return xgMatches;
    } catch (error) {
      console.error(`Error fetching recent xG matches for team ${teamId}:`, error);
      return [];
    }
  }
}

export const mlDataFetcher = new MLDataFetcherService();
