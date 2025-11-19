// ===== VIRUSTOTAL API INTEGRATION =====
class VirusTotalAPI {
    static API_BASE = '/api'; // Backend API endpoint

    /**
     * Scan a URL using VirusTotal API via backend
     * @param {string} url - The URL to scan
     * @returns {Promise<Object>} - Scan results
     */
    static async scanURL(url) {
        try {
            // Step 1: Submit URL for scanning
            const analysisId = await this.submitURL(url);

            // Step 2: Poll for results
            const results = await this.pollForResults(analysisId);

            // Step 3: Transform and classify results
            return this.transformResults(url, results);

        } catch (error) {
            // Handle specific error types
            if (error.rateLimitError) {
                throw error; // Pass through rate limit errors
            }

            throw {
                error: 'scan_failed',
                message: error.message || 'Failed to scan URL. Please try again.',
                originalError: error
            };
        }
    }

    /**
     * Submit URL to backend for scanning
     */
    static async submitURL(url) {
        const response = await fetch(`${this.API_BASE}/scan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });

        const data = await response.json();

        if (!response.ok) {
            if (response.status === 429) {
                throw {
                    rateLimitError: true,
                    message: data.message,
                    reason: data.reason,
                    waitTime: data.waitTime
                };
            }
            throw new Error(data.message || 'Failed to submit URL');
        }

        return data.analysisId;
    }

    /**
     * Poll for analysis results with timeout
     */
    static async pollForResults(analysisId, maxAttempts = 30, interval = 2000) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const response = await fetch(`${this.API_BASE}/analysis/${analysisId}`);
            const data = await response.json();

            if (!response.ok) {
                if (response.status === 429) {
                    throw {
                        rateLimitError: true,
                        message: data.message,
                        reason: data.reason,
                        waitTime: data.waitTime
                    };
                }
                throw new Error(data.message || 'Failed to get analysis results');
            }

            const analysis = data.data.attributes;

            // Check if analysis is complete
            if (analysis.status === 'completed') {
                return analysis;
            }

            // Wait before next poll
            await this.delay(interval);
        }

        throw new Error('Analysis timeout - please try again later');
    }

    /**
     * Transform VirusTotal results into UI format
     */
    static transformResults(url, analysis) {
        const stats = analysis.stats;
        const results = analysis.results;

        // Classify risk level
        const riskLevel = this.classifyRisk(stats);

        // Get threat details
        const threats = this.extractThreats(results, riskLevel);

        // Generate recommendations
        const recommendations = this.generateRecommendations(riskLevel, stats);

        // Get metadata
        const urlInfo = analysis.meta?.url_info || {};

        return {
            url: urlInfo.url || url,
            scanDate: new Date(analysis.date * 1000).toISOString(),
            status: riskLevel,
            title: this.getRiskTitle(riskLevel),
            description: this.getRiskDescription(riskLevel, stats),
            explanation: this.getRiskExplanation(riskLevel, stats),
            threats,
            stats: {
                detectionsPositive: stats.malicious + stats.suspicious,
                detectionsTotal: Object.values(stats).reduce((a, b) => a + b, 0),
                reputation: this.calculateReputation(stats),
                age: 'Unknown' // VirusTotal analysis doesn't provide domain age
            },
            recommendations,
            rawStats: stats,
            engineResults: results
        };
    }

    /**
     * Classify risk based on VirusTotal stats
     */
    static classifyRisk(stats) {
        if (stats.malicious > 0) {
            return 'dangerous';
        }
        if (stats.suspicious > 3) {
            return 'suspicious';
        }
        return 'safe';
    }

    /**
     * Extract threat information from engine results
     */
    static extractThreats(results, riskLevel) {
        if (riskLevel === 'safe') return [];

        const threats = [];
        const maliciousEngines = [];
        const suspiciousEngines = [];

        for (const [engine, result] of Object.entries(results)) {
            if (result.category === 'malicious') {
                maliciousEngines.push(`${engine}: ${result.result}`);
            } else if (result.category === 'suspicious') {
                suspiciousEngines.push(`${engine}: ${result.result}`);
            }
        }

        if (maliciousEngines.length > 0) {
            threats.push(`Detected as malicious by ${maliciousEngines.length} security vendor(s)`);
            threats.push(...maliciousEngines.slice(0, 5)); // Show top 5
        }

        if (suspiciousEngines.length > 0) {
            threats.push(`Flagged as suspicious by ${suspiciousEngines.length} security vendor(s)`);
            if (maliciousEngines.length === 0) {
                threats.push(...suspiciousEngines.slice(0, 3)); // Show top 3
            }
        }

        return threats;
    }

    /**
     * Generate recommendations based on risk level
     */
    static generateRecommendations(riskLevel, stats) {
        const recommendations = {
            safe: [
                'Always verify the URL matches the intended destination',
                'Keep your browser and security software up to date',
                'Be cautious when entering personal information'
            ],
            suspicious: [
                'Do not enter passwords or financial information',
                'Verify the legitimacy through official channels',
                'Consider using a virtual machine or sandbox',
                'Report if you suspect malicious intent'
            ],
            dangerous: [
                'DO NOT visit this URL under any circumstances',
                'Do not download any files from this source',
                'Report this URL to your IT security team',
                'Run a full system scan if you visited this site',
                'Change passwords if you entered credentials'
            ]
        };

        return recommendations[riskLevel] || recommendations.safe;
    }

    /**
     * Get risk title
     */
    static getRiskTitle(riskLevel) {
        const titles = {
            safe: 'Safe to Visit',
            suspicious: 'Potentially Suspicious',
            dangerous: 'Dangerous - Do Not Visit'
        };
        return titles[riskLevel];
    }

    /**
     * Get risk description
     */
    static getRiskDescription(riskLevel, stats) {
        if (riskLevel === 'dangerous') {
            return `This URL has been identified as dangerous. ${stats.malicious} security vendor(s) have flagged this site for malicious activity.`;
        }
        if (riskLevel === 'suspicious') {
            return `This URL shows some suspicious characteristics. ${stats.suspicious} security vendor(s) have flagged potential concerns. Proceed with caution.`;
        }
        return `This URL has been analyzed and appears to be safe. No malicious activity or suspicious patterns were detected by ${stats.harmless} security vendors.`;
    }

    /**
     * Get detailed risk explanation
     */
    static getRiskExplanation(riskLevel, stats) {
        if (riskLevel === 'dangerous') {
            return 'CRITICAL WARNING: This URL is associated with confirmed malicious activity. Multiple security vendors have identified this site as actively distributing malware, conducting phishing attacks, or engaging in other harmful activities. Visiting this site could compromise your device and personal information.';
        }
        if (riskLevel === 'suspicious') {
            return 'Our analysis detected several warning signs that suggest this URL may not be entirely trustworthy. While not definitively malicious, the site exhibits patterns that warrant caution. Avoid entering sensitive information.';
        }
        return 'Our comprehensive security scan checked this URL against multiple threat databases and behavioral analysis systems. The site shows no signs of phishing, malware distribution, or other malicious activities.';
    }

    /**
     * Calculate reputation score (0-100)
     */
    static calculateReputation(stats) {
        const total = Object.values(stats).reduce((a, b) => a + b, 0);
        if (total === 0) return 50;

        const harmlessPercent = (stats.harmless / total) * 100;
        return Math.round(harmlessPercent);
    }

    /**
     * Delay helper
     */
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ===== UI CONTROLLER =====
class ScannerUI {
    constructor() {
        this.form = document.getElementById('scanForm');
        this.urlInput = document.getElementById('urlInput');
        this.scanButton = document.getElementById('scanButton');
        this.loadingState = document.getElementById('loadingState');
        this.resultsContainer = document.getElementById('resultsContainer');

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    async handleSubmit(event) {
        event.preventDefault();

        let url = this.urlInput.value.trim();

        // Normalize URL by adding https:// if no protocol is specified
        url = this.normalizeURL(url);

        if (!this.isValidURL(url)) {
            this.showError('Please enter a valid URL');
            return;
        }

        await this.performScan(url);
    }

    normalizeURL(url) {
        // If URL doesn't start with http:// or https://, add https://
        if (!url.match(/^https?:\/\//i)) {
            return 'https://' + url;
        }
        return url;
    }

    isValidURL(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    async performScan(url) {
        // Show loading state
        this.showLoading();

        try {
            // Call VirusTotal API via backend
            const results = await VirusTotalAPI.scanURL(url);

            // Hide loading and show results
            this.hideLoading();
            this.displayResults(results);

        } catch (error) {
            this.hideLoading();

            // Handle rate limit errors specifically
            if (error.rateLimitError) {
                let errorMessage = error.message;

                if (error.reason === 'daily_limit') {
                    errorMessage += '\n\nThe daily limit of 500 scans has been reached. This limit will reset tomorrow.';
                } else if (error.reason === 'rate_limit' && error.waitTime) {
                    errorMessage += `\n\nYou can try again in ${error.waitTime} seconds.`;
                }

                this.showError(errorMessage);
            } else {
                // Handle other errors
                this.showError(error.message || 'An error occurred during scanning. Please try again.');
            }

            console.error('Scan error:', error);
        }
    }

    showLoading() {
        this.scanButton.disabled = true;
        this.loadingState.classList.remove('hidden');
        this.resultsContainer.classList.add('hidden');
    }

    hideLoading() {
        this.scanButton.disabled = false;
        this.loadingState.classList.add('hidden');
    }

    displayResults(results) {
        this.resultsContainer.innerHTML = this.generateResultsHTML(results);
        this.resultsContainer.classList.remove('hidden');

        // Scroll to results
        setTimeout(() => {
            this.resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);

        // Initialize action buttons
        this.initializeActionButtons();
    }

    generateResultsHTML(results) {
        const icons = {
            safe: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`,
            suspicious: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`,
            dangerous: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 8V12M12 16H12.01M4.93 4.93L19.07 19.07M19.07 4.93L4.93 19.07" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`
        };

        const threatsHTML = results.threats.length > 0
            ? `<div class="detail-section">
                <h3>Detected Threats</h3>
                <ul class="threat-list">
                    ${results.threats.map(threat => `<li>${threat}</li>`).join('')}
                </ul>
            </div>`
            : '';

        const recommendationsHTML = results.recommendations.length > 0
            ? `<div class="detail-section">
                <h3>Recommendations</h3>
                <ul class="threat-list">
                    ${results.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>`
            : '';

        return `
            <div class="result-card ${results.status}">
                <div class="result-header">
                    <div class="status-icon">
                        ${icons[results.status]}
                    </div>
                    <div class="result-info">
                        <div class="status-label">${results.status}</div>
                        <h2 class="status-title">${results.title}</h2>
                        <div class="scanned-url">${results.url}</div>
                    </div>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-value">${results.stats.detectionsPositive}/${results.stats.detectionsTotal}</div>
                        <div class="stat-label">Detections</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${results.stats.reputation}</div>
                        <div class="stat-label">Reputation Score</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${results.stats.age}</div>
                        <div class="stat-label">Domain Age</div>
                    </div>
                </div>
                
                <div class="result-details">
                    <div class="detail-section">
                        <h3>Analysis Summary</h3>
                        <p>${results.description}</p>
                    </div>
                    
                    <div class="detail-section">
                        <h3>Detailed Explanation</h3>
                        <p>${results.explanation}</p>
                    </div>
                    
                    ${threatsHTML}
                    ${recommendationsHTML}
                </div>
                
                <div class="result-actions">
                    <button class="action-button" id="scanAgainBtn">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2"/>
                            <path d="M12 8V12L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                        Scan Another URL
                    </button>
                    <button class="action-button" id="copyResultsBtn">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M8 4V16C8 16.5304 8.21071 17.0391 8.58579 17.4142C8.96086 17.7893 9.46957 18 10 18H18C18.5304 18 19.0391 17.7893 19.4142 17.4142C19.7893 17.0391 20 16.5304 20 16V7.242C20 6.97556 19.9467 6.71181 19.8433 6.46624C19.7399 6.22068 19.5885 5.99824 19.398 5.812L16.083 2.57C15.7094 2.20466 15.2076 2.00007 14.685 2H10C9.46957 2 8.96086 2.21071 8.58579 2.58579C8.21071 2.96086 8 3.46957 8 4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M16 18V20C16 20.5304 15.7893 21.0391 15.4142 21.4142C15.0391 21.7893 14.5304 22 14 22H6C5.46957 22 4.96086 21.7893 4.58579 21.4142C4.21071 21.0391 4 20.5304 4 20V9C4 8.46957 4.21071 7.96086 4.58579 7.58579C4.96086 7.21071 5.46957 7 6 7H8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Copy Results
                    </button>
                </div>
            </div>
        `;
    }

    initializeActionButtons() {
        const scanAgainBtn = document.getElementById('scanAgainBtn');
        const copyResultsBtn = document.getElementById('copyResultsBtn');

        if (scanAgainBtn) {
            scanAgainBtn.addEventListener('click', () => {
                this.urlInput.value = '';
                this.urlInput.focus();
                this.resultsContainer.classList.add('hidden');
            });
        }

        if (copyResultsBtn) {
            copyResultsBtn.addEventListener('click', () => {
                const resultCard = document.querySelector('.result-card');
                const text = resultCard.innerText;

                navigator.clipboard.writeText(text).then(() => {
                    const originalText = copyResultsBtn.innerHTML;
                    copyResultsBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Copied!
                    `;

                    setTimeout(() => {
                        copyResultsBtn.innerHTML = originalText;
                    }, 2000);
                });
            });
        }
    }

    showError(message) {
        // Simple alert for now - could be enhanced with a custom modal
        alert(message);
    }
}

// ===== INITIALIZE APP =====
document.addEventListener('DOMContentLoaded', () => {
    new ScannerUI();
});
