import { Router, Request, Response } from 'express';
import moment from 'moment-timezone';

const router = Router();

interface BacktestRequest {
  startDate: string;
  endDate: string;
  initialCapital?: number;
  stakePercentage?: number;
  targetOdds?: number;
  minOdds?: number;
  maxOdds?: number;
}

interface BacktestResult {
  date: string;
  capital: number;
  stake: number;
  odds: number;
  events: Array<{
    fixture: any;
    recommendation: any;
    actualResult: string;
    won: boolean;
  }>;
  won: boolean;
  profit: number;
}

// Funzione per generare multipla per una data (identica a backtest-multiple.js)
async function generateMultipleForDate(
  date: string,
  API_URL: string,
  TARGET_ODDS: number,
  MIN_ODDS: number,
  MAX_ODDS: number
): Promise<any> {
  try {
    // 1. Carica partite del giorno
    const fixturesResponse = await fetch(`${API_URL}/api/fixtures/sm/range?startDate=${date}&endDate=${date}`);
    const fixturesData: any = await fixturesResponse.json();

    if (!fixturesData.fixtures || fixturesData.fixtures.length === 0) {
      return null;
    }

    // Filtra solo partite finite
    const finishedFixtures = fixturesData.fixtures.filter((f: any) => f.status === 'FT' && f.score);

    if (finishedFixtures.length === 0) {
      return null;
    }

    // 2. Per ogni partita, carica raccomandazioni IN CHUNKS
    const allEvents: any[] = [];
    const chunkSize = Math.ceil(finishedFixtures.length / 3);

    for (let i = 0; i < finishedFixtures.length; i += chunkSize) {
      const chunk = finishedFixtures.slice(i, i + chunkSize);

      const fixturePromises = chunk.map(async (fixture: any) => {
        const homeTeamId = fixture.homeTeam?.id;
        const awayTeamId = fixture.awayTeam?.id;
        const leagueId = fixture.league?.id;
        const seasonId = fixture.league?.season;

        if (!homeTeamId || !awayTeamId || !leagueId || !seasonId) {
          return null;
        }

        try {
          const recsResponse = await fetch(`${API_URL}/api/betting-recommendations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fixtureId: fixture.id,
              homeTeamId,
              awayTeamId,
              leagueId,
              seasonId,
              homeTeamName: fixture.homeTeam.name,
              awayTeamName: fixture.awayTeam.name,
            }),
          });

          if (!recsResponse.ok) {
            return null;
          }

          const recsData: any = await recsResponse.json();

          if (recsData.recommendations && recsData.recommendations.length > 0) {
            const bestRec = recsData.recommendations[0];

            return {
              fixture,
              recommendation: bestRec,
              actualResult: `${fixture.score.home}-${fixture.score.away}`,
            };
          }
          return null;
        } catch (error) {
          return null;
        }
      });

      const chunkResults = await Promise.all(fixturePromises);
      allEvents.push(...chunkResults.filter((event: any) => event !== null));

      if (i + chunkSize < finishedFixtures.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    if (allEvents.length === 0) {
      return null;
    }

    // 3. Ordina per expectedValue
    allEvents.sort((a, b) => {
      const evDiff = b.recommendation.expectedValue - a.recommendation.expectedValue;
      if (Math.abs(evDiff) > 0.001) return evDiff;
      return b.recommendation.confidence - a.recommendation.confidence;
    });

    // 4. STRATEGIA FLESSIBILE: Cerca di raggiungere quota target con 1-3 partite
    let bestMultiple: any = null;
    let bestDiffFromTarget = Infinity;

    // Prova con 1 partita
    for (const event of allEvents) {
      const odds = event.recommendation.odds;
      if (odds >= MIN_ODDS && odds <= MAX_ODDS) {
        const diff = Math.abs(odds - TARGET_ODDS);
        if (diff < bestDiffFromTarget) {
          bestDiffFromTarget = diff;
          bestMultiple = {
            events: [event],
            odds: odds,
          };
        }
      }
    }

    // Prova con 2 partite
    for (let i = 0; i < Math.min(allEvents.length, 10); i++) {
      for (let j = i + 1; j < Math.min(allEvents.length, 15); j++) {
        if (allEvents[i].fixture.id === allEvents[j].fixture.id) continue;

        const combinedOdds = allEvents[i].recommendation.odds * allEvents[j].recommendation.odds;

        if (combinedOdds >= MIN_ODDS && combinedOdds <= MAX_ODDS) {
          const diff = Math.abs(combinedOdds - TARGET_ODDS);
          if (diff < bestDiffFromTarget) {
            bestDiffFromTarget = diff;
            bestMultiple = {
              events: [allEvents[i], allEvents[j]],
              odds: combinedOdds,
            };
          }
        }
      }
    }

    // Prova con 3 partite
    if (bestDiffFromTarget > 0.3) {
      for (let i = 0; i < Math.min(allEvents.length, 8); i++) {
        for (let j = i + 1; j < Math.min(allEvents.length, 10); j++) {
          for (let k = j + 1; k < Math.min(allEvents.length, 12); k++) {
            if (
              allEvents[i].fixture.id === allEvents[j].fixture.id ||
              allEvents[i].fixture.id === allEvents[k].fixture.id ||
              allEvents[j].fixture.id === allEvents[k].fixture.id
            )
              continue;

            const combinedOdds =
              allEvents[i].recommendation.odds *
              allEvents[j].recommendation.odds *
              allEvents[k].recommendation.odds;

            if (combinedOdds >= MIN_ODDS && combinedOdds <= MAX_ODDS) {
              const diff = Math.abs(combinedOdds - TARGET_ODDS);
              if (diff < bestDiffFromTarget) {
                bestDiffFromTarget = diff;
                bestMultiple = {
                  events: [allEvents[i], allEvents[j], allEvents[k]],
                  odds: combinedOdds,
                };
              }
            }
          }
        }
      }
    }

    if (!bestMultiple) {
      return null;
    }

    return bestMultiple;
  } catch (error) {
    console.error(`Error processing date ${date}:`, error);
    return null;
  }
}

// Funzione per verificare se multipla è vinta
function checkMultipleWon(multiple: any): boolean {
  return multiple.events.every((event: any) => {
    const { recommendation, actualResult } = event;
    const [homeScore, awayScore] = actualResult.split('-').map(Number);

    switch (recommendation.prediction) {
      case '1':
        return homeScore > awayScore;
      case 'X':
        return homeScore === awayScore;
      case '2':
        return homeScore < awayScore;
      case '1X':
        return homeScore >= awayScore;
      case 'X2':
        return homeScore <= awayScore;
      case '12':
        return homeScore !== awayScore;
      case 'Over 2.5':
        return homeScore + awayScore > 2.5;
      case 'Under 2.5':
        return homeScore + awayScore < 2.5;
      case 'GG':
        return homeScore > 0 && awayScore > 0;
      case 'NG':
        return homeScore === 0 || awayScore === 0;
      default:
        return false;
    }
  });
}

// POST /api/backtest - Esegue backtest per periodo specificato
router.post('/backtest', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      startDate,
      endDate,
      initialCapital = 100,
      stakePercentage = 0.3,
      targetOdds = 1.4,
      minOdds = 1.4,
      maxOdds = 4.0,
    } = req.body as BacktestRequest;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate are required' });
      return;
    }

    const API_URL = process.env.API_URL || 'http://localhost:3001';
    const start = moment(startDate);
    const end = moment(endDate);

    if (!start.isValid() || !end.isValid()) {
      res.status(400).json({ error: 'Invalid date format' });
      return;
    }

    if (start.isAfter(end)) {
      res.status(400).json({ error: 'startDate must be before endDate' });
      return;
    }

    // Setup SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const results: BacktestResult[] = [];
    let capital = initialCapital;
    let totalWon = 0;
    let totalLost = 0;

    // Genera array di date
    const dates: string[] = [];
    let currentDate = start.clone();
    while (currentDate.isSameOrBefore(end)) {
      dates.push(currentDate.format('YYYY-MM-DD'));
      currentDate.add(1, 'day');
    }

    sendEvent('init', {
      totalDays: dates.length,
      initialCapital,
      parameters: { stakePercentage, targetOdds, minOdds, maxOdds }
    });

    // Processa ogni data
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      
      sendEvent('progress', {
        current: i + 1,
        total: dates.length,
        date,
        percentage: Math.round(((i + 1) / dates.length) * 100)
      });

      const multiple = await generateMultipleForDate(date, API_URL, targetOdds, minOdds, maxOdds);

      if (!multiple) {
        continue; // Nessuna schedina per questo giorno
      }

      const stake = capital * stakePercentage;
      const won = checkMultipleWon(multiple);
      const profit = won ? stake * multiple.odds - stake : -stake;

      capital += profit;

      const result: BacktestResult = {
        date,
        capital,
        stake,
        odds: multiple.odds,
        events: multiple.events.map((event: any) => ({
          fixture: {
            id: event.fixture.id,
            homeTeam: event.fixture.homeTeam.name,
            awayTeam: event.fixture.awayTeam.name,
            league: event.fixture.league.name,
          },
          recommendation: {
            prediction: event.recommendation.prediction,
            odds: event.recommendation.odds,
            confidence: event.recommendation.confidence,
            expectedValue: event.recommendation.expectedValue,
          },
          actualResult: event.actualResult,
          won: checkMultipleWon({ events: [event] }),
        })),
        won,
        profit,
      };

      results.push(result);

      if (won) {
        totalWon++;
      } else {
        totalLost++;
      }

      // Invia aggiornamento in tempo reale
      const totalBets = totalWon + totalLost;
      const winRate = totalBets > 0 ? (totalWon / totalBets) * 100 : 0;
      const totalProfit = capital - initialCapital;
      const roi = ((totalProfit / initialCapital) * 100);

      sendEvent('update', {
        result,
        summary: {
          initialCapital,
          finalCapital: capital,
          totalProfit,
          roi: parseFloat(roi.toFixed(2)),
          totalBets,
          won: totalWon,
          lost: totalLost,
          winRate: parseFloat(winRate.toFixed(1)),
        }
      });
    }

    // Invio risultato finale
    const totalBets = totalWon + totalLost;
    const winRate = totalBets > 0 ? (totalWon / totalBets) * 100 : 0;
    const totalProfit = capital - initialCapital;
    const roi = ((totalProfit / initialCapital) * 100).toFixed(2);

    sendEvent('complete', {
      summary: {
        initialCapital,
        finalCapital: capital,
        totalProfit,
        roi: parseFloat(roi),
        totalBets,
        won: totalWon,
        lost: totalLost,
        winRate: parseFloat(winRate.toFixed(1)),
        period: {
          start: startDate,
          end: endDate,
          days: dates.length,
        },
      },
      results,
    });

    res.end();
  } catch (error) {
    console.error('Backtest error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
