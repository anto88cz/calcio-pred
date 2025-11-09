/**
 * Routes per ML Predictions
 * POST /api/ml-prediction - Genera predizione ML per una partita
 */

import { Router } from 'express';
import { z } from 'zod';
import { mlPredictionAlgorithm } from '../services/ml-prediction';
import redis from '../lib/redis';
import logger from '../utils/logger';
import type { Request, Response, NextFunction } from 'express';

const router = Router();

// Schema validazione body POST
const mlPredictionSchema = z.object({
  fixtureId: z.number().int().positive(),
  homeTeamId: z.number().int().positive(),
  awayTeamId: z.number().int().positive(),
  seasonId: z.number().int().positive(),
  leagueId: z.number().int().positive(),
  homeTeamName: z.string().optional(),
  awayTeamName: z.string().optional(),
});

/**
 * POST /api/ml-prediction
 * Genera una predizione ML completa per una partita
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = mlPredictionSchema.parse(req.body);
    
    logger.info({ fixtureId: input.fixtureId }, '🤖 ML Prediction request received');
    
    // Check cache
    const cacheKey = `ml-prediction:${input.fixtureId}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      logger.info({ fixtureId: input.fixtureId }, '✅ ML Prediction cache hit');
      return res.json({
        ...JSON.parse(cached),
        fromCache: true,
      });
    }
    
    // Genera predizione ML
    const prediction = await mlPredictionAlgorithm.predictMatch({
      fixtureId: input.fixtureId,
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      seasonId: input.seasonId,
      leagueId: input.leagueId,
    });

    // Arricchisci con i nomi delle squadre se disponibili
    if (input.homeTeamName) {
      prediction.homeTeam = input.homeTeamName;
    }
    if (input.awayTeamName) {
      prediction.awayTeam = input.awayTeamName;
    }
    
    // Cache per 30 minuti
    await redis.setex(cacheKey, 1800, JSON.stringify(prediction));
    
    logger.info({ 
      fixtureId: input.fixtureId, 
      confidence: prediction.confidence,
      homeWinProb: prediction.predictions.homeWin,
      drawProb: prediction.predictions.draw,
      awayWinProb: prediction.predictions.awayWin,
    }, '✅ ML Prediction generated successfully');
    
    return res.status(200).json({
      ...prediction,
      fromCache: false,
    });
    
  } catch (error) {
    logger.error({ error }, '❌ ML Prediction error');
    return next(error);
  }
});

/**
 * GET /api/ml-prediction/:fixtureId
 * Recupera una predizione ML già generata (dalla cache)
 */
router.get('/:fixtureId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fixtureId = parseInt(req.params.fixtureId, 10);
    
    if (isNaN(fixtureId)) {
      return res.status(400).json({ error: 'Invalid fixtureId' });
    }
    
    const cacheKey = `ml-prediction:${fixtureId}`;
    const cached = await redis.get(cacheKey);
    
    if (!cached) {
      return res.status(404).json({ 
        error: 'ML Prediction not found. Generate it first using POST /api/ml-prediction' 
      });
    }
    
    logger.info({ fixtureId }, '✅ ML Prediction retrieved from cache');
    
    return res.json({
      ...JSON.parse(cached),
      fromCache: true,
    });
    
  } catch (error) {
    return next(error);
  }
});

export default router;
