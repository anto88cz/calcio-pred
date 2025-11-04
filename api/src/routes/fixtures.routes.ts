/**
 * Routes per Fixtures
 * GET /api/fixtures - Lista fixtures con filtri
 */

import { Router } from 'express';
import { z } from 'zod';
import { fixturesService } from '../services/api-football';
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
