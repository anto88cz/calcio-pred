/**
 * Routes per Predictions
 * GET /api/predictions - Lista predizioni con filtri
 * GET /api/predictions/:fixtureId - Dettaglio predizione
 * POST /api/predictions/calculate - Calcola nuova predizione
 */

import { Router } from 'express';
import { z } from 'zod';
import { predictionEngine } from '../services/prediction';
import prisma from '../lib/prisma';
import redis from '../lib/redis';
import logger from '../utils/logger';
import type { Request, Response, NextFunction } from 'express';

const router = Router();

// Schema validazione query params
const predictionsQuerySchema = z.object({
  date: z.string().optional(), // YYYY-MM-DD
  days: z.coerce.number().int().min(0).max(7).optional().default(0),
  leagueId: z.coerce.number().int().optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  strengthFilter: z.enum(['ALL', 'GIOCALA', 'STRONG_PLUS']).optional().default('ALL'),
});

// Schema validazione body POST
const calculatePredictionSchema = z.object({
  fixtureId: z.number().int().positive(),
  homeTeamId: z.number().int().positive(),
  awayTeamId: z.number().int().positive(),
  season: z.number().int().positive(),
  leagueId: z.number().int().positive(),
});

/**
 * GET /api/predictions
 * Lista predizioni con filtri
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = predictionsQuerySchema.parse(req.query);
    
    // Determina data target
    const targetDate = params.date ? new Date(params.date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    
    const startDate = new Date(targetDate);
    const endDate = new Date(targetDate);
    endDate.setDate(endDate.getDate() + params.days);
    
    logger.info({ 
      startDate: startDate.toISOString(), 
      endDate: endDate.toISOString(),
      strengthFilter: params.strengthFilter,
    }, 'Fetching predictions');
    
    // Cache key
    const cacheKey = `predictions:${startDate.toISOString()}:${endDate.toISOString()}:${params.strengthFilter}:${params.minConfidence || 0}`;
    
    // Prova cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug({ cacheKey }, 'Cache hit');
      return res.json(JSON.parse(cached));
    }
    
    // Query base
    const predictions = await prisma.prediction.findMany({
      where: {
        fixture: {
          date: {
            gte: startDate,
            lte: endDate,
          },
          ...(params.leagueId && { leagueId: params.leagueId }),
        },
        ...(params.minConfidence && {
          confidence: {
            gte: params.minConfidence,
          },
        }),
      },
      include: {
        fixture: {
          include: {
            homeTeam: true,
            awayTeam: true,
          },
        },
      },
      orderBy: {
        fixture: {
          date: 'asc',
        },
      },
    });
    
    // Applica filtro forza
    let filteredPredictions = predictions;
    
    if (params.strengthFilter === 'GIOCALA') {
      // Solo GIOCALA (almeno un mercato)
      filteredPredictions = predictions.filter(p => 
        p.strength1X2 === 'GIOCALA' ||
        p.strengthOver05 === 'GIOCALA' ||
        p.strengthOver15 === 'GIOCALA' ||
        p.strengthOver25 === 'GIOCALA' ||
        p.strengthOver35 === 'GIOCALA' ||
        p.strengthOver45 === 'GIOCALA' ||
        p.strengthBtts === 'GIOCALA' ||
        p.strength1X === 'GIOCALA' ||
        p.strength12 === 'GIOCALA' ||
        p.strengthX2 === 'GIOCALA'
      );
    } else if (params.strengthFilter === 'STRONG_PLUS') {
      // GIOCALA o STRONG
      filteredPredictions = predictions.filter(p => {
        const strengths = [
          p.strength1X2,
          p.strengthOver05,
          p.strengthOver15,
          p.strengthOver25,
          p.strengthOver35,
          p.strengthOver45,
          p.strengthBtts,
          p.strength1X,
          p.strength12,
          p.strengthX2,
        ];
        return strengths.some(s => s === 'GIOCALA' || s === 'STRONG');
      });
    }
    
    // Cache risultato (2 minuti)
    await redis.setex(cacheKey, 120, JSON.stringify(filteredPredictions));
    
    return res.json(filteredPredictions);
    
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/predictions/league/:leagueId
 * Predizioni per specifica league
 */
router.get('/league/:leagueId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const leagueId = parseInt(req.params.leagueId, 10);
    
    if (isNaN(leagueId)) {
      return res.status(400).json({ error: 'Invalid leagueId' });
    }
    
    // Cache key per le predizioni della league
    const cacheKey = `predictions:league:${leagueId}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      logger.debug({ leagueId }, 'Cache hit for league predictions');
      return res.json(JSON.parse(cached));
    }
    
    // Ottieni predizioni per la league
    const predictions = await prisma.prediction.findMany({
      where: {
        fixture: {
          leagueId,
          date: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // prossimi 7 giorni
          },
        },
      },
      include: {
        fixture: {
          include: {
            homeTeam: true,
            awayTeam: true,
          },
        },
      },
      orderBy: {
        fixture: {
          date: 'asc',
        },
      },
      take: 50, // limite ragionevole
    });
    
    const result = {
      success: true,
      leagueId,
      predictions: predictions.map(prediction => ({
        id: prediction.id.toString(),
        homeTeam: prediction.fixture.homeTeam.name,
        awayTeam: prediction.fixture.awayTeam.name,
        league: `League ${leagueId}`,
        date: prediction.fixture.date.toISOString(),
        predictions: {
          homeGoals: prediction.lambdaHome,
          awayGoals: prediction.lambdaAway,
          totalGoals: prediction.lambdaHome + prediction.lambdaAway,
          prob1: prediction.prob1Final * 100,
          probX: prediction.probXFinal * 100,
          prob2: prediction.prob2Final * 100,
        },
        confidence: prediction.confidence * 100,
        strength: prediction.strength1X2,
        valueBets: [], // TODO: implementare value bets
      })),
    };
    
    // Cache per 10 minuti
    await redis.setex(cacheKey, 600, JSON.stringify(result));
    
    logger.info({ leagueId, count: predictions.length }, 'League predictions retrieved');
    
    return res.json(result);
    
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/predictions/:fixtureId
 * Dettaglio singola predizione
 */
router.get('/:fixtureId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fixtureId = parseInt(req.params.fixtureId, 10);
    
    if (isNaN(fixtureId)) {
      return res.status(400).json({ error: 'Invalid fixtureId' });
    }
    
    const prediction = await prisma.prediction.findUnique({
      where: { fixtureId },
      include: {
        fixture: {
          include: {
            homeTeam: true,
            awayTeam: true,
          },
        },
      },
    });
    
    if (!prediction) {
      return res.status(404).json({ error: 'Prediction not found' });
    }
    
    return res.json(prediction);
    
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/predictions/calculate
 * Calcola e salva nuova predizione
 */
router.post('/calculate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = calculatePredictionSchema.parse(req.body);
    
    logger.info({ fixtureId: input.fixtureId }, 'Calculating prediction');
    
    // Verifica che la fixture esista
    const fixture = await prisma.fixture.findUnique({
      where: { apiId: input.fixtureId },
    });
    
    if (!fixture) {
      return res.status(404).json({ error: 'Fixture not found. Load fixtures first.' });
    }
    
    // Calcola predizione
    const predictionResult = await predictionEngine.calculatePrediction(input);
    
    // Salva nel database
    const savedPrediction = await prisma.prediction.upsert({
      where: { fixtureId: input.fixtureId },
      update: {
        // Confidence
        confidence: predictionResult.confidence,
        confidenceLevel: predictionResult.confidenceLevel,
        
        // Metadata
        homeMatchesUsed: predictionResult.homeMatchesUsed,
        awayMatchesUsed: predictionResult.awayMatchesUsed,
        dataQuality: predictionResult.dataQuality,
        hasInjuries: predictionResult.hasInjuries,
        hasLineup: predictionResult.hasLineup,
        
        // 1X2
        prob1Empiric: predictionResult.market1X2.empiric.prob1,
        probXEmpiric: predictionResult.market1X2.empiric.probX,
        prob2Empiric: predictionResult.market1X2.empiric.prob2,
        prob1Poisson: predictionResult.market1X2.poisson.prob1,
        probXPoisson: predictionResult.market1X2.poisson.probX,
        prob2Poisson: predictionResult.market1X2.poisson.prob2,
        prob1Final: predictionResult.market1X2.final.prob1,
        probXFinal: predictionResult.market1X2.final.probX,
        prob2Final: predictionResult.market1X2.final.prob2,
        strength1X2: predictionResult.market1X2.strength,
        
        // Under/Over 0.5
        probUnder05Empiric: predictionResult.marketUnderOver['0.5'].empiric.under,
        probOver05Empiric: predictionResult.marketUnderOver['0.5'].empiric.over,
        probUnder05Poisson: predictionResult.marketUnderOver['0.5'].poisson.under,
        probOver05Poisson: predictionResult.marketUnderOver['0.5'].poisson.over,
        probUnder05Final: predictionResult.marketUnderOver['0.5'].final.under,
        probOver05Final: predictionResult.marketUnderOver['0.5'].final.over,
        strengthOver05: predictionResult.marketUnderOver['0.5'].strength,
        
        // Under/Over 1.5
        probUnder15Empiric: predictionResult.marketUnderOver['1.5'].empiric.under,
        probOver15Empiric: predictionResult.marketUnderOver['1.5'].empiric.over,
        probUnder15Poisson: predictionResult.marketUnderOver['1.5'].poisson.under,
        probOver15Poisson: predictionResult.marketUnderOver['1.5'].poisson.over,
        probUnder15Final: predictionResult.marketUnderOver['1.5'].final.under,
        probOver15Final: predictionResult.marketUnderOver['1.5'].final.over,
        strengthOver15: predictionResult.marketUnderOver['1.5'].strength,
        
        // Under/Over 2.5
        probUnder25Empiric: predictionResult.marketUnderOver['2.5'].empiric.under,
        probOver25Empiric: predictionResult.marketUnderOver['2.5'].empiric.over,
        probUnder25Poisson: predictionResult.marketUnderOver['2.5'].poisson.under,
        probOver25Poisson: predictionResult.marketUnderOver['2.5'].poisson.over,
        probUnder25Final: predictionResult.marketUnderOver['2.5'].final.under,
        probOver25Final: predictionResult.marketUnderOver['2.5'].final.over,
        strengthOver25: predictionResult.marketUnderOver['2.5'].strength,
        
        // Under/Over 3.5
        probUnder35Empiric: predictionResult.marketUnderOver['3.5'].empiric.under,
        probOver35Empiric: predictionResult.marketUnderOver['3.5'].empiric.over,
        probUnder35Poisson: predictionResult.marketUnderOver['3.5'].poisson.under,
        probOver35Poisson: predictionResult.marketUnderOver['3.5'].poisson.over,
        probUnder35Final: predictionResult.marketUnderOver['3.5'].final.under,
        probOver35Final: predictionResult.marketUnderOver['3.5'].final.over,
        strengthOver35: predictionResult.marketUnderOver['3.5'].strength,
        
        // Under/Over 4.5
        probUnder45Empiric: predictionResult.marketUnderOver['4.5'].empiric.under,
        probOver45Empiric: predictionResult.marketUnderOver['4.5'].empiric.over,
        probUnder45Poisson: predictionResult.marketUnderOver['4.5'].poisson.under,
        probOver45Poisson: predictionResult.marketUnderOver['4.5'].poisson.over,
        probUnder45Final: predictionResult.marketUnderOver['4.5'].final.under,
        probOver45Final: predictionResult.marketUnderOver['4.5'].final.over,
        strengthOver45: predictionResult.marketUnderOver['4.5'].strength,
        
        // BTTS
        probBttsYesEmpiric: predictionResult.marketBTTS.empiric.yes,
        probBttsNoEmpiric: predictionResult.marketBTTS.empiric.no,
        probBttsYesPoisson: predictionResult.marketBTTS.poisson.yes,
        probBttsNoPoisson: predictionResult.marketBTTS.poisson.no,
        probBttsYesFinal: predictionResult.marketBTTS.final.yes,
        probBttsNoFinal: predictionResult.marketBTTS.final.no,
        strengthBtts: predictionResult.marketBTTS.strength,
        
        // Doppia Chance
        prob1XEmpiric: predictionResult.marketDoubleChance['1X'].empiric.prob,
        prob1XPoisson: predictionResult.marketDoubleChance['1X'].poisson.prob,
        prob1XFinal: predictionResult.marketDoubleChance['1X'].final.prob,
        strength1X: predictionResult.marketDoubleChance['1X'].strength,
        
        prob12Empiric: predictionResult.marketDoubleChance['12'].empiric.prob,
        prob12Poisson: predictionResult.marketDoubleChance['12'].poisson.prob,
        prob12Final: predictionResult.marketDoubleChance['12'].final.prob,
        strength12: predictionResult.marketDoubleChance['12'].strength,
        
        probX2Empiric: predictionResult.marketDoubleChance['X2'].empiric.prob,
        probX2Poisson: predictionResult.marketDoubleChance['X2'].poisson.prob,
        probX2Final: predictionResult.marketDoubleChance['X2'].final.prob,
        strengthX2: predictionResult.marketDoubleChance['X2'].strength,
        
        // Poisson params
        lambdaHome: predictionResult.poissonParams.lambdaHome,
        lambdaAway: predictionResult.poissonParams.lambdaAway,
        homeAdvantage: predictionResult.poissonParams.homeAdvantage,
        
        // xG data (optional)
        ...(predictionResult.xgModel && {
          xgHome: predictionResult.xgModel.home,
          xgAway: predictionResult.xgModel.away,
          xgotHome: predictionResult.xgModel.xgotHome,
          xgotAway: predictionResult.xgModel.xgotAway,
          xgaHome: predictionResult.xgModel.away, // xGA = xG opponent
          xgaAway: predictionResult.xgModel.home,
        }),
        ...(predictionResult.xgFlags && {
          missingXg: predictionResult.xgFlags.missingXg,
        }),
        
        // Timestamp
        calculatedAt: predictionResult.calculatedAt,
        lastUpdate: new Date(),
      },
      create: {
        fixtureId: input.fixtureId,
        providerFixtureId: input.fixtureId,
        
        // Confidence
        confidence: predictionResult.confidence,
        confidenceLevel: predictionResult.confidenceLevel,
        
        // Metadata
        homeMatchesUsed: predictionResult.homeMatchesUsed,
        awayMatchesUsed: predictionResult.awayMatchesUsed,
        dataQuality: predictionResult.dataQuality,
        hasInjuries: predictionResult.hasInjuries,
        hasLineup: predictionResult.hasLineup,
        
        // 1X2
        prob1Empiric: predictionResult.market1X2.empiric.prob1,
        probXEmpiric: predictionResult.market1X2.empiric.probX,
        prob2Empiric: predictionResult.market1X2.empiric.prob2,
        prob1Poisson: predictionResult.market1X2.poisson.prob1,
        probXPoisson: predictionResult.market1X2.poisson.probX,
        prob2Poisson: predictionResult.market1X2.poisson.prob2,
        prob1Final: predictionResult.market1X2.final.prob1,
        probXFinal: predictionResult.market1X2.final.probX,
        prob2Final: predictionResult.market1X2.final.prob2,
        strength1X2: predictionResult.market1X2.strength,
        
        // Under/Over 0.5
        probUnder05Empiric: predictionResult.marketUnderOver['0.5'].empiric.under,
        probOver05Empiric: predictionResult.marketUnderOver['0.5'].empiric.over,
        probUnder05Poisson: predictionResult.marketUnderOver['0.5'].poisson.under,
        probOver05Poisson: predictionResult.marketUnderOver['0.5'].poisson.over,
        probUnder05Final: predictionResult.marketUnderOver['0.5'].final.under,
        probOver05Final: predictionResult.marketUnderOver['0.5'].final.over,
        strengthOver05: predictionResult.marketUnderOver['0.5'].strength,
        
        // Under/Over 1.5
        probUnder15Empiric: predictionResult.marketUnderOver['1.5'].empiric.under,
        probOver15Empiric: predictionResult.marketUnderOver['1.5'].empiric.over,
        probUnder15Poisson: predictionResult.marketUnderOver['1.5'].poisson.under,
        probOver15Poisson: predictionResult.marketUnderOver['1.5'].poisson.over,
        probUnder15Final: predictionResult.marketUnderOver['1.5'].final.under,
        probOver15Final: predictionResult.marketUnderOver['1.5'].final.over,
        strengthOver15: predictionResult.marketUnderOver['1.5'].strength,
        
        // Under/Over 2.5
        probUnder25Empiric: predictionResult.marketUnderOver['2.5'].empiric.under,
        probOver25Empiric: predictionResult.marketUnderOver['2.5'].empiric.over,
        probUnder25Poisson: predictionResult.marketUnderOver['2.5'].poisson.under,
        probOver25Poisson: predictionResult.marketUnderOver['2.5'].poisson.over,
        probUnder25Final: predictionResult.marketUnderOver['2.5'].final.under,
        probOver25Final: predictionResult.marketUnderOver['2.5'].final.over,
        strengthOver25: predictionResult.marketUnderOver['2.5'].strength,
        
        // Under/Over 3.5
        probUnder35Empiric: predictionResult.marketUnderOver['3.5'].empiric.under,
        probOver35Empiric: predictionResult.marketUnderOver['3.5'].empiric.over,
        probUnder35Poisson: predictionResult.marketUnderOver['3.5'].poisson.under,
        probOver35Poisson: predictionResult.marketUnderOver['3.5'].poisson.over,
        probUnder35Final: predictionResult.marketUnderOver['3.5'].final.under,
        probOver35Final: predictionResult.marketUnderOver['3.5'].final.over,
        strengthOver35: predictionResult.marketUnderOver['3.5'].strength,
        
        // Under/Over 4.5
        probUnder45Empiric: predictionResult.marketUnderOver['4.5'].empiric.under,
        probOver45Empiric: predictionResult.marketUnderOver['4.5'].empiric.over,
        probUnder45Poisson: predictionResult.marketUnderOver['4.5'].poisson.under,
        probOver45Poisson: predictionResult.marketUnderOver['4.5'].poisson.over,
        probUnder45Final: predictionResult.marketUnderOver['4.5'].final.under,
        probOver45Final: predictionResult.marketUnderOver['4.5'].final.over,
        strengthOver45: predictionResult.marketUnderOver['4.5'].strength,
        
        // BTTS
        probBttsYesEmpiric: predictionResult.marketBTTS.empiric.yes,
        probBttsNoEmpiric: predictionResult.marketBTTS.empiric.no,
        probBttsYesPoisson: predictionResult.marketBTTS.poisson.yes,
        probBttsNoPoisson: predictionResult.marketBTTS.poisson.no,
        probBttsYesFinal: predictionResult.marketBTTS.final.yes,
        probBttsNoFinal: predictionResult.marketBTTS.final.no,
        strengthBtts: predictionResult.marketBTTS.strength,
        
        // Doppia Chance
        prob1XEmpiric: predictionResult.marketDoubleChance['1X'].empiric.prob,
        prob1XPoisson: predictionResult.marketDoubleChance['1X'].poisson.prob,
        prob1XFinal: predictionResult.marketDoubleChance['1X'].final.prob,
        strength1X: predictionResult.marketDoubleChance['1X'].strength,
        
        prob12Empiric: predictionResult.marketDoubleChance['12'].empiric.prob,
        prob12Poisson: predictionResult.marketDoubleChance['12'].poisson.prob,
        prob12Final: predictionResult.marketDoubleChance['12'].final.prob,
        strength12: predictionResult.marketDoubleChance['12'].strength,
        
        probX2Empiric: predictionResult.marketDoubleChance['X2'].empiric.prob,
        probX2Poisson: predictionResult.marketDoubleChance['X2'].poisson.prob,
        probX2Final: predictionResult.marketDoubleChance['X2'].final.prob,
        strengthX2: predictionResult.marketDoubleChance['X2'].strength,
        
        // Poisson params
        lambdaHome: predictionResult.poissonParams.lambdaHome,
        lambdaAway: predictionResult.poissonParams.lambdaAway,
        homeAdvantage: predictionResult.poissonParams.homeAdvantage,
        
        // xG data (optional)
        ...(predictionResult.xgModel && {
          xgHome: predictionResult.xgModel.home,
          xgAway: predictionResult.xgModel.away,
          xgotHome: predictionResult.xgModel.xgotHome,
          xgotAway: predictionResult.xgModel.xgotAway,
          xgaHome: predictionResult.xgModel.away, // xGA = xG opponent
          xgaAway: predictionResult.xgModel.home,
        }),
        ...(predictionResult.xgFlags && {
          missingXg: predictionResult.xgFlags.missingXg,
        }),
        
        // Timestamp
        calculatedAt: predictionResult.calculatedAt,
        lastUpdate: new Date(),
      },
      include: {
        fixture: {
          include: {
            homeTeam: true,
            awayTeam: true,
          },
        },
      },
    });
    
    logger.info({ fixtureId: input.fixtureId, confidence: savedPrediction.confidence }, 'Prediction saved');
    
    // Invalida cache
    await redis.del(`prediction:${input.fixtureId}`);
    
    // Aggiungi exactGoals alla risposta (non salvato nel DB per evitare verbosity)
    const responseWithExactGoals = {
      ...savedPrediction,
      exactGoals: predictionResult.poisson?.exactGoals || null,
    };
    
    return res.status(201).json(responseWithExactGoals);
    
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/predictions/calculate-by-name
 * Calcola predizione inserendo manualmente i nomi delle squadre
 * Supporta cache Redis con parametro forceRecalculate per sovrascrivere
 */
router.post('/calculate-by-name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Calcola stagione dinamicamente (anno corrente o precedente se prima di agosto)
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-11
    const currentSeason = currentMonth >= 7 ? currentYear : currentYear - 1; // 7 = agosto
    
    const schema = z.object({
      homeTeamName: z.string().min(1),
      awayTeamName: z.string().min(1),
      leagueId: z.number().int().positive().optional().default(39), // Default Premier League
      season: z.number().int().positive().optional().default(currentSeason),
      forceRecalculate: z.boolean().optional().default(false), // 🆕 Forza ricalcolo
      fixtureId: z.number().int().positive().optional(), // 🆕 Fixture ID opzionale (se dalla lista partite)
    });
    
    const input = schema.parse(req.body);
    
    // 🔑 Cache key unica per questa predizione
    const cacheKey = `prediction:${input.homeTeamName.toLowerCase()}:${input.awayTeamName.toLowerCase()}:${input.season}:${input.leagueId}`;
    
    // 📦 Controlla cache (se non forza ricalcolo)
    if (!input.forceRecalculate) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.info({ 
          homeTeam: input.homeTeamName, 
          awayTeam: input.awayTeamName,
          cacheKey,
        }, '✅ Cache hit - returning cached prediction');
        
        const cachedData = JSON.parse(cached);
        return res.json({
          ...cachedData,
          fromCache: true, // Indica che proviene dalla cache
        });
      }
    } else {
      logger.info({ 
        homeTeam: input.homeTeamName, 
        awayTeam: input.awayTeamName,
      }, '🔄 Force recalculate requested - bypassing cache');
    }
    
    logger.info({ homeTeam: input.homeTeamName, awayTeam: input.awayTeamName }, 'Manual prediction request');
    
    // Cerca le squadre nel database per nome (case-insensitive)
    const homeTeam = await prisma.team.findFirst({
      where: {
        name: {
          contains: input.homeTeamName,
          mode: 'insensitive',
        },
      },
    });
    
    const awayTeam = await prisma.team.findFirst({
      where: {
        name: {
          contains: input.awayTeamName,
          mode: 'insensitive',
        },
      },
    });
    
    if (!homeTeam) {
      logger.warn({ searchName: input.homeTeamName }, 'Home team not found');
      return res.status(404).json({ 
        error: `Squadra casa "${input.homeTeamName}" non trovata nel database`,
        suggestion: 'Prova con: Liverpool, Real Madrid, Barcelona, Bayern Munich, Inter, Manchester City, etc.',
      });
    }
    
    if (!awayTeam) {
      logger.warn({ searchName: input.awayTeamName }, 'Away team not found');
      return res.status(404).json({ 
        error: `Squadra trasferta "${input.awayTeamName}" non trovata nel database`,
        suggestion: 'Prova con: Liverpool, Real Madrid, Barcelona, Bayern Munich, Inter, Manchester City, etc.',
      });
    }
    
    // Calcola predizione usando i team ID trovati
    // Se abbiamo un fixtureId dalla lista partite, usalo. Altrimenti genera un ID temporaneo
    const fixtureId = input.fixtureId || Math.floor(Math.random() * 1147483647) + 1000000000;
    
    logger.info({ 
      homeTeam: homeTeam.name, 
      awayTeam: awayTeam.name,
      fixtureId,
      isRealFixture: !!input.fixtureId,
    }, input.fixtureId ? '🎯 Using real fixture ID from frontend' : '🔀 Generated temporary fixture ID');
    
    const predictionResult = await predictionEngine.calculatePrediction({
      fixtureId,
      homeTeamId: homeTeam.apiId,
      awayTeamId: awayTeam.apiId,
      season: input.season,
      leagueId: input.leagueId,
      homeTeamName: homeTeam.name,  // Aggiungi nome per Market Odds
      awayTeamName: awayTeam.name,  // Aggiungi nome per Market Odds
    });
    
    logger.info({ 
      homeTeam: homeTeam.name, 
      awayTeam: awayTeam.name,
      confidence: predictionResult.confidence,
      calibrated: !!predictionResult.marketCalibration,
      hasInjuriesAnalysis: !!predictionResult.injuriesAnalysis,
    }, 'Manual prediction calculated');
    
    // 🔍 DEBUG: Log dettagliato prima di ritornare al frontend
    logger.debug({
      marketCalibration: predictionResult.marketCalibration ? 'PRESENT' : 'NULL',
      injuriesAnalysis: predictionResult.injuriesAnalysis ? 'PRESENT' : 'NULL',
      formMomentum: predictionResult.formMomentum ? 'PRESENT' : 'NULL',
      h2hAnalysis: predictionResult.h2hAnalysis ? 'PRESENT' : 'NULL',
    }, '🔍 Response data check before sending to frontend');
    
    // 💾 Prepara risposta da cachare
    const responseData = {
      success: true,
      homeTeam: homeTeam.name,
      awayTeam: awayTeam.name,
      ...predictionResult,
      fromCache: false,
    };
    
    // 💾 Salva in cache (TTL: 6 ore = 21600 secondi)
    try {
      await redis.setex(cacheKey, 21600, JSON.stringify(responseData));
      logger.info({ cacheKey }, '💾 Prediction saved to cache (TTL: 6h)');
    } catch (cacheError) {
      logger.error({ cacheError, cacheKey }, '❌ Failed to save to cache');
      // Non blocchiamo la risposta se la cache fallisce
    }
    
    return res.json(responseData);
    
  } catch (error) {
    logger.error({ error }, 'Error in manual prediction');
    return next(error);
  }
});

export default router;
