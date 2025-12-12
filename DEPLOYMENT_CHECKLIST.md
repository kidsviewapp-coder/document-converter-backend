# Backend Deployment Checklist

## Issue
The backend on Render is missing the new routes (`/pdf/reorder`, `/pdf/to-office`, `/pdf/protect`, `/pdf/unlock`, `/pdf/extract-images`). This causes "Cannot POST" errors in the Android app.

## Solution: Deploy Updated Backend to Render

### Step 1: Verify All Files Are Present
Make sure these files exist in your `backend/` directory:
- ✅ `server.js`
- ✅ `routes/pdf.js` (contains all PDF routes)
- ✅ `routes/ocr.js`
- ✅ `routes/watermark.js`
- ✅ `routes/convert.js`
- ✅ `routes/merge.js`
- ✅ `routes/split.js`
- ✅ `routes/compress.js`
- ✅ `package.json`
- ✅ `Dockerfile`

### Step 2: Commit and Push to Git

```bash
cd backend
git add .
git commit -m "Add PDF routes: reorder, to-office, protect, unlock, extract-images"
git push origin main
```

### Step 3: Redeploy on Render

**Option A: Auto-Deploy (if connected to GitHub)**
- Render will automatically detect the push and redeploy
- Check Render dashboard for deployment status
- Wait for deployment to complete (usually 2-5 minutes)

**Option B: Manual Deploy**
1. Go to your Render dashboard: https://dashboard.render.com
2. Select your backend service
3. Click "Manual Deploy" → "Deploy latest commit"

### Step 4: Verify Deployment

After deployment completes, test the endpoints:

```bash
# Test health endpoint
curl https://document-converter-tfqi.onrender.com/health

# Test PDF reorder endpoint (should return error about missing file, not "Cannot POST")
curl -X POST https://document-converter-tfqi.onrender.com/pdf/reorder
```

### Step 5: Update Android App (if needed)

Make sure your Android app's `ApiConfig.kt` has the correct base URL:

```kotlin
const val BASE_URL = "https://document-converter-tfqi.onrender.com"
```

## Routes That Should Work After Deployment

✅ `POST /convert` - Document conversion
✅ `POST /merge` - Merge PDFs
✅ `POST /split` - Split PDF
✅ `POST /compress` - Compress PDF
✅ `POST /ocr` - OCR text extraction
✅ `POST /watermark` - Add watermark
✅ `POST /pdf/protect` - Add password
✅ `POST /pdf/unlock` - Remove password
✅ `POST /pdf/reorder` - Reorder pages
✅ `POST /pdf/extract-images` - Extract images
✅ `POST /pdf/to-office` - Convert to DOCX/XLSX/PPTX

## Troubleshooting

### If routes still don't work after deployment:

1. **Check Render logs:**
   - Go to Render dashboard → Your service → Logs
   - Look for errors during startup

2. **Verify routes are loaded:**
   - Check if `routes/pdf.js` is being required in `server.js`
   - Verify all route files exist

3. **Check Dockerfile:**
   - Ensure `routes/` directory is copied
   - Verify `server.js` is the entry point

4. **Restart service:**
   - In Render dashboard, click "Restart" on your service

## Quick Test Commands

After deployment, you can test endpoints using curl:

```bash
# Health check
curl https://document-converter-tfqi.onrender.com/health

# Test PDF reorder (should return JSON error, not HTML "Cannot POST")
curl -X POST https://document-converter-tfqi.onrender.com/pdf/reorder \
  -F "file=@test.pdf" \
  -F "pageOrder=[1,2,3]"
```

If you get JSON error responses (even if they're errors), the route is working. If you get HTML "Cannot POST", the route doesn't exist.

