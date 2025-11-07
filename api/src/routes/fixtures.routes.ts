/**
 * Routes per Fixtures
 * GET /api/fixtures - Lista fixtures con filtri
 * GET /api/fixtures/today - Partite di oggi (football-data.org)
 */

import { Router } from 'express';
import { z } from 'zod';
import { fixturesService } from '../services/api-football';
import { footballDataClient } from '../services/football-data/client';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import logger from '../utils/logger';
import { mapAPIFixturesToFlat } from '../utils/fixtureMapper';
import type { Request, Response, NextFunction } from 'express';

const router = Router();

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
    
    // Se non ci sono fixtures nel DB, prova a fetchare da API-FOOTBALL
    if (fixtures.length === 0 && params.leagueId && params.season) {
      logger.info({ leagueId: params.leagueId, season: params.season }, 'No fixtures in DB, fetching from API');
      
      try {
        // Fetch da API-FOOTBALL
        const apiFixtures = await fixturesService.getFixturesByLeague(
          params.leagueId,
          params.season,
          { from: startDate.toISOString().split('T')[0], to: endDate.toISOString().split('T')[0] }
        );
        
        // Converti fixtures API in formato piatto
        const flatFixtures = mapAPIFixturesToFlat(apiFixtures);
        
        // Salva nel DB (upsert)
        for (const fixture of flatFixtures) {
          await prisma.fixture.upsert({
            where: { apiId: fixture.apiId },
            update: {
              status: fixture.statusShort as any,
              venue: fixture.venue,
              referee: fixture.referee,
              date: fixture.date,
            },
            create: {
              apiId: fixture.apiId,
              leagueId: fixture.leagueId,
              leagueName: fixture.leagueName,
              leagueCountry: fixture.leagueCountry,
              leagueSeason: fixture.season,
              round: fixture.round,
              date: fixture.date,
              timestamp: fixture.timestamp,
              timezone: fixture.timezone,
              homeTeamId: fixture.homeTeamId,
              awayTeamId: fixture.awayTeamId,
              status: fixture.statusShort as any,
              venue: fixture.venue,
              referee: fixture.referee,
            },
          });
          
          // Assicura che i team esistano
          await prisma.team.upsert({
            where: { apiId: fixture.homeTeamId },
            update: {},
            create: {
              apiId: fixture.homeTeamId,
              name: `Team ${fixture.homeTeamId}`,
              logo: '',
              country: fixture.leagueCountry,
            },
          });
          
          await prisma.team.upsert({
            where: { apiId: fixture.awayTeamId },
            update: {},
            create: {
              apiId: fixture.awayTeamId,
              name: `Team ${fixture.awayTeamId}`,
              logo: '',
              country: fixture.leagueCountry,
            },
          });
        }
        
        // Re-query con i nuovi fixtures
        const newFixtures = await prisma.fixture.findMany({
          where: {
            date: {
              gte: startDate,
              lte: endDate,
            },
            leagueId: params.leagueId,
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
        
        // Cache risultato
        await redis.setex(cacheKey, 300, JSON.stringify(newFixtures)); // 5 min
        
        return res.json(newFixtures);
        
      } catch (apiError) {
        logger.error({ error: apiError }, 'Failed to fetch fixtures from API');
        // Continua con array vuoto invece di fallire
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
 * Partite di oggi da API-FOOTBALL
 */
router.get('/today', async (_req: Request, res: Response) => {
  try {
    logger.info('Fetching today fixtures from API-FOOTBALL');
    
    const today = new Date().toISOString().split('T')[0];
    
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
    
    // Usa API-FOOTBALL (più affidabile e completo)
    const fixtures = await fixturesService.getFixturesByDate(today);
    
    // Filtra solo le competizioni che ci interessano
    const filteredFixtures = fixtures.filter((fixture: any) => 
      allowedLeagues.includes(fixture.league?.id)
    );
    
    logger.info({ 
      total: fixtures.length, 
      filtered: filteredFixtures.length 
    }, 'Fixtures filtered by league');
    
    // 🎯 Salva TUTTE le fixture nel DB (filtro dati sarà fatto al momento della predizione)
    const validFixtures = filteredFixtures; // Non filtriamo qui, troppo costoso con API calls
    
    // 🎯 Salva fixture nel DB in background
    if (validFixtures.length > 0) {
      // STEP 1: Salva PRIMA tutti i team (per evitare foreign key violations)
      const teamsMap = new Map<number, any>();
      for (const fixture of validFixtures) {
        if (fixture.teams?.home?.id && !teamsMap.has(fixture.teams.home.id)) {
          teamsMap.set(fixture.teams.home.id, {
            apiId: fixture.teams.home.id,
            name: fixture.teams.home.name,
            country: fixture.league?.country || 'Unknown',
            logo: fixture.teams.home.logo,
          });
        }
        if (fixture.teams?.away?.id && !teamsMap.has(fixture.teams.away.id)) {
          teamsMap.set(fixture.teams.away.id, {
            apiId: fixture.teams.away.id,
            name: fixture.teams.away.name,
            country: fixture.league?.country || 'Unknown',
            logo: fixture.teams.away.logo,
          });
        }
      }
      
      // Salva team in background
      Promise.all(
        Array.from(teamsMap.values()).map(team =>
          prisma.team.upsert({
            where: { apiId: team.apiId },
            update: { name: team.name, logo: team.logo },
            create: team,
          }).catch(err => {
            logger.warn({ team: team.name, error: err }, 'Failed to save team');
          })
        )
      ).then(() => {
        logger.info({ count: teamsMap.size }, 'Teams saved');
        
        // STEP 2: Salva fixture DOPO che i team sono stati salvati
        return Promise.all(
          validFixtures.map(async (fixture: any) => {
            try {
              // Mappa status a enum valido
              const statusMap: Record<string, string> = {
                'TBD': 'SCHEDULED', 'NS': 'SCHEDULED',
                '1H': 'LIVE', 'HT': 'LIVE', '2H': 'LIVE', 'ET': 'LIVE', 'P': 'LIVE',
                'FT': 'FINISHED', 'AET': 'FINISHED', 'PEN': 'FINISHED', 'BT': 'FINISHED',
                'SUSP': 'SUSPENDED', 'INT': 'SUSPENDED',
                'PST': 'POSTPONED',
                'CANC': 'CANCELLED', 'ABD': 'CANCELLED',
                'AWD': 'FINISHED', 'WO': 'FINISHED',
              };
              
              const rawStatus = fixture.fixture.status.short;
              const mappedStatus = statusMap[rawStatus] || 'SCHEDULED';
              
              // Fetch internal DB IDs for home and away teams
              const [homeTeamDb, awayTeamDb] = await Promise.all([
                prisma.team.findUnique({ where: { apiId: fixture.teams.home.id }, select: { id: true } }),
                prisma.team.findUnique({ where: { apiId: fixture.teams.away.id }, select: { id: true } }),
              ]);

              if (!homeTeamDb || !awayTeamDb) {
                return;
              }
              
              // Salva fixture nel DB usando internal IDs
              await prisma.fixture.upsert({
                where: { apiId: fixture.fixture.id },
                update: {
                  date: new Date(fixture.fixture.date),
                  status: mappedStatus as any,
                },
                create: {
                  apiId: fixture.fixture.id,
                  date: new Date(fixture.fixture.date),
                  timestamp: fixture.fixture.timestamp,
                  timezone: fixture.fixture.timezone || 'Europe/Rome',
                  homeTeamId: homeTeamDb.id,
                  awayTeamId: awayTeamDb.id,
                  leagueId: fixture.league.id,
                  leagueName: fixture.league.name,
                  leagueCountry: fixture.league.country,
                  leagueSeason: fixture.league.season,
                  round: fixture.league.round,
                  status: mappedStatus as any,
                  venue: fixture.fixture.venue?.name,
                  referee: fixture.fixture.referee,
                },
              });
            } catch (err) {
              logger.warn({ fixtureId: fixture.fixture.id, error: err }, 'Failed to save fixture');
            }
          })
        );
      }).then(() => {
        logger.info({ count: validFixtures.length }, 'Fixtures saved to database');
      }).catch((err) => {
        logger.error({ error: err }, 'Error saving fixtures');
      });
    }
    
    // Formatta per il frontend (usa validFixtures invece di filteredFixtures)
    const formatted = validFixtures.map((fixture: any) => ({
      id: fixture.fixture.id,
      homeTeam: fixture.teams.home.name,
      awayTeam: fixture.teams.away.name,
      competition: fixture.league.name,
      competitionCode: fixture.league.id.toString(),
      date: fixture.fixture.date,
      time: new Date(fixture.fixture.date).toLocaleTimeString('it-IT', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      status: fixture.fixture.status.short,
      logo: fixture.league.logo,
    }));

    logger.info({ count: formatted.length }, 'Today fixtures fetched successfully');
    
    return res.json({
      success: true,
      count: formatted.length,
      matches: formatted,
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
      if (fixture.teams?.home?.id && fixture.teams?.home?.name) {
        teamsToSave.add(JSON.stringify({
          apiId: fixture.teams.home.id,
          name: fixture.teams.home.name,
          country: fixture.league?.country || 'Unknown',
          logo: fixture.teams.home.logo,
        }));
      }
      if (fixture.teams?.away?.id && fixture.teams?.away?.name) {
        teamsToSave.add(JSON.stringify({
          apiId: fixture.teams.away.id,
          name: fixture.teams.away.name,
          country: fixture.league?.country || 'Unknown',
          logo: fixture.teams.away.logo,
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
      id: fixture.fixture.id,
      homeTeam: fixture.teams.home.name,
      awayTeam: fixture.teams.away.name,
      competition: fixture.league.name,
      competitionCode: fixture.league.id.toString(),
      date: fixture.fixture.date,
      time: new Date(fixture.fixture.date).toLocaleTimeString('it-IT', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      status: fixture.fixture.status.short,
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

export default router;
