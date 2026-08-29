import axios, { AxiosInstance } from 'axios';

export interface SportsmonksConfig {
  baseUrl: string;
  apiKey: string;
}

export class SportsmonksClient {
  private client: AxiosInstance;
  private apiKey: string;
  /** Coda: garantisce una distanza minima fra due richieste consecutive. */
  private lastRequestAt = 0;
  private queue: Promise<void> = Promise.resolve();

  /**
   * Distanza minima fra richieste, in ms.
   *
   * Il piano Growth da' 2500 chiamate per entita' all'ora, cioe' una ogni
   * 1440 ms. Si tiene un margine (default 1600 ms) perche' il contatore e'
   * per entita' ma quasi tutte le nostre chiamate colpiscono Fixture, quindi
   * in pratica il tetto orario e' quello.
   *
   * Non e' un sostituto della gestione del 429: serve a non arrivarci.
   */
  private readonly minIntervalMs = Number(process.env.SPORTSMONKS_MIN_REQUEST_MS) || 1600;

  constructor(config: SportsmonksConfig) {
    this.apiKey = config.apiKey;
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
      },
    });

    // Add request interceptor to include API key in all requests
    this.client.interceptors.request.use((config) => {
      config.params = {
        ...config.params,
        api_token: this.apiKey,
      };
      // Il token NON va nei log: finirebbe in chiaro in ogni riga di output,
      // nei file di log e negli output dei job.
      const { api_token, ...safeParams } = config.params as Record<string, unknown>;
      console.log(`🌐 Sportsmonks API Request: ${config.baseURL}${config.url}`, safeParams);
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('Sportsmonks API Error:', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.response?.data?.message || error.message,
        });
        throw error;
      }
    );
  }

  /**
   * GET con attesa sul rate limit.
   *
   * Sportmonks limita per ENTITA' (2500 richieste/ora sulle fixture nel piano
   * Growth) e risponde 429 quando il budget e' esaurito. Senza gestirlo, ogni
   * chiamata successiva fallisce e i servizi a valle interpretano l'errore come
   * "nessun dato": in backtest questo produce predizioni calcolate su storico
   * VUOTO, cioe' numeri plausibili ma senza alcun contenuto. Meglio aspettare.
   */
  /** Attende il proprio turno nella coda, rispettando minIntervalMs. */
  private async pace(): Promise<void> {
    const wait = this.queue.then(async () => {
      const elapsed = Date.now() - this.lastRequestAt;
      const delay = this.minIntervalMs - elapsed;
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
      this.lastRequestAt = Date.now();
    });
    this.queue = wait.catch(() => undefined);
    return wait;
  }

  async get<T = any>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const MAX_ATTEMPTS = 8;

    for (let attempt = 1; ; attempt++) {
      try {
        await this.pace();
        const response = await this.client.get<T>(endpoint, { params });
        return response.data;
      } catch (error: any) {
        const status = error.response?.status;
        const isRateLimit =
          status === 429 ||
          /rate limit/i.test(error.response?.data?.message || '');

        if (!isRateLimit || attempt >= MAX_ATTEMPTS) throw error;

        // Quanto aspettare. Sul 429 Sportmonks NON mette nulla nel body (solo
        // `message`): l'informazione viaggia negli header.
        //   retry-after:       secondi da attendere
        //   x-ratelimit-reset: epoch in secondi del reset
        // Le risposte 200 hanno invece rate_limit.resets_in_seconds nel body.
        // La finestra e' oraria e scorrevole, e parte dalla PRIMA richiesta
        // fatta a quell'entita' (Growth: 2500 chiamate/entita'/ora).
        const headers = error.response?.headers || {};
        const retryAfter = Number(headers['retry-after']);
        const resetEpoch = Number(headers['x-ratelimit-reset']);
        const resetsInBody = Number(error.response?.data?.rate_limit?.resets_in_seconds);

        let waitSec: number;
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          waitSec = retryAfter + 2;
        } else if (Number.isFinite(resetEpoch) && resetEpoch > 0) {
          waitSec = Math.max(5, resetEpoch - Math.floor(Date.now() / 1000) + 2);
        } else if (Number.isFinite(resetsInBody) && resetsInBody > 0) {
          waitSec = resetsInBody + 2;
        } else {
          waitSec = Math.min(300 * attempt, 900);
        }
        waitSec = Math.min(waitSec, 3700);

        console.warn(`⏳ Rate limit su ${endpoint}: attendo ${waitSec}s (tentativo ${attempt}/${MAX_ATTEMPTS})`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
      }
    }
  }
}

// Singleton instance
let clientInstance: SportsmonksClient | null = null;

export function getSportsmonksClient(): SportsmonksClient {
  if (!clientInstance) {
    const config: SportsmonksConfig = {
      baseUrl: process.env.SPORTSMONKS_BASE_URL || 'https://api.sportmonks.com/v3/football',
      apiKey: process.env.SPORTSMONKS_API_KEY || '',
    };

    if (!config.apiKey) {
      throw new Error('SPORTSMONKS_API_KEY is not configured in environment variables');
    }

    clientInstance = new SportsmonksClient(config);
  }

  return clientInstance;
}
