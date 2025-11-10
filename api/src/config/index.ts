/**
 * Configurazione centrale dell'applicazione
 * Carica e valida variabili d'ambiente
 */

import dotenv from 'dotenv';
import { z } from 'zod';

// Carica .env
dotenv.config();

// Schema validazione con Zod
const configSchema = z.object({
  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3001'),
  
  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  
  // Sportsmonks API
  SPORTSMONKS_API_KEY: z.string().min(1),
  SPORTSMONKS_BASE_URL: z.string().url().default('https://api.sportmonks.com/v3/football'),
  
  // The Odds API (Market Calibration)
  ODDS_API_BASE: z.string().url().default('https://api.the-odds-api.com'),
  ODDS_API_KEY: z.string().optional(), // Optional - se non presente, skip calibration
  ODDS_API_SPORT: z.string().default('soccer_uefa_champs_league'), // Default sport
  ODDS_API_REGIONS: z.string().default('eu'), // Europe bookmakers
  ODDS_API_MARKETS: z.string().default('h2h,totals'), // 1X2 + Over/Under
  ODDS_API_CACHE_TTL: z.string().transform(Number).default('1800'), // 30 min cache
  
  // Database
  DATABASE_URL: z.string().url(),
  
  // Redis
  REDIS_URL: z.string().url(),
  
  // Parametri Calcolo - CORRETTI
  HISTORY_GAMES: z.string().transform(Number).default('7'), // Compromesso ottimale tra stabilità e volume dati
  HOME_ADV_GOALS: z.string().transform(Number).default('0.15'), // Vantaggio casa calibrato conservativo
  CONFIDENCE_MIN: z.string().transform(Number).default('0.65'), // Soglia bilanciata per qualità/volume
  BLEND_EMPIRIC: z.string().transform(Number).default('0.55'), // Riequilibrato
  BLEND_POISSON: z.string().transform(Number).default('0.45'), // Riequilibrato
  
  // Parametri Avanzati - NUOVI
  MULTIGOAL_MIN_CONFIDENCE: z.string().transform(Number).default('0.75'), // Soglia per Multigoal
  XG_DIVERGENCE_THRESHOLD_ALT: z.string().transform(Number).default('0.50'), // Soglia xG inconsistenza
  
  // Time-Weighted Analysis - OTTIMIZZATO
  TIME_DECAY_FACTOR: z.string().transform(Number).default('0.95'), // Decay esponenziale ottimizzato
  TIME_DECAY_RATE: z.string().transform(Number).default('0.95'), // Alias per compatibilità
  TIME_RECENT_DAYS: z.string().transform(Number).default('60'),    // Fascia recente
  TIME_MEDIUM_DAYS: z.string().transform(Number).default('150'),   // Fascia media
  
  // xG Parameters - OTTIMIZZATI
  XG_BLEND_WEIGHT: z.string().transform(Number).default('0.25'), // 25% peso xG, 75% storico (ridotto per stabilità)
  XG_WEIGHT: z.string().transform(Number).default('0.25'), // Alias per compatibilità
  XG_DIVERGENCE_THRESHOLD: z.string().transform(Number).default('0.50'), // 50% soglia inconsistenza (più rigorosa)
  XG_MIN_TOTAL: z.string().transform(Number).default('2.2'), // Soglia per declassare Over/BTTS (abbassata)
  XG_HIGH_THRESHOLD: z.string().transform(Number).default('1.7'), // Soglia per aumentare Over (abbassata)
  
  // Timezone
  TZ: z.string().default('Europe/Rome'),
  
  // Cache
  CACHE_FIXTURES_TTL: z.string().transform(Number).default('3600'),
  CACHE_PREDICTIONS_TTL: z.string().transform(Number).default('1800'),
  
  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  
  // Soglie Classificazione
  THRESHOLD_1X2_STRONG: z.string().transform(Number).default('50'),
  THRESHOLD_1X2_MEDIUM: z.string().transform(Number).default('42'),
  THRESHOLD_GIOCALA: z.string().transform(Number).default('80'),
  THRESHOLD_BINARY_STRONG: z.string().transform(Number).default('62'),
  THRESHOLD_BINARY_MEDIUM: z.string().transform(Number).default('55'),
  THRESHOLD_DC_STRONG: z.string().transform(Number).default('75'),
  THRESHOLD_DC_MEDIUM: z.string().transform(Number).default('65'),
  
  // Job Scheduler
  CRON_ENABLED: z.string().transform(v => v === 'true').default('true'),
  CRON_DAILY_FIXTURES: z.string().default('0 6 * * *'),
  CRON_LINEUP_REFRESH_MINUTES: z.string().transform(Number).default('120'),
  CRON_FINAL_UPDATE_MINUTES: z.string().transform(Number).default('30'),
  CRON_TIMEZONE: z.string().default('Europe/Rome'),
  CRON_LEAGUE_IDS: z.string().default('39,135,140,78,61'), // Premier, Serie A, La Liga, Bundesliga, Ligue 1
  
  // Rate Limiting
  API_RATE_LIMIT_PER_MINUTE: z.string().transform(Number).default('10'),
  API_REQUEST_DELAY: z.string().transform(Number).default('6000'),
  
  // Data Validation
  EXCLUDE_FRIENDLIES: z.string().transform(v => v === 'true').default('true'),
  ONLY_OFFICIAL_RESULTS: z.string().transform(v => v === 'true').default('true'),
  MIN_MATCH_TIME: z.string().transform(Number).default('90'),
});

// Parse e valida
const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;

// Helper per i thresholds
export const thresholds = {
  threshold1X2Strong: config.THRESHOLD_1X2_STRONG,
  threshold1X2Medium: config.THRESHOLD_1X2_MEDIUM,
  thresholdGiocala: config.THRESHOLD_GIOCALA,
  thresholdBinaryStrong: config.THRESHOLD_BINARY_STRONG,
  thresholdBinaryMedium: config.THRESHOLD_BINARY_MEDIUM,
  thresholdDCStrong: config.THRESHOLD_DC_STRONG,
  thresholdDCMedium: config.THRESHOLD_DC_MEDIUM,
  confidenceMin: config.CONFIDENCE_MIN,
};

// Helper per calcolo config
export const calculationConfig = {
  historyGames: config.HISTORY_GAMES,
  homeAdvGoals: config.HOME_ADV_GOALS,
  confidenceMin: config.CONFIDENCE_MIN,
  blendEmpiric: config.BLEND_EMPIRIC,
  blendPoisson: config.BLEND_POISSON,
  xgBlendWeight: config.XG_BLEND_WEIGHT,
  xgDivergenceThreshold: config.XG_DIVERGENCE_THRESHOLD,
  xgMinTotal: config.XG_MIN_TOTAL,
  xgHighThreshold: config.XG_HIGH_THRESHOLD,
  thresholds,
  // Market Odds Calibration
  oddsCalibrationEnabled: !!config.ODDS_API_KEY,
  oddsBlendWeight: 0.30, // 70% model + 30% market
  oddsMinDifferenceForValueBet: 0.10, // 10% difference = value bet
  oddsConfidenceBoostThreshold: 0.05, // If diff < 5%, boost confidence
};

// Valida che i blend sommino a 1
const totalBlend = config.BLEND_EMPIRIC + config.BLEND_POISSON;
if (Math.abs(totalBlend - 1.0) > 0.01) {
  console.warn(`⚠️  BLEND_EMPIRIC (${config.BLEND_EMPIRIC}) + BLEND_POISSON (${config.BLEND_POISSON}) = ${totalBlend} (dovrebbe essere 1.0)`);
}

// Helper per scheduler config
export const schedulerConfig = {
  enabled: config.CRON_ENABLED,
  timezone: config.CRON_TIMEZONE,
  dailyFixturesCron: config.CRON_DAILY_FIXTURES,
  lineupRefreshMinutes: config.CRON_LINEUP_REFRESH_MINUTES,
  finalUpdateMinutes: config.CRON_FINAL_UPDATE_MINUTES,
  leagueIds: config.CRON_LEAGUE_IDS.split(',').map(id => parseInt(id.trim())),
};

export default config;
