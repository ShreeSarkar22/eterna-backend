import express, { Application } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import cors from 'cors';
import { config } from './config';
import { tokenController } from './controllers/tokenController';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { initializeSocketManager } from './websocket/socketManager';
import { createLogger } from './utils/logger';
import { cacheService } from './services/cacheService';

const logger = createLogger('Server');

/**
 * Main Express application
 */
class App {
  public app: Application;
  public httpServer: HTTPServer;

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    this.setupWebSocket();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // CORS
    this.app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        query: req.query,
        ip: req.ip,
      });
      next();
    });

    // Rate limiting (apply globally)
    this.app.use(rateLimiter);
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    const router = express.Router();

    // Health check
    router.get('/health', tokenController.healthCheck.bind(tokenController));

    // Token endpoints
    router.get('/tokens', tokenController.getTokens.bind(tokenController));
    router.get('/tokens/search', tokenController.searchTokens.bind(tokenController));
    router.get('/tokens/:address', tokenController.getTokenByAddress.bind(tokenController));
    router.post('/tokens/refresh', tokenController.refreshCache.bind(tokenController));

    // Mount router
    this.app.use('/api', router);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Meme Coin Aggregator API',
        version: '1.0.0',
        endpoints: {
          health: '/api/health',
          tokens: '/api/tokens',
          search: '/api/tokens/search?q=<query>',
          tokenByAddress: '/api/tokens/:address',
          refresh: '/api/tokens/refresh (POST)',
        },
        websocket: {
          url: `ws://localhost:${config.port}`,
          events: {
            connection: 'Connect to receive real-time updates',
            initial_data: 'Received on connection',
            price_updates: 'Real-time price changes',
            volume_spikes: 'Significant volume increases',
            set_filters: 'Set custom filters',
            subscribe_token: 'Subscribe to specific token',
          },
        },
        documentation: 'https://github.com/ShreeSarkar22/eterna-backend',
      });
    });
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  /**
   * Setup WebSocket server
   */
  private setupWebSocket(): void {
    initializeSocketManager(this.httpServer);
    logger.info('WebSocket server initialized');
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    try {
      // Test Redis connection
      await cacheService.set('test', 'connection', 10);
      logger.info('Redis connection successful');

      this.httpServer.listen(config.port, () => {
        logger.info(`Server running on port ${config.port}`);
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info(`API available at: http://localhost:${config.port}/api`);
        logger.info(`WebSocket available at: ws://localhost:${config.port}`);
      });
    } catch (error) {
      logger.error('Failed to start server', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down gracefully...');

    // Close HTTP server
    this.httpServer.close(() => {
      logger.info('HTTP server closed');
    });

    // Disconnect Redis
    await cacheService.disconnect();

    process.exit(0);
  }
}

// Create and start application
const app = new App();

// Handle graceful shutdown
process.on('SIGTERM', () => app.shutdown());
process.on('SIGINT', () => app.shutdown());

// Start server
app.start();
