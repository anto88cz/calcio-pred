import { Router, Request, Response } from 'express';
import { recommendationLogger } from '../services/recommendation-logger';
import moment from 'moment-timezone';

const router = Router();

/**
 * POST /api/recommendations/log
 * Logga una schedina giornaliera con le sue raccomandazioni
 */
router.post('/log', async (req: Request, res: Response): Promise<void> => {
  try {
    const { date, recommendations, totalOdds, stakePercent = 0.30 } = req.body;

    if (!date || !recommendations || !totalOdds) {
      res.status(400).json({ error: 'Missing required fields: date, recommendations, totalOdds' });
      return;
    }

    await recommendationLogger.logDailyBet({
      date,
      recommendations,
      totalOdds,
      stakePercent,
    });

    res.json({ success: true, message: `Logged ${recommendations.length} recommendations for ${date}` });
  } catch (error) {
    console.error('Error logging recommendations:', error);
    res.status(500).json({ error: 'Failed to log recommendations' });
  }
});

/**
 * GET /api/recommendations/logged/:date
 * Recupera le raccomandazioni logggate per una data specifica
 */
router.get('/logged/:date', async (req: Request, res: Response): Promise<void> => {
  try {
    const { date } = req.params;

    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }

    const data = await recommendationLogger.getLoggedRecommendations(date);

    if (!data) {
      res.status(404).json({ error: `No logged recommendations found for ${date}` });
      return;
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching logged recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch logged recommendations' });
  }
});

/**
 * POST /api/recommendations/update-results
 * Aggiorna i risultati delle raccomandazioni dopo le partite
 */
router.post('/update-results', async (req: Request, res: Response): Promise<void> => {
  try {
    const { date, results } = req.body;

    if (!date || !results || !Array.isArray(results)) {
      res.status(400).json({ error: 'Missing required fields: date, results (array)' });
      return;
    }

    await recommendationLogger.updateResults(date, results);

    res.json({ success: true, message: `Updated ${results.length} results for ${date}` });
  } catch (error) {
    console.error('Error updating results:', error);
    res.status(500).json({ error: 'Failed to update results' });
  }
});

/**
 * GET /api/recommendations/real-backtest
 * Genera statistiche di backtest basate sui dati REALI loggati
 */
router.get('/real-backtest', async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'Missing required query params: startDate, endDate' });
      return;
    }

    const stats = await recommendationLogger.getRealBacktestStats(
      startDate as string,
      endDate as string
    );

    res.json(stats);
  } catch (error) {
    console.error('Error generating real backtest stats:', error);
    res.status(500).json({ error: 'Failed to generate backtest stats' });
  }
});

/**
 * GET /api/recommendations/logged-list
 * Lista tutte le schedine logggate
 */
router.get('/logged-list', async (_req: Request, res: Response): Promise<void> => {
  try {
    const dailyBets = await recommendationLogger.listAllDailyBets();
    res.json(dailyBets);
  } catch (error) {
    console.error('Error listing daily bets:', error);
    res.status(500).json({ error: 'Failed to list daily bets' });
  }
});

export default router;
