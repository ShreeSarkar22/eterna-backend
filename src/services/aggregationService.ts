import { dexScreenerService } from './dexScreenerService';
import { jupiterService } from './jupiterService';
import { cacheService } from './cacheService';
import { createLogger } from '../utils/logger';
import { Token, QueryOptions, TokenResponse } from '../types';
import { config } from '../config';

const logger = createLogger('AggregationService');

/**
 * Core aggregation service
 * Merges data from multiple DEX sources with intelligent deduplication
 */
export class AggregationService {
  private readonly CACHE_KEY_PREFIX = 'tokens:';

  /**
   * Fetch and aggregate tokens from all sources
   */
  async aggregateTokens(options: QueryOptions = {}): Promise<TokenResponse> {
    const cacheKey = this.generateCacheKey(options);
    
    // Check cache first
    const cached = await cacheService.get<TokenResponse>(cacheKey);
    if (cached) {
      logger.info('Returning cached token data');
      return cached;
    }

    logger.info('Fetching fresh token data from all sources');

    // Fetch from all sources in parallel
    const [dexTokens, jupiterTokens] = await Promise.allSettled([
      dexScreenerService.getTrendingTokens(),
      jupiterService.getAllTokens(),
    ]);

    // Combine results
    let allTokens: Token[] = [];
    
    if (dexTokens.status === 'fulfilled') {
      allTokens = [...allTokens, ...dexTokens.value];
    } else {
      logger.error('DexScreener fetch failed', dexTokens.reason);
    }

    if (jupiterTokens.status === 'fulfilled') {
      allTokens = [...allTokens, ...jupiterTokens.value];
    } else {
      logger.error('Jupiter fetch failed', jupiterTokens.reason);
    }

    // Merge duplicates
    const mergedTokens = this.mergeTokens(allTokens);

    // Apply filters and sorting
    const filteredTokens = this.applyFilters(mergedTokens, options);
    const sortedTokens = this.applySort(filteredTokens, options);

    // Apply pagination
    const paginatedResult = this.applyPagination(sortedTokens, options);

    // Cache the result
    await cacheService.set(cacheKey, paginatedResult, config.cache.ttl);

    return paginatedResult;
  }

  /**
   * Search tokens across all sources
   */
  async searchTokens(query: string, options: QueryOptions = {}): Promise<TokenResponse> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}search:${query}:${JSON.stringify(options)}`;
    
    const cached = await cacheService.get<TokenResponse>(cacheKey);
    if (cached) {
      logger.info(`Returning cached search results for: ${query}`);
      return cached;
    }

    logger.info(`Searching for tokens: ${query}`);

    // Search all sources in parallel
    const [dexResults, jupiterResults] = await Promise.allSettled([
      dexScreenerService.searchTokens(query),
      jupiterService.searchTokens(query),
    ]);

    let allTokens: Token[] = [];
    
    if (dexResults.status === 'fulfilled') {
      allTokens = [...allTokens, ...dexResults.value];
    }

    if (jupiterResults.status === 'fulfilled') {
      allTokens = [...allTokens, ...jupiterResults.value];
    }

    const mergedTokens = this.mergeTokens(allTokens);
    const filteredTokens = this.applyFilters(mergedTokens, options);
    const sortedTokens = this.applySort(filteredTokens, options);
    const paginatedResult = this.applyPagination(sortedTokens, options);

    await cacheService.set(cacheKey, paginatedResult, config.cache.ttl);

    return paginatedResult;
  }

  /**
   * Get specific token by address
   */
  async getTokenByAddress(address: string): Promise<Token | null> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}address:${address}`;
    
    const cached = await cacheService.get<Token>(cacheKey);
    if (cached) {
      return cached;
    }

    const tokens = await dexScreenerService.getTokenByAddress(address);
    const token = tokens[0] || null;

    if (token) {
      await cacheService.set(cacheKey, token, config.cache.ttl);
    }

    return token;
  }

  /**
   * Merge duplicate tokens from different sources
   * Uses token address as unique identifier
   */
  private mergeTokens(tokens: Token[]): Token[] {
    const tokenMap = new Map<string, Token>();

    for (const token of tokens) {
      const address = token.token_address.toLowerCase();
      
      if (!tokenMap.has(address)) {
        tokenMap.set(address, token);
      } else {
        // Merge with existing, prefer data with more information
        const existing = tokenMap.get(address)!;
        const merged = this.mergeSingleToken(existing, token);
        tokenMap.set(address, merged);
      }
    }

    return Array.from(tokenMap.values());
  }

  /**
   * Merge two token objects, preferring non-zero values
   */
  private mergeSingleToken(token1: Token, token2: Token): Token {
    return {
      token_address: token1.token_address,
      token_name: token1.token_name || token2.token_name,
      token_ticker: token1.token_ticker || token2.token_ticker,
      price_sol: token1.price_sol || token2.price_sol,
      market_cap_sol: Math.max(token1.market_cap_sol, token2.market_cap_sol),
      volume_sol: Math.max(token1.volume_sol, token2.volume_sol),
      liquidity_sol: Math.max(token1.liquidity_sol, token2.liquidity_sol),
      transaction_count: Math.max(token1.transaction_count, token2.transaction_count),
      price_1hr_change: token1.price_1hr_change || token2.price_1hr_change,
      price_24hr_change: token1.price_24hr_change || token2.price_24hr_change,
      price_7d_change: token1.price_7d_change || token2.price_7d_change,
      protocol: token1.protocol !== 'Unknown' ? token1.protocol : token2.protocol,
      dex_id: token1.dex_id || token2.dex_id,
      last_updated: Math.max(token1.last_updated, token2.last_updated),
    };
  }

  /**
   * Apply filters based on query options
   */
  private applyFilters(tokens: Token[], options: QueryOptions): Token[] {
    let filtered = tokens;

    // Filter by minimum volume
    if (options.min_volume) {
      filtered = filtered.filter(t => t.volume_sol >= options.min_volume!);
    }

    // Filter by minimum liquidity
    if (options.min_liquidity) {
      filtered = filtered.filter(t => t.liquidity_sol >= options.min_liquidity!);
    }

    return filtered;
  }

  /**
   * Apply sorting based on query options
   */
  private applySort(tokens: Token[], options: QueryOptions): Token[] {
    const sortBy = options.sort_by || 'volume';
    const sortOrder = options.sort_order || 'desc';

    const sorted = [...tokens].sort((a, b) => {
      let aValue: number;
      let bValue: number;

      switch (sortBy) {
        case 'volume':
          aValue = a.volume_sol;
          bValue = b.volume_sol;
          break;
        case 'market_cap':
          aValue = a.market_cap_sol;
          bValue = b.market_cap_sol;
          break;
        case 'liquidity':
          aValue = a.liquidity_sol;
          bValue = b.liquidity_sol;
          break;
        case 'price_change':
          // Use appropriate time period
          aValue = a.price_1hr_change || 0;
          bValue = b.price_1hr_change || 0;
          break;
        default:
          aValue = a.volume_sol;
          bValue = b.volume_sol;
      }

      return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
    });

    return sorted;
  }

  /**
   * Apply cursor-based pagination
   */
  private applyPagination(tokens: Token[], options: QueryOptions): TokenResponse {
    const limit = Math.min(
      options.limit || config.pagination.defaultLimit,
      config.pagination.maxLimit
    );

    let startIndex = 0;
    
    // Decode cursor if provided
    if (options.cursor) {
      try {
        startIndex = parseInt(Buffer.from(options.cursor, 'base64').toString('utf-8'));
      } catch (error) {
        logger.warn('Invalid cursor provided, starting from beginning');
      }
    }

    const endIndex = startIndex + limit;
    const paginatedTokens = tokens.slice(startIndex, endIndex);

    // Generate next cursor
    const nextCursor = endIndex < tokens.length
      ? Buffer.from(endIndex.toString()).toString('base64')
      : undefined;

    return {
      tokens: paginatedTokens,
      next_cursor: nextCursor,
      total_count: tokens.length,
      timestamp: Date.now(),
    };
  }

  /**
   * Generate cache key from query options
   */
  private generateCacheKey(options: QueryOptions): string {
    const parts = [
      this.CACHE_KEY_PREFIX,
      'aggregate',
      options.sort_by || 'volume',
      options.sort_order || 'desc',
      options.min_volume || 0,
      options.min_liquidity || 0,
    ];

    return parts.join(':');
  }

  /**
   * Invalidate all token caches (useful for manual refresh)
   */
  async invalidateCache(): Promise<void> {
    await cacheService.deletePattern(`${this.CACHE_KEY_PREFIX}*`);
    logger.info('Token cache invalidated');
  }
}

export const aggregationService = new AggregationService();