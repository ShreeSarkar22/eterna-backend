import { Request, Response, NextFunction } from 'express';
import { aggregationService } from '../services/aggregationService';
import { createLogger } from '../utils/logger';
import { QueryOptions } from '../types';

const logger = createLogger('TokenController');

/**
 * Controller for token-related endpoints
 */
export class TokenController {
  /**
   * GET /api/tokens - Get aggregated tokens
   */
  async getTokens(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const options: QueryOptions = {
        limit: parseInt(req.query.limit as string) || 20,
        cursor: req.query.cursor as string,
        sort_by: (req.query.sort_by as any) || 'volume',
        sort_order: (req.query.sort_order as any) || 'desc',
        min_volume: req.query.min_volume ? parseFloat(req.query.min_volume as string) : undefined,
        min_liquidity: req.query.min_liquidity ? parseFloat(req.query.min_liquidity as string) : undefined,
      };

      logger.info('Fetching tokens', options);

      const result = await aggregationService.aggregateTokens(options);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/tokens/search?q=query - Search tokens
   */
  async searchTokens(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query.q as string;

      if (!query) {
        res.status(400).json({
          success: false,
          error: 'Query parameter "q" is required',
        });
        return;
      }

      const options: QueryOptions = {
        limit: parseInt(req.query.limit as string) || 20,
        cursor: req.query.cursor as string,
        sort_by: (req.query.sort_by as any) || 'volume',
        sort_order: (req.query.sort_order as any) || 'desc',
      };

      logger.info(`Searching tokens: ${query}`, options);

      const result = await aggregationService.searchTokens(query, options);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/tokens/:address - Get specific token by address
   */
  async getTokenByAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { address } = req.params;

      if (!address) {
        res.status(400).json({
          success: false,
          error: 'Token address is required',
        });
        return;
      }

      logger.info(`Fetching token: ${address}`);

      const token = await aggregationService.getTokenByAddress(address);

      if (!token) {
        res.status(404).json({
          success: false,
          error: 'Token not found',
        });
        return;
      }

      res.json({
        success: true,
        data: token,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/tokens/refresh - Force cache refresh
   */
  async refreshCache(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.info('Manual cache refresh requested');

      await aggregationService.invalidateCache();

      res.json({
        success: true,
        message: 'Cache refreshed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/health - Health check endpoint
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      message: 'Service is healthy',
      timestamp: Date.now(),
      uptime: process.uptime(),
    });
  }
}

export const tokenController = new TokenController();