# Rate Limiting Implementation

## Overview

This application uses **Vercel KV** (Redis-based key-value storage) for persistent rate limiting across serverless function invocations.

## Rate Limit Policies

- **Per Minute**: 4 requests per minute per client
- **Per Day**: 500 requests per day per client

These limits align with VirusTotal's free API tier to prevent exceeding their quotas.

## How It Works

### Client Identification

Each client is identified by their IP address, extracted from:
1. `x-forwarded-for` header (for proxies/load balancers)
2. `x-real-ip` header
3. Direct connection IP address

### Storage Structure

Rate limiting uses Redis **sorted sets** for efficient time-based tracking:

```
Key Pattern: ratelimit:{window}:{clientId}
- ratelimit:minute:192.168.1.1
- ratelimit:day:192.168.1.1

Members: Timestamp of each request (in milliseconds)
Score: Timestamp in seconds (for range queries)
```

### Sliding Window Algorithm

The implementation uses a sliding window algorithm for accurate rate limiting:

1. **Check**: Count requests within the time window
2. **Enforce**: Reject if limit exceeded, calculate wait time
3. **Record**: Add request timestamp to sorted set
4. **Cleanup**: Automatically expire old data (2x window size)

### Example Flow

```javascript
// 1. Client makes request
const clientId = getClientIdentifier(req); // "192.168.1.1"

// 2. Check rate limits
const check = await checkRateLimit(clientId);
if (!check.allowed) {
    return res.status(429).json({ message: check.message });
}

// 3. Process request...

// 4. Record successful request
await recordRequest(clientId);
```

## Vercel KV Setup

### Required Environment Variables

Vercel KV automatically provides these when you connect a KV database:
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `KV_REST_API_READ_ONLY_TOKEN`
- `KV_URL`

### Setup Steps

1. Create KV database in Vercel dashboard (Storage tab)
2. Connect to your project
3. Redeploy

See [VERCEL-DEPLOYMENT-GUIDE.md](./VERCEL-DEPLOYMENT-GUIDE.md) for detailed instructions.

## Adjusting Rate Limits

To modify rate limits, edit `rate-limiter.js`:

```javascript
const LIMITS = {
    PER_MINUTE: 4,  // Change this
    PER_DAY: 500    // Change this
};
```

## Monitoring

### Check Rate Limit Status

```bash
curl https://your-app.vercel.app/api/rate-limit-status
```

Response:
```json
{
    "requestsLastMinute": 2,
    "requestsToday": 45,
    "limits": {
        "perMinute": 4,
        "perDay": 500
    },
    "remaining": {
        "perMinute": 2,
        "perDay": 455
    }
}
```

### View KV Data

1. Go to Vercel dashboard → Storage → Your KV database
2. Click "Data Browser"
3. Search for keys: `ratelimit:*`

## Error Handling

The rate limiter **fails open** - if KV is unavailable, requests are allowed through:

```javascript
catch (error) {
    console.error('Rate limit check error:', error);
    return { allowed: true, warning: 'Rate limiting temporarily unavailable' };
}
```

For production, you may want to **fail closed** (reject requests when KV is down) by changing this behavior.

## Local Development

For local development without Vercel KV:

1. The rate limiter will fail open and allow all requests
2. Consider using a local Redis instance with environment variables:
   ```bash
   KV_REST_API_URL=http://localhost:6379
   KV_REST_API_TOKEN=your-local-token
   ```

## Performance

- **Latency**: ~10-50ms per rate limit check (KV is very fast)
- **Storage**: Minimal - each request is ~50 bytes
- **Cleanup**: Automatic via TTL (time-to-live) on keys

## Troubleshooting

### Rate limits not persisting

- Verify KV is connected to your project
- Check environment variables are set
- Redeploy after connecting KV

### "Rate limiting temporarily unavailable" warning

- KV connection issue
- Check Vercel KV status
- Verify environment variables

### Too many requests getting through

- Check if KV is properly connected
- Verify client identification is working
- Check Vercel function logs for errors
