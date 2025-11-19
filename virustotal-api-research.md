# VirusTotal API Research

## Overview
VirusTotal API v3 provides threat intelligence and malware analysis capabilities. It allows you to scan URLs, files, domains, and IP addresses using 70+ antivirus engines and security tools.

## Authentication
- **Method**: Include `x-apikey` header in all requests
- **Format**: `x-apikey: YOUR_API_KEY`
- **Security**: Always use HTTPS, keep API key secure

## API Limits

### Public API (Free Tier)
- **Rate Limit**: 4 requests per minute
- **Daily Quota**: 500 requests per day
- **Restrictions**: 
  - Cannot be used in commercial products
  - Cannot be used in business workflows that don't contribute new files
  - Multiple accounts to bypass limits are prohibited

### Premium API
- No rate limits (governed by service tier)
- More threat context and advanced features
- SLA guarantees
- Access to file downloads, sandbox reports, and advanced hunting

## Key Endpoints for URL Scanning

### 1. Submit URL for Scanning
**Endpoint**: `POST https://www.virustotal.com/api/v3/urls`

**Headers**:
```
x-apikey: YOUR_API_KEY
Content-Type: application/x-www-form-urlencoded
```

**Body**:
```
url=https://example.com
```

**Response**:
```json
{
  "data": {
    "type": "analysis",
    "id": "u-<hash>-<timestamp>",
    "links": {
      "self": "https://www.virustotal.com/api/v3/analyses/<analysis_id>"
    }
  }
}
```

**Notes**: 
- Returns an Analysis ID immediately
- The actual scanning happens asynchronously
- Use the Analysis ID to retrieve results

### 2. Get Analysis Results
**Endpoint**: `GET https://www.virustotal.com/api/v3/analyses/{analysis_id}`

**Headers**:
```
x-apikey: YOUR_API_KEY
```

**Response Structure**:
```json
{
  "data": {
    "attributes": {
      "date": 1234567890,
      "status": "completed",
      "stats": {
        "harmless": 72,
        "malicious": 0,
        "suspicious": 0,
        "undetected": 26,
        "timeout": 0
      },
      "results": {
        "Google Safebrowsing": {
          "method": "blacklist",
          "engine_name": "Google Safebrowsing",
          "category": "harmless",
          "result": "clean"
        }
        // ... 70+ more engines
      }
    },
    "meta": {
      "url_info": {
        "id": "<url_hash>",
        "url": "https://example.com/"
      }
    }
  }
}
```

**Status Values**:
- `"completed"` - Analysis is finished
- `"queued"` - Waiting to be analyzed
- `"in-progress"` - Currently being analyzed

### 3. Get URL Report (Direct)
**Endpoint**: `GET https://www.virustotal.com/api/v3/urls/{url_id}`

**URL ID Format**: SHA-256 hash of the URL (without protocol normalization)

**Headers**:
```
x-apikey: YOUR_API_KEY
```

**Response**: Returns full URL object with historical data

## Response Objects

### Analysis Object
Contains scan results from all engines.

**Key Attributes**:
- `date`: Unix timestamp of analysis
- `status`: "completed", "queued", or "in-progress"
- `stats`: Aggregated counts by category
  - `harmless`: Number of engines marking as safe
  - `malicious`: Number of engines detecting threats
  - `suspicious`: Number of engines flagging as suspicious
  - `undetected`: Number of engines with no opinion
  - `timeout`: Number of engines that timed out
- `results`: Dictionary of individual engine results
  - Each engine has: `category`, `engine_name`, `method`, `result`

**Categories** (normalized):
- `"harmless"` - Site is not malicious
- `"undetected"` - Scanner has no opinion
- `"suspicious"` - Scanner thinks site is suspicious
- `"malicious"` - Scanner thinks site is malicious

### URL Object
Full information about a URL including historical data.

**Key Attributes**:
- `url`: Original URL scanned
- `last_analysis_date`: Unix timestamp of last scan
- `last_analysis_stats`: Same structure as Analysis stats
- `last_analysis_results`: Individual engine results
- `last_final_url`: Final URL after redirects
- `last_http_response_code`: HTTP status code
- `title`: Webpage title
- `categories`: URL categorization by different services
- `reputation`: Community reputation score
- `total_votes`: Community votes (harmless/malicious)
- `times_submitted`: How many times URL was submitted
- `first_submission_date`: First time URL was seen
- `last_submission_date`: Most recent submission
- `threat_names`: List of detected threat names
- `tags`: Associated tags
- `outgoing_links`: Links found on the page
- `redirection_chain`: Redirect history

## Tested Examples

### Example 1: Scanning Google.com
**Request**:
```bash
curl -X POST "https://www.virustotal.com/api/v3/urls" \
  -H "x-apikey: YOUR_API_KEY" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "url=https://www.google.com"
```

**Analysis ID Received**: `u-d0e196a0c25d35dd0a84593cbae0f38333aa58529936444ea26453eab28dfc86-746d7496`

**Results Summary**:
- Status: `completed`
- Harmless: 72 engines
- Malicious: 0 engines
- Suspicious: 0 engines
- Undetected: 26 engines
- **Verdict**: SAFE

**Additional Data**:
- Title: "Google"
- Categories: "search engines" (by multiple vendors)
- HTTP Response: 200
- No threat names detected

## Implementation Recommendations

### For a Link Scanner App:

1. **Two-Step Process**:
   - Step 1: Submit URL via POST to `/urls` endpoint
   - Step 2: Poll the analysis endpoint until status is "completed"

2. **Risk Classification Logic**:
   ```javascript
   function classifyRisk(stats) {
     const total = stats.harmless + stats.malicious + stats.suspicious + stats.undetected;
     const maliciousPercent = (stats.malicious / total) * 100;
     const suspiciousPercent = (stats.suspicious / total) * 100;
     
     if (stats.malicious > 0 || maliciousPercent > 5) {
       return "DANGEROUS";
     } else if (stats.suspicious > 3 || suspiciousPercent > 10) {
       return "SUSPICIOUS";
     } else {
       return "SAFE";
     }
   }
   ```

3. **Display Information**:
   - Show stats breakdown (harmless/malicious/suspicious counts)
   - Display top detecting engines if malicious
   - Show URL title and final destination
   - Include scan timestamp
   - Show reputation score if available

4. **Error Handling**:
   - Handle rate limiting (429 status code)
   - Handle queued/in-progress states
   - Timeout for long-running analyses
   - Invalid URL handling

5. **Rate Limit Management** (Public API):
   - Implement client-side throttling (max 4 req/min)
   - Track daily quota usage
   - Show user remaining quota
   - Queue requests if needed

## Additional Endpoints

### Other Useful Endpoints:
- `GET /urls/{id}/comments` - Get community comments
- `POST /urls/{id}/comments` - Add a comment
- `GET /urls/{id}/votes` - Get community votes
- `POST /urls/{id}/votes` - Vote on URL
- `GET /domains/{domain}` - Get domain report
- `GET /ip_addresses/{ip}` - Get IP address report
- `POST /files` - Upload file for scanning
- `GET /files/{hash}` - Get file report

## Best Practices

1. **Cache Results**: Don't re-scan recently scanned URLs
2. **Respect Rate Limits**: Implement proper throttling
3. **User Feedback**: Show progress during async scanning
4. **Privacy**: Consider user privacy when submitting URLs
5. **Error Messages**: Provide clear feedback on API errors
6. **Timeout Handling**: Set reasonable timeouts for analysis polling

## API Response Time
- URL submission: Immediate (< 1 second)
- Analysis completion: Varies (typically 10-30 seconds)
- Retrieving cached results: Immediate

## Useful Resources
- [API Documentation](https://developers.virustotal.com/reference/overview)
- [URL Object Schema](https://developers.virustotal.com/reference/url-object)
- [Analysis Object Schema](https://developers.virustotal.com/reference/analyses-object)
- [Public vs Premium Comparison](https://developers.virustotal.com/reference/public-vs-premium-api)
