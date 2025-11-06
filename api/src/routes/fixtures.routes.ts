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
    
    // 🎯 NUOVO: Verifica disponibilità dati storici con throttling AGGRESSIVO per evitare rate limit
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const BATCH_SIZE = 2; // Processa SOLO 2 partite alla volta (ridotto da 5)
    const DELAY_BETWEEN_BATCHES = 5000; // 5 secondi tra batch (aumentato da 1s)
    
    const validFixtures: any[] = [];
    const currentSeason = 2025;
    const seasonStartDate = new Date('2025-08-01');
    
    // Processa partite in batch per evitare rate limit
    for (let i = 0; i < filteredFixtures.length; i += BATCH_SIZE) {
      const batch = filteredFixtures.slice(i, i + BATCH_SIZE);
      
      const batchResults = await Promise.all(
        batch.map(async (fixture: any) => {
          try {
            // Verifica dati storici per entrambe le squadre dall'inizio della stagione
            const [homeHistory, awayHistory] = await Promise.all([
              fixturesService.getFixturesByTeam(fixture.teams.home.id, currentSeason, { last: 50 }),
              fixturesService.getFixturesByTeam(fixture.teams.away.id, currentSeason, { last: 50 }),
            ]);
            
            // Filtra solo partite della stagione corrente (da agosto 2025)
            const homeSeasonMatches = homeHistory.filter((f: any) => 
              new Date(f.fixture.date) >= seasonStartDate
            );
            const awaySeasonMatches = awayHistory.filter((f: any) => 
              new Date(f.fixture.date) >= seasonStartDate
            );
            
            // Minimo 3 partite per squadra nella stagione corrente
            const hasEnoughData = homeSeasonMatches.length >= 3 && awaySeasonMatches.length >= 3;
            
            if (hasEnoughData) {
              logger.info({
                fixture: `${fixture.teams.home.name} vs ${fixture.teams.away.name}`,
                homeMatches: homeSeasonMatches.length,
                awayMatches: awaySeasonMatches.length,
                season: `${currentSeason}/${currentSeason + 1}`,
              }, '✅ Fixture has enough data from current season');
            } else {
              logger.info({
                fixture: `${fixture.teams.home.name} vs ${fixture.teams.away.name}`,
                homeMatches: homeSeasonMatches.length,
                awayMatches: awaySeasonMatches.length,
                season: `${currentSeason}/${currentSeason + 1}`,
              }, '❌ Fixture skipped - insufficient data from current season');
            }
            
            return hasEnoughData ? fixture : null;
          } catch (err) {
            logger.warn({ 
              fixture: `${fixture.teams.home.name} vs ${fixture.teams.away.name}`,
              error: err 
            }, 'Failed to check fixture data availability');
            return null;
          }
        })
      );
      
      // Aggiungi risultati validi
      validFixtures.push(...batchResults.filter(f => f !== null));
      
      // Delay tra batch (tranne l'ultimo)
      if (i + BATCH_SIZE < filteredFixtures.length) {
        logger.info({ 
          processed: i + BATCH_SIZE, 
          total: filteredFixtures.length,
          nextBatchIn: `${DELAY_BETWEEN_BATCHES}ms`
        }, 'Batch processed, waiting before next batch');
        await delay(DELAY_BETWEEN_BATCHES);
      }
    }
    
    logger.info({
      initial: filteredFixtures.length,
      withData: validFixtures.length,
      filtered: filteredFixtures.length - validFixtures.length,
      season: '2025/2026'
    }, 'Fixtures filtered by current season data availability');
    
    // 🎯 Salva fixture nel DB e popola cache xG in background
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
      
      // Salva team in sequenza (PRIMA delle fixture)
      await Promise.all(
        Array.from(teamsMap.values()).map(team =>
          prisma.team.upsert({
            where: { apiId: team.apiId },
            update: {},
            create: team,
          }).catch(err => {
            logger.warn({ team: team.name, error: err }, 'Failed to save team');
          })
        )
      );
      
      logger.info({ count: teamsMap.size }, 'Teams saved BEFORE fixtures');
      
      // STEP 2: Salva fixture (ora i team esistono)
      Promise.all(
        validFixtures.slice(0, 20).map(async (fixture: any) => {
          try {
            // Mappa status a enum valido
            const statusMap: Record<string, string> = {
              'TBD': 'SCHEDULED',
              'NS': 'SCHEDULED',
              '1H': 'LIVE',
              'HT': 'LIVE',
              '2H': 'LIVE',
              'ET': 'LIVE',
              'P': 'LIVE',
              'FT': 'FINISHED',
              'AET': 'FINISHED',
              'PEN': 'FINISHED',
              'BT': 'FINISHED',
              'SUSP': 'SUSPENDED',
              'INT': 'SUSPENDED',
              'PST': 'POSTPONED',
              'CANC': 'CANCELLED',
              'ABD': 'CANCELLED',
              'AWD': 'FINISHED',
              'WO': 'FINISHED',
            };
            
            const rawStatus = fixture.fixture.status.short;
            const mappedStatus = statusMap[rawStatus] || 'SCHEDULED';
            
            // Fetch internal DB IDs for home and away teams
            const [homeTeamDb, awayTeamDb] = await Promise.all([
              prisma.team.findUnique({ where: { apiId: fixture.teams.home.id }, select: { id: true } }),
              prisma.team.findUnique({ where: { apiId: fixture.teams.away.id }, select: { id: true } }),
            ]);

            if (!homeTeamDb || !awayTeamDb) {
              logger.warn({ 
                fixtureId: fixture.fixture.id,
                homeApiId: fixture.teams.home.id,
                awayApiId: fixture.teams.away.id,
              }, 'Team not found in database, skipping fixture');
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
            
            // Fetcha storico squadre per popolare xG cache
            const season = fixture.league.season || new Date().getFullYear();
            const [homeHistory, awayHistory] = await Promise.all([
              fixturesService.getFixturesByTeam(fixture.teams.home.id, season, { last: 20 }),
              fixturesService.getFixturesByTeam(fixture.teams.away.id, season, { last: 20 }),
            ]);
            
            // Salva partite storiche e fetcha xG SERIALIZZATO (uno alla volta con delay)
            const allHistorical = [...homeHistory, ...awayHistory].slice(0, 10);
            for (let idx = 0; idx < allHistorical.length; idx++) {
              const histFixture = allHistorical[idx];
              try {
                const histStatus = statusMap[histFixture.fixture.status.short] || 'FINISHED';
                
                // Lookup internal DB IDs for historical fixture teams
                const [histHomeTeamDb, histAwayTeamDb] = await Promise.all([
                  prisma.team.findUnique({ 
                    where: { apiId: histFixture.teams.home.id },
                    select: { id: true }
                  }),
                  prisma.team.findUnique({ 
                    where: { apiId: histFixture.teams.away.id },
                    select: { id: true }
                  }),
                ]);

                // Skip if teams not found in DB
                if (!histHomeTeamDb || !histAwayTeamDb) {
                  continue;
                }
                
                // Salva fixture storica
                await prisma.fixture.upsert({
                  where: { apiId: histFixture.fixture.id },
                  update: {},
                  create: {
                    apiId: histFixture.fixture.id,
                    date: new Date(histFixture.fixture.date),
                    timestamp: histFixture.fixture.timestamp,
                    timezone: histFixture.fixture.timezone || 'Europe/Rome',
                    homeTeamId: histHomeTeamDb.id,
                    awayTeamId: histAwayTeamDb.id,
                    leagueId: histFixture.league.id,
                    leagueName: histFixture.league.name,
                    leagueCountry: histFixture.league.country,
                    leagueSeason: histFixture.league.season,
                    status: histStatus as any,
                    homeGoals: histFixture.goals?.home,
                    awayGoals: histFixture.goals?.away,
                  },
                });
                
                // Fetcha xG se partita conclusa (con delay per rate limit)
                if (histFixture.fixture.status.short === 'FT') {
                  const { statisticsService } = await import('../services/api-football');
                  await statisticsService.fetchAndCacheXG(histFixture.fixture.id);
                  
                  // Delay di 500ms tra ogni fetch xG per evitare rate limit
                  if (idx < allHistorical.length - 1) {
                    await delay(500);
                  }
                }
              } catch (err) {
                // Ignora errori su singole fixture
              }
            }
            
            logger.info({ 
              fixtureId: fixture.fixture.id,
              homeTeam: fixture.teams.home.name,
              awayTeam: fixture.teams.away.name,
              historicalCached: allHistorical.length
            }, 'Fixture and xG cache prepared');
            
          } catch (err) {
            logger.warn({ fixtureId: fixture.fixture.id, error: err }, 'Failed to prepare fixture');
          }
        })
      ).catch((err) => {
        logger.error({ error: err }, 'Error preparing fixtures and xG cache');
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
