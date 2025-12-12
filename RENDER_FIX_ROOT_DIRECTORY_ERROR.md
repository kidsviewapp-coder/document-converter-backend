# Fix "Service Root Directory is missing" Error

## Error You're Seeing
```
Service Root Directory "/opt/render/project/src/backend" is missing.
error: invalid local: resolve : lstat /opt/render/project/src/backend: no such file or directory
```

## Cause
Render is looking for a `backend/` folder in your GitHub repository, but it doesn't exist at that location.

## Solution: Check Your GitHub Repository Structure

### Step 1: Check Your GitHub Repo
1. Go to: https://github.com/kidsviewapp-coder/document-converter-backend
2. Look at the file structure
3. Are your files:
   - **At the root?** (package.json, server.js, routes/, utils/ at the top level)
   - **In a `backend/` folder?** (backend/package.json, backend/server.js, etc.)

### Step 2: Fix Root Directory Based on Structure

#### Option A: Files are at ROOT of repository
If your files are at the root (not in a `backend/` folder):

1. **In Render settings:**
   - **Root Directory:** Leave EMPTY (blank) ⚠️
   - **Docker Build Context Directory:** Leave EMPTY or set to `.`
   - **Dockerfile Path:** `Dockerfile` (not `backend/Dockerfile`)

2. **Make sure Dockerfile is at root:**
   - Your Dockerfile should be at: `document-converter-backend/Dockerfile`
   - Not at: `document-converter-backend/backend/Dockerfile`

#### Option B: Files are in `backend/` folder
If your files ARE in a `backend/` folder:

1. **In Render settings:**
   - **Root Directory:** `backend` ✅ (keep this)
   - **Docker Build Context Directory:** `backend/` ✅ (keep this)
   - **Dockerfile Path:** `backend/Dockerfile` ✅ (keep this)

2. **Make sure Dockerfile is in backend folder:**
   - Your Dockerfile should be at: `document-converter-backend/backend/Dockerfile`

## Quick Check: What's Your Repo Structure?

Go to your GitHub repo and check:

**If you see:**
```
document-converter-backend/
  ├── package.json
  ├── server.js
  ├── routes/
  ├── utils/
  └── Dockerfile
```
→ Files are at **ROOT** → Set Root Directory to **EMPTY**

**If you see:**
```
document-converter-backend/
  └── backend/
      ├── package.json
      ├── server.js
      ├── routes/
      ├── utils/
      └── Dockerfile
```
→ Files are in **backend/** → Set Root Directory to **backend**

## How to Fix in Render

1. **Go to your service settings**
2. **Find "Root Directory" field**
3. **Change it:**
   - If files are at root → **Clear it** (make it empty)
   - If files are in backend/ → **Keep it as `backend`**

4. **Update Dockerfile Path:**
   - If Root Directory is empty → Dockerfile Path: `Dockerfile`
   - If Root Directory is `backend` → Dockerfile Path: `backend/Dockerfile`

5. **Save and redeploy**

## Most Common Issue

Most likely, your files are at the **ROOT** of your GitHub repo, but you set Root Directory to `backend`.

**Fix:** Clear the Root Directory field (make it empty/blank).

Let me know what structure you see in your GitHub repo!

