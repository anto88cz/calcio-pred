import { PrismaClient } from '@prisma/client';
import moment from 'moment-timezone';

const prisma = new PrismaClient();

interface RecommendationToLog {
  fixtureId: number;
  fixtureApiId: number;
  homeTeam: string;
  awayTeam: string;
  leagueName: string;
  leagueId: number;
  matchDate: Date;
  matchTime: string;
  prediction: string;
  odds: number;
  confidence: number;
  expectedValue: number;
  valueRating: number;
}

interface DailyBetToLog {
  date: string; // YYYY-MM-DD
  recommendations: RecommendationToLog[];
  totalOdds: number;
  stakePercent: number;
}

/**
 * Servizio per loggare le raccomandazioni generate
 * Permette di tracciare storicamente cosa è stato consigliato e verificare i risultati
 */
export class RecommendationLogger {
  
  /**
   * Logga una schedina giornaliera con tutte le sue raccomandazioni
   */
  async logDailyBet(bet: DailyBetToLog): Promise<void> {
    const dailyBetId = bet.date;
    const dateObj = moment(bet.date, 'YYYY-MM-DD').toDate();
    
    try {
      // Crea o aggiorna la schedina giornaliera
      await prisma.dailyBet.upsert({
        where: { id: dailyBetId },
        create: {
          id: dailyBetId,
          date: dateObj,
          totalOdds: bet.totalOdds,
          eventsCount: bet.recommendations.length,
          stakePercent: bet.stakePercent,
          generatedAt: new Date(),
        },
        update: {
          totalOdds: bet.totalOdds,
          eventsCount: bet.recommendations.length,
          stakePercent: bet.stakePercent,
          generatedAt: new Date(),
        },
      });
      
      // Logga ogni raccomandazione
      for (const rec of bet.recommendations) {
        // Converti matchDate se è stringa
        const matchDateObj = typeof rec.matchDate === 'string' 
          ? new Date(rec.matchDate) 
          : rec.matchDate;
        
        await prisma.recommendationLog.upsert({
          where: {
            dailyBetId_fixtureId: {
              dailyBetId,
              fixtureId: rec.fixtureId,
            },
          },
          create: {
            dailyBetId,
            fixtureId: rec.fixtureId,
            fixtureApiId: rec.fixtureApiId,
            homeTeam: rec.homeTeam,
            awayTeam: rec.awayTeam,
            leagueName: rec.leagueName,
            leagueId: rec.leagueId,
            matchDate: matchDateObj,
            matchTime: rec.matchTime,
            prediction: rec.prediction,
            odds: rec.odds,
            confidence: rec.confidence,
            expectedValue: rec.expectedValue,
            valueRating: rec.valueRating,
            combinedOdds: bet.totalOdds,
            stakePercentage: bet.stakePercent,
          },
          update: {
            prediction: rec.prediction,
            odds: rec.odds,
            confidence: rec.confidence,
            expectedValue: rec.expectedValue,
            valueRating: rec.valueRating,
            combinedOdds: bet.totalOdds,
            generatedAt: new Date(),
          },
        });
      }
      
      console.log(`✅ Logged daily bet for ${dailyBetId} with ${bet.recommendations.length} recommendations`);
    } catch (error) {
      console.error(`❌ Error logging daily bet for ${dailyBetId}:`, error);
      throw error;
    }
  }
  
  /**
   * Recupera le raccomandazioni logggate per una data
   */
  async getLoggedRecommendations(date: string): Promise<any> {
    const dailyBet = await prisma.dailyBet.findUnique({
      where: { id: date },
    });
    
    if (!dailyBet) {
      return null;
    }
    
    const recommendations = await prisma.recommendationLog.findMany({
      where: { dailyBetId: date },
      orderBy: { expectedValue: 'desc' },
    });
    
    return {
      dailyBet,
      recommendations,
    };
  }
  
  /**
   * Aggiorna i risultati delle raccomandazioni dopo che le partite sono finite
   */
  async updateResults(date: string, results: Array<{
    fixtureId: number;
    actualResult: string;
    won: boolean;
  }>): Promise<void> {
    for (const result of results) {
      await prisma.recommendationLog.updateMany({
        where: {
          dailyBetId: date,
          fixtureId: result.fixtureId,
        },
        data: {
          actualResult: result.actualResult,
          won: result.won,
          verifiedAt: new Date(),
        },
      });
    }
    
    // Verifica se tutte le raccomandazioni del giorno sono state verificate
    const allRecs = await prisma.recommendationLog.findMany({
      where: { dailyBetId: date },
    });
    
    const allVerified = allRecs.every(r => r.won !== null);
    
    if (allVerified && allRecs.length > 0) {
      // Calcola se la schedina è stata vinta (tutte le raccomandazioni vinte)
      const betWon = allRecs.every(r => r.won === true);
      
      await prisma.dailyBet.update({
        where: { id: date },
        data: {
          won: betWon,
          settledAt: new Date(),
        },
      });
      
      console.log(`✅ Daily bet ${date} settled: ${betWon ? 'WON' : 'LOST'}`);
    }
  }
  
  /**
   * Genera statistiche sui backtest basati su dati REALI loggati
   */
  async getRealBacktestStats(startDate: string, endDate: string): Promise<any> {
    const dailyBets = await prisma.dailyBet.findMany({
      where: {
        date: {
          gte: moment(startDate).toDate(),
          lte: moment(endDate).toDate(),
        },
        won: { not: null }, // Solo schedine con risultato
      },
      orderBy: { date: 'asc' },
    });
    
    const totalBets = dailyBets.length;
    const wonBets = dailyBets.filter(b => b.won === true).length;
    const lostBets = dailyBets.filter(b => b.won === false).length;
    const winRate = totalBets > 0 ? (wonBets / totalBets) * 100 : 0;
    
    // Calcola ROI simulato
    let capital = 100;
    const capitalHistory: Array<{ date: string; capital: number; won: boolean }> = [];
    
    for (const bet of dailyBets) {
      const stake = capital * bet.stakePercent;
      if (bet.won) {
        capital += stake * bet.totalOdds - stake;
      } else {
        capital -= stake;
      }
      capitalHistory.push({
        date: moment(bet.date).format('YYYY-MM-DD'),
        capital,
        won: bet.won!,
      });
    }
    
    const roi = ((capital - 100) / 100) * 100;
    
    return {
      period: { start: startDate, end: endDate },
      totalBets,
      wonBets,
      lostBets,
      winRate: winRate.toFixed(1),
      initialCapital: 100,
      finalCapital: capital.toFixed(2),
      roi: roi.toFixed(2),
      capitalHistory,
    };
  }
  
  /**
   * Lista tutte le schedine logggate (per debug/admin)
   */
  async listAllDailyBets(): Promise<any[]> {
    return prisma.dailyBet.findMany({
      orderBy: { date: 'desc' },
      take: 100,
    });
  }
}

export const recommendationLogger = new RecommendationLogger();
