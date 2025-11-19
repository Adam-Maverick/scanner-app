require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;
const VIRUSTOTAL_API_KEY = process.env.VIRUSTOTAL_API_KEY;

// Import KV-based rate limiter
const { checkRateLimit, recordRequest, getRateLimitStatus, getClientIdentifier } = require('./rate-limiter');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (HTML, CSS, JS)
app.use(express.static(__dirname));

/**
 * API Endpoint: Submit URL for scanning
 * POST /api/scan
 */
app.post('/api/scan', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                error: 'URL is required',
                message: 'Please provide a URL to scan'
            });
        }

        // Check rate limits using client identifier
        const clientId = getClientIdentifier(req);
        const rateLimitCheck = await checkRateLimit(clientId);
        if (!rateLimitCheck.allowed) {
            return res.status(429).json({
                error: 'rate_limit_exceeded',
                message: rateLimitCheck.message,
                reason: rateLimitCheck.reason,
                waitTime: rateLimitCheck.waitTime,
                resetTime: rateLimitCheck.resetTime
            });
        }

        // Submit URL to VirusTotal
        const response = await fetch('https://www.virustotal.com/api/v3/urls', {
            method: 'POST',
            headers: {
                'x-apikey': VIRUSTOTAL_API_KEY,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `url=${encodeURIComponent(url)}`
        });

        const data = await response.json();

        // Handle VirusTotal API errors
        if (!response.ok) {
            if (response.status === 429) {
                return res.status(429).json({
                    error: 'virustotal_rate_limit',
                    message: 'VirusTotal API rate limit reached. Please try again later.',
                    vtError: data.error
                });
            }

            return res.status(response.status).json({
                error: 'virustotal_error',
                message: data.error?.message || 'Error communicating with VirusTotal',
                vtError: data.error
            });
        }

        // Record successful request
        recordRequest();

        // Return analysis ID
        res.json({
            success: true,
            analysisId: data.data.id,
            url: url
        });

    } catch (error) {
        console.error('Error in /api/scan:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'An error occurred while processing your request',
            details: error.message
        });
    }
});

/**
 * API Endpoint: Get analysis results
 * GET /api/analysis/:id
 */
app.get('/api/analysis/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                error: 'Analysis ID is required'
            });
        }

        // Check rate limits using client identifier
        const clientId = getClientIdentifier(req);
        const rateLimitCheck = await checkRateLimit(clientId);
        if (!rateLimitCheck.allowed) {
            return res.status(429).json({
                error: 'rate_limit_exceeded',
                message: rateLimitCheck.message,
                reason: rateLimitCheck.reason,
                waitTime: rateLimitCheck.waitTime,
                resetTime: rateLimitCheck.resetTime
            });
        }

        // Get analysis from VirusTotal
        const response = await fetch(`https://www.virustotal.com/api/v3/analyses/${id}`, {
            method: 'GET',
            headers: {
                'x-apikey': VIRUSTOTAL_API_KEY
            }
        });

        const data = await response.json();

        // Handle VirusTotal API errors
        if (!response.ok) {
            if (response.status === 429) {
                return res.status(429).json({
                    error: 'virustotal_rate_limit',
                    message: 'VirusTotal API rate limit reached. Please try again later.',
                    vtError: data.error
                });
            }

            return res.status(response.status).json({
                error: 'virustotal_error',
                message: data.error?.message || 'Error communicating with VirusTotal',
                vtError: data.error
            });
        }

        // Record successful request
        recordRequest();

        // Return analysis results
        res.json({
            success: true,
            data: data.data
        });

    } catch (error) {
        console.error('Error in /api/analysis:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'An error occurred while processing your request',
            details: error.message
        });
    }
});

/**
 * API Endpoint: Get rate limit status
 * GET /api/rate-limit-status
 */
app.get('/api/rate-limit-status', async (req, res) => {
    try {
        const clientId = getClientIdentifier(req);
        const status = await getRateLimitStatus(clientId);
        res.json(status);
    } catch (error) {
        console.error('Error getting rate limit status:', error);
        res.status(500).json({
            error: 'Unable to fetch rate limit status'
        });
    }
});

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 VirusTotal API Key: ${VIRUSTOTAL_API_KEY ? '✓ Configured' : '✗ Missing'}`);
    console.log(`⚡ Rate Limits: 4 req/min, 500 req/day`);
});
