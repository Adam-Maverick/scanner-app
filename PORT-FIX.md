# Quick Start Fix - Port Conflict

Port 3000 is already in use on your system. Here are two solutions:

## Option 1: Change the Port (Recommended)

1. Open the `.env` file in the scanner-app folder
2. Change this line:
   ```
   PORT=3000
   ```
   To:
   ```
   PORT=3002
   ```
3. Save the file
4. Run `npm start` again

## Option 2: Kill the Process on Port 3000

Run this command to find what's using port 3000:
```powershell
netstat -ano | findstr :3000
```

Then kill the process (replace PID with the number from the command above):
```powershell
taskkill /PID <PID> /F
```

Then run `npm start` again.

## After Fixing

Once the server starts successfully, you'll see:
```
🚀 Server running on http://localhost:3002
📊 VirusTotal API Key: ✓ Configured
⚡ Rate Limits: 4 req/min, 500 req/day
```

Then open your browser to: **http://localhost:3002**
