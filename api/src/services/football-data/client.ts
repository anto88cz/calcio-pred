import axios, { AxiosInstance } from 'axios';
import logger from '../../utils/logger';

/**
 * Football-Data.org API Client
 * FREE API per partite in programma
 * Rate limit: 10 requests/minute
 * https://www.football-data.org/
 */
class FootballDataClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.FOOTBALL_DATA_API_KEY || 'YOUR_FREE_API_KEY';
    
    this.client = axios.create({
      baseURL: 'https://api.football-data.org/v4',
      headers: {
        'X-Auth-Token': this.apiKey,
      },
      timeout: 10000,
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error({
          error: error.message,
          response: error.response?.data,
          status: error.response?.status,
        }, 'Football-Data.org API error');
        throw error;
      }
    );
  }

  /**
   * Get today's matches from top European leagues
   */
  async getTodayMatches() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      logger.info({ date: today }, 'Fetching today matches from Football-Data.org');

      // Fetch all matches for today (free tier doesn't support competition filter)
      const response = await this.client.get('/matches', {
        params: {
          dateFrom: today,
          dateTo: today,
        },
      });

      logger.info({ 
        count: response.data.matches?.length || 0,
        resultSet: response.data.resultSet 
      }, 'Matches fetched from Football-Data.org');

      return response.data.matches || [];
      
    } catch (error) {
      logger.error({ error }, 'Error fetching today matches');
      throw error;
    }
  }

  /**
   * Get matches for a specific date
   */
  async getMatchesByDate(date: string) {
    try {
      logger.info({ date }, 'Fetching matches by date from Football-Data.org');

      const response = await this.client.get('/matches', {
        params: {
          dateFrom: date,
          dateTo: date,
        },
      });

      return response.data.matches || [];
      
    } catch (error) {
      logger.error({ error }, 'Error fetching matches by date');
      throw error;
    }
  }
}

export const footballDataClient = new FootballDataClient();
