import { Request, Response, NextFunction } from 'express';
import { cacheService } from '../services/cacheService';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('RateLimiter');

/**
 * Rate limiting middleware using Redis
 * Prevents API abuse and ensures fair usage
 */
export async function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Use IP address as identifier
    const identifier = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `rate-limit:${identifier}`;

    // Increment request count
    const requestCount = await cacheService.increment(
      key,
      Math.ceil(config.rateLimit.windowMs / 1000)
    );

    // Set headers
    res.setHeader('X-RateLimit-Limit', config.rateLimit.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, config.rateLimit.maxRequests - requestCount));

    // Check if limit exceeded
    if (requestCount > config.rateLimit.maxRequests) {
      logger.warn(`Rate limit exceeded for ${identifier}`, { requestCount });

      res.status(429).json({
        success: false,
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again later.`,
        retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Rate limiter error', error);
    // Don't block requests if rate limiter fails
    next();
  }
}