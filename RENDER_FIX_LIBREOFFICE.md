# Fix LibreOffice "not found" Error on Render

## ⚠️ Problem
You're getting this error:
```
Document conversion failed: Command failed: libreoffice --headless ...
/bin/sh: 1: libreoffice: not found
```

## 🔍 Cause
Your Render service is using **Node.js environment** instead of **Docker**. LibreOffice is not installed in Node.js environment.

## ✅ Solution: Switch to Docker

**👉 See `RENDER_SWITCH_TO_DOCKER.md` for detailed step-by-step instructions!**

Quick version:

### Step 1: Check Your Current Setup
1. Go to your Render dashboard
2. Click on your service
3. Go to "Settings" tab
4. Check what "Environment" is selected

### Step 2: Switch to Docker
1. In Render dashboard, go to your service → "Settings"
2. Scroll to "Environment" section
3. Change from **"Node"** to **"Docker"** ⚠️
4. **Root Directory:** 
   - If your repo has files at root → Leave EMPTY
   - If your repo has files in `backend/` folder → Set to `backend`
5. **Build Command:** Leave EMPTY (Docker handles this)
6. **Start Command:** Leave EMPTY (Docker handles this)
7. Click **"Save Changes"**

### Step 3: Verify Dockerfile Exists
Make sure your GitHub repository has a `Dockerfile` in the backend folder (or root if that's where your files are).

The Dockerfile should contain:
```dockerfile
FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libreoffice \
    ghostscript \
    poppler-utils \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN mkdir -p uploads outputs
EXPOSE 3000
CMD ["node", "server.js"]
```

### Step 4: Redeploy
1. After saving settings, Render will automatically redeploy
2. Wait 5-10 minutes for build to complete
3. Check build logs to verify LibreOffice is being installed
4. You should see: "Installing system dependencies for LibreOffice..."

### Step 5: Test
1. Wait for deployment to complete
2. Test Word to PDF conversion again
3. Should work now! ✅

## Alternative: If Docker Doesn't Work

If you can't use Docker, you need to install LibreOffice manually. However, **Render's free tier Node.js environment doesn't support installing system packages easily**.

**Best solution:** Use Docker (recommended above)

## Verify Installation

After switching to Docker and redeploying, you can verify LibreOffice is installed by:
1. Checking build logs - should show LibreOffice installation
2. Testing Word to PDF conversion
3. Should no longer see "libreoffice: not found" error

## Still Having Issues?

1. **Check build logs** in Render dashboard
2. **Verify Dockerfile** is in your repository
3. **Check Root Directory** matches your repo structure
4. **Wait for full deployment** (can take 10+ minutes)

