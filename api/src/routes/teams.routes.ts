/**
 * Teams Routes - Gestione squadre
 */

import { Router } from 'express';
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
 * NOTE: Currently not implemented for Sportsmonks - use seed-common instead
 */
router.post('/load-by-league', async (_req, res) => {
  return res.status(501).json({
    success: false,
    message: 'This endpoint is currently not implemented for Sportsmonks. Use /api/teams/seed-common instead.',
  });
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
