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

## Step 2: Deploy on Render

1. **Sign up/Login**
   - Go to https://render.com
   - Click "Get Started for Free"
   - Sign up with GitHub

2. **Create New Web Service**
   - Click "New" → "Web Service"
   - Connect your GitHub account (if not connected)
   - Select your repository

3. **Configure Service**
   - **Name:** `document-converter` (or any name)
   - **Region:** Choose closest to you
   - **Branch:** `main` (or your default branch)
   - **Root Directory:** `backend` (if repo root is project root)
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`

4. **Advanced Settings (Optional)**
   - Click "Advanced"
   - Add Environment Variables:
     ```
     PORT=3000
     UPLOAD_DIR=./uploads
     OUTPUT_DIR=./outputs
     MAX_FILE_SIZE_MB=100
     ```

5. **Deploy**
   - Click "Create Web Service"
   - Render will build and deploy (takes 5-10 minutes)

6. **Get Your URL**
   - After deployment, you'll see your URL
   - Format: `https://your-app-name.onrender.com`
   - **Copy this URL!**

## Step 3: Test Your Deployment

1. Open browser
2. Go to: `https://your-app-name.onrender.com/health`
3. Should see: `{"status":"ok","timestamp":"..."}`

## Step 4: Update Android App

Same as Railway - update `ApiConfig.kt` with your Render URL.

## Notes

- Render free tier:
  - Spins down after 15 minutes of inactivity
  - First request after spin-down takes ~30 seconds
  - 750 hours/month free
  - Includes system dependencies (LibreOffice, etc.)

- Render automatically installs system packages
- Better for apps that need LibreOffice/Ghostscript

## Troubleshooting

**Build fails:**
- Check build logs in Render dashboard
- Verify `package.json` exists
- Check Node.js version

**Service won't start:**
- Check logs for errors
- Verify start command is correct
- Check environment variables

**App can't connect:**
- Verify URL in `ApiConfig.kt`
- Check service status in Render dashboard
- Test `/health` endpoint

