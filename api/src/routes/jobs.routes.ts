/**
 * Jobs Routes - Manual job triggers
 */

import { Router } from 'express';
import { fixturesService } from '../services/sportsmonks';
import prisma from '../lib/prisma';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/jobs/load-today-fixtures
 * Carica manualmente le fixtures di oggi
 */
router.post('/load-today-fixtures', async (_req, res) => {
  try {
    logger.info('Manual fixtures load triggered');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayStr = today.toISOString().split('T')[0];
    
    logger.info({ date: todayStr }, 'Loading today fixtures from Sportsmonks');
    
    let totalFixtures = 0;
    const fixtureDetails = [];
    
    try {
      // Fetch fixtures dalla API Sportsmonks per oggi
      const apiFixtures = await fixturesService.getFixturesByDate(todayStr);
      
      logger.info({ count: apiFixtures.length }, 'Found fixtures for today');
      
      // Salva nel DB usando il formato corretto
      for (const fixture of apiFixtures) {
        const dateObj = new Date(fixture.date);
        
        await prisma.fixture.upsert({
          where: { apiId: fixture.id },
          update: {
            status: fixture.statusShort as any,
            venue: fixture.venue?.name || null,
            date: dateObj,
          },
          create: {
            apiId: fixture.id,
            timestamp: fixture.timestamp,
            date: dateObj,
            timezone: 'UTC',
            leagueId: fixture.league.id,
            leagueName: fixture.league.name,
            leagueCountry: fixture.league.country,
            leagueSeason: fixture.league.season,
            round: '',
            homeTeamId: fixture.homeTeam.id,
            awayTeamId: fixture.awayTeam.id,
            status: fixture.statusShort as any,
            venue: fixture.venue?.name || null,
            referee: null,
          },
        });
        
        // Assicura team esistano
        await prisma.team.upsert({
          where: { apiId: fixture.homeTeam.id },
          update: { name: fixture.homeTeam.name },
          create: {
            apiId: fixture.homeTeam.id,
            name: fixture.homeTeam.name,
            country: fixture.league.country,
          },
        });
        
        await prisma.team.upsert({
          where: { apiId: fixture.awayTeam.id },
          update: { name: fixture.awayTeam.name },
          create: {
            apiId: fixture.awayTeam.id,
            name: fixture.awayTeam.name,
            country: fixture.league.country,
          },
        });
        
        totalFixtures++;
        fixtureDetails.push({
          league: fixture.league.name,
          home: fixture.homeTeam.name,
          away: fixture.awayTeam.name,
          date: fixture.date,
        });
      }
      
    } catch (error) {
      logger.error({ error }, 'Error loading fixtures');
    }
    
    logger.info({ totalFixtures }, 'Manual fixtures load completed');
    
    res.json({
      success: true,
      message: `Loaded ${totalFixtures} fixtures for today`,
      fixtures: fixtureDetails,
    });
    
  } catch (error) {
    logger.error({ error }, 'Error in manual fixtures load');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
