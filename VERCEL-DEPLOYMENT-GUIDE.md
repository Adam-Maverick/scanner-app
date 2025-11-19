# Vercel Deployment Guide for Scanner App

This guide will walk you through deploying your VirusTotal URL scanner application to Vercel.

## Prerequisites

Before you begin, make sure you have:
- A [Vercel account](https://vercel.com/signup) (free tier works fine)
- Your VirusTotal API key
- Git installed on your computer
- Your project pushed to a Git repository (GitHub, GitLab, or Bitbucket)

## Step 1: Prepare Your Project for Vercel

### 1.1 Create a `vercel.json` Configuration File

Create a new file called `vercel.json` in your project root with the following content:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    },
    {
      "src": "index.html",
      "use": "@vercel/static"
    },
    {
      "src": "index.css",
      "use": "@vercel/static"
    },
    {
      "src": "app.js",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/server.js"
    },
    {
      "src": "/(.*\\.(css|js))",
      "dest": "/$1"
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ]
}
```

This configuration tells Vercel:
- To use the Node.js runtime for `server.js`
- To serve static files (HTML, CSS, JS)
- How to route requests (API routes to server, static files directly, everything else to index.html)

### 1.2 Update Your `.gitignore`

Make sure your `.gitignore` file includes:

```
node_modules/
.env
.vercel
```

> [!IMPORTANT]
> **Never commit your `.env` file!** Your API keys should remain secret.

## Step 2: Push Your Code to Git

If you haven't already, initialize a Git repository and push to GitHub (or GitLab/Bitbucket):

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Prepare for Vercel deployment"

# Add remote (replace with your repository URL)
git remote add origin https://github.com/YOUR_USERNAME/scanner-app.git

# Push to GitHub
git push -u origin main
```

## Step 3: Deploy to Vercel

### Option A: Deploy via Vercel Dashboard (Recommended for First-Time Users)

1. **Go to Vercel Dashboard**
   - Visit [vercel.com](https://vercel.com)
   - Sign in or create an account

2. **Import Your Project**
   - Click "Add New..." → "Project"
   - Click "Import Git Repository"
   - Select your repository from the list
   - If you don't see it, click "Adjust GitHub App Permissions" to grant access

3. **Configure Your Project**
   - **Project Name**: Choose a name (e.g., `url-scanner-app`)
   - **Framework Preset**: Select "Other" (since this is a custom Node.js app)
   - **Root Directory**: Leave as `./` (unless your code is in a subdirectory)
   - **Build Command**: Leave empty or use `npm install`
   - **Output Directory**: Leave empty
   - **Install Command**: `npm install`

4. **Add Environment Variables**
   - Click "Environment Variables"
   - Add the following variable:
     - **Name**: `VIRUSTOTAL_API_KEY`
     - **Value**: Your actual VirusTotal API key
     - **Environment**: Select all (Production, Preview, Development)
   - Click "Add"

5. **Deploy**
   - Click "Deploy"
   - Wait for the deployment to complete (usually 1-2 minutes)
   - **IMPORTANT**: Don't test yet - you need to set up Vercel KV first (see next step)

### Step 3.5: Set Up Vercel KV (Required for Rate Limiting)

After your first deployment, you need to create a Vercel KV database for persistent rate limiting:

1. **Create KV Database**
   - In your Vercel dashboard, go to the "Storage" tab
   - Click "Create Database"
   - Select "KV" (Key-Value Store)
   - Choose a name (e.g., `scanner-rate-limiter`)
   - Select your region (choose closest to your users)
   - Click "Create"

2. **Connect to Your Project**
   - After creation, click "Connect Project"
   - Select your scanner app project
   - Click "Connect"
   - This automatically adds the required environment variables:
     - `KV_REST_API_URL`
     - `KV_REST_API_TOKEN`
     - `KV_REST_API_READ_ONLY_TOKEN`
     - `KV_URL`

3. **Redeploy**
   - Go back to your project's "Deployments" tab
   - Click the three dots (...) on your latest deployment
   - Click "Redeploy"
   - Your app will now have persistent rate limiting!

> [!NOTE]
> **Vercel KV Free Tier**: The free tier includes 256 MB storage and 3,000 commands per day, which is more than sufficient for rate limiting in this application.


### Option B: Deploy via Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Set up and deploy? **Y**
   - Which scope? Select your account
   - Link to existing project? **N** (for first deployment)
   - What's your project's name? Enter a name
   - In which directory is your code located? **./**
   - Want to override the settings? **N**

4. **Add Environment Variable**
   ```bash
   vercel env add VIRUSTOTAL_API_KEY
   ```
   
   - Select environment: **Production**
   - Enter your VirusTotal API key
   - Repeat for Preview and Development if needed

5. **Deploy to Production**
   ```bash
   vercel --prod
   ```

6. **Set Up Vercel KV** (Required)
   - Go to [vercel.com/dashboard](https://vercel.com/dashboard)
   - Navigate to Storage → Create Database → KV
   - Connect it to your project
   - Redeploy: `vercel --prod`

## Step 4: Verify Your Deployment

> [!IMPORTANT]
> Make sure you've completed Step 3.5 (Vercel KV setup) before testing, otherwise rate limiting won't work properly.

1. **Visit Your Live Site**
   - Open the URL provided by Vercel (e.g., `https://your-app.vercel.app`)

2. **Test the Scanner**
   - Try scanning a URL (e.g., `https://google.com`)
   - Verify that the scan completes successfully
   - Check that results are displayed correctly

3. **Check the Logs** (if something goes wrong)
   - Go to your Vercel dashboard
   - Click on your project
   - Click "Deployments" → Select your deployment
   - Click "Functions" to see server logs

## Step 5: Configure Custom Domain (Optional)

1. **Go to Project Settings**
   - In Vercel dashboard, click your project
   - Go to "Settings" → "Domains"

2. **Add Domain**
   - Click "Add"
   - Enter your domain name
   - Follow the DNS configuration instructions

## Troubleshooting

### Issue: API Routes Not Working

**Solution**: Make sure your `vercel.json` is properly configured with the routes section.

### Issue: Environment Variables Not Found

**Solution**: 
1. Go to Project Settings → Environment Variables
2. Verify `VIRUSTOTAL_API_KEY` is set
3. Redeploy the project

### Issue: Build Fails

**Solution**:
1. Check the build logs in Vercel dashboard
2. Ensure `package.json` has all required dependencies
3. Make sure there are no syntax errors in your code

### Issue: Rate Limiting Not Working

**Solution**: 
1. Verify Vercel KV is set up and connected to your project
2. Check Storage tab in Vercel dashboard
3. Ensure KV environment variables are present
4. Redeploy after connecting KV

## Important Notes

> [!WARNING]
> **Serverless Function Limitations**: Vercel uses serverless functions, which means:
> - Each request may be handled by a different instance
> - In-memory state (like your rate limiter) won't persist between requests
> - Consider using a database or Redis for persistent rate limiting

> [!TIP]
> **Free Tier Limits**: Vercel's free tier includes:
> - 100GB bandwidth per month
> - 100 hours of serverless function execution
> - Unlimited deployments
> 
> This should be sufficient for personal projects and testing.

## Updating Your Deployment

Whenever you push changes to your Git repository:

```bash
git add .
git commit -m "Your commit message"
git push
```

Vercel will automatically detect the changes and redeploy your application!

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Node.js Runtime](https://vercel.com/docs/runtimes#official-runtimes/node-js)
- [Environment Variables on Vercel](https://vercel.com/docs/concepts/projects/environment-variables)
- [Custom Domains on Vercel](https://vercel.com/docs/concepts/projects/domains)

---

**Need Help?** Check the [Vercel Community](https://github.com/vercel/vercel/discussions) or [Discord](https://vercel.com/discord)
