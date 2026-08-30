import { getSportsmonksClient } from '../sportsmonks/client';
import { getTeamHistory, type MatchHistoryData } from '../sportsmonks/statistics';
import { redis } from '../../lib/redis';
import { parseSportmonksDate } from '../../utils/sportmonks-date';

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

export interface FormMatch {
  id: number;
  date: string;
  isHome: boolean;
  opponentId: number;
  opponentName: string;
  goalsScored: number;
  goalsConceded: number;
  result: 'win' | 'draw' | 'loss';
  xGFor?: number;
  xGAgainst?: number;
}

export class MLDataFetcherService {
  private client = getSportsmonksClient();

  /**
   * Storico partite della squadra, gia' tagliato alla data richiesta.
   *
   * Unico punto di accesso ai dati storici del predittore C. Passa dallo
   * stesso statisticsService del motore A, quindi: endpoint per squadra
   * (una chiamata per 12 mesi), taglio temporale reale e cache Redis
   * condivisa. I metodi che seguono ci si appoggiano invece di interrogare
   * /teams/{id}?include=latest, che restituisce le ultime partite rispetto a
   * OGGI: in backtest quell'include riporta partite successive a quella da
   * predire e il filtro per data le scarta quasi tutte, lasciando la forma vuota.
   */
  private async getHistory(
    teamId: number,
    seasonId: number,
    maxDate?: Date
  ): Promise<MatchHistoryData[]> {
    const history = await getTeamHistory(teamId, seasonId, 0, undefined, maxDate);

    // Difesa in profondita': mai partite oltre il cutoff, qualunque cosa arrivi
    const withinCutoff = maxDate
      ? history.filter(m => new Date(m.date) < maxDate)
      : history;

    return withinCutoff.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  /** Prospettiva della squadra su una partita dello storico. */
  private perspective(match: MatchHistoryData, teamId: number) {
    const isHome = match.homeTeamId === teamId;
    const goalsScored = isHome ? match.goalsHome : match.goalsAway;
    const goalsConceded = isHome ? match.goalsAway : match.goalsHome;

    return {
      isHome,
      goalsScored,
      goalsConceded,
      opponentId: isHome ? match.awayTeamId : match.homeTeamId,
      opponentName: isHome ? match.awayTeamName : match.homeTeamName,
      result: (goalsScored > goalsConceded
        ? 'win'
        : goalsScored < goalsConceded
        ? 'loss'
        : 'draw') as 'win' | 'draw' | 'loss',
    };
  }

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
            const fixtureDate = parseSportmonksDate(fixture.starting_at);
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
  async getTeamSeasonStats(
    teamId: number,
    seasonId: number,
    leagueId?: number,
    maxDate?: Date
  ): Promise<TeamSeasonStats | null> {
    // Con un cutoff le statistiche stagionali si ricostruiscono dalle partite
    // GIOCATE FINO A QUEL MOMENTO.
    //
    // L'endpoint /statistics/seasons/teams/{id} restituisce gli aggregati
    // DELL'INTERA stagione: su una stagione conclusa sono i totali finali.
    // Usarli per predire una partita di ottobre significa conoscere come e'
    // finito il campionato — il look-ahead piu' grave possibile, perche' entra
    // direttamente nella forza attribuita alle squadre.
    if (maxDate) {
      const history = (await this.getHistory(teamId, seasonId, maxDate))
        .filter(m => !seasonId || m.seasonId === seasonId);

      if (history.length === 0) {
        console.warn(`Nessuna partita prima del cutoff per team ${teamId}, stagione ${seasonId}`);
        return null;
      }

      let goalsScored = 0, goalsConceded = 0, wins = 0, draws = 0, losses = 0;
      let cleanSheets = 0, failedToScore = 0;

      for (const match of history) {
        const p = this.perspective(match, teamId);
        goalsScored += p.goalsScored;
        goalsConceded += p.goalsConceded;
        if (p.result === 'win') wins++;
        else if (p.result === 'draw') draws++;
        else losses++;
        if (p.goalsConceded === 0) cleanSheets++;
        if (p.goalsScored === 0) failedToScore++;
      }

      const matchesPlayed = history.length;

      console.log(`📊 Stats team ${teamId} da ${matchesPlayed} partite prima del ${maxDate.toISOString().slice(0, 10)}`);

      return {
        teamId,
        seasonId,
        goalsScored,
        goalsConceded,
        wins,
        draws,
        losses,
        matchesPlayed,
        avgGoalsScored: goalsScored / matchesPlayed,
        avgGoalsConceded: goalsConceded / matchesPlayed,
        winRate: wins / matchesPlayed,
        cleanSheets,
        failedToScore,
        // Non ricavabili dallo storico partite. Non sono usati dall'algoritmo
        // (analyzeSeasonStats legge solo medie gol e winRate), restano a 0
        // invece di essere inventati.
        shotsPerGame: 0,
        shotsOnTargetPerGame: 0,
        corners: 0,
        fouls: 0,
        yellowCards: 0,
        redCards: 0,
      };
    }

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
    maxDate?: Date
  ): Promise<FixtureXGData[]> {
    try {
      // Le ultime N partite giocate PRIMA del cutoff, con il loro xG.
      //
      // Prima: /teams/{id}?include=latest (= ultime rispetto a oggi) e poi UNA
      // CHIAMATA PER PARTITA per l'xG, cioe' fino a 10 chiamate per squadra e
      // ~20 per pronostico. Ora: una sola richiesta per squadra sull'endpoint
      // per intervallo, con l'include xGFixture, e lo storico arriva dalla
      // cache condivisa.
      const history = (await this.getHistory(teamId, seasonId, maxDate)).slice(0, limit);
      if (history.length === 0) return [];

      const xgByFixture = await this.getXGForTeamRange(teamId, history);

      const xgMatches: FixtureXGData[] = [];
      for (const match of history) {
        const xg = xgByFixture.get(match.fixtureId);
        if (!xg) continue; // senza xG reale non si inventa un valore

        xgMatches.push({
          fixtureId: match.fixtureId,
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          homeXG: xg.home,
          awayXG: xg.away,
          homeScore: match.goalsHome,
          awayScore: match.goalsAway,
          date: typeof match.date === 'string' ? match.date : match.date.toISOString(),
        });
      }

      console.log(`✅ ${xgMatches.length}/${history.length} partite con xG per team ${teamId}`);
      return xgMatches;
    } catch (error) {
      console.error(`Error fetching recent xG matches for team ${teamId}:`, error);
      return [];
    }
  }

  /**
   * xG delle partite passate di una squadra, in UNA chiamata.
   *
   * Copre l'intervallo che va dalla piu' vecchia alla piu' recente delle
   * partite richieste. Se l'include xGFixture non e' disponibile sul piano,
   * torna una mappa vuota e il chiamante lavora senza xG invece di usare un
   * surrogato.
   */
  private async getXGForTeamRange(
    teamId: number,
    matches: MatchHistoryData[]
  ): Promise<Map<number, { home: number; away: number }>> {
    const out = new Map<number, { home: number; away: number }>();
    if (matches.length === 0) return out;

    const dates = matches.map(m => new Date(m.date).getTime());
    const from = new Date(Math.min(...dates));
    const to = new Date(Math.max(...dates));
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);

    const cacheKey = `mlxg:team-range:${teamId}:${fromStr}:${toStr}`;
    try {
      const cached = await redis?.get(cacheKey);
      if (cached) {
        for (const [id, v] of JSON.parse(cached)) out.set(Number(id), v);
        return out;
      }
    } catch {
      // cache assente: si prosegue
    }

    try {
      const response = await this.client.get<any>(
        `/fixtures/between/${fromStr}/${toStr}/${teamId}`,
        { include: 'participants;xGFixture', per_page: 50 }
      );

      const fixtures: any[] = response?.data || [];
      const XG_TYPE = 5304;

      for (const f of fixtures) {
        const rows = f.xgfixture;
        if (!Array.isArray(rows)) continue;

        const pick = (location: 'home' | 'away') =>
          rows.find((r: any) => r.location === location && r.type_id === XG_TYPE)?.data?.value;

        const home = pick('home');
        const away = pick('away');
        if (typeof home === 'number' && typeof away === 'number') {
          out.set(f.id, { home, away });
        }
      }

      try {
        await redis?.setex(cacheKey, 60 * 60 * 24 * 30, JSON.stringify([...out]));
      } catch {
        // ignorabile
      }
    } catch (error: any) {
      console.warn(`xG storico non disponibile per team ${teamId}: ${error.message}`);
    }

    return out;
  }


  /**
   * 🆕 Recupera le ultime N partite di una squadra (vs qualsiasi avversario)
   * Per analizzare forma recente indipendentemente dall'avversario
   */
  async getTeamRecentForm(
    teamId: number,
    seasonId: number,
    limit: number = 7,
    maxDate?: Date
  ): Promise<FormMatch[]> {
    try {
      // Stesso motivo di getTeamRecentXGMatches: l'include `latest` guarda a
      // oggi, quindi in backtest la forma usciva vuota e l'algoritmo cadeva
      // sui valori di default.
      const history = await this.getHistory(teamId, seasonId, maxDate);

      // Forma = stagione in corso. Se la stagione e' appena iniziata e le
      // partite sono poche, si allarga agli ultimi 12 mesi invece di
      // restituire quasi nulla.
      const seasonMatches = seasonId
        ? history.filter(m => m.seasonId === seasonId)
        : history;
      const source = seasonMatches.length >= 3 ? seasonMatches : history;

      const formMatches: FormMatch[] = source.slice(0, limit).map(match => {
        const p = this.perspective(match, teamId);
        return {
          id: match.fixtureId,
          date: typeof match.date === 'string' ? match.date : match.date.toISOString(),
          isHome: p.isHome,
          opponentId: p.opponentId,
          opponentName: p.opponentName,
          goalsScored: p.goalsScored,
          goalsConceded: p.goalsConceded,
          result: p.result,
        };
      });

      console.log(`✅ Forma team ${teamId}: ${formMatches.map(m => m.result[0].toUpperCase()).join('-') || 'nessuna partita'}`);
      return formMatches;
    } catch (error) {
      console.error(`Error fetching recent form for team ${teamId}:`, error);
      return [];
    }
  }

}

export const mlDataFetcher = new MLDataFetcherService();
