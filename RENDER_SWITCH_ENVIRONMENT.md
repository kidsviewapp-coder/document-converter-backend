# How to Switch from Node.js to Docker on Render

## Problem
Render won't let you leave Build Command and Start Command empty when using Node.js environment.

## Solution: Change the Service Type/Environment

Since you can't delete the commands, you need to change the **environment type** first. Here's how:

### Method 1: Edit Repository/Source (Recommended)

1. **Go to Settings → Build & Deploy**
2. **Find "Repository" section**
3. **Click "Edit"** button next to the repository URL
4. This might open a dialog where you can:
   - Change the environment type
   - Or it will detect Dockerfile and switch automatically

### Method 2: Check for Environment/Runtime Option

1. **In Settings → Build & Deploy**, scroll through ALL sections
2. **Look for:**
   - "Runtime" dropdown
   - "Environment" dropdown  
   - "Service Type" dropdown
   - "Language" dropdown
   - Any dropdown that says "Node" or "Node.js"

3. **If you find it:**
   - Change it to "Docker"
   - This should then allow empty Build/Start commands

### Method 3: Delete and Recreate Service (Last Resort)

If you can't find the option to switch:

1. **Note down these settings:**
   - Root Directory: `backend`
   - Repository: `kidsviewapp-coder/document-converter-backend`
   - Branch: `main`
   - Region: Singapore
   - Health Check Path: `/health`

2. **Delete the current service:**
   - Go to Settings
   - Scroll to bottom
   - Find "Delete or suspend" section
   - Click "Delete Service"

3. **Create a NEW Web Service:**
   - Click "+ New" → "Web Service"
   - Connect your GitHub repo
   - **IMPORTANT:** When it asks for environment, select **"Docker"** (NOT Node.js)
   - Set Root Directory: `backend`
   - Leave Build Command EMPTY
   - Leave Start Command EMPTY
   - Set Dockerfile Path: `backend/Dockerfile`

### Method 4: Check if Dockerfile Detection Works

1. **Make sure Dockerfile is in your GitHub repo:**
   - Go to: https://github.com/kidsviewapp-coder/document-converter-backend
   - Check if `backend/Dockerfile` exists
   - If not, push it to GitHub

2. **In Render, try:**
   - Go to Settings → Build & Deploy
   - Look for "Auto-detect" or "Detect Dockerfile" option
   - Or try clicking "Edit" on Repository and see if it offers Docker option

## What to Look For

When you're in Settings → Build & Deploy, look for ANY of these:
- A dropdown/select that says "Node" or "Node.js"
- A button that says "Switch to Docker"
- An "Edit" button on Repository that might show environment options
- A section called "Docker" or "Dockerfile"

## Quick Test

Try this:
1. Click "Edit" on the **Repository** field
2. See if it shows options to change environment
3. Or if it auto-detects Dockerfile and switches

Let me know what happens when you click "Edit" on the Repository field!

