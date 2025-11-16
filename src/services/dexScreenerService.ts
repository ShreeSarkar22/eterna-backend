import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { retryWithBackoff, RateLimiter } from '../utils/retry';
import { Token } from '../types';

const logger = createLogger('DexScreenerService');

/**
 * DexScreener API integration
 * Fetches token data from DexScreener with rate limiting
 */
export class DexScreenerService {
  private client: AxiosInstance;
  private rateLimiter: RateLimiter;

  constructor() {
    this.client = axios.create({
      baseURL: config.api.dexScreener.baseUrl,
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
      },
    });

    // DexScreener: 300 requests per minute
    this.rateLimiter = new RateLimiter(config.api.dexScreener.rateLimit, 60000);
  }

  /**
   * Search for tokens by query
   */
  async searchTokens(query: string): Promise<Token[]> {
    await this.rateLimiter.acquire();

    const fetchData = async () => {
      logger.info(`Searching DexScreener for: ${query}`);
      const response = await this.client.get(`/search?q=${encodeURIComponent(query)}`);
      return this.transformResponse(response.data);
    };

    return retryWithBackoff(fetchData, config.retry, 'DexScreener search');
  }

  /**
   * Get token by address
   */
  async getTokenByAddress(address: string): Promise<Token[]> {
    await this.rateLimiter.acquire();

    const fetchData = async () => {
      logger.info(`Fetching DexScreener token: ${address}`);
      const response = await this.client.get(`/tokens/${address}`);
      return this.transformResponse(response.data);
    };

    return retryWithBackoff(fetchData, config.retry, 'DexScreener token fetch');
  }

  /**
   * Get trending tokens from Solana
   */
  async getTrendingTokens(): Promise<Token[]> {
    await this.rateLimiter.acquire();

    const fetchData = async () => {
      logger.info('Fetching trending tokens from DexScreener');
      // Search for Solana tokens with high volume
      const response = await this.client.get('/search?q=solana');
      return this.transformResponse(response.data);
    };

    return retryWithBackoff(fetchData, config.retry, 'DexScreener trending');
  }

  /**
   * Transform DexScreener API response to our Token format
   */
  private transformResponse(data: any): Token[] {
    if (!data.pairs || !Array.isArray(data.pairs)) {
      return [];
    }

    return data.pairs
      .filter((pair: any) => pair.chainId === 'solana') // Only Solana tokens
      .map((pair: any) => this.transformPair(pair))
      .filter((token: Token | null) => token !== null) as Token[];
  }

  /**
   * Transform a single pair to Token format
   */
  private transformPair(pair: any): Token | null {
    try {
      // Extract price in SOL (approximate conversion)
      const priceUsd = parseFloat(pair.priceUsd) || 0;
      const priceSol = priceUsd / 100; // Rough estimate, adjust based on SOL price

      return {
        token_address: pair.baseToken?.address || '',
        token_name: pair.baseToken?.name || 'Unknown',
        token_ticker: pair.baseToken?.symbol || 'UNKNOWN',
        price_sol: priceSol,
        market_cap_sol: parseFloat(pair.fdv) / 100 || 0,
        volume_sol: parseFloat(pair.volume?.h24) / 100 || 0,
        liquidity_sol: parseFloat(pair.liquidity?.usd) / 100 || 0,
        transaction_count: parseInt(pair.txns?.h24?.buys || 0) + parseInt(pair.txns?.h24?.sells || 0),
        price_1hr_change: parseFloat(pair.priceChange?.h1) || 0,
        price_24hr_change: parseFloat(pair.priceChange?.h24) || 0,
        price_7d_change: parseFloat(pair.priceChange?.h7d) || 0,
        protocol: pair.dexId || 'Unknown',
        dex_id: pair.dexId,
        last_updated: Date.now(),
      };
    } catch (error) {
      logger.error('Error transforming DexScreener pair', { error, pair });
      return null;
    }
  }
}

export const dexScreenerService = new DexScreenerService();