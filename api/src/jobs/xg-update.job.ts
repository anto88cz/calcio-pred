/**
 * xG Update Job - Aggiornamento notturno dati Expected Goals
 * 
 * Questo job esegue ogni notte alle 3:00 AM per:
 * 1. Trovare partite degli ultimi 30 giorni SENZA dati xG
 * 2. Fetchare xG reali da Sportsmonks
 * 3. Salvare nel database per costruire gradualmente la cache
 * 
 * Parte del sistema xG Real Hybrid Cache (+15-20% accuracy)
 */

import * as cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { statisticsService } from '../services/sportsmonks';
import logger from '../utils/logger';

/**
 * Aggiorna xG per partite recenti che non hanno ancora dati xG
 */
async function updateMissingXG(): Promise<void> {
  try {
    logger.info('Starting xG update job');

    // Calcola data 30 giorni fa
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Trova partite finite degli ultimi 30 giorni SENZA xG
    const fixturesWithoutXG = await prisma.fixture.findMany({
      where: {
        status: 'FINISHED',
        date: {
          gte: thirtyDaysAgo
        },
        xg_home: null, // xG non ancora fetchato
      },
      include: {
        homeTeam: {
          select: { name: true }
        },
        awayTeam: {
          select: { name: true }
        }
      },
      orderBy: {
        date: 'desc'
      },
      take: 100 // Processa max 100 partite per notte (limite sicurezza API)
    });

    logger.info({ 
      count: fixturesWithoutXG.length,
      dateThreshold: thirtyDaysAgo.toISOString()
    }, 'Found fixtures without xG data');

    if (fixturesWithoutXG.length === 0) {
      logger.info('No fixtures to update - all recent matches have xG data');
      return;
    }

    // Aggiorna xG per ogni partita (batch processing)
    let successCount = 0;
    let failCount = 0;

    for (const fixture of fixturesWithoutXG) {
      try {
        // Fetch xG data from Sportsmonks
        const xgData = await statisticsService.getExpectedGoals(fixture.apiId);
        
        if (xgData) {
          // Update fixture with xG data
          await prisma.fixture.update({
            where: { id: fixture.id },
            data: {
              xg_home: xgData.homeXg,
              xg_away: xgData.awayXg,
            },
          });
          
          successCount++;
          logger.debug({
            fixtureId: fixture.apiId,
            match: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
            date: fixture.date,
            xgHome: xgData.homeXg,
            xgAway: xgData.awayXg,
          }, 'xG data cached successfully');
        } else {
          failCount++;
        }

        // Rate limiting: pausa 200ms tra chiamate (max 5/sec)
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        failCount++;
        logger.warn({
          error,
          fixtureId: fixture.apiId
        }, 'Failed to fetch xG for fixture');
      }
    }

    logger.info({
      total: fixturesWithoutXG.length,
      success: successCount,
      failed: failCount,
      cacheGrowth: `+${successCount} fixtures with xG`
    }, 'xG update job completed');

  } catch (error) {
    logger.error({ error }, 'xG update job failed');
    throw error;
  }
}

/**
 * Cron schedule: Ogni notte alle 3:00 AM
 * Pattern: '0 3 * * *' = minuto 0, ora 3, ogni giorno
 * 
 * node-cron usa formato: second(opzionale) minute hour day month weekday
 * Non include timezone, usa timezone del sistema
 */
export function startXGUpdateJob(): void {
  cron.schedule('0 3 * * *', async () => {
    logger.info('xG update job triggered');
    try {
      await updateMissingXG();
    } catch (error) {
      logger.error({ error }, 'xG update job error');
    }
  }, {
    timezone: 'Europe/Rome'
  });

  logger.info('xG update cron job scheduled at 3:00 AM daily');
}

/**
 * Esegui immediatamente (per testing manuale)
 * Usa: import { runXGUpdateNow } from './xg-update.job'
 */
export async function runXGUpdateNow(): Promise<void> {
  logger.info('Running xG update manually');
  await updateMissingXG();
}
