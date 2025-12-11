# Deploy to Railway (Free) - Step by Step

## Prerequisites
- GitHub account
- Railway account (free at https://railway.app)

## Step 1: Push Backend to GitHub

1. Create a new GitHub repository
2. Push the `backend` folder to GitHub:

```bash
cd backend
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

## Step 2: Deploy on Railway

1. **Sign up/Login**
   - Go to https://railway.app
   - Click "Login" → "Login with GitHub"

2. **Create/Select Workspace (IMPORTANT!)**
   - If you see "You must specify a workspaceId" error:
     - Click on your profile/account menu (top right)
     - Select or create a workspace first
     - Workspaces organize your projects
   - If you don't have a workspace, Railway will prompt you to create one

3. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository
   - Railway will auto-detect it's a Node.js app

4. **Configure (if needed)**
   - Railway should auto-detect everything
   - If not, set:
     - **Root Directory:** `/` (or leave empty)
     - **Build Command:** `npm install` (auto-detected)
     - **Start Command:** `node server.js` (auto-detected)

5. **Get Your URL**
   - After deployment (takes 2-3 minutes)
   - Click on your service
   - Go to "Settings" → "Domains"
   - Railway generates a URL like: `https://your-app-name.up.railway.app`
   - **Copy this URL!**

6. **Set Environment Variables (Optional)**
   - Go to "Variables" tab
   - Add:
     ```
     PORT=3000
     UPLOAD_DIR=./uploads
     OUTPUT_DIR=./outputs
     MAX_FILE_SIZE_MB=100
     ```

## Step 3: Test Your Deployment

1. Open browser
2. Go to: `https://your-app-name.up.railway.app/health`
3. Should see: `{"status":"ok","timestamp":"..."}`

## Step 4: Update Android App

1. Open `android/app/src/main/java/com/documentconverter/app/data/api/ApiConfig.kt`
2. Change:
   ```kotlin
   const val BASE_URL = "https://your-app-name.up.railway.app"
   ```
3. Rebuild and install app

## Notes

- Railway free tier includes:
  - 500 hours/month free
  - $5 credit monthly
  - Perfect for testing and development

- Your app will sleep after inactivity (free tier)
- First request after sleep takes ~30 seconds (wake up time)
- Subsequent requests are fast

## Troubleshooting

**Deployment fails:**
- Check Railway logs
- Ensure `package.json` is in root of backend folder
- Verify Node.js version (18+)

**App can't connect:**
- Verify URL in `ApiConfig.kt`
- Check Railway service is "Active"
- Test `/health` endpoint in browser

**Conversion fails:**
- Railway free tier doesn't include LibreOffice/Ghostscript
- You may need to use a paid Railway plan or alternative service
- OR use Render which includes these tools

