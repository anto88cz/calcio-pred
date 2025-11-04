/**
 * Redis Lock Manager
 * Previene esecuzioni duplicate di job cron
 */

import redis from '../lib/redis';
import logger from './logger';

export class RedisLock {
  private key: string;
  private ttl: number; // secondi
  private acquired: boolean = false;

  constructor(key: string, ttl: number = 300) {
    this.key = `lock:${key}`;
    this.ttl = ttl;
  }

  /**
   * Acquisisce lock (SET NX EX)
   */
  async acquire(): Promise<boolean> {
    try {
      const result = await redis.set(this.key, Date.now().toString(), 'EX', this.ttl, 'NX');
      this.acquired = result === 'OK';
      
      if (this.acquired) {
        logger.debug({ key: this.key, ttl: this.ttl }, 'Lock acquired');
      } else {
        logger.debug({ key: this.key }, 'Lock already held');
      }
      
      return this.acquired;
    } catch (error) {
      logger.error({ error, key: this.key }, 'Failed to acquire lock');
      return false;
    }
  }

  /**
   * Rilascia lock
   */
  async release(): Promise<void> {
    if (!this.acquired) return;
    
    try {
      await redis.del(this.key);
      this.acquired = false;
      logger.debug({ key: this.key }, 'Lock released');
    } catch (error) {
      logger.error({ error, key: this.key }, 'Failed to release lock');
    }
  }

  /**
   * Extend lock TTL
   */
  async extend(additionalSeconds: number): Promise<boolean> {
    if (!this.acquired) return false;
    
    try {
      const result = await redis.expire(this.key, this.ttl + additionalSeconds);
      return result === 1;
    } catch (error) {
      logger.error({ error, key: this.key }, 'Failed to extend lock');
      return false;
    }
  }

  /**
   * Check if lock exists
   */
  static async exists(key: string): Promise<boolean> {
    try {
      const result = await redis.exists(`lock:${key}`);
      return result === 1;
    } catch (error) {
      logger.error({ error, key }, 'Failed to check lock existence');
      return false;
    }
  }
}

/**
 * Wrapper per eseguire funzione con lock automatico
 */
export async function withLock<T>(
  lockKey: string,
  ttl: number,
  fn: () => Promise<T>
): Promise<T | null> {
  const lock = new RedisLock(lockKey, ttl);
  
  const acquired = await lock.acquire();
  if (!acquired) {
    logger.warn({ lockKey }, 'Cannot acquire lock, skipping execution');
    return null;
  }
  
  try {
    const result = await fn();
    return result;
  } finally {
    await lock.release();
  }
}
