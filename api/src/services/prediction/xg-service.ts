/**
 * xG Service - Gestione Expected Goals nel database
 * 
 * Features:
 * - Non sovrascrive valori validi con null
 * - Traccia sources con provider e timestamp
 * - Calcola automaticamente xGA (xG Against)
 * - Gestisce flag missingXg e lowXgConsistency
 */

import { prisma } from '../../lib/prisma';
import logger from '../../utils/logger';
import type { ExpectedGoalsData } from '../api-football';

export interface XGUpdateData {
  fixtureId: number;
  xgData: ExpectedGoalsData;
  providerId: number; // API-FOOTBALL fixture ID
}

export interface XGSource {
  type: 'statistics';
  provider: 'API-FOOTBALL';
  provider_id: number;
  last_update_utc: string;
}

export class XGService {
  /**
   * Salva o aggiorna xG per una predizione
   * Non sovrascrive valori validi con null
   */
  async saveOrUpdateXG(data: XGUpdateData): Promise<void> {
    const { fixtureId, xgData, providerId } = data;

    try {
      // 1. Verifica se esiste già una predizione
      const existingPrediction = await prisma.prediction.findUnique({
        where: { fixtureId },
        select: {
          id: true,
          xgHome: true,
          xgAway: true,
          xgotHome: true,
          xgotAway: true,
          xgSources: true,
        },
      });

      if (!existingPrediction) {
        logger.warn({ fixtureId }, 'Prediction not found, cannot save xG data');
        return;
      }

      // 2. Prepara i nuovi valori (non sovrascrivere validi con null)
      const xgHome = xgData.home.xg ?? existingPrediction.xgHome;
      const xgAway = xgData.away.xg ?? existingPrediction.xgAway;
      const xgotHome = xgData.home.xgot ?? existingPrediction.xgotHome;
      const xgotAway = xgData.away.xgot ?? existingPrediction.xgotAway;

      // 3. Calcola xGA (xG Against = xG avversaria)
      const xgaHome = xgAway; // xGA casa = xG trasferta
      const xgaAway = xgHome; // xGA trasferta = xG casa

      // 4. Determina flag missingXg
      const missingXg = xgHome === null || xgAway === null;

      // 5. Crea source entry
      const newSource: XGSource = {
        type: 'statistics',
        provider: 'API-FOOTBALL',
        provider_id: providerId,
        last_update_utc: new Date().toISOString(),
      };

      // 6. Aggiorna sources (aggiungi nuovo, mantieni storici)
      const existingSources = (existingPrediction.xgSources as XGSource[] | null) || [];
      const updatedSources = [...existingSources, newSource];

      // 7. Update database
      await prisma.prediction.update({
        where: { fixtureId },
        data: {
          xgHome,
          xgAway,
          xgaHome,
          xgaAway,
          xgotHome,
          xgotAway,
          xgLastUpdate: new Date(),
          missingXg,
          xgSources: updatedSources as any,
        },
      });

      logger.info(
        { 
          fixtureId, 
          xgHome, 
          xgAway, 
          xgotHome, 
          xgotAway, 
          missingXg 
        },
        'xG data saved successfully'
      );
    } catch (error) {
      logger.error({ error, fixtureId }, 'Failed to save xG data');
      throw error;
    }
  }

  /**
   * Verifica consistenza xG con storico
   * Imposta flag lowXgConsistency se divergenza > 60%
   */
  async checkXGConsistency(
    fixtureId: number,
    lambdaHome: number,
    lambdaAway: number
  ): Promise<boolean> {
    try {
      const prediction = await prisma.prediction.findUnique({
        where: { fixtureId },
        select: { xgHome: true, xgAway: true },
      });

      if (!prediction || prediction.xgHome === null || prediction.xgAway === null) {
        return false; // No xG data, skip consistency check
      }

      const xgTotal = prediction.xgHome + prediction.xgAway;
      const lambdaTotal = lambdaHome + lambdaAway;

      // Calcola divergenza percentuale
      const divergence = Math.abs(xgTotal - lambdaTotal) / lambdaTotal;
      const lowConsistency = divergence > 0.6; // > 60%

      if (lowConsistency) {
        await prisma.prediction.update({
          where: { fixtureId },
          data: { lowXgConsistency: true },
        });

        logger.warn(
          {
            fixtureId,
            xgTotal: xgTotal.toFixed(2),
            lambdaTotal: lambdaTotal.toFixed(2),
            divergence: (divergence * 100).toFixed(1) + '%',
          },
          'Low xG consistency detected'
        );
      }

      return lowConsistency;
    } catch (error) {
      logger.error({ error, fixtureId }, 'Failed to check xG consistency');
      return false;
    }
  }

  /**
   * Recupera xG data da database
   */
  async getXGData(fixtureId: number): Promise<{
    xgHome: number | null;
    xgAway: number | null;
    xgaHome: number | null;
    xgaAway: number | null;
    xgotHome: number | null;
    xgotAway: number | null;
    missingXg: boolean;
    lowXgConsistency: boolean;
  } | null> {
    try {
      const prediction = await prisma.prediction.findUnique({
        where: { fixtureId },
        select: {
          xgHome: true,
          xgAway: true,
          xgaHome: true,
          xgaAway: true,
          xgotHome: true,
          xgotAway: true,
          missingXg: true,
          lowXgConsistency: true,
        },
      });

      return prediction;
    } catch (error) {
      logger.error({ error, fixtureId }, 'Failed to get xG data');
      return null;
    }
  }

  /**
   * Calcola xG totale per una fixture
   */
  async calculateTotalXG(fixtureId: number): Promise<number | null> {
    try {
      const xgData = await this.getXGData(fixtureId);
      
      if (!xgData || xgData.xgHome === null || xgData.xgAway === null) {
        return null;
      }

      return xgData.xgHome + xgData.xgAway;
    } catch (error) {
      logger.error({ error, fixtureId }, 'Failed to calculate total xG');
      return null;
    }
  }

  /**
   * Batch update xG per multiple fixtures
   */
  async batchUpdateXG(updates: XGUpdateData[]): Promise<{
    success: number;
    failed: number;
  }> {
    let success = 0;
    let failed = 0;

    for (const update of updates) {
      try {
        await this.saveOrUpdateXG(update);
        success++;
      } catch (error) {
        failed++;
        logger.error(
          { error, fixtureId: update.fixtureId },
          'Batch xG update failed for fixture'
        );
      }
    }

    logger.info({ success, failed, total: updates.length }, 'Batch xG update completed');

    return { success, failed };
  }
}

export const xgService = new XGService();
