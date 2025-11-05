/**
 * Jobs Routes - Manual job triggers
 */

import { Router } from 'express';
import { fixturesService } from '../services/api-football';
import { mapAPIFixturesToFlat } from '../utils/fixtureMapper';
import prisma from '../lib/prisma';
import logger from '../utils/logger';
import { schedulerConfig } from '../config';

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
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Calcola stagione dinamicamente (anno corrente o precedente se prima di agosto)
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-11
    const season = currentMonth >= 7 ? currentYear : currentYear - 1; // 7 = agosto
    
    logger.info({ season, date: today.toISOString() }, 'Using season for fixtures');
    
    const leagueIds = schedulerConfig.leagueIds;
    
    let totalFixtures = 0;
    const fixtureDetails = [];
    
    for (const leagueId of leagueIds) {
      try {
        logger.info({ leagueId, season }, 'Fetching fixtures for league');
        
        // Fetch fixtures dalla API
        const apiFixtures = await fixturesService.getFixturesByLeague(leagueId, season);
        
        // Converti in formato piatto
        const fixtures = mapAPIFixturesToFlat(apiFixtures);
        
        // Filtra solo oggi e domani
        const relevantFixtures = fixtures.filter(f => {
          const fixtureDate = new Date(f.date);
          return fixtureDate >= today && fixtureDate < tomorrow;
        });
        
        logger.info({ leagueId, count: relevantFixtures.length }, 'Found fixtures for today');
        
        // Salva nel DB
        for (const fixture of relevantFixtures) {
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
              timestamp: fixture.timestamp,
              date: fixture.date,
              timezone: fixture.timezone,
              leagueId: fixture.leagueId,
              leagueName: fixture.leagueName,
              leagueCountry: fixture.leagueCountry,
              leagueSeason: fixture.season,
              round: fixture.round,
              homeTeamId: fixture.homeTeamId,
              awayTeamId: fixture.awayTeamId,
              status: fixture.statusShort as any,
              venue: fixture.venue,
              referee: fixture.referee,
            },
          });
          
          // Assicura team esistano
          await prisma.team.upsert({
            where: { apiId: fixture.homeTeamId },
            update: {},
            create: {
              apiId: fixture.homeTeamId,
              name: `Team ${fixture.homeTeamId}`,
              country: fixture.leagueCountry,
            },
          });
          
          await prisma.team.upsert({
            where: { apiId: fixture.awayTeamId },
            update: {},
            create: {
              apiId: fixture.awayTeamId,
              name: `Team ${fixture.awayTeamId}`,
              country: fixture.leagueCountry,
            },
          });
          
          totalFixtures++;
          fixtureDetails.push({
            league: fixture.leagueName,
            home: `Team ${fixture.homeTeamId}`,
            away: `Team ${fixture.awayTeamId}`,
            date: fixture.date,
          });
        }
        
      } catch (error) {
        logger.error({ leagueId, error }, 'Error loading fixtures for league');
      }
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
