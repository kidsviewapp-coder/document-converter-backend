# Deploy to Render (Free) - Step by Step

## Prerequisites
- GitHub account (free at https://github.com)
- Render account (free at https://render.com)

## Step 1: Push Backend to GitHub

**Don't have a GitHub repository yet?** See `GITHUB_SETUP.md` for step-by-step instructions!

Once you have your repository:
1. Push your `backend` folder to GitHub
2. Make sure these files are in the repository:
   - `package.json`
   - `server.js`
   - `routes/` folder
   - `utils/` folder

## Step 2: Deploy on Render (Node.js)

1. **Sign up/Login**
   - Go to https://render.com
   - Click "Get Started for Free"
   - Sign up with GitHub

2. **Create New Web Service**
   - Click "New" → "Web Service"
   - Connect your GitHub account (if not connected)
   - Select your repository: `document-converter-backend`

3. **Configure Service (Docker - REQUIRED for LibreOffice)**
   - **Name:** `document-converter` (or any name)
   - **Region:** Choose closest to you
   - **Branch:** `main`
   - **Root Directory:** 
     - **If your GitHub repo has files at root:** Leave **EMPTY** (blank)
     - **If your GitHub repo has files in `backend/` folder:** Set to `backend`
     - ⚠️ **Check your GitHub repo structure first!**
   - **Environment:** Select **`Docker`** ⚠️ IMPORTANT! (NOT Node)
     - Docker is required because LibreOffice needs to be installed
     - The Dockerfile already includes LibreOffice installation
   - **Build Command:** (Leave empty - Docker handles this)
   - **Start Command:** (Leave empty - Docker handles this)

4. **Advanced Settings (Important!)**
   - Click "Advanced" section to expand
   - **Health Check Path:** Change from `/healthz` to `/health` ⚠️ IMPORTANT!
     - Your server uses `/health` endpoint
     - This ensures Render knows your service is healthy
   - **Environment Variables (Optional):** Click "+ Add Environment Variable"
     - Add these if you want to customize (optional):
       ```
       PORT=3000
       UPLOAD_DIR=./uploads
       OUTPUT_DIR=./outputs
       MAX_FILE_SIZE_MB=100
       ```
     - **Note:** These are optional - your server has defaults
   - **Auto-Deploy:** Keep "On Commit" ✅ Good
     - This auto-deploys when you push to GitHub

5. **Deploy**
   - Scroll to bottom
   - Click **"Deploy Web Service"** button ✅
   - Render will build and deploy (takes 5-10 minutes)
   - You'll see build logs in real-time

6. **Get Your URL**
   - After deployment, you'll see your URL
   - Format: `https://your-app-name.onrender.com`
   - **Copy this URL!**

## Step 3: Test Your Deployment

1. Wait for deployment to complete (5-10 minutes)
2. You'll see "Live" status when ready
3. Copy your URL (e.g., `https://document-converter.onrender.com`)
4. Open browser and test: `https://your-url.onrender.com/health`
5. Should see: `{"status":"ok","timestamp":"..."}`

## Step 4: Update Android App

1. Open: `android/app/src/main/java/com/documentconverter/app/data/api/ApiConfig.kt`
2. Change:
   ```kotlin
   const val BASE_URL = "https://your-service-name.onrender.com"
   ```
   (Use YOUR actual Render URL)
3. Build and install app on your phone
4. Test!

## Notes

- Render free tier:
  - Spins down after 15 minutes of inactivity
  - First request after spin-down takes ~30 seconds
  - 750 hours/month free
  - Includes system dependencies (LibreOffice, etc.)

- **IMPORTANT:** You MUST use Docker environment (not Node.js) to install LibreOffice
- The Dockerfile includes all required system packages (LibreOffice, Ghostscript, poppler-utils)
- Node.js environment on Render does NOT automatically install LibreOffice

## Troubleshooting

**"Root directory 'backend' does not exist" Error:**
- **Problem:** Repository structure doesn't match Root Directory setting
- **Fix:** 
  1. Check your GitHub repo structure
  2. If files are at root → Clear Root Directory (make it empty)
  3. If files are in `backend/` folder → Set Root Directory to `backend`
  4. See `RENDER_FIX_ROOT_DIRECTORY.md` for detailed fix

**Build fails:**
- Check build logs in Render dashboard
- Verify `package.json` exists
- Check Node.js version
- Verify Root Directory matches your repo structure

**Service won't start:**
- Check logs for errors
- Verify start command is correct
- Check environment variables

**App can't connect:**
- Verify URL in `ApiConfig.kt`
- Check service status in Render dashboard
- Test `/health` endpoint

