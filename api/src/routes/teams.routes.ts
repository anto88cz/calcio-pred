/**
 * Teams Routes - Gestione squadre
 */

import { Router } from 'express';
import { z } from 'zod';
import { teamsService } from '../services/api-football';
import prisma from '../lib/prisma';
import logger from '../utils/logger';
import { seedCommonTeams } from '../utils/seedTeams';

const router = Router();

/**
 * POST /api/teams/seed-common
 * Carica squadre comuni (Champions, top leghe)
 */
router.post('/seed-common', async (_req, res) => {
  try {
    logger.info('Seeding common teams');
    
    const count = await seedCommonTeams();
    
    return res.json({
      success: true,
      message: `Loaded ${count} common teams`,
      count,
    });
    
  } catch (error) {
    logger.error({ error }, 'Error seeding common teams');
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/teams/load-by-league
 * Carica tutte le squadre di una lega
 */
router.post('/load-by-league', async (req, res) => {
  try {
    const schema = z.object({
      leagueId: z.number().int().positive(),
      season: z.number().int().positive(),
    });
    
    const input = schema.parse(req.body);
    
    logger.info({ leagueId: input.leagueId, season: input.season }, 'Loading teams for league');
    
    // Carica squadre dalla API
    const teams = await teamsService.getTeamsByLeague(input.leagueId, input.season);
    
    logger.info({ count: teams.length }, 'Teams fetched from API');
    
    if (!teams || teams.length === 0) {
      return res.json({
        success: true,
        message: 'No teams found for this league/season',
        teams: [],
      });
    }
    
    let savedCount = 0;
    
    // Salva nel database
    for (const team of teams) {
      try {
        await prisma.team.upsert({
          where: { apiId: team.id },
          update: {
            name: team.name,
            logo: team.logo || null,
            country: team.country || 'Unknown',
          },
          create: {
            apiId: team.id,
            name: team.name,
            logo: team.logo || null,
            country: team.country || 'Unknown',
          },
        });
        savedCount++;
      } catch (dbError) {
        logger.error({ dbError, team: team.name }, 'Error saving team');
      }
    }
    
    logger.info({ leagueId: input.leagueId, count: savedCount }, 'Teams loaded successfully');
    
    return res.json({
      success: true,
      message: `Loaded ${savedCount} teams`,
      teams: teams.slice(0, 10).map(t => ({ id: t.id, name: t.name })), // Solo primi 10 per non appesantire
    });
    
  } catch (error) {
    logger.error({ error, message: error instanceof Error ? error.message : 'Unknown' }, 'Error loading teams');
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : undefined,
    });
  }
});

/**
 * GET /api/teams/search
 * Cerca squadre per nome
 */
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q as string;
    
    if (!query || query.length < 2) {
      return res.json({ teams: [] });
    }
    
    const teams = await prisma.team.findMany({
      where: {
        name: {
          contains: query,
          mode: 'insensitive',
        },
      },
      take: 20,
      select: {
        id: true,
        apiId: true,
        name: true,
        country: true,
        logo: true,
      },
    });
    
    return res.json({ teams });
    
  } catch (error) {
    logger.error({ error }, 'Error searching teams');
    return res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /api/teams
 * Lista tutte le squadre
 */
router.get('/', async (_req, res) => {
  try {
    const teams = await prisma.team.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        apiId: true,
        name: true,
        country: true,
      },
    });
    
    res.json({ teams, count: teams.length });
    
  } catch (error) {
    logger.error({ error }, 'Error fetching teams');
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

export default router;
