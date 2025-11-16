import Redis from 'ioredis';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { Token } from '../types';

const logger = createLogger('CacheService');

/**
 * Redis-based caching service
 * Reduces API calls and improves response times
 */
export class CacheService {
  private redis: Redis;
  private readonly prefix: string;
  private readonly defaultTTL: number;

  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.prefix = config.cache.prefix;
    this.defaultTTL = config.cache.ttl;

    this.redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    this.redis.on('error', (err) => {
      logger.error('Redis connection error', err);
    });
  }

  /**
   * Generate cache key with prefix
   */
  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(this.getKey(key));
      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (error) {
      logger.error(`Error getting cache key ${key}`, error);
      return null;
    }
  }

  /**
   * Set cache value with TTL
   */
  async set(key: string, value: any, ttl: number = this.defaultTTL): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await this.redis.setex(this.getKey(key), ttl, serialized);
      logger.debug(`Cache set: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      logger.error(`Error setting cache key ${key}`, error);
    }
  }

  /**
   * Delete cache key
   */
  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(this.getKey(key));
      logger.debug(`Cache deleted: ${key}`);
    } catch (error) {
      logger.error(`Error deleting cache key ${key}`, error);
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async deletePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(this.getKey(pattern));
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.debug(`Cache pattern deleted: ${pattern} (${keys.length} keys)`);
      }
    } catch (error) {
      logger.error(`Error deleting cache pattern ${pattern}`, error);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(this.getKey(key));
      return result === 1;
    } catch (error) {
      logger.error(`Error checking cache key ${key}`, error);
      return false;
    }
  }

  /**
   * Get multiple keys at once
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const prefixedKeys = keys.map(k => this.getKey(k));
      const values = await this.redis.mget(...prefixedKeys);
      
      return values.map(v => v ? JSON.parse(v) as T : null);
    } catch (error) {
      logger.error('Error getting multiple cache keys', error);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys at once
   */
  async mset(items: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      
      items.forEach(item => {
        const serialized = JSON.stringify(item.value);
        const ttl = item.ttl || this.defaultTTL;
        pipeline.setex(this.getKey(item.key), ttl, serialized);
      });
      
      await pipeline.exec();
      logger.debug(`Cache mset: ${items.length} keys`);
    } catch (error) {
      logger.error('Error setting multiple cache keys', error);
    }
  }

  /**
   * Increment counter (useful for rate limiting)
   */
  async increment(key: string, ttl?: number): Promise<number> {
    try {
      const prefixedKey = this.getKey(key);
      const value = await this.redis.incr(prefixedKey);
      
      if (value === 1 && ttl) {
        await this.redis.expire(prefixedKey, ttl);
      }
      
      return value;
    } catch (error) {
      logger.error(`Error incrementing cache key ${key}`, error);
      return 0;
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
    logger.info('Redis disconnected');
  }
}

// Singleton instance
export const cacheService = new CacheService();