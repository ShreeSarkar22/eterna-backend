import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  
  cache: {
    ttl: parseInt(process.env.CACHE_TTL || '30', 10), // seconds
    prefix: 'meme-coin:',
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  
  api: {
    dexScreener: {
      baseUrl: 'https://api.dexscreener.com/latest/dex',
      rateLimit: parseInt(process.env.DEXSCREENER_RATE_LIMIT || '300', 10),
    },
    jupiter: {
      baseUrl: 'https://lite-api.jup.ag',
      rateLimit: parseInt(process.env.JUPITER_RATE_LIMIT || '600', 10),
    },
  },
  
  websocket: {
    updateInterval: parseInt(process.env.WS_UPDATE_INTERVAL || '5000', 10),
  },
  
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },
  
  retry: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
  },
  
  nodeEnv: process.env.NODE_ENV || 'development',
};