import { getSportsmonksClient } from './client';
import { redis } from '../../lib/redis';
import { ALLOWED_LEAGUES } from '../../config/supported-leagues';
import { parseSportmonksDate } from '../../utils/sportmonks-date';

/**
 * Sportsmonks Statistics Service
 * Provides match statistics, team stats, and expected goals data
 */

export interface MatchStatistics {
  teamId: number;
  shots: {
    total: number | null;
    onTarget: number | null;
  };
  possession: number | null;
  passes: {
    total: number | null;
    accurate: number | null;
    percentage: number | null;
  };
  fouls: number | null;
  corners: number | null;
  offsides: number | null;
  yellowCards: number | null;
  redCards: number | null;
  expected_goals: number | null;
}

export interface MatchStatisticsData {
  fixtureId: number;
  home: MatchStatistics;
  away: MatchStatistics;
}

export interface ExpectedGoalsData {
  home: {
    teamId: number;
    teamName: string;
    xg: number | null;
    xgot: number | null;
  };
  away: {
    teamId: number;
    teamName: string;
    xg: number | null;
    xgot: number | null;
  };
  missingXg: boolean;
  // Legacy compatibility
  fixtureId?: number;
  homeXg?: number;
  awayXg?: number;
  totalXg?: number;
}

export interface MatchHistoryData {
  fixtureId: number;
  date: Date | string; // Can be Date or ISO string after JSON serialization
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  goalsHome: number;
  goalsAway: number;
  // Compatibility with old API-Football format
  homeGoals: number;
  awayGoals: number;
  isHome: boolean;
  venue: 'home' | 'away';
  leagueId: number;
  leagueName?: string;
  seasonId: number;
  season: number;
  xgHome?: number;
  xgAway?: number;
  xg_home?: number | null;
  xg_away?: number | null;
  xga_home?: number | null;
  xga_away?: number | null;
}

/**
 * Get statistics for a specific fixture
 */
export async function getFixtureStatistics(fixtureId: number): Promise<MatchStatisticsData | null> {
  const cacheKey = `sportsmonks:stats:${fixtureId}`;
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ Statistics cache hit for fixture ${fixtureId}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching statistics from Sportsmonks for fixture ${fixtureId}`);
    const client = getSportsmonksClient();
    
    const response = await client.get<any>(
      `/fixtures/${fixtureId}`,
      {
        include: 'statistics',
      }
    );
    
    if (response.message || !response.data || !response.data.statistics) {
      console.log(`⚠️ Statistics not found for fixture ${fixtureId}`);
      return null;
    }
    
    const stats = response.data.statistics;
    
    // Group statistics by team
    const homeStats = stats.filter((s: any) => s.location === 'home');
    const awayStats = stats.filter((s: any) => s.location === 'away');
    
    const getStatValue = (teamStats: any[], type: string): number | null => {
      const stat = teamStats.find((s: any) => s.type?.name === type);
      return stat?.data?.value ? parseFloat(stat.data.value) : null;
    };
    
    const result: MatchStatisticsData = {
      fixtureId,
      home: {
        teamId: homeStats[0]?.participant_id || 0,
        shots: {
          total: getStatValue(homeStats, 'Shots Total'),
          onTarget: getStatValue(homeStats, 'Shots On Target'),
        },
        possession: getStatValue(homeStats, 'Ball Possession'),
        passes: {
          total: getStatValue(homeStats, 'Passes Total'),
          accurate: getStatValue(homeStats, 'Passes Accurate'),
          percentage: getStatValue(homeStats, 'Passes %'),
        },
        fouls: getStatValue(homeStats, 'Fouls'),
        corners: getStatValue(homeStats, 'Corners'),
        offsides: getStatValue(homeStats, 'Offsides'),
        yellowCards: getStatValue(homeStats, 'Yellow Cards'),
        redCards: getStatValue(homeStats, 'Red Cards'),
        expected_goals: getStatValue(homeStats, 'Expected Goals'),
      },
      away: {
        teamId: awayStats[0]?.participant_id || 0,
        shots: {
          total: getStatValue(awayStats, 'Shots Total'),
          onTarget: getStatValue(awayStats, 'Shots On Target'),
        },
        possession: getStatValue(awayStats, 'Ball Possession'),
        passes: {
          total: getStatValue(awayStats, 'Passes Total'),
          accurate: getStatValue(awayStats, 'Passes Accurate'),
          percentage: getStatValue(awayStats, 'Passes %'),
        },
        fouls: getStatValue(awayStats, 'Fouls'),
        corners: getStatValue(awayStats, 'Corners'),
        offsides: getStatValue(awayStats, 'Offsides'),
        yellowCards: getStatValue(awayStats, 'Yellow Cards'),
        redCards: getStatValue(awayStats, 'Red Cards'),
        expected_goals: getStatValue(awayStats, 'Expected Goals'),
      },
    };
    
    console.log(`✅ Found statistics for fixture ${fixtureId}`);
    
    // Cache for 1 hour
    await redis?.setex(cacheKey, 3600, JSON.stringify(result));
    
    return result;
  } catch (error: any) {
    console.error(`❌ Error fetching statistics:`, error.message);
    return null;
  }
}

/** type_id Sportmonks dentro l'include xGFixture (verificati su /core/types) */
const XG_TYPE_ID = 5304;   // Expected Goals (xG)
const XGOT_TYPE_ID = 5305; // Expected Goals on Target (xGoT)

/**
 * Legge l'xG REALE dall'include `xGFixture`.
 *
 * L'add-on xG NON aggiunge una statistica "Expected Goals" dentro `statistics`:
 * espone un include separato, `xGFixture`, con una riga per squadra e per
 * metrica (type_id 5304 = xG, 5305 = xGoT) e il campo `location` per il lato.
 * Cercarlo tra le statistiche non lo trova mai e fa scattare in silenzio la
 * stima dai tiri, che e' molto piu' rozza dell'xG pagato.
 */
async function fetchXGFromFixture(fixtureId: number): Promise<{
  home: { xg: number | null; xgot: number | null };
  away: { xg: number | null; xgot: number | null };
} | null> {
  try {
    const client = getSportsmonksClient();
    const response = await client.get<any>(`/fixtures/${fixtureId}`, {
      include: 'xGFixture',
    });

    const rows = response?.data?.xgfixture;
    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    const pick = (location: 'home' | 'away', typeId: number): number | null => {
      const row = rows.find((r: any) => r.location === location && r.type_id === typeId);
      const value = row?.data?.value;
      return typeof value === 'number' ? value : null;
    };

    return {
      home: { xg: pick('home', XG_TYPE_ID), xgot: pick('home', XGOT_TYPE_ID) },
      away: { xg: pick('away', XG_TYPE_ID), xgot: pick('away', XGOT_TYPE_ID) },
    };
  } catch (error: any) {
    console.error(`❌ Error fetching xGFixture for ${fixtureId}:`, error.message);
    return null;
  }
}

/**
 * Get expected goals data for a fixture
 * NOTE: Sportsmonks requires xG add-on package. If not available, estimates xG from shots.
 */
export async function getExpectedGoals(fixtureId: number): Promise<ExpectedGoalsData | null> {
  const [stats, realXg] = await Promise.all([
    getFixtureStatistics(fixtureId),
    fetchXGFromFixture(fixtureId),
  ]);

  if (!stats) {
    // Senza statistiche non c'e' il ripiego sui tiri, ma l'xG vero puo' esserci
    // lo stesso: viaggia su un include diverso.
    return {
      home: {
        teamId: 0,
        teamName: '',
        xg: realXg?.home.xg ?? null,
        xgot: realXg?.home.xgot ?? null,
      },
      away: {
        teamId: 0,
        teamName: '',
        xg: realXg?.away.xg ?? null,
        xgot: realXg?.away.xgot ?? null,
      },
      missingXg: realXg?.home.xg == null || realXg?.away.xg == null,
      fixtureId,
      homeXg: realXg?.home.xg ?? 0,
      awayXg: realXg?.away.xg ?? 0,
      totalXg: (realXg?.home.xg ?? 0) + (realXg?.away.xg ?? 0),
    };
  }

  // 1) xG reale dall'include xGFixture (add-on xG)
  // 2) statistica "Expected Goals", se un giorno comparisse nel set
  let homeXg = realXg?.home.xg ?? stats.home.expected_goals;
  let awayXg = realXg?.away.xg ?? stats.away.expected_goals;

  // 3) ultimo ripiego: stima dai tiri.
  // Formula: xG ≈ (shots_on_target * 0.35) + (shots_total * 0.05)
  // Approssimazione grezza sui tassi di conversione storici: NON e' xG, e va
  // trattata come tale a valle (missingXg non la distingue, vedi sotto).
  let estimatedFromShots = false;

  if (homeXg === null && stats.home.shots) {
    const shotsOnTarget = stats.home.shots.onTarget || 0;
    const shotsTotal = stats.home.shots.total || 0;
    homeXg = (shotsOnTarget * 0.35) + (shotsTotal * 0.05);
    estimatedFromShots = true;
    console.log(`⚠️ xG not available for home team, estimated from shots: ${homeXg.toFixed(2)}`);
  }

  if (awayXg === null && stats.away.shots) {
    const shotsOnTarget = stats.away.shots.onTarget || 0;
    const shotsTotal = stats.away.shots.total || 0;
    awayXg = (shotsOnTarget * 0.35) + (shotsTotal * 0.05);
    estimatedFromShots = true;
    console.log(`⚠️ xG not available for away team, estimated from shots: ${awayXg.toFixed(2)}`);
  }

  if (realXg?.home.xg != null && realXg?.away.xg != null) {
    console.log(`✅ Real xG from xGFixture — home ${realXg.home.xg.toFixed(2)}, away ${realXg.away.xg.toFixed(2)}`);
  } else if (estimatedFromShots) {
    console.log(`⚠️ Fixture ${fixtureId}: xG stimato dai tiri, non e' l'xG dell'add-on`);
  }

  const missingXg = homeXg === null || awayXg === null;
  const homeXgValue = homeXg ?? 0;
  const awayXgValue = awayXg ?? 0;

  return {
    home: {
      teamId: stats.home.teamId,
      teamName: '',
      xg: homeXg,
      xgot: realXg?.home.xgot ?? null,
    },
    away: {
      teamId: stats.away.teamId,
      teamName: '',
      xg: awayXg,
      xgot: realXg?.away.xgot ?? null,
    },
    missingXg,
    fixtureId,
    homeXg: homeXgValue,
    awayXg: awayXgValue,
    totalXg: homeXgValue + awayXgValue,
  };
}

/**
 * Get match history for a team
 * Uses /teams/{id} endpoint with 'latest' include
 * NOTE: Team ID must be Sportsmonks ID, not API-Football ID
 */
export async function getTeamHistory(
  teamId: number,
  seasonId: number,
  limit: number = 20,
  teamName?: string, // Optional: for ID mapping
  maxDate?: Date // 🆕 Optional: max date for historical data (for backtesting)
): Promise<MatchHistoryData[]> {
  // maxDate DEVE far parte della chiave: due backtest della stessa squadra a
  // date diverse hanno storici diversi. Senza, la prima partita elaborata
  // fissava in cache il suo storico e tutte le successive riusavano quello,
  // reintroducendo il look-ahead che maxDate serviva a evitare.
  const cutoff = maxDate ? maxDate.toISOString().slice(0, 10) : 'now';
  const cacheKey = `sportsmonks:history:${teamId}:${seasonId}:${limit}:${cutoff}`;

  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ History cache hit for team ${teamId}`);
      return JSON.parse(cached);
    }

    console.log(`🔍 Fetching history for team ${teamId}, season ${seasonId}`);
    console.log(`📋 Parameters: limit=${limit}, teamName="${teamName}"`);
    
    // If teamName provided, try to get Sportsmonks ID
    // SOLO per predizioni manuali dove teamId potrebbe essere API-Football ID
    let sportsmonksTeamId = teamId;
    if (teamName) {
      const { getSportsmonksTeamId } = await import('./team-mapping');
      const mappedId = await getSportsmonksTeamId(teamId, teamName);
      if (mappedId) {
        sportsmonksTeamId = mappedId;
        console.log(`🔄 Mapped team ${teamId} (${teamName}) → Sportsmonks ID: ${sportsmonksTeamId}`);
      } else {
        // 🔧 FIX: Se il mapping fallisce, usa comunque teamId originale
        // Potrebbe essere già un Sportsmonks ID (es. da fixture reale)
        console.log(`⚠️ Mapping failed for ${teamName}, using original ID ${teamId} (might already be Sportsmonks ID)`);
        sportsmonksTeamId = teamId;
      }
    }
    
    const client = getSportsmonksClient();

    // Endpoint per squadra: /fixtures/between/{from}/{to}/{teamId}.
    //
    // Prima si scaricava /fixtures/between SENZA squadra, quindi TUTTE le leghe
    // del piano, a blocchi di 90 giorni e con un tetto di 3 pagine per blocco:
    // con 21 leghe quel tetto tagliava via la maggior parte delle partite e lo
    // storico usciva incompleto in silenzio (difetto G11).
    //
    // La finestra scaricata NON dipende dal cutoff: si prende una volta sola
    // l'intero triennio della squadra e lo si taglia in memoria. Il motivo e'
    // il rate limit: con una coppia di chiamate per ogni partita da predire,
    // una stagione di 1751 partite ne chiedeva ~3500 sulla sola entita'
    // Fixture, contro un budget di 2500/ora. Cosi' invece sono ~3 chiamate per
    // SQUADRA, una volta, e ogni data di taglio successiva e' gratis.
    const RAW_YEARS = 3;
    const rawTo = new Date();
    const rawFrom = new Date(rawTo);
    rawFrom.setFullYear(rawFrom.getFullYear() - RAW_YEARS);

    const rawFromStr = rawFrom.toISOString().split('T')[0];
    const rawToStr = rawTo.toISOString().split('T')[0];
    const rawCacheKey = `sportsmonks:history-raw:${sportsmonksTeamId}:${RAW_YEARS}y`;

    let allFixtures: any[] = [];
    let fromCache = false;

    try {
      const cachedRaw = await redis?.get(rawCacheKey);
      if (cachedRaw) {
        allFixtures = JSON.parse(cachedRaw);
        fromCache = true;
      }
    } catch {
      // cache non disponibile: si scarica
    }

    if (!fromCache) {
      console.log(`📊 Scarico storico grezzo ${rawFromStr} -> ${rawToStr} per team ${sportsmonksTeamId}`);

      let page = 1;
      for (;;) {
        const response = await client.get<any>(
          `/fixtures/between/${rawFromStr}/${rawToStr}/${sportsmonksTeamId}`,
          {
            include: 'participants;scores;state;season',
            per_page: 50,
            page,
          }
        );

        if (!response.data || !Array.isArray(response.data)) break;
        allFixtures = allFixtures.concat(response.data);

        if (!response.pagination?.has_more) break;
        page += 1;
        if (page > 20) break; // guardia
      }

      // Le partite passate non cambiano: cache lunga.
      try {
        await redis?.setex(rawCacheKey, 60 * 60 * 24 * 7, JSON.stringify(allFixtures));
      } catch {
        // ignorabile
      }
    }

    console.log(`📊 ${allFixtures.length} partite grezze per team ${sportsmonksTeamId}${fromCache ? ' (cache)' : ''}`);

    // Restano solo le leghe che il modello tratta (esclude coppe e amichevoli
    // fuori perimetro, che hanno dinamiche diverse).
    const teamFixtures = allFixtures.filter((f: any) => ALLOWED_LEAGUES.includes(f.league_id));

    // Stato "partita conclusa".
    //
    // Il campo e' state.short_name / state.state / state.developer_name.
    // Il codice precedente leggeva `state.short`, che NON esiste nella
    // risposta v3: il confronto era sempre falso e questa funzione restituiva
    // sistematicamente zero partite, mandando il motore sui valori di fallback.
    const isFinished = (f: any): boolean => {
      const st = f.state?.short_name || f.state?.state || f.state?.developer_name;
      return st === 'FT' || st === 'AET' || st === 'FT_PEN';
    };

    const finishedFixtures = teamFixtures.filter(isFinished);

    // Finestra effettiva: 12 mesi che finiscono al cutoff (o a oggi).
    const endDate = maxDate || new Date();
    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - 12);

    const withinCutoff = finishedFixtures.filter((f: any) => {
      const d = parseSportmonksDate(f.starting_at);
      return d < endDate && d >= startDate;
    });

    console.log(`🏁 ${withinCutoff.length} partite nella finestra ${startDate.toISOString().split('T')[0]} -> ${endDate.toISOString().split('T')[0]} per team ${sportsmonksTeamId}`);
    
    const matchHistory = withinCutoff
      .sort((a: any, b: any) => parseSportmonksDate(b.starting_at).getTime() - parseSportmonksDate(a.starting_at).getTime()) // Most recent first
      .slice(0, limit > 0 ? limit : undefined)
      .map((f: any): MatchHistoryData => {
        // Extract team IDs from participants array
        const participants = f.participants || [];
        const homeTeam = participants.find((p: any) => p.meta?.location === 'home');
        const awayTeam = participants.find((p: any) => p.meta?.location === 'away');
        
        const homeTeamId = homeTeam?.id || f.participant_home_id || 0;
        const awayTeamId = awayTeam?.id || f.participant_away_id || 0;
        
        const isHome = homeTeamId === sportsmonksTeamId;
        
        // Extract scores from scores array
        const scores = f.scores || [];
        const currentScores = scores.filter((s: any) => s.description === 'CURRENT');
        const homeScoreObj = currentScores.find((s: any) => s.score?.participant === 'home');
        const awayScoreObj = currentScores.find((s: any) => s.score?.participant === 'away');
        
        const goalsHome = homeScoreObj?.score?.goals ?? 0;
        const goalsAway = awayScoreObj?.score?.goals ?? 0;
        
        return {
          fixtureId: f.id,
          date: parseSportmonksDate(f.starting_at),
          homeTeamId,
          awayTeamId,
          homeTeamName: homeTeam?.name || '',
          awayTeamName: awayTeam?.name || '',
          goalsHome,
          goalsAway,
          homeGoals: goalsHome,
          awayGoals: goalsAway,
          isHome,
          venue: isHome ? 'home' : 'away',
          leagueId: f.league_id || 0,
          leagueName: f.league?.name,
          seasonId: f.season_id || seasonId,
          season: f.season_id || seasonId,
        };
      });
    
    console.log(`✅ Found ${matchHistory.length} matches in history for team ${teamId} (season ${seasonId || 'all'})`);
    
    // Cache for 1 hour
    // Uno storico tagliato a una data passata non cambiera' mai piu': si tiene
    // 30 giorni, cosi' i backtest successivi (o un secondo predittore sulle
    // stesse partite) girano da cache invece di riscaricare tutto.
    // Senza cutoff invece resta a 1 ora, perche' "ultimi 12 mesi da oggi" scade.
    const historyTtl = maxDate ? 60 * 60 * 24 * 30 : 3600;
    await redis?.setex(cacheKey, historyTtl, JSON.stringify(matchHistory));
    
    return matchHistory;
  } catch (error: any) {
    console.error(`❌ Error fetching team history:`, error.message);
    return [];
  }
}

/**
 * Applica cutoff e limite allo storico grezzo dei testa a testa.
 * In backtest gli scontri giocati DOPO la partita da predire sono look-ahead.
 */
function sliceH2H(
  fixtures: MatchHistoryData[],
  limit: number,
  maxDate?: Date
): MatchHistoryData[] {
  return fixtures
    .filter(f => !maxDate || new Date(f.date) < maxDate)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

/**
 * Get head-to-head history between two teams
 */
export async function getHeadToHead(
  homeTeamId: number,
  awayTeamId: number,
  limit: number = 10,
  maxDate?: Date // taglio temporale per il backtest: solo scontri PRECEDENTI
): Promise<MatchHistoryData[]> {
  // La cache NON include il cutoff: l'endpoint h2h restituisce tutti gli
  // scontri diretti, che sono immutabili. Si scarica una volta per coppia e si
  // taglia in memoria, invece di una chiamata per ogni data di backtest.
  const cacheKey = `sportsmonks:h2h-raw:${homeTeamId}:${awayTeamId}`;
  
  try {
    const cached = await redis?.get(cacheKey);
    if (cached) {
      console.log(`✅ H2H cache hit for ${homeTeamId} vs ${awayTeamId}`);
      return sliceH2H(JSON.parse(cached), limit, maxDate);
    }

    console.log(`🔍 Fetching H2H for teams ${homeTeamId} vs ${awayTeamId}`);
    const client = getSportsmonksClient();
    
    const response = await client.get<any>(
      `/fixtures/head-to-head/${homeTeamId}/${awayTeamId}`,
      {
        include: 'participants;scores',
      }
    );
    
    if (response.message || !response.data) {
      console.log(`⚠️ H2H not found for teams ${homeTeamId} vs ${awayTeamId}`);
      return [];
    }
    
    const fixtures = response.data
      // state.short non esiste in v3 (il campo e' short_name): il vecchio
      // confronto scartava sempre tutto e l'H2H era sempre vuoto.
      .filter((f: any) => {
        const st = f.state?.short_name || f.state?.state || f.state?.developer_name;
        return st === 'FT' || st === 'AET' || st === 'FT_PEN';
      })
      .map((f: any): MatchHistoryData => {
        const participants = f.participants || [];
        const homeTeam = participants.find((p: any) => p.meta?.location === 'home');
        const awayTeam = participants.find((p: any) => p.meta?.location === 'away');
        
        const scores = f.scores || [];
        const isHome = homeTeam?.id === homeTeamId;
        const goalsHome = scores.find((s: any) => s.score?.participant === 'home')?.score?.goals || 0;
        const goalsAway = scores.find((s: any) => s.score?.participant === 'away')?.score?.goals || 0;
        
        return {
          fixtureId: f.id,
          date: parseSportmonksDate(f.starting_at),
          homeTeamId: homeTeam?.id || 0,
          awayTeamId: awayTeam?.id || 0,
          homeTeamName: homeTeam?.name || '',
          awayTeamName: awayTeam?.name || '',
          goalsHome,
          goalsAway,
          homeGoals: goalsHome,
          awayGoals: goalsAway,
          isHome,
          venue: isHome ? 'home' : 'away',
          leagueId: f.league_id || 0,
          leagueName: f.league?.name,
          seasonId: f.season_id || 0,
          season: 0,
        };
      });
    
    console.log(`✅ Found ${fixtures.length} H2H matches`);
    
    // Scontri diretti passati: immutabili, cache lunga sul GREZZO.
    await redis?.setex(cacheKey, 60 * 60 * 24 * 7, JSON.stringify(fixtures));

    return sliceH2H(fixtures, limit, maxDate);
  } catch (error: any) {
    console.error(`❌ Error fetching H2H:`, error.message);
    return [];
  }
}

/**
 * Get match history for a team filtered by venue (home/away)
 */
export async function getTeamHistoryByVenue(
  teamId: number,
  seasonId: number,
  isHome: boolean,
  limit: number = 0,
  teamName?: string, // 🆕 Team name for ID mapping
  maxDate?: Date // 🆕 Optional: max date for historical data (for backtesting)
): Promise<MatchHistoryData[]> {
  try {
    console.log(`🔍 Fetching ${isHome ? 'home' : 'away'} history for team ${teamId} (${teamName || 'no name'}), season ${seasonId}`);
    
    // Get full team history first (pass teamName for mapping and maxDate)
    const allHistory = await getTeamHistory(teamId, seasonId, 0, teamName, maxDate);
    
    // Filter by venue
    const venueHistory = allHistory.filter(match => match.isHome === isHome);
    
    // Apply limit if specified
    const finalHistory = limit > 0 ? venueHistory.slice(0, limit) : venueHistory;
    
    console.log(`✅ Found ${finalHistory.length} ${isHome ? 'home' : 'away'} matches for team ${teamId}`);
    
    return finalHistory;
  } catch (error: any) {
    console.error(`❌ Error fetching venue history:`, error.message);
    return [];
  }
}

export const statisticsService = {
  getFixtureStatistics,
  getExpectedGoals,
  getTeamHistory,
  getTeamHistoryByVenue,
  getHeadToHead,
};
