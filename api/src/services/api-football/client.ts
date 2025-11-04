/**
 * Client base per API-FOOTBALL
 * Gestisce rate limiting, cache, retry logic, error handling
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../../config';
import logger from '../../utils/logger';
import { cacheGet, cacheSet } from '../../lib/redis';

class APIFootballClient {
  private client: AxiosInstance;
  private requestCount: number = 0;
  private lastResetTime: number = Date.now();
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue: boolean = false;

  constructor() {
    this.client = axios.create({
      baseURL: config.APIFOOTBALL_BASE,
      headers: {
        'x-apisports-key': config.APIFOOTBALL_KEY,
      },
      timeout: 30000,
    });

    // Interceptor per logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug({ 
          url: config.url, 
          params: config.params 
        }, 'API-FOOTBALL request');
        return config;
      },
      (error) => {
        logger.error({ error }, 'API-FOOTBALL request error');
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.debug({ 
          url: response.config.url,
          status: response.status,
          results: response.data?.results 
        }, 'API-FOOTBALL response');
        return response;
      },
      (error) => {
        this.handleError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Rate limiting: max richieste al minuto
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeElapsed = now - this.lastResetTime;

    // Reset counter ogni minuto
    if (timeElapsed >= 60000) {
      this.requestCount = 0;
      this.lastResetTime = now;
      return;
    }

    // Se abbiamo raggiunto il limite, aspetta
    if (this.requestCount >= config.API_RATE_LIMIT_PER_MINUTE) {
      const waitTime = 60000 - timeElapsed;
      logger.warn({ waitTime }, 'Rate limit reached, waiting...');
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.lastResetTime = Date.now();
    }

    // Delay tra richieste
    if (config.API_REQUEST_DELAY > 0) {
      await new Promise(resolve => setTimeout(resolve, config.API_REQUEST_DELAY));
    }
  }

  /**
   * Processa la coda di richieste
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (request) {
        await this.waitForRateLimit();
        await request();
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Error handling con retry logic
   */
  private handleError(error: AxiosError): void {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as any;

      switch (status) {
        case 429:
          logger.warn('API-FOOTBALL rate limit exceeded');
          break;
        case 401:
          logger.error('API-FOOTBALL authentication failed - check API key');
          break;
        case 403:
          logger.error('API-FOOTBALL forbidden - check subscription plan');
          break;
        case 404:
          logger.warn({ url: error.config?.url }, 'API-FOOTBALL resource not found');
          break;
        case 500:
        case 502:
        case 503:
          logger.error('API-FOOTBALL server error');
          break;
        default:
          logger.error({ status, data }, 'API-FOOTBALL error');
      }
    } else if (error.request) {
      logger.error('API-FOOTBALL no response received');
    } else {
      logger.error({ error: error.message }, 'API-FOOTBALL request setup error');
    }
  }

  /**
   * Request con cache e retry
   */
  async request<T>(
    endpoint: string,
    params: Record<string, any> = {},
    options: {
      cache?: boolean;
      cacheTTL?: number;
      retries?: number;
    } = {}
  ): Promise<T> {
    const {
      cache = true,
      cacheTTL = config.CACHE_FIXTURES_TTL,
      retries = 3,
    } = options;

    // Genera cache key
    const cacheKey = `api:${endpoint}:${JSON.stringify(params)}`;

    // Check cache
    if (cache) {
      const cached = await cacheGet<T>(cacheKey);
      if (cached) {
        logger.debug({ cacheKey }, 'Cache hit');
        return cached;
      }
    }

    // Esegui richiesta con retry
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.waitForRateLimit();
        this.requestCount++;

        const response = await this.client.get(endpoint, { params });

        // Verifica response API-FOOTBALL
        if (!response.data) {
          throw new Error('API-FOOTBALL: no data in response');
        }
        
        if (response.data.errors && Object.keys(response.data.errors).length > 0) {
          throw new Error(`API-FOOTBALL error: ${JSON.stringify(response.data.errors)}`);
        }

        const data = response.data.response as T;
        
        logger.debug({ 
          endpoint, 
          params,
          dataLength: Array.isArray(data) ? data.length : 'not-array',
          results: response.data.results 
        }, 'API-FOOTBALL data received');

        // Salva in cache
        if (cache) {
          await cacheSet(cacheKey, data, cacheTTL);
        }

        return data;

      } catch (error) {
        lastError = error as Error;
        
        if (attempt < retries) {
          const backoffTime = Math.pow(2, attempt) * 1000; // Exponential backoff
          logger.warn({ 
            attempt, 
            retries, 
            backoffTime,
            error: (error as Error).message 
          }, 'Request failed, retrying...');
          
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        }
      }
    }

    // Tutti i retry falliti
    logger.error({ 
      endpoint, 
      params, 
      error: lastError?.message 
    }, 'All retries failed');
    
    throw lastError || new Error('Request failed after all retries');
  }

  /**
   * Batch request per multiple IDs
   */
  async batchRequest<T>(
    endpoint: string,
    paramsList: Array<Record<string, any>>,
    options?: {
      cache?: boolean;
      cacheTTL?: number;
      retries?: number;
    }
  ): Promise<T[]> {
    const results: T[] = [];

    for (const params of paramsList) {
      try {
        const result = await this.request<T>(endpoint, params, options);
        results.push(result);
      } catch (error) {
        logger.error({ params, error }, 'Batch request item failed');
        // Continue con altri items
      }
    }

    return results;
  }

  /**
   * Get con queue per evitare overload
   */
  async queuedRequest<T>(
    endpoint: string,
    params: Record<string, any> = {},
    options?: {
      cache?: boolean;
      cacheTTL?: number;
      retries?: number;
    }
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await this.request<T>(endpoint, params, options);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  /**
   * Health check API
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Usa endpoint timezone per verificare connettività
      const response = await this.client.get('/timezone');
      return response.status === 200;
    } catch (error) {
      logger.error({ error }, 'API-FOOTBALL health check failed');
      return false;
    }
  }

  /**
   * Get API status e rate limits
   */
  async getStatus(): Promise<{
    account: string;
    requests: {
      current: number;
      limit_day: number;
    };
  }> {
    try {
      const response = await this.client.get('/status');
      return response.data.response;
    } catch (error) {
      logger.error({ error }, 'Failed to get API status');
      throw error;
    }
  }
}

// Singleton
export const apiFootballClient = new APIFootballClient();

export default apiFootballClient;
