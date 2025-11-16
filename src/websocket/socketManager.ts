import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { aggregationService } from '../services/aggregationService';
import { createLogger } from '../utils/logger';
import { WebSocketEvent, Token, QueryOptions } from '../types';
import { config } from '../config';

const logger = createLogger('SocketManager');

/**
 * WebSocket manager for real-time updates
 * Pushes price changes and volume spikes to connected clients
 */
export class SocketManager {
  private io: SocketIOServer;
  private updateInterval: NodeJS.Timeout | null = null;
  private previousTokens: Map<string, Token> = new Map();
  private clientFilters: Map<string, QueryOptions> = new Map();

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
    this.startUpdateLoop();
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Send initial data
      this.sendInitialData(socket);

      // Handle client filters
      socket.on('set_filters', (filters: QueryOptions) => {
        logger.debug(`Client ${socket.id} set filters`, filters);
        this.clientFilters.set(socket.id, filters);
        this.sendFilteredData(socket, filters);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
        this.clientFilters.delete(socket.id);
      });

      // Handle manual refresh request
      socket.on('refresh', async () => {
        logger.info(`Client ${socket.id} requested refresh`);
        await aggregationService.invalidateCache();
        this.sendInitialData(socket);
      });

      // Subscribe to specific token updates
      socket.on('subscribe_token', (tokenAddress: string) => {
        logger.debug(`Client ${socket.id} subscribed to token ${tokenAddress}`);
        socket.join(`token:${tokenAddress}`);
      });

      socket.on('unsubscribe_token', (tokenAddress: string) => {
        logger.debug(`Client ${socket.id} unsubscribed from token ${tokenAddress}`);
        socket.leave(`token:${tokenAddress}`);
      });
    });
  }

  /**
   * Send initial token data to newly connected client
   */
  private async sendInitialData(socket: Socket): Promise<void> {
    try {
      const data = await aggregationService.aggregateTokens({
        limit: 30,
        sort_by: 'volume',
        sort_order: 'desc',
      });

      socket.emit('initial_data', data);
      logger.debug(`Sent initial data to ${socket.id}: ${data.tokens.length} tokens`);
    } catch (error) {
      logger.error('Error sending initial data', error);
      socket.emit('error', { message: 'Failed to fetch initial data' });
    }
  }

  /**
   * Send filtered data to client
   */
  private async sendFilteredData(socket: Socket, filters: QueryOptions): Promise<void> {
    try {
      const data = await aggregationService.aggregateTokens(filters);
      socket.emit('filtered_data', data);
      logger.debug(`Sent filtered data to ${socket.id}: ${data.tokens.length} tokens`);
    } catch (error) {
      logger.error('Error sending filtered data', error);
      socket.emit('error', { message: 'Failed to fetch filtered data' });
    }
  }

  /**
   * Start the update loop for real-time updates
   */
  private startUpdateLoop(): void {
    this.updateInterval = setInterval(async () => {
      await this.checkForUpdates();
    }, config.websocket.updateInterval);

    logger.info(`WebSocket update loop started (interval: ${config.websocket.updateInterval}ms)`);
  }

  /**
   * Check for token updates and broadcast changes
   */
  private async checkForUpdates(): Promise<void> {
    try {
      // Invalidate cache to get fresh data
      await aggregationService.invalidateCache();

      const data = await aggregationService.aggregateTokens({
        limit: 50,
        sort_by: 'volume',
        sort_order: 'desc',
      });

      const currentTokens = new Map<string, Token>(
        data.tokens.map(t => [t.token_address, t])
      );

      // Detect changes
      const updates: Token[] = [];
      const volumeSpikes: Token[] = [];

      for (const [address, currentToken] of currentTokens.entries()) {
        const previousToken = this.previousTokens.get(address);

        if (previousToken) {
          // Check for price changes (>1% change)
          const priceChange = Math.abs(
            ((currentToken.price_sol - previousToken.price_sol) / previousToken.price_sol) * 100
          );

          if (priceChange > 1) {
            updates.push(currentToken);
          }

          // Check for volume spikes (>50% increase)
          const volumeIncrease = 
            ((currentToken.volume_sol - previousToken.volume_sol) / previousToken.volume_sol) * 100;

          if (volumeIncrease > 50) {
            volumeSpikes.push(currentToken);
          }

          // Notify token-specific subscribers
          this.io.to(`token:${address}`).emit('token_update', {
            type: 'price_update',
            data: currentToken,
            timestamp: Date.now(),
          } as WebSocketEvent);
        }
      }

      // Broadcast price updates
      if (updates.length > 0) {
        this.io.emit('price_updates', {
          type: 'price_update',
          data: updates,
          timestamp: Date.now(),
        } as WebSocketEvent);

        logger.info(`Broadcasted ${updates.length} price updates`);
      }

      // Broadcast volume spikes
      if (volumeSpikes.length > 0) {
        this.io.emit('volume_spikes', {
          type: 'volume_spike',
          data: volumeSpikes,
          timestamp: Date.now(),
        } as WebSocketEvent);

        logger.info(`Broadcasted ${volumeSpikes.length} volume spikes`);
      }

      // Update previous tokens
      this.previousTokens = currentTokens;

    } catch (error) {
      logger.error('Error checking for updates', error);
    }
  }

  /**
   * Broadcast custom event to all clients
   */
  public broadcast(event: string, data: any): void {
    this.io.emit(event, data);
    logger.debug(`Broadcasted event: ${event}`);
  }

  /**
   * Get number of connected clients
   */
  public getConnectedClients(): number {
    return this.io.sockets.sockets.size;
  }

  /**
   * Stop update loop
   */
  public stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      logger.info('WebSocket update loop stopped');
    }
  }
}

let socketManager: SocketManager | null = null;

export const initializeSocketManager = (httpServer: HTTPServer): SocketManager => {
  socketManager = new SocketManager(httpServer);
  return socketManager;
};

export const getSocketManager = (): SocketManager | null => {
  return socketManager;
};