/**
 * Configurazione centralizzata delle variabili d'ambiente
 * Tutte le variabili d'ambiente devono essere definite qui
 */

export const ENV = {
  // API Configuration
  API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  
  // App Configuration
  APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'Calcio-Pred',
  APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  
  // Features Toggle
  DEFAULT_FILTER_GIOCALA: process.env.NEXT_PUBLIC_DEFAULT_FILTER_GIOCALA === 'true',
  SHOW_CHARTS: process.env.NEXT_PUBLIC_SHOW_CHARTS !== 'false', // default true
  
  // UI Configuration
  AUTO_REFRESH_SECONDS: parseInt(process.env.NEXT_PUBLIC_AUTO_REFRESH_SECONDS || '0', 10),
  MATCHES_PER_PAGE: parseInt(process.env.NEXT_PUBLIC_MATCHES_PER_PAGE || '50', 10),
} as const;

// Type-safe environment check
export const isDevelopment = process.env.NODE_ENV === 'development';
export const isProduction = process.env.NODE_ENV === 'production';
export const isTest = process.env.NODE_ENV === 'test';
