import { AggregationService } from '../../src/services/aggregationService';
import { Token } from '../../src/types';

// Mock the DEX services
jest.mock('../../src/services/dexScreenerService');
jest.mock('../../src/services/jupiterService');
jest.mock('../../src/services/cacheService');

describe('AggregationService', () => {
  let aggregationService: AggregationService;

  const mockTokens: Token[] = [
    {
      token_address: 'addr1',
      token_name: 'Token A',
      token_ticker: 'TKA',
      price_sol: 0.5,
      market_cap_sol: 1000,
      volume_sol: 500,
      liquidity_sol: 200,
      transaction_count: 100,
      price_1hr_change: 5,
      protocol: 'Raydium',
      last_updated: Date.now(),
    },
    {
      token_address: 'addr2',
      token_name: 'Token B',
      token_ticker: 'TKB',
      price_sol: 1.5,
      market_cap_sol: 2000,
      volume_sol: 1000,
      liquidity_sol: 400,
      transaction_count: 200,
      price_1hr_change: -3,
      protocol: 'Orca',
      last_updated: Date.now(),
    },
  ];

  beforeEach(() => {
    aggregationService = new AggregationService();
  });

  describe('mergeTokens', () => {
    it('should merge duplicate tokens', () => {
      const tokens = [
        { ...mockTokens[0], volume_sol: 100 },
        { ...mockTokens[0], volume_sol: 500 },
      ];

      const merged = (aggregationService as any).mergeTokens(tokens);

      expect(merged).toHaveLength(1);
      expect(merged[0].volume_sol).toBe(500); // Should take max
    });

    it('should keep unique tokens separate', () => {
      const merged = (aggregationService as any).mergeTokens(mockTokens);

      expect(merged).toHaveLength(2);
    });
  });

  describe('applyFilters', () => {
    it('should filter by minimum volume', () => {
      const filtered = (aggregationService as any).applyFilters(mockTokens, {
        min_volume: 750,
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].token_ticker).toBe('TKB');
    });

    it('should filter by minimum liquidity', () => {
      const filtered = (aggregationService as any).applyFilters(mockTokens, {
        min_liquidity: 300,
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].token_ticker).toBe('TKB');
    });

    it('should apply multiple filters', () => {
      const filtered = (aggregationService as any).applyFilters(mockTokens, {
        min_volume: 250,
        min_liquidity: 150,
      });

      expect(filtered).toHaveLength(2);
    });
  });

  describe('applySort', () => {
    it('should sort by volume descending', () => {
      const sorted = (aggregationService as any).applySort(mockTokens, {
        sort_by: 'volume',
        sort_order: 'desc',
      });

      expect(sorted[0].token_ticker).toBe('TKB');
      expect(sorted[1].token_ticker).toBe('TKA');
    });

    it('should sort by volume ascending', () => {
      const sorted = (aggregationService as any).applySort(mockTokens, {
        sort_by: 'volume',
        sort_order: 'asc',
      });

      expect(sorted[0].token_ticker).toBe('TKA');
      expect(sorted[1].token_ticker).toBe('TKB');
    });

    it('should sort by market cap', () => {
      const sorted = (aggregationService as any).applySort(mockTokens, {
        sort_by: 'market_cap',
        sort_order: 'desc',
      });

      expect(sorted[0].market_cap_sol).toBe(2000);
    });
  });

  describe('applyPagination', () => {
    it('should paginate results', () => {
      const result = (aggregationService as any).applyPagination(mockTokens, {
        limit: 1,
      });

      expect(result.tokens).toHaveLength(1);
      expect(result.next_cursor).toBeDefined();
      expect(result.total_count).toBe(2);
    });

    it('should not have next cursor on last page', () => {
      const result = (aggregationService as any).applyPagination(mockTokens, {
        limit: 10,
      });

      expect(result.tokens).toHaveLength(2);
      expect(result.next_cursor).toBeUndefined();
    });

    it('should respect cursor for pagination', () => {
      const cursor = Buffer.from('1').toString('base64');
      const result = (aggregationService as any).applyPagination(mockTokens, {
        limit: 1,
        cursor,
      });

      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].token_ticker).toBe('TKB');
    });
  });

  describe('generateCacheKey', () => {
    it('should generate consistent cache keys', () => {
      const key1 = (aggregationService as any).generateCacheKey({
        sort_by: 'volume',
        sort_order: 'desc',
      });

      const key2 = (aggregationService as any).generateCacheKey({
        sort_by: 'volume',
        sort_order: 'desc',
      });

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different options', () => {
      const key1 = (aggregationService as any).generateCacheKey({
        sort_by: 'volume',
      });

      const key2 = (aggregationService as any).generateCacheKey({
        sort_by: 'market_cap',
      });

      expect(key1).not.toBe(key2);
    });
  });
});