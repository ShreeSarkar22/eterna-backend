// Core token data structure matching the requirement
export interface Token {
  token_address: string;
  token_name: string;
  token_ticker: string;
  price_sol: number;
  market_cap_sol: number;
  volume_sol: number;
  liquidity_sol: number;
  transaction_count: number;
  price_1hr_change: number;
  price_24hr_change?: number;
  price_7d_change?: number;
  protocol: string;
  dex_id?: string;
  last_updated: number;
}

// API response structure
export interface TokenResponse {
  tokens: Token[];
  next_cursor?: string;
  total_count: number;
  timestamp: number;
}

// Filter and sort options
export interface QueryOptions {
  limit?: number;
  cursor?: string;
  time_period?: '1h' | '24h' | '7d';
  sort_by?: 'volume' | 'price_change' | 'market_cap' | 'liquidity';
  sort_order?: 'asc' | 'desc';
  min_volume?: number;
  min_liquidity?: number;
}

// WebSocket event types
export interface WebSocketEvent {
  type: 'price_update' | 'volume_spike' | 'new_token';
  data: Token | Token[];
  timestamp: number;
}

// API source configuration
export interface APISource {
  name: string;
  baseUrl: string;
  rateLimit: number;
  lastCallTime: number;
  callCount: number;
}

// Cache configuration
export interface CacheConfig {
  ttl: number;
  prefix: string;
}

// Retry configuration for exponential backoff
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}