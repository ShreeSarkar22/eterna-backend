# Meme Coin Data Aggregation Service

A real-time cryptocurrency data aggregation service that fetches, merges, and streams meme coin data from multiple DEX sources (DexScreener and Jupiter) with WebSocket support for live updates.

## Features

- **Multi-Source Aggregation**: Combines data from DexScreener and Jupiter APIs
- **Real-time Updates**: WebSocket support for live price and volume updates
- **Intelligent Caching**: Redis-based caching with configurable TTL (default 30s)
- **Rate Limiting**: Built-in rate limiting to respect API limits
- **Exponential Backoff**: Automatic retry with exponential backoff for failed requests
- **Duplicate Handling**: Smart merging of tokens appearing on multiple DEXs
- **Advanced Filtering**: Filter by volume, liquidity, and time periods
- **Cursor Pagination**: Efficient pagination for large datasets
- **Comprehensive Testing**: Unit and integration tests with >70% coverage

##  Prerequisites

- Node.js (v18 or higher)
- Redis (local installation or Redis Cloud account)
- npm or yarn

##  Installation

1. **Clone the repository**:
```bash
git clone https://github.com/ShreeSarkar22/eterna-backend.git
cd meme-coin-aggregator
```

2. **Install dependencies**:
```bash
npm install
```

3. **Setup Redis**:

4. **Configure environment variables**:

Edit `.env` with your settings:
```env
PORT=3000
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-password-if-needed
CACHE_TTL=30
```

## Running the Application

**Development mode**:
```bash
npm run dev
```

**Production mode**:
```bash
npm run build
npm start
```

**Run tests**:
```bash
npm test
```

## API Endpoints

### REST API

#### Health Check
```http
GET /api/health
```

#### Get Tokens
```http
GET /api/tokens?limit=20&sort_by=volume&sort_order=desc&min_volume=100
```

Query Parameters:
- `limit` (number): Number of tokens to return (default: 20, max: 100)
- `cursor` (string): Pagination cursor
- `sort_by` (string): Sort field (volume, market_cap, liquidity, price_change)
- `sort_order` (string): Sort order (asc, desc)
- `min_volume` (number): Minimum volume filter
- `min_liquidity` (number): Minimum liquidity filter

#### Search Tokens
```http
GET /api/tokens/search?q=SOL&limit=10
```

#### Get Token by Address
```http
GET /api/tokens/:address
```

#### Refresh Cache
```http
POST /api/tokens/refresh
```

### WebSocket Events

**Connect to WebSocket**:
```javascript
const socket = io('ws://localhost:3000');
```

**Events**:

- `connection`: Fired on successful connection
- `initial_data`: Receive initial token data
- `price_updates`: Real-time price changes (>1% change)
- `volume_spikes`: Volume spikes (>50% increase)
- `token_update`: Updates for subscribed tokens

**Client Events**:

- `set_filters`: Set custom filters
```javascript
socket.emit('set_filters', {
  limit: 20,
  sort_by: 'volume',
  min_volume: 100
});
```

- `subscribe_token`: Subscribe to specific token
```javascript
socket.emit('subscribe_token', 'token-address');
```

- `refresh`: Request cache refresh
```javascript
socket.emit('refresh');
```

##  Architecture

### Design Decisions

1. **Multi-Source Aggregation**: 
   - Fetches from DexScreener and Jupiter in parallel using `Promise.allSettled`
   - Merges duplicates based on token address
   - Prefers data with more complete information

2. **Caching Strategy**:
   - Redis for distributed caching
   - 30-second TTL balances freshness and API usage
   - Cache keys include query parameters for precise matching
   - Pattern-based invalidation for manual refreshes

3. **Rate Limiting**:
   - Per-API rate limiters prevent exceeding limits
   - Global rate limiter protects against client abuse
   - Uses Redis for distributed rate limiting

4. **WebSocket Implementation**:
   - Polling interval checks for significant changes
   - Only broadcasts meaningful updates (>1% price change, >50% volume spike)
   - Room-based subscriptions for specific tokens
   - Client-specific filters stored in memory

5. **Error Handling**:
   - Exponential backoff for transient failures
   - Graceful degradation when sources fail
   - Comprehensive logging at all levels

### Data Flow

```
Client Request → Rate Limiter → Controller → Aggregation Service
                                                    ↓
                                            Check Cache
                                                    ↓
                                        Cache Miss → Fetch from APIs
                                                    ↓
                                            DexScreener + Jupiter
                                                    ↓
                                            Merge & Deduplicate
                                                    ↓
                                            Filter & Sort
                                                    ↓
                                            Paginate
                                                    ↓
                                            Cache Result
                                                    ↓
                                            Return to Client

WebSocket Updates: Background job → Check changes → Broadcast to clients
```


### Test Coverage

- Cache Service: Get/Set, TTL, Patterns, Multi-operations
- Aggregation Service: Merging, Filtering, Sorting, Pagination
- API Integration: All endpoints, Error handling, Parameter validation
- WebSocket: Connection, Events, Subscriptions

## 📊 Performance Benchmarks

Expected performance metrics:

- **Cache Hit**: <10ms response time
- **Cache Miss (Single Source)**: 200-500ms
- **Cache Miss (All Sources)**: 500-1000ms
- **WebSocket Update Latency**: <100ms
- **Throughput**: 100+ requests/second with caching

##  Configuration

All configuration is in `src/config/index.ts`:

```typescript
{
  cache: {
    ttl: 30, // seconds
  },
  websocket: {
    updateInterval: 5000, // ms
  },
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  }
}
```

##  API Response Format

```json
{
  "success": true,
  "data": {
    "tokens": [
      {
        "token_address": "addr123",
        "token_name": "Example Token",
        "token_ticker": "EXAMPLE",
        "price_sol": 0.5,
        "market_cap_sol": 1000,
        "volume_sol": 500,
        "liquidity_sol": 200,
        "transaction_count": 100,
        "price_1hr_change": 5.2,
        "price_24hr_change": -2.1,
        "protocol": "Raydium",
        "last_updated": 1699999999999
      }
    ],
    "next_cursor": "eyJvZmZzZXQiOjIwfQ==",
    "total_count": 150,
    "timestamp": 1699999999999
  }
}
```

##  Troubleshooting

**Redis Connection Error**:
```
- Check Redis is running: redis-cli ping
- Verify connection details in .env
- Check firewall/network settings
```

**API Rate Limit Errors**:
```
- Reduce WS_UPDATE_INTERVAL
- Increase CACHE_TTL
- Implement request queuing
```

**WebSocket Not Connecting**:
```
- Check CORS configuration
- Verify port is accessible
- Check firewall rules
```



## Acknowledgments

- DexScreener API
- Jupiter Aggregator


**Demo Video**: [YouTube Link]
**Live Demo**: https://eterna-backend-zt7y.onrender.com/
