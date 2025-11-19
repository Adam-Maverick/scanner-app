const { createClient } = require('redis');

// Create Redis client using the connection URL
const redisUrl = process.env.sky_REDIS_URL || process.env.REDIS_URL;
const redisClient = createClient({
    url: redisUrl,
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                return new Error('Max reconnection attempts reached');
            }
            return Math.min(retries * 100, 3000);
        }
    }
});

// Connect to Redis
redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('✅ Connected to Redis'));

// Initialize connection
(async () => {
    try {
        await redisClient.connect();
    } catch (err) {
        console.error('Failed to connect to Redis:', err);
    }
})();

// Create a kv-like interface for compatibility
const kv = {
    async zadd(key, options) {
        if (!redisClient.isOpen) return null;
        return await redisClient.zAdd(key, [{ score: options.score, value: options.member }]);
    },
    async zcount(key, min, max) {
        if (!redisClient.isOpen) return 0;
        return await redisClient.zCount(key, min, max);
    },
    async zrange(key, min, max, options = {}) {
        if (!redisClient.isOpen) return [];
        if (options.byScore) {
            const results = await redisClient.zRangeByScore(key, min, max, {
                LIMIT: options.count ? { offset: 0, count: options.count } : undefined
            });
            if (options.withScores) {
                return await redisClient.zRangeByScoreWithScores(key, min, max, {
                    LIMIT: options.count ? { offset: 0, count: options.count } : undefined
                });
            }
            return results;
        }
        if (options.withScores) {
            return await redisClient.zRangeWithScores(key, min, max);
        }
        return await redisClient.zRange(key, min, max);
    },
    async expire(key, seconds) {
        if (!redisClient.isOpen) return null;
        return await redisClient.expire(key, seconds);
    }
};

/**
 * Rate Limiter using Vercel KV (Redis)
 * Implements sliding window algorithm for accurate rate limiting
 * 
 * Limits:
 * - 4 requests per minute
 * - 500 requests per day
 */

const LIMITS = {
    PER_MINUTE: 4,
    PER_DAY: 500
};

const WINDOWS = {
    MINUTE: 60, // seconds
    DAY: 86400  // seconds
};

/**
 * Check if a request is within rate limits
 * @param {string} identifier - Unique identifier (e.g., IP address)
 * @returns {Promise<Object>} - { allowed: boolean, reason?: string, message?: string, waitTime?: number }
 */
async function checkRateLimit(identifier) {
    try {
        const now = Date.now();
        const nowSeconds = Math.floor(now / 1000);

        // Keys for tracking requests
        const minuteKey = `ratelimit:minute:${identifier}`;
        const dayKey = `ratelimit:day:${identifier}`;

        // Check per-minute limit
        const minuteCount = await countRequestsInWindow(minuteKey, nowSeconds, WINDOWS.MINUTE);

        if (minuteCount >= LIMITS.PER_MINUTE) {
            // Calculate wait time
            const oldestRequestTime = await getOldestRequestTime(minuteKey, nowSeconds, WINDOWS.MINUTE);
            const waitTime = oldestRequestTime ? Math.ceil(oldestRequestTime + WINDOWS.MINUTE - nowSeconds) : WINDOWS.MINUTE;

            return {
                allowed: false,
                reason: 'rate_limit',
                message: `Rate limit exceeded. Please wait ${waitTime} seconds before trying again.`,
                waitTime
            };
        }

        // Check per-day limit
        const dayCount = await countRequestsInWindow(dayKey, nowSeconds, WINDOWS.DAY);

        if (dayCount >= LIMITS.PER_DAY) {
            return {
                allowed: false,
                reason: 'daily_limit',
                message: 'Daily limit of 500 requests reached. Please try again tomorrow.',
                resetTime: 'tomorrow'
            };
        }

        return { allowed: true };

    } catch (error) {
        console.error('Rate limit check error:', error);
        // Fail open - allow request if KV is unavailable
        // In production, you might want to fail closed instead
        return {
            allowed: true,
            warning: 'Rate limiting temporarily unavailable'
        };
    }
}

/**
 * Record a successful request
 * @param {string} identifier - Unique identifier (e.g., IP address)
 */
async function recordRequest(identifier) {
    try {
        const now = Date.now();
        const nowSeconds = Math.floor(now / 1000);

        const minuteKey = `ratelimit:minute:${identifier}`;
        const dayKey = `ratelimit:day:${identifier}`;

        // Add request timestamp to sorted sets
        // Using sorted sets allows efficient time-based queries
        await Promise.all([
            kv.zadd(minuteKey, { score: nowSeconds, member: `${now}` }),
            kv.zadd(dayKey, { score: nowSeconds, member: `${now}` }),
            // Set expiration to clean up old data
            kv.expire(minuteKey, WINDOWS.MINUTE * 2), // 2 minutes
            kv.expire(dayKey, WINDOWS.DAY * 2) // 2 days
        ]);

    } catch (error) {
        console.error('Error recording request:', error);
        // Don't throw - recording failure shouldn't block the request
    }
}

/**
 * Get current rate limit status for an identifier
 * @param {string} identifier - Unique identifier (e.g., IP address)
 * @returns {Promise<Object>} - Status information
 */
async function getRateLimitStatus(identifier) {
    try {
        const nowSeconds = Math.floor(Date.now() / 1000);

        const minuteKey = `ratelimit:minute:${identifier}`;
        const dayKey = `ratelimit:day:${identifier}`;

        const [minuteCount, dayCount] = await Promise.all([
            countRequestsInWindow(minuteKey, nowSeconds, WINDOWS.MINUTE),
            countRequestsInWindow(dayKey, nowSeconds, WINDOWS.DAY)
        ]);

        return {
            requestsLastMinute: minuteCount,
            requestsToday: dayCount,
            limits: {
                perMinute: LIMITS.PER_MINUTE,
                perDay: LIMITS.PER_DAY
            },
            remaining: {
                perMinute: Math.max(0, LIMITS.PER_MINUTE - minuteCount),
                perDay: Math.max(0, LIMITS.PER_DAY - dayCount)
            }
        };

    } catch (error) {
        console.error('Error getting rate limit status:', error);
        return {
            requestsLastMinute: 0,
            requestsToday: 0,
            limits: {
                perMinute: LIMITS.PER_MINUTE,
                perDay: LIMITS.PER_DAY
            },
            remaining: {
                perMinute: LIMITS.PER_MINUTE,
                perDay: LIMITS.PER_DAY
            },
            error: 'Unable to fetch rate limit status'
        };
    }
}

/**
 * Count requests in a time window using sorted set
 * @param {string} key - Redis key
 * @param {number} nowSeconds - Current time in seconds
 * @param {number} windowSeconds - Window size in seconds
 * @returns {Promise<number>} - Count of requests in window
 */
async function countRequestsInWindow(key, nowSeconds, windowSeconds) {
    try {
        const windowStart = nowSeconds - windowSeconds;

        // Count members with score >= windowStart
        // This gives us all requests within the time window
        const count = await kv.zcount(key, windowStart, '+inf');

        return count || 0;
    } catch (error) {
        console.error(`Error counting requests for ${key}:`, error);
        return 0;
    }
}

/**
 * Get the timestamp of the oldest request in the window
 * @param {string} key - Redis key
 * @param {number} nowSeconds - Current time in seconds
 * @param {number} windowSeconds - Window size in seconds
 * @returns {Promise<number|null>} - Timestamp of oldest request or null
 */
async function getOldestRequestTime(key, nowSeconds, windowSeconds) {
    try {
        const windowStart = nowSeconds - windowSeconds;

        // Get the oldest request in the window
        const oldest = await kv.zrange(key, windowStart, '+inf', {
            byScore: true,
            count: 1
        });

        if (oldest && oldest.length > 0) {
            // The score is the timestamp
            const members = await kv.zrange(key, 0, 0, { withScores: true });
            return members && members.length > 0 ? members[0].score : null;
        }

        return null;
    } catch (error) {
        console.error(`Error getting oldest request for ${key}:`, error);
        return null;
    }
}

/**
 * Get client identifier from request
 * Uses IP address or falls back to a default
 * @param {Object} req - Express request object
 * @returns {string} - Client identifier
 */
function getClientIdentifier(req) {
    // Try to get real IP from various headers (for proxies/load balancers)
    const forwarded = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    const ip = forwarded
        ? forwarded.split(',')[0].trim()
        : realIp || req.ip || req.connection.remoteAddress || 'unknown';

    return ip;
}

module.exports = {
    checkRateLimit,
    recordRequest,
    getRateLimitStatus,
    getClientIdentifier
};
