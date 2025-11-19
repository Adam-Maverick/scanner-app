# Link Scanner App - VirusTotal Integration

A URL scanner application that uses the VirusTotal API to analyze URLs for security threats.

## Features

- 🔍 Real-time URL scanning using VirusTotal API (70+ security engines)
- 🛡️ Risk classification: Safe, Suspicious, or Dangerous
- ⚡ Rate limiting protection (4 requests/minute, 500/day)
- 🎨 Beautiful, modern UI with dynamic risk-based styling
- 🔒 Secure API key storage on backend server

## Setup Instructions

### 1. Install Dependencies

Open a terminal (Command Prompt or PowerShell) and run:

```bash
npm install
```

**If you get a PowerShell execution policy error**, run this first:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Then run `npm install` again.

### 2. Configure API Key

The API key is already configured in the `.env` file. If you need to change it:

1. Open `.env`
2. Update `VIRUSTOTAL_API_KEY` with your key

### 3. Start the Server

```bash
npm start
```

The server will start on `http://localhost:3000`

### 4. Open in Browser

Navigate to: `http://localhost:3000`

## Usage

1. Enter a URL in the input field
2. Click "Scan URL" or press Enter
3. Wait for the analysis (10-30 seconds for new URLs)
4. View the results with risk classification and recommendations

## API Rate Limits

**Free VirusTotal API limits:**
- 4 requests per minute
- 500 requests per day

The app will automatically handle rate limits and show user-friendly error messages when limits are reached.

## Project Structure

```
scanner-app/
├── server.js           # Backend Express server
├── app.js              # Frontend JavaScript (VirusTotal API integration)
├── index.html          # Main HTML page
├── index.css           # Styles
├── package.json        # Node.js dependencies
├── .env                # Environment variables (API key)
└── .gitignore          # Git ignore file
```

## Deployment

To deploy this app to production:

1. **Environment Variables**: Set `VIRUSTOTAL_API_KEY` and `PORT` on your hosting platform
2. **Install Dependencies**: Run `npm install` on the server
3. **Start Server**: Run `npm start`
4. **Recommended Platforms**:
   - Heroku
   - Railway
   - Render
   - DigitalOcean App Platform
   - AWS Elastic Beanstalk

## Security Notes

- ✅ API key is stored securely in `.env` file (not in frontend code)
- ✅ `.env` is in `.gitignore` to prevent accidental commits
- ✅ Backend proxies all VirusTotal API requests
- ⚠️ Never commit your `.env` file to version control

## Troubleshooting

### "Cannot load npm.ps1" Error
Run: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

### Rate Limit Errors
Wait for the specified time before making another request. The app tracks:
- Requests per minute (max 4)
- Requests per day (max 500)

### Server Won't Start
- Check if port 3000 is already in use
- Verify `.env` file exists with valid API key
- Ensure all dependencies are installed (`npm install`)

## Development

To modify the app:

- **Frontend**: Edit `app.js`, `index.html`, or `index.css`
- **Backend**: Edit `server.js`
- **Restart** the server after backend changes

## License

ISC
