import request from 'supertest';
import express from 'express';
import { tokenController } from '../../src/controllers/tokenController';
import { errorHandler } from '../../src/middleware/errorHandler';

// Mock services
jest.mock('../../src/services/aggregationService');
jest.mock('../../src/services/cacheService');

describe('API Integration Tests', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Setup routes
    app.get('/api/health', tokenController.healthCheck.bind(tokenController));
    app.get('/api/tokens', tokenController.getTokens.bind(tokenController));
    app.get('/api/tokens/search', tokenController.searchTokens.bind(tokenController));
    app.get('/api/tokens/:address', tokenController.getTokenByAddress.bind(tokenController));
    app.post('/api/tokens/refresh', tokenController.refreshCache.bind(tokenController));

    app.use(errorHandler);
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });
  });

  describe('GET /api/tokens', () => {
    it('should return tokens with default parameters', async () => {
      const response = await request(app)
        .get('/api/tokens')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });

    it('should accept limit parameter', async () => {
      const response = await request(app)
        .get('/api/tokens?limit=10')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should accept sort parameters', async () => {
      const response = await request(app)
        .get('/api/tokens?sort_by=volume&sort_order=desc')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should accept filter parameters', async () => {
      const response = await request(app)
        .get('/api/tokens?min_volume=100&min_liquidity=50')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should accept cursor for pagination', async () => {
      const cursor = Buffer.from('10').toString('base64');
      const response = await request(app)
        .get(`/api/tokens?cursor=${cursor}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/tokens/search', () => {
    it('should require query parameter', async () => {
      const response = await request(app)
        .get('/api/tokens/search')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });

    it('should search tokens with query', async () => {
      const response = await request(app)
        .get('/api/tokens/search?q=SOL')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('data');
    });

    it('should accept additional parameters', async () => {
      const response = await request(app)
        .get('/api/tokens/search?q=SOL&limit=5&sort_by=volume')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/tokens/:address', () => {
    it('should return token by address', async () => {
      const response = await request(app)
        .get('/api/tokens/test-address-123')
        .expect(200);

      expect(response.body).toHaveProperty('success');
    });

    it('should handle invalid address', async () => {
      const response = await request(app)
        .get('/api/tokens/');

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /api/tokens/refresh', () => {
    it('should refresh cache', async () => {
      const response = await request(app)
        .post('/api/tokens/refresh')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('refresh');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/unknown-route')
        .expect(404);
    });
  });
});