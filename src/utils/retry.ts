import { RetryConfig } from '../types';
import { createLogger } from './logger';

const logger = createLogger('RetryUtil');

/**
 * Implements exponential backoff retry logic
 * Essential for handling API rate limits and transient failures
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  context: string = 'operation'
): Promise<T> {
  let lastError: Error = new Error('Unknown error');
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on certain errors (e.g., 404, 401)
      if (error.response?.status && [404, 401, 403].includes(error.response.status)) {
        throw error;
      }
      
      if (attempt < config.maxRetries) {
        const delay = Math.min(
          config.initialDelay * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelay
        );
        
        logger.warn(
          `${context} failed (attempt ${attempt + 1}/${config.maxRetries + 1}). Retrying in ${delay}ms`,
          { error: error.message }
        );
        
        await sleep(delay);
      }
    }
  }
  
  logger.error(`${context} failed after ${config.maxRetries + 1} attempts`, lastError);
  throw lastError!;
}

/**
 * Sleep utility for delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Rate limiter utility to prevent exceeding API limits
 */
export class RateLimiter {
  private queue: Array<() => void> = [];
  private requestCount: number = 0;
  private windowStart: number = Date.now();
  
  constructor(
    private maxRequests: number,
    private windowMs: number = 60000
  ) {}
  
  async acquire(): Promise<void> {
    const now = Date.now();
    
    // Reset window if expired
    if (now - this.windowStart >= this.windowMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }
    
    // If under limit, allow immediately
    if (this.requestCount < this.maxRequests) {
      this.requestCount++;
      return;
    }
    
    // Wait until window resets
    const waitTime = this.windowMs - (now - this.windowStart);
    await sleep(waitTime);
    
    // Reset and allow
    this.requestCount = 1;
    this.windowStart = Date.now();
  }
}