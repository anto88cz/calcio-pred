/**
 * Cron Jobs Scheduler
 * - 06:00: Carica fixtures giornaliere
 * - H-120: Refresh lineup 2h prima
          
          // Calcola predizione se non esiste
          const existingPrediction = await prisma.prediction.findUnique({
            where: { fixtureId: savedFixture.id }, // Use internal DB id
          });
          
          if (!existingPrediction) {
            try {
              void await predictionEngine.calculatePrediction({
                fixtureId: savedFixture.apiId, // Use API id for calculation
                homeTeamId: fixture.homeTeamId,
                awayTeamId: fixture.awayTeamId,
                season: fixture.season,
                leagueId: fixture.leagueId,
              });te finale 30min prima
 */

import cron from 'node-cron';
import { fixturesService, lineupsService, statisticsService } from '../services/api-football';
import { predictionEngine, xgService } from '../services/prediction';
import { mapAPIFixturesToFlat } from '../utils/fixtureMapper';
import prisma from '../lib/prisma';
import logger from '../utils/logger';
import { withLock } from '../utils/redisLock';
import { schedulerConfig } from '../config';
import { startXGUpdateJob } from './xg-update.job';

// ============================================
// JOB 1: DAILY FIXTURES (06:00)
// ============================================

/**
 * Carica fixtures giornaliere per le leghe configurate
 */
async function dailyFixturesJob() {
  logger.info('Starting daily fixtures job');
  
  const result = await withLock('daily-fixtures', 600, async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const season = today.getFullYear();
    const leagueIds = schedulerConfig.leagueIds;
    
    let totalFixtures = 0;
    let totalPredictions = 0;
    
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
        
        logger.info({ leagueId, count: relevantFixtures.length }, 'Found fixtures');
        
        // Salva nel DB
        for (const fixture of relevantFixtures) {
          void await prisma.fixture.upsert({
            where: { apiId: fixture.apiId },
            update: {
              status: fixture.statusShort as any, // Will be mapped to enum
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
          
          // Calcola predizione se non esiste
          const existingPrediction = await prisma.prediction.findUnique({
            where: { fixtureId: fixture.fixtureId },
          });
          
          if (!existingPrediction) {
            try {
              void await predictionEngine.calculatePrediction({
                fixtureId: fixture.fixtureId,
                homeTeamId: fixture.homeTeamId,
                awayTeamId: fixture.awayTeamId,
                season: fixture.season,
                leagueId: fixture.leagueId,
              });
              
              // Salva predizione (omesso per brevità - vedi predictions.routes.ts)
              logger.info({ fixtureId: fixture.fixtureId }, 'Prediction calculated');
              totalPredictions++;
            } catch (error) {
              logger.error({ error, fixtureId: fixture.fixtureId }, 'Failed to calculate prediction');
            }
          }
        }
        
      } catch (error) {
        logger.error({ error, leagueId }, 'Failed to process league');
      }
    }
    
    // Log job
    await prisma.jobLog.create({
      data: {
        jobName: 'DAILY_FIXTURES',
        jobType: 'DAILY_FIXTURES',
        status: 'SUCCESS',
        executedAt: new Date(),
        message: `Loaded ${totalFixtures} fixtures, calculated ${totalPredictions} predictions`,
      },
    });
    
    logger.info({ totalFixtures, totalPredictions }, 'Daily fixtures job completed');
    
    return { totalFixtures, totalPredictions };
  });
  
  if (!result) {
    logger.warn('Daily fixtures job skipped (lock held)');
  }
}

// ============================================
// JOB 2: LINEUP REFRESH (H-120)
// ============================================

/**
 * Aggiorna lineup per partite tra 2-3 ore
 */
async function lineupRefreshJob() {
  logger.info('Starting lineup refresh job');
  
  const result = await withLock('lineup-refresh', 300, async () => {
    const now = new Date();
    const in2hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const in3hours = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    
    // Trova fixtures tra 2 e 3 ore
    const fixtures = await prisma.fixture.findMany({
      where: {
        date: {
          gte: in2hours,
          lte: in3hours,
        },
        status: 'NS', // Not Started
      },
      include: {
        prediction: true,
      },
    });
    
    logger.info({ count: fixtures.length }, 'Found fixtures for lineup refresh');
    
    let updated = 0;
    
    for (const fixture of fixtures) {
      try {
        // Fetch lineup da API-FOOTBALL
        const lineups = await lineupsService.getLineupsByFixture(fixture.apiId);
        
        if (lineups.length === 2) {
          // Ricalcola predizione con lineup aggiornato
          void await predictionEngine.calculatePrediction({
            fixtureId: fixture.apiId,
            homeTeamId: fixture.homeTeamId,
            awayTeamId: fixture.awayTeamId,
            season: fixture.leagueSeason,
            leagueId: fixture.leagueId,
          });
          
          logger.info({ fixtureId: fixture.apiId }, 'Lineup refreshed, prediction updated');
          updated++;
        }
        // Aggiorna xG per la fixture (opzionale) - non blocca il job
        try {
          const xgData = await statisticsService.getExpectedGoals(fixture.apiId);
          if (xgData) {
            const dbFixtureId = (fixture as any).id ?? fixture.apiId;
            await xgService.saveOrUpdateXG({ fixtureId: dbFixtureId, xgData, providerId: fixture.apiId });
            logger.debug({ fixtureId: dbFixtureId, apiId: fixture.apiId }, 'xG data saved during lineup refresh');
          }
        } catch (err) {
          logger.warn({ error: err, fixtureId: fixture.apiId }, 'Failed to fetch/save xG during lineup refresh');
        }
      } catch (error) {
        logger.error({ error, fixtureId: fixture.apiId }, 'Failed to refresh lineup');
      }
    }
    
    await prisma.jobLog.create({
      data: {
        jobName: 'LINEUP_REFRESH',
        jobType: 'LINEUP_REFRESH',
        status: 'SUCCESS',
        executedAt: new Date(),
        message: `Updated ${updated}/${fixtures.length} fixtures`,
      },
    });
    
    logger.info({ updated, total: fixtures.length }, 'Lineup refresh job completed');
    
    return { updated, total: fixtures.length };
  });
  
  if (!result) {
    logger.warn('Lineup refresh job skipped (lock held)');
  }
}

// ============================================
// JOB 3: FINAL UPDATE (H-30)
// ============================================

/**
 * Update finale 30min prima del match
 */
async function finalUpdateJob() {
  logger.info('Starting final update job');
  
  const result = await withLock('final-update', 300, async () => {
    const now = new Date();
    const in30min = new Date(now.getTime() + 30 * 60 * 1000);
    const in45min = new Date(now.getTime() + 45 * 60 * 1000);
    
    // Trova fixtures tra 30 e 45 minuti
    const fixtures = await prisma.fixture.findMany({
      where: {
        date: {
          gte: in30min,
          lte: in45min,
        },
        status: 'NS',
      },
      include: {
        prediction: true,
      },
    });
    
    logger.info({ count: fixtures.length }, 'Found fixtures for final update');
    
    let updated = 0;
    
    for (const fixture of fixtures) {
      try {
        // Try to fetch and persist xG data before final update (optional)
        try {
          const xgData = await statisticsService.getExpectedGoals(fixture.apiId);
          if (xgData) {
            const dbFixtureId = (fixture as any).id ?? fixture.apiId;
            await xgService.saveOrUpdateXG({ fixtureId: dbFixtureId, xgData, providerId: fixture.apiId });
            logger.debug({ fixtureId: dbFixtureId, apiId: fixture.apiId }, 'xG data saved during final update');
          }
        } catch (err) {
          logger.warn({ error: err, fixtureId: fixture.apiId }, 'Failed to fetch/save xG during final update');
        }

        // Ricalcola predizione finale
        void await predictionEngine.calculatePrediction({
          fixtureId: fixture.apiId,
          homeTeamId: fixture.homeTeamId,
          awayTeamId: fixture.awayTeamId,
          season: fixture.leagueSeason,
          leagueId: fixture.leagueId,
        });

        logger.info({ fixtureId: fixture.apiId }, 'Final prediction updated');
        updated++;
      } catch (error) {
        logger.error({ error, fixtureId: fixture.apiId }, 'Failed final update');
      }
    }
    
    await prisma.jobLog.create({
      data: {
        jobName: 'FINAL_UPDATE',
        jobType: 'FINAL_UPDATE',
        status: 'SUCCESS',
        executedAt: new Date(),
        message: `Updated ${updated}/${fixtures.length} fixtures`,
      },
    });
    
    logger.info({ updated, total: fixtures.length }, 'Final update job completed');
    
    return { updated, total: fixtures.length };
  });
  
  if (!result) {
    logger.warn('Final update job skipped (lock held)');
  }
}

// ============================================
// SCHEDULER SETUP
// ============================================

export function startScheduler() {
  logger.info('Starting cron scheduler');
  
  // Job 1: Daily fixtures at 06:00
  cron.schedule('0 6 * * *', async () => {
    logger.info('Triggering daily fixtures job (06:00)');
    await dailyFixturesJob();
  }, {
    timezone: schedulerConfig.timezone,
  });
  
  // Job 2: Lineup refresh every 15 minutes (checks H-120)
  cron.schedule('*/15 * * * *', async () => {
    logger.debug('Triggering lineup refresh check (every 15min)');
    await lineupRefreshJob();
  }, {
    timezone: schedulerConfig.timezone,
  });
  
  // Job 3: Final update every 10 minutes (checks H-30)
  cron.schedule('*/10 * * * *', async () => {
    logger.debug('Triggering final update check (every 10min)');
    await finalUpdateJob();
  }, {
    timezone: schedulerConfig.timezone,
  });
  
  // Job 4: xG Update at 03:00 (builds xG cache gradually)
  startXGUpdateJob();
  
  logger.info('Cron scheduler started successfully');
}

// Export job functions per testing manuale
export { dailyFixturesJob, lineupRefreshJob, finalUpdateJob };
