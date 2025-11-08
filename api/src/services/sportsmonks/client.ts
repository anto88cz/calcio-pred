import axios, { AxiosInstance } from 'axios';

export interface SportsmonksConfig {
  baseUrl: string;
  apiKey: string;
}

export class SportsmonksClient {
  private client: AxiosInstance;
  private apiKey: string;

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
      console.log(`🌐 Sportsmonks API Request: ${config.baseURL}${config.url}`, config.params);
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

  async get<T = any>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const response = await this.client.get<T>(endpoint, { params });
    return response.data;
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
