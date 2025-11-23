/**
 * Routes per Fixtures
 * GET /api/fixtures - Lista fixtures con filtri
 * GET /api/fixtures/today - Partite di oggi
 */

import { Router } from 'express';
import { z } from 'zod';
import { fixturesService } from '../services/sportsmonks';
import { fetchOddsByFixtureId } from '../services/sportsmonks/odds';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import logger from '../utils/logger';
import { filterSupportedFixtures, hasMinimumDataQuality } from '../config/supported-leagues';
import type { Request, Response, NextFunction } from 'express';

const router = Router();

// IDs delle competizioni principali supportate (Sportsmonks IDs)
const ALLOWED_LEAGUES = [
  8,    // Premier League (England)
  9,    // Championship (England) 🆕
  10,   // League One (England)
  11,   // League Two (England)
  384,  // Serie A (Italy)
  387,  // Serie B (Italy) 🆕
  564,  // La Liga (Spain)
  566,  // La Liga 2 (Spain)
  82,   // Bundesliga (Germany)
  83,   // 2. Bundesliga (Germany)
  301,  // Ligue 1 (France)
  303,  // Ligue 2 (France)
  72,   // Eredivisie (Netherlands)
  73,   // Eerste Divisie (Netherlands)
  271,  // Primeira Liga (Portugal)
  272,  // Segunda Liga (Portugal)
  462,  // Super Lig (Turkey)
  463,  // 1. Lig (Turkey)
  307,  // Pro League (Belgium)
  266,  // Superliga (Denmark)
  2,    // Champions League
  5,    // Europa League
  848,  // Conference League
  600,  // Nations League
  // Serie B Italy, Championship England, etc. - più coverage
];

// Schema validazione query params
const fixturesQuerySchema = z.object({
  date: z.string().optional(), // YYYY-MM-DD
  days: z.coerce.number().int().min(0).max(7).optional().default(0),
  leagueId: z.coerce.number().int().optional(),
  teamId: z.coerce.number().int().optional(),
  season: z.coerce.number().int().optional(),
});

/**
 * GET /api/fixtures
 * Lista fixtures con possibilità di filtrare per data, lega, team
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Valida query params
    const params = fixturesQuerySchema.parse(req.query);
    
    // Determina data target
    const targetDate = params.date ? new Date(params.date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    
    // Calcola range date
    const startDate = new Date(targetDate);
    const endDate = new Date(targetDate);
    endDate.setDate(endDate.getDate() + params.days);
    
    logger.info({ 
      startDate: startDate.toISOString(), 
      endDate: endDate.toISOString(),
      leagueId: params.leagueId,
      teamId: params.teamId,
    }, 'Fetching fixtures');
    
    // Cache key
    const cacheKey = `fixtures:${startDate.toISOString()}:${endDate.toISOString()}:${params.leagueId || 'all'}:${params.teamId || 'all'}`;
    
    // Prova cache Redis
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Cache hit');
      return res.json(JSON.parse(cached));
    }
    
    // Query database
    const fixtures = await prisma.fixture.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
        ...(params.leagueId && { leagueId: params.leagueId }),
        ...(params.teamId && {
          OR: [
            { homeTeamId: params.teamId },
            { awayTeamId: params.teamId },
          ],
        }),
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        prediction: true,
      },
      orderBy: {
        date: 'asc',
      },
    });
    
    // Se non ci sono fixtures nel DB, prova a fetchare da Sportsmonks
    if (fixtures.length === 0 && params.leagueId) {
      logger.info({ leagueId: params.leagueId }, 'No fixtures in DB, fetching from Sportsmonks');
      
      try {
        // Fetch da Sportsmonks usando date range
        const from = startDate.toISOString().split('T')[0];
        const to = endDate.toISOString().split('T')[0];
        const apiFixtures = await fixturesService.getFixturesByDateRange(from, to, params.leagueId);
        
        // Gli apiFixtures sono già nel formato Fixture[]
        // Salva nel DB se necessario (opzionale)
        logger.info({ count: apiFixtures.length }, 'Fixtures fetched from Sportsmonks');
        
        // Ritorna direttamente i fixtures da Sportsmonks
        // 🔥 FILTER: Solo campionati supportati con dati sufficienti
        const filteredFixtures = filterSupportedFixtures(apiFixtures);
        
        logger.info({ 
          total: apiFixtures.length,
          filtered: filteredFixtures.length,
          removed: apiFixtures.length - filteredFixtures.length,
        }, '🔥 Filtered fixtures by supported leagues');
        
        return res.json(filteredFixtures.map(f => ({
          id: f.id,
          homeTeam: f.homeTeam.name,
          homeTeamLogo: f.homeTeam.logo,
          awayTeam: f.awayTeam.name,
          awayTeamLogo: f.awayTeam.logo,
          competition: f.league.name,
          competitionCountry: f.league.country,
          date: f.date,
          time: new Date(f.date).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
          status: f.statusShort,
          logo: f.league.logo,
        })));
      } catch (error) {
        logger.error({ error }, 'Failed to fetch fixtures from Sportsmonks');
      }
    }
    
    // Cache risultato
    await redis.setex(cacheKey, 300, JSON.stringify(fixtures)); // 5 min
    
    return res.json(fixtures);
    
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/fixtures/today
 * Partite di oggi da Sportsmonks con quote (solo partite ancora da giocare)
 */
router.get('/today', async (_req: Request, res: Response) => {
  try {
    logger.info('Fetching today fixtures from Sportsmonks');
    
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    
    // Usa Sportsmonks per ottenere le fixtures con filtro sulle leghe supportate
    const allFixtures = await fixturesService.getFixturesByDate(today, undefined, ALLOWED_LEAGUES);
    
    // 🔥 FILTRO: Solo partite ancora da giocare (escludi finite, in corso, o passate)
    const upcomingFixtures = allFixtures.filter((fixture: any) => {
      // Escludi partite finite (FT, AET, PEN, etc.)
      const finishedStatuses = ['FT', 'AET', 'PEN', 'LIVE', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'ABD', 'AWA', 'WO', 'CANC'];
      if (finishedStatuses.includes(fixture.statusShort)) {
        return false;
      }
      
      // Escludi partite il cui orario di inizio è già passato (con margine di 5 minuti)
      const fixtureTime = new Date(fixture.date);
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      if (fixtureTime < fiveMinutesAgo) {
        return false;
      }
      
      return true;
    });
    
    // Le fixtures sono già filtrate dall'API
    logger.info({ 
      total: allFixtures.length,
      upcoming: upcomingFixtures.length,
      filtered: allFixtures.length - upcomingFixtures.length,
    }, 'Fixtures fetched (only upcoming)');
    
    // Fetch odds in parallelo con limite (max 3 contemporanee)
    const batchSize = 3;
    const fixturesWithOdds: any[] = [];
    
    for (let i = 0; i < upcomingFixtures.length; i += batchSize) {
      const batch = upcomingFixtures.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (fixture: any) => {
          let odds = null;
          
          try {
            // Timeout di 5 secondi per fixture
            const oddsPromise = fetchOddsByFixtureId(fixture.id);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), 5000)
            );
            
            odds = await Promise.race([oddsPromise, timeoutPromise]) as any;
          } catch (error: any) {
            if (error.message !== 'Timeout') {
              logger.warn({ fixtureId: fixture.id, error: error.message }, 'Failed to fetch odds');
            }
          }

          return {
            id: fixture.id,
            homeTeam: fixture.homeTeam.name,
            homeTeamLogo: fixture.homeTeam.logo,
            awayTeam: fixture.awayTeam.name,
            awayTeamLogo: fixture.awayTeam.logo,
            competition: fixture.league.name,
            competitionCode: fixture.league.id.toString(),
            competitionCountry: fixture.league.country,
            date: fixture.date,
            time: new Date(fixture.date).toLocaleTimeString('it-IT', { 
              hour: '2-digit', 
              minute: '2-digit' 
            }),
            status: fixture.statusShort,
            logo: fixture.league.logo,
            odds: odds ? {
              home: odds.odds1X2.home,
              draw: odds.odds1X2.draw,
              away: odds.odds1X2.away,
              prob1: (odds.odds1X2.prob1 * 100).toFixed(1),
              probX: (odds.odds1X2.probX * 100).toFixed(1),
              prob2: (odds.odds1X2.prob2 * 100).toFixed(1),
              bookmakerCount: odds.bookmakerCount,
              overUnder: odds.oddsOverUnder ? {
                over15: odds.oddsOverUnder.over15,
                under15: odds.oddsOverUnder.under15,
                over25: odds.oddsOverUnder.over25,
                under25: odds.oddsOverUnder.under25,
                over35: odds.oddsOverUnder.over35,
                under35: odds.oddsOverUnder.under35,
              } : undefined,
              btts: odds.oddsBTTS ? {
                yes: odds.oddsBTTS.yes,
                no: odds.oddsBTTS.no,
              } : undefined,
              doubleChance: odds.oddsDoubleChance ? {
                '1X': odds.oddsDoubleChance.homeOrDraw,
                'X2': odds.oddsDoubleChance.drawOrAway,
                '12': odds.oddsDoubleChance.homeOrAway,
              } : undefined,
            } : null,
          };
        })
      );
      
      fixturesWithOdds.push(...batchResults);
    }

    logger.info({ 
      count: fixturesWithOdds.length,
      withOdds: fixturesWithOdds.filter(f => f.odds !== null).length 
    }, 'Today fixtures fetched with odds');
    
    return res.json({
      success: true,
      count: fixturesWithOdds.length,
      matches: fixturesWithOdds,
      date: today,
    });
    
  } catch (error) {
    logger.error({ error }, 'Error fetching today fixtures');
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/fixtures/by-date?date=YYYY-MM-DD
 * Partite per una data specifica
 */
router.get('/by-date', async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    
    if (!date || typeof date !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Date parameter required (format: YYYY-MM-DD)',
      });
    }

    logger.info({ date }, 'Fetching fixtures by date');
    
    // IDs delle competizioni che ci interessano
    const allowedLeagues = [
      39,  // Premier League
      135, // Serie A
      140, // La Liga
      78,  // Bundesliga
      61,  // Ligue 1
      2,   // Champions League
      3,   // Europa League
    ];
    
    const fixtures = await fixturesService.getFixturesByDate(date);
    
    // Filtra solo le competizioni che ci interessano
    const filteredFixtures = fixtures.filter((fixture: any) => 
      allowedLeagues.includes(fixture.league?.id)
    );
    
    logger.info({ 
      total: fixtures.length, 
      filtered: filteredFixtures.length 
    }, 'Fixtures filtered by league');
    
    // Salva automaticamente le squadre nel database se non esistono
    const teamsToSave = new Set<string>();
    for (const fixture of filteredFixtures) {
      if (fixture.homeTeam?.id && fixture.homeTeam?.name) {
        teamsToSave.add(JSON.stringify({
          apiId: fixture.homeTeam.id,
          name: fixture.homeTeam.name,
          country: fixture.league?.country || 'Unknown',
          logo: fixture.homeTeam.logo,
        }));
      }
      if (fixture.awayTeam?.id && fixture.awayTeam?.name) {
        teamsToSave.add(JSON.stringify({
          apiId: fixture.awayTeam.id,
          name: fixture.awayTeam.name,
          country: fixture.league?.country || 'Unknown',
          logo: fixture.awayTeam.logo,
        }));
      }
    }
    
    // Upsert teams in background (non-blocking)
    if (teamsToSave.size > 0) {
      Promise.all(
        Array.from(teamsToSave).map(async (teamStr) => {
          const team = JSON.parse(teamStr);
          try {
            await prisma.team.upsert({
              where: { apiId: team.apiId },
              update: {},
              create: team,
            });
          } catch (err) {
            logger.warn({ team: team.name, error: err }, 'Failed to save team');
          }
        })
      ).then(() => {
        logger.info({ count: teamsToSave.size }, 'Teams saved to database');
      }).catch((err) => {
        logger.error({ error: err }, 'Error saving teams');
      });
    }
    
    const formatted = filteredFixtures.map((fixture: any) => ({
      id: fixture.id,
      homeTeam: fixture.homeTeam.name,
      homeTeamLogo: fixture.homeTeam.logo,
      awayTeam: fixture.awayTeam.name,
      awayTeamLogo: fixture.awayTeam.logo,
      competition: fixture.league.name,
      competitionCode: fixture.league.id.toString(),
      competitionCountry: fixture.league.country,
      date: fixture.date,
      time: new Date(fixture.date).toLocaleTimeString('it-IT', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      status: fixture.statusShort,
      logo: fixture.league.logo,
    }));

    return res.json({
      success: true,
      count: formatted.length,
      matches: formatted,
      date,
    });
    
  } catch (error) {
    logger.error({ error }, 'Error fetching fixtures by date');
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/fixtures/:fixtureId
 * Dettaglio singola fixture
 */
router.get('/:fixtureId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fixtureId = parseInt(req.params.fixtureId, 10);
    
    if (isNaN(fixtureId)) {
      return res.status(400).json({ error: 'Invalid fixtureId' });
    }
    
    const fixture = await prisma.fixture.findUnique({
      where: { apiId: fixtureId },
      include: {
        homeTeam: true,
        awayTeam: true,
        prediction: true,
      },
    });
    
    
    if (!fixture) {
      return res.status(404).json({ error: 'Fixture not found' });
    }
    
    return res.json(fixture);
    
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/fixtures/sm/today
 * Get today's fixtures directly from Sportsmonks (only upcoming matches)
 */
router.get('/sm/today', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const leagueId = req.query.leagueId ? parseInt(req.query.leagueId as string) : undefined;
    
    logger.info({ date: today, leagueId }, 'Fetching today fixtures from Sportsmonks');
    
    // Se viene specificato un leagueId, usa quello, altrimenti usa tutte le leghe supportate
    const allFixtures = leagueId 
      ? await fixturesService.getFixturesByDate(today, leagueId)
      : await fixturesService.getFixturesByDate(today, undefined, ALLOWED_LEAGUES);
    
    // 🔥 FILTRO: Solo partite ancora da giocare (escludi finite, in corso, o passate)
    const upcomingFixtures = allFixtures.filter((fixture: any) => {
      // Escludi partite finite o in corso
      const finishedStatuses = ['FT', 'AET', 'PEN', 'LIVE', 'HT', 'ET', 'BT', 'P', 'SUSP', 'INT', 'ABD', 'AWA', 'WO', 'CANC'];
      if (finishedStatuses.includes(fixture.statusShort)) {
        return false;
      }
      
      // Escludi partite il cui orario di inizio è già passato (con margine di 5 minuti)
      const fixtureTime = new Date(fixture.date);
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      if (fixtureTime < fiveMinutesAgo) {
        return false;
      }
      
      return true;
    });
    
    logger.info({ 
      total: allFixtures.length, 
      upcoming: upcomingFixtures.length,
      filtered: allFixtures.length - upcomingFixtures.length,
    }, 'Fixtures fetched (only upcoming)');
    
    return res.json({
      count: upcomingFixtures.length,
      fixtures: upcomingFixtures,
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching today fixtures from Sportsmonks');
    return next(error);
  }
});

/**
 * GET /api/fixtures/sm/live
 * Get live fixtures directly from Sportsmonks (new endpoint)
 */
router.get('/sm/live', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const leagueId = req.query.leagueId ? parseInt(req.query.leagueId as string) : undefined;
    
    logger.info({ leagueId }, 'Fetching live fixtures from Sportsmonks');
    
    const fixtures = await fixturesService.getLiveFixtures(leagueId);
    
    // Filtra solo le leghe supportate
    const filteredFixtures = fixtures.filter((fixture: any) => 
      ALLOWED_LEAGUES.includes(fixture.league?.id)
    );
    
    logger.info({ total: fixtures.length, filtered: filteredFixtures.length }, 'Live fixtures filtered');
    
    return res.json({
      count: filteredFixtures.length,
      fixtures: filteredFixtures,
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching live fixtures from Sportsmonks');
    return next(error);
  }
});

/**
 * GET /api/fixtures/sm/range
 * Get fixtures by date range directly from Sportsmonks (new endpoint)
 */
router.get('/sm/range', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate, leagueId, includeAllLeagues } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }
    
    const league = leagueId ? parseInt(leagueId as string) : undefined;
    const includeAll = includeAllLeagues === 'true';
    
    logger.info({ startDate, endDate, leagueId: league, includeAll }, 'Fetching fixtures by range from Sportsmonks');
    
    // Se viene specificato un leagueId, usa quello
    // Se includeAllLeagues=true, non filtrare per leghe
    // Altrimenti usa ALLOWED_LEAGUES
    const fixtures = league
      ? await fixturesService.getFixturesByDateRange(startDate as string, endDate as string, league)
      : includeAll
      ? await fixturesService.getFixturesByDateRange(startDate as string, endDate as string)
      : await fixturesService.getFixturesByDateRange(startDate as string, endDate as string, undefined, ALLOWED_LEAGUES);
    
    logger.info({ total: fixtures.length }, 'Fixtures fetched');
    
    return res.json({
      count: fixtures.length,
      fixtures: fixtures,
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching fixtures by range from Sportsmonks');
    return next(error);
  }
});

/**
 * GET /api/fixtures/sm/:id
 * Get fixture by ID directly from Sportsmonks (new endpoint)
 */
router.get('/sm/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fixtureId = parseInt(req.params.id);
    
    if (isNaN(fixtureId)) {
      return res.status(400).json({ error: 'Invalid fixture ID' });
    }
    
    logger.info({ fixtureId }, 'Fetching fixture by ID from Sportsmonks');
    
    const fixture = await fixturesService.getFixtureById(fixtureId);
    
    if (!fixture) {
      return res.status(404).json({ error: 'Fixture not found' });
    }
    
    return res.json(fixture);
  } catch (error) {
    logger.error({ error }, 'Error fetching fixture by ID from Sportsmonks');
    return next(error);
  }
});

export default router;

