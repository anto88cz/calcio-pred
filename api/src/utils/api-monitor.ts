/**
 * API Monitor - Monitoraggio utilizzo API-FOOTBALL
 * 
 * Traccia chiamate API giornaliere per evitare superamento limite (7500/day)
 * Sistema di allerta quando si avvicina al limite
 */

import { redis } from '../lib/redis';
import logger from './logger';

const API_DAILY_LIMIT = 7500; // Piano $19/month
const WARNING_THRESHOLD = 7000; // Avviso al 93% del limite
const CRITICAL_THRESHOLD = 7400; // Critico al 98%

/**
 * Incrementa contatore chiamate API per oggi
 * @returns Numero totale chiamate oggi
 */
export async function incrementAPICall(): Promise<number> {
  const today = getTodayKey();
  
  try {
    // Incrementa contatore
    const count = await redis.incr(today);
    
    // Imposta scadenza a fine giornata solo se è la prima chiamata
    if (count === 1) {
      const midnight = getNextMidnight();
      const ttl = Math.floor((midnight.getTime() - Date.now()) / 1000);
      await redis.expire(today, ttl);
      
      logger.info({ 
        date: today, 
        count, 
        resetAt: midnight.toISOString() 
      }, 'API call counter initialized');
    }
    
    // Log warning/critical alerts
    if (count === WARNING_THRESHOLD) {
      logger.warn({ 
        count, 
        limit: API_DAILY_LIMIT, 
        percentage: (count / API_DAILY_LIMIT * 100).toFixed(1) 
      }, 'API call count approaching daily limit!');
    } else if (count === CRITICAL_THRESHOLD) {
      logger.error({ 
        count, 
        limit: API_DAILY_LIMIT, 
        remaining: API_DAILY_LIMIT - count 
      }, 'CRITICAL: API call count near daily limit!');
    }
    
    return count;
  } catch (error) {
    logger.error({ error }, 'Failed to increment API call counter');
    return 0;
  }
}

/**
 * Ottieni numero chiamate API effettuate oggi
 * @returns Numero chiamate oggi
 */
export async function getTodayAPICount(): Promise<number> {
  const today = getTodayKey();
  
  try {
    const count = await redis.get(today);
    return count ? parseInt(count, 10) : 0;
  } catch (error) {
    logger.error({ error }, 'Failed to get API call count');
    return 0;
  }
}

/**
 * Ottieni statistiche utilizzo API
 */
export async function getAPIUsageStats(): Promise<{
  today: number;
  limit: number;
  remaining: number;
  percentage: number;
  status: 'OK' | 'WARNING' | 'CRITICAL' | 'EXCEEDED';
  resetAt: string;
}> {
  const today = await getTodayAPICount();
  const remaining = Math.max(0, API_DAILY_LIMIT - today);
  const percentage = (today / API_DAILY_LIMIT) * 100;
  
  let status: 'OK' | 'WARNING' | 'CRITICAL' | 'EXCEEDED' = 'OK';
  if (today >= API_DAILY_LIMIT) {
    status = 'EXCEEDED';
  } else if (today >= CRITICAL_THRESHOLD) {
    status = 'CRITICAL';
  } else if (today >= WARNING_THRESHOLD) {
    status = 'WARNING';
  }
  
  const resetAt = getNextMidnight();
  
  return {
    today,
    limit: API_DAILY_LIMIT,
    remaining,
    percentage: parseFloat(percentage.toFixed(2)),
    status,
    resetAt: resetAt.toISOString()
  };
}

/**
 * Verifica se possiamo effettuare N chiamate API senza superare limite
 * @param callsNeeded Numero chiamate necessarie
 * @returns true se possiamo procedere
 */
export async function canMakeAPICalls(callsNeeded: number): Promise<boolean> {
  const today = await getTodayAPICount();
  const wouldExceed = (today + callsNeeded) > API_DAILY_LIMIT;
  
  if (wouldExceed) {
    logger.warn({
      currentCount: today,
      callsNeeded,
      limit: API_DAILY_LIMIT,
      totalAfter: today + callsNeeded
    }, 'Cannot make API calls - would exceed daily limit');
  }
  
  return !wouldExceed;
}

/**
 * Reset manuale del contatore (solo per testing/admin)
 */
export async function resetAPICounter(): Promise<void> {
  const today = getTodayKey();
  
  try {
    await redis.del(today);
    logger.info({ date: today }, 'API counter reset manually');
  } catch (error) {
    logger.error({ error }, 'Failed to reset API counter');
    throw error;
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Genera chiave Redis per oggi
 * Formato: api:calls:YYYY-MM-DD
 */
function getTodayKey(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  
  return `api:calls:${year}-${month}-${day}`;
}

/**
 * Calcola prossima mezzanotte (00:00:00)
 */
function getNextMidnight(): Date {
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0); // Imposta a mezzanotte di domani
  return midnight;
}
