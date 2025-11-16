import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { retryWithBackoff, RateLimiter } from '../utils/retry';
import { Token } from '../types';

const logger = createLogger('JupiterService');

/**
 * Jupiter API integration
 * Provides additional token data and pricing information
 */
export class JupiterService {
  private client: AxiosInstance;
  private rateLimiter: RateLimiter;

  constructor() {
    this.client = axios.create({
      baseURL: config.api.jupiter.baseUrl,
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
      },
    });

    // Jupiter: Higher rate limit
    this.rateLimiter = new RateLimiter(config.api.jupiter.rateLimit, 60000);
  }

  /**
   * Search tokens on Jupiter
   */
  async searchTokens(query: string): Promise<Token[]> {
    await this.rateLimiter.acquire();

    const fetchData = async () => {
      logger.info(`Searching Jupiter for: ${query}`);
      const response = await this.client.get(`/tokens/v2/search?query=${encodeURIComponent(query)}`);
      return this.transformResponse(response.data);
    };

    return retryWithBackoff(fetchData, config.retry, 'Jupiter search');
  }

  /**
   * Get all tokens (limited to top tokens)
   */
  async getAllTokens(): Promise<Token[]> {
    await this.rateLimiter.acquire();

    const fetchData = async () => {
      logger.info('Fetching all tokens from Jupiter');
      const response = await this.client.get('/tokens/v2');
      return this.transformTokenList(response.data);
    };

    return retryWithBackoff(fetchData, config.retry, 'Jupiter all tokens');
  }

  /**
   * Transform Jupiter search response
   */
  private transformResponse(data: any): Token[] {
    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .map((token: any) => this.transformToken(token))
      .filter((token: Token | null) => token !== null) as Token[];
  }

  /**
   * Transform Jupiter token list
   */
  private transformTokenList(data: any): Token[] {
    // Jupiter v2 returns object with tokens
    const tokens = Array.isArray(data) ? data : (data.tokens || []);
    
    return tokens
      .slice(0, 50) // Limit to top 50 to avoid too much data
      .map((token: any) => this.transformToken(token))
      .filter((token: Token | null) => token !== null) as Token[];
  }

  /**
   * Transform single Jupiter token to our format
   */
  private transformToken(token: any): Token | null {
    try {
      // Jupiter doesn't provide all fields, so we use defaults
      return {
        token_address: token.address || '',
        token_name: token.name || 'Unknown',
        token_ticker: token.symbol || 'UNKNOWN',
        price_sol: 0, // Jupiter doesn't provide direct SOL price
        market_cap_sol: 0,
        volume_sol: 0,
        liquidity_sol: 0,
        transaction_count: 0,
        price_1hr_change: 0,
        price_24hr_change: 0,
        protocol: 'Jupiter',
        dex_id: 'jupiter',
        last_updated: Date.now(),
      };
    } catch (error) {
      logger.error('Error transforming Jupiter token', { error, token });
      return null;
    }
  }

  /**
   * Get token price (if needed for enrichment)
   */
  async getTokenPrice(tokenAddress: string): Promise<number | null> {
    try {
      await this.rateLimiter.acquire();
      
      const response = await this.client.get(`/price?ids=${tokenAddress}`);
      const data = response.data;
      
      if (data && data.data && data.data[tokenAddress]) {
        return parseFloat(data.data[tokenAddress].price) || null;
      }
      
      return null;
    } catch (error) {
      logger.error(`Error getting Jupiter price for ${tokenAddress}`, error);
      return null;
    }
  }
}

export const jupiterService = new JupiterService();