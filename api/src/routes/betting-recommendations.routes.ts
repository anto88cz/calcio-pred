import { Router, Request, Response } from 'express';
import { mlPredictionAlgorithm } from '../services/ml-prediction/ml-algorithm.service';
import { bettingRecommendationsService, type OddsData } from '../services/ml-prediction/betting-recommendations.service';
import { getSportsmonksClient } from '../services/sportsmonks/client';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/betting-recommendations
 * Genera suggerimenti di giocate con quote da Sportmonks
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { fixtureId, homeTeamId, awayTeamId, leagueId, seasonId, homeTeamName, awayTeamName, referenceDate } = req.body;
    
    if (!fixtureId || !homeTeamId || !awayTeamId) {
      return res.status(400).json({
        error: 'Missing required fields: fixtureId, homeTeamId, awayTeamId',
      });
    }
    
    logger.info(`🎲 Generating betting recommendations for fixture ${fixtureId}`);
    
    // 1. Ottieni predizione ML
    const mlPrediction = await mlPredictionAlgorithm.predictMatch({
      fixtureId,
      homeTeamId,
      awayTeamId,
      leagueId,
      seasonId,
      referenceDate, // ← AGGIUNTO: Passa la data di riferimento per backtest
    });
    
    // 2. Fetch fixture data da Sportmonks per validazione temporale
    logger.info(`📊 Fetching fixture data from Sportmonks for fixture ${fixtureId}`);
    const sportsmonksClient = getSportsmonksClient();
    const fixtureResponse = await sportsmonksClient.get<any>(
      `/fixtures/${fixtureId}`,
      {
        include: 'odds.bookmaker;odds.market',
      }
    );
    
    // 3. VALIDAZIONE TEMPORALE CRITICA: Verifica che la partita sia già finita
    // Per backtesting: la fixture deve essere nel PASSATO rispetto alla referenceDate
    // Per predizioni live: la fixture può essere futura ma referenceDate = oggi
    if (referenceDate && fixtureResponse?.data?.starting_at) {
      const fixtureDate = new Date(fixtureResponse.data.starting_at);
      const refDate = new Date(referenceDate);
      const now = new Date();
      
      // CASO 1: Fixture nel futuro rispetto a OGGI = impossibile analizzare (non ancora giocata)
      if (fixtureDate > now) {
        logger.warn(`🚨 TEMPORAL VIOLATION: Fixture ${fixtureId} (${fixtureDate.toISOString()}) has not been played yet`);
        return res.status(400).json({
          error: 'Cannot analyze fixture that has not been played yet',
          fixtureDate: fixtureDate.toISOString(),
          currentDate: now.toISOString()
        });
      }
      
      // CASO 2: Per BACKTESTING - verifica che non usiamo dati futuri rispetto alla referenceDate
      // Ma la fixture DEVE essere già stata giocata (quindi nel passato rispetto a ora)
      if (fixtureDate > refDate) {
        logger.info(`⚠️ Backtesting: Fixture ${fixtureId} (${fixtureDate.toISOString()}) played AFTER reference date (${refDate.toISOString()}), but already finished. Analysis allowed with temporal constraints.`);
        // NON bloccare - permetti l'analisi ma con vincoli temporali
      }
      
      logger.info(`✅ Temporal validation OK: Fixture ${fixtureId} already played, analyzing with reference date ${referenceDate}`);
    }
    
    const odds = fixtureResponse?.data?.odds || [];
    
    // 4. Calcola medie quote per mercati principali
    const avgOdds = calculateAverageOdds(odds);
    
    logger.info(`💰 Average odds calculated:`, avgOdds);
    
    // 4. Genera raccomandazioni
    const recommendations = bettingRecommendationsService.generateRecommendations(
      fixtureId,
      homeTeamName || `Team ${homeTeamId}`,
      awayTeamName || `Team ${awayTeamId}`,
      {
        predictions: mlPrediction.predictions,
        expectedScore: mlPrediction.expectedScore,
        confidence: mlPrediction.confidence,
        factors: mlPrediction.factors,
      },
      avgOdds
    );
    
    logger.info(`✅ Generated ${recommendations.recommendations.length} betting recommendations`);
    
    return res.json(recommendations);
    
  } catch (error: any) {
    logger.error('Error generating betting recommendations:', error);
    return res.status(500).json({
      error: 'Failed to generate betting recommendations',
      message: error.message,
    });
  }
});

/**
 * Calcola quote medie da array odds di Sportmonks
 */
function calculateAverageOdds(odds: any[]): OddsData {
  const result: OddsData = {
    home: 0,
    draw: 0,
    away: 0,
  };
  
  // Raggruppa per market_id
  const marketGroups: { [marketId: number]: any[] } = {};
  
  odds.forEach((odd: any) => {
    const marketId = odd.market_id;
    if (!marketGroups[marketId]) {
      marketGroups[marketId] = [];
    }
    marketGroups[marketId].push(odd);
  });
  
  // Market IDs Sportmonks (comuni):
  // 1 = 1X2 (Full Time Result)
  // 80 = Goals Over/Under
  // 14 = Both Teams To Score (BTTS)
  
  // 1X2 - Market ID 1
  const market1X2 = marketGroups[1] || [];
  const homeOdds = market1X2.filter((o: any) => o.label === '1' || o.label === 'Home');
  const drawOdds = market1X2.filter((o: any) => o.label === 'X' || o.label === 'Draw');
  const awayOdds = market1X2.filter((o: any) => o.label === '2' || o.label === 'Away');
  
  result.home = calculateAverage(homeOdds.map((o: any) => parseFloat(o.value))) || 2.50;
  result.draw = calculateAverage(drawOdds.map((o: any) => parseFloat(o.value))) || 3.20;
  result.away = calculateAverage(awayOdds.map((o: any) => parseFloat(o.value))) || 3.00;
  
  // Over/Under - Market ID 80
  const marketOU = marketGroups[80] || [];
  
  // Over/Under 0.5
  const over05 = marketOU.filter((o: any) => o.label === 'Over' && o.total === '0.5');
  const under05 = marketOU.filter((o: any) => o.label === 'Under' && o.total === '0.5');
  if (over05.length > 0) result.over05 = calculateAverage(over05.map((o: any) => parseFloat(o.value)));
  if (under05.length > 0) result.under05 = calculateAverage(under05.map((o: any) => parseFloat(o.value)));
  
  // Over/Under 1.5
  const over15 = marketOU.filter((o: any) => o.label === 'Over' && o.total === '1.5');
  const under15 = marketOU.filter((o: any) => o.label === 'Under' && o.total === '1.5');
  if (over15.length > 0) result.over15 = calculateAverage(over15.map((o: any) => parseFloat(o.value)));
  if (under15.length > 0) result.under15 = calculateAverage(under15.map((o: any) => parseFloat(o.value)));
  
  // Over/Under 2.5
  const over25 = marketOU.filter((o: any) => o.label === 'Over' && o.total === '2.5');
  const under25 = marketOU.filter((o: any) => o.label === 'Under' && o.total === '2.5');
  if (over25.length > 0) result.over25 = calculateAverage(over25.map((o: any) => parseFloat(o.value)));
  if (under25.length > 0) result.under25 = calculateAverage(under25.map((o: any) => parseFloat(o.value)));
  
  // Over/Under 3.5
  const over35 = marketOU.filter((o: any) => o.label === 'Over' && o.total === '3.5');
  const under35 = marketOU.filter((o: any) => o.label === 'Under' && o.total === '3.5');
  if (over35.length > 0) result.over35 = calculateAverage(over35.map((o: any) => parseFloat(o.value)));
  if (under35.length > 0) result.under35 = calculateAverage(under35.map((o: any) => parseFloat(o.value)));
  
  // Both Teams To Score - Market ID 14
  const marketBTTS = marketGroups[14] || [];
  const bttsYes = marketBTTS.filter((o: any) => o.label === 'Yes');
  const bttsNo = marketBTTS.filter((o: any) => o.label === 'No');
  if (bttsYes.length > 0) result.btts_yes = calculateAverage(bttsYes.map((o: any) => parseFloat(o.value)));
  if (bttsNo.length > 0) result.btts_no = calculateAverage(bttsNo.map((o: any) => parseFloat(o.value)));
  
  return result;
}

/**
 * Calcola media di un array di numeri
 */
function calculateAverage(numbers: number[]): number | undefined {
  if (numbers.length === 0) return undefined;
  const sum = numbers.reduce((acc, val) => acc + val, 0);
  return Number((sum / numbers.length).toFixed(2));
}

export default router;
