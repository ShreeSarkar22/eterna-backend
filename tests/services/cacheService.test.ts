import { CacheService } from '../../src/services/cacheService';

describe('CacheService', () => {
  let cacheService: CacheService;

  beforeAll(() => {
    cacheService = new CacheService();
  });

  afterAll(async () => {
    await cacheService.disconnect();
  });

  beforeEach(async () => {
    // Clear cache before each test
    await cacheService.deletePattern('*');
  });

  describe('set and get', () => {
    it('should set and retrieve a value', async () => {
      await cacheService.set('test-key', { data: 'test-value' }, 60);
      const result = await cacheService.get('test-key');

      expect(result).toEqual({ data: 'test-value' });
    });

    it('should return null for non-existent key', async () => {
      const result = await cacheService.get('non-existent');
      expect(result).toBeNull();
    });

    it('should expire after TTL', async () => {
      await cacheService.set('expire-test', { data: 'value' }, 1);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const result = await cacheService.get('expire-test');
      expect(result).toBeNull();
    }, 10000);
  });

  describe('delete', () => {
    it('should delete a key', async () => {
      await cacheService.set('delete-test', { data: 'value' });
      await cacheService.delete('delete-test');
      
      const result = await cacheService.get('delete-test');
      expect(result).toBeNull();
    });

    it('should delete keys matching pattern', async () => {
      await cacheService.set('prefix:key1', { data: 'value1' });
      await cacheService.set('prefix:key2', { data: 'value2' });
      await cacheService.set('other:key', { data: 'value3' });

      await cacheService.deletePattern('prefix:*');

      expect(await cacheService.get('prefix:key1')).toBeNull();
      expect(await cacheService.get('prefix:key2')).toBeNull();
      expect(await cacheService.get('other:key')).not.toBeNull();
    });
  });

  describe('exists', () => {
    it('should check if key exists', async () => {
      await cacheService.set('exists-test', { data: 'value' });
      
      expect(await cacheService.exists('exists-test')).toBe(true);
      expect(await cacheService.exists('non-existent')).toBe(false);
    });
  });

  describe('mget and mset', () => {
    it('should set and get multiple keys', async () => {
      await cacheService.mset([
        { key: 'key1', value: { data: 'value1' } },
        { key: 'key2', value: { data: 'value2' } },
        { key: 'key3', value: { data: 'value3' } },
      ]);

      const results = await cacheService.mget(['key1', 'key2', 'key3', 'key4']);

      expect(results[0]).toEqual({ data: 'value1' });
      expect(results[1]).toEqual({ data: 'value2' });
      expect(results[2]).toEqual({ data: 'value3' });
      expect(results[3]).toBeNull();
    });
  });

  describe('increment', () => {
    it('should increment counter', async () => {
      const count1 = await cacheService.increment('counter', 60);
      const count2 = await cacheService.increment('counter', 60);
      const count3 = await cacheService.increment('counter', 60);

      expect(count1).toBe(1);
      expect(count2).toBe(2);
      expect(count3).toBe(3);
    });
  });
});