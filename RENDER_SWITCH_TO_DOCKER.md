# 🚀 Quick Fix: Switch Render to Docker (5 Minutes)

## ⚠️ Current Problem
Your service is using **Node.js** environment, which doesn't have LibreOffice installed.
Error: `libreoffice: not found`

## ✅ Solution: Switch to Docker

### Step-by-Step Instructions

#### 1. Open Render Dashboard
- Go to: https://dashboard.render.com
- Login if needed
- Click on your service name (e.g., "document-converter")

#### 2. Go to Settings
- Click the **"Settings"** tab at the top
- Scroll down to find **"Environment"** section

#### 3. Change Environment to Docker
- Find the dropdown that says **"Environment"** or **"Language"**
- Currently it says: **"Node"** or **"Node.js"**
- Change it to: **"Docker"** ⚠️ IMPORTANT!

#### 4. Configure Docker Settings
After selecting Docker, you'll see new fields:

**Docker Build Context:**
- If your files are in `backend/` folder → Set to: `backend/`
- If your files are at root → Leave EMPTY

**Dockerfile Path:**
- If your files are in `backend/` folder → Set to: `backend/Dockerfile`
- If your files are at root → Set to: `Dockerfile`

**Root Directory:**
- If your files are in `backend/` folder → Set to: `backend`
- If your files are at root → Leave EMPTY

**Build Command:**
- Leave **EMPTY** (Docker handles this automatically)

**Start Command:**
- Leave **EMPTY** (Docker handles this automatically)

#### 5. Save and Redeploy
- Scroll to bottom
- Click **"Save Changes"** button
- Render will automatically start a new deployment
- You'll see "Building..." status

#### 6. Wait for Build (5-10 minutes)
- Watch the build logs
- You should see Docker building the image
- Look for: "Installing system dependencies..."
- Look for: "libreoffice" in the logs
- Wait until status changes to **"Live"** ✅

#### 7. Test
- Once status is "Live", test Word to PDF conversion
- Should work now! ✅

## 📋 Quick Checklist

Before switching:
- [ ] Dockerfile exists in your GitHub repo (in `backend/` folder)
- [ ] You know where your files are (root or `backend/` folder)

After switching:
- [ ] Environment changed to "Docker"
- [ ] Root Directory set correctly
- [ ] Build Command is EMPTY
- [ ] Start Command is EMPTY
- [ ] Clicked "Save Changes"
- [ ] Waiting for build to complete (5-10 min)
- [ ] Status shows "Live"
- [ ] Tested Word to PDF - works! ✅

## 🔍 How to Verify Dockerfile Exists

1. Go to your GitHub repository
2. Navigate to `backend/` folder
3. Look for file named `Dockerfile`
4. It should contain:
   ```dockerfile
   FROM node:18-slim
   RUN apt-get update && apt-get install -y \
       libreoffice \
       ghostscript \
       poppler-utils \
       ...
   ```

If Dockerfile doesn't exist:
- It's already in your local project at `backend/Dockerfile`
- Push it to GitHub if you haven't already
- Then switch to Docker on Render

## ⏱️ Expected Timeline

- **Switching settings:** 1 minute
- **Build time:** 5-10 minutes
- **Total:** ~10 minutes

## 🆘 Still Not Working?

1. **Check build logs** - Look for errors
2. **Verify Dockerfile path** - Make sure it matches your repo structure
3. **Check Root Directory** - Must match where your files are
4. **Wait longer** - First Docker build can take 10+ minutes

## 💡 Why This Works

- **Node.js environment:** Only has Node.js, no system packages
- **Docker environment:** Runs your Dockerfile which installs LibreOffice
- Your Dockerfile already has: `RUN apt-get install -y libreoffice`

That's it! Once you switch to Docker and it redeploys, LibreOffice will be installed and Word to PDF will work! 🎉

