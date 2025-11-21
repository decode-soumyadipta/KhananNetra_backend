# GCP Cloud Run Deployment Checklist - KhananNetra Backend

## ✅ Current Configuration Status

### CORS & Cookie Configuration (VERIFIED ✓)
Your backend is **READY** for Cloud Run deployment without custom domain mapping:

1. **Trust Proxy** ✓
   - `app.set('trust proxy', 1)` configured in `server.js:446`
   - Ensures correct IP detection behind Cloud Run proxy

2. **CORS Configuration** ✓
   - Multi-origin support via `ALLOWED_ORIGINS` environment variable
   - Credentials enabled: `credentials: true`
   - Fallback to `CLIENT_URL` if `ALLOWED_ORIGINS` not set
   - Location: `server.js:457-470`

3. **Cookie Configuration** ✓
   - Dynamic SameSite handling in `sessionManager.js`
   - Auto-fallback: `SameSite=none` → `lax` when secure=false
   - Configurable via environment variables:
     - `COOKIE_SECURE` (defaults to true in production)
     - `COOKIE_SAME_SITE` (defaults to 'none' for HTTPS, 'lax' otherwise)
     - `COOKIE_DOMAIN` (optional, leave empty for Cloud Run)
   - Location: `middleware/sessionManager.js:34-65`

4. **Session Management** ✓
   - Consistent cookie options via `getCookieOptions()` helper
   - Proper cleanup on logout/errors
   - Location: `middleware/sessionManager.js:68-73`

---

## 🔧 Environment Variables for Cloud Run

Set these in GCP Cloud Run Console → Edit & Deploy New Revision → Variables & Secrets:

### Required Variables
```bash
NODE_ENV=production
PORT=8080

# MongoDB Atlas Connection
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/khanannetra?retryWrites=true&w=majority

# Frontend URL (Cloud Run URL without custom domain)
CLIENT_URL=https://your-frontend-xxxxx.vercel.app
ALLOWED_ORIGINS=https://your-frontend-xxxxx.vercel.app,https://khanan-xxxxx.vercel.app

# JWT Secrets (use strong random strings)
JWT_SECRET=your-production-jwt-secret-min-32-chars-xxxxx
SESSION_SECRET=your-production-session-secret-min-32-chars-xxxxx

# Cookie Configuration for HTTPS Cloud Run
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
# COOKIE_DOMAIN= (leave empty/unset for Cloud Run default domain)

# Kaggle Model Download
KAGGLE_USERNAME=your-kaggle-username
KAGGLE_KEY=your-kaggle-api-key
KAGGLE_MODEL_PATH=soumyadiptadey/khanannetra-production/tensorFlow2/version1
DOWNLOAD_MODELS_ON_STARTUP=true
MODEL_CACHE_DIR=/tmp/kagglehub

# Python Backend (internal)
PYTHON_BACKEND_URL=http://127.0.0.1:9000
PYTHON_BACKEND_PORT=9000

# Google Earth Engine (if used)
# GEE_PROJECT_ID=your-gee-project-id
```

### Optional Variables
```bash
# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=1000

# Logging
LOG_LEVEL=info

# Analysis Settings
MAX_ANALYSIS_DURATION=3600
MAX_AOI_SIZE=1000000
```

---

## 📦 Docker Build & Push Commands

### Step 1: Set Variables
```bash
# Set your GCP project details
export PROJECT_ID="your-gcp-project-id"
export SERVICE_NAME="khanannetra-backend"
export REGION="asia-south1"  # or your preferred region
export IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
export IMAGE_TAG="latest"
```

### Step 2: Navigate to Backend Directory
```bash
cd /Users/soumyadiptadey/Developer/KhananNetra_backend
```

### Step 3: Build Docker Image (linux/amd64)
```bash
docker buildx build \
  --platform linux/amd64 \
  -t ${IMAGE_NAME}:${IMAGE_TAG} \
  -t ${IMAGE_NAME}:$(date +%Y%m%d-%H%M%S) \
  --load \
  .
```

### Step 4: Test Image Locally (Optional)
```bash
docker run --rm -p 8080:8080 \
  -e NODE_ENV=production \
  -e PORT=8080 \
  -e MONGODB_URI="your-mongodb-uri" \
  -e CLIENT_URL="http://localhost:3000" \
  -e JWT_SECRET="test-secret-min-32-chars" \
  -e SESSION_SECRET="test-session-secret-min-32-chars" \
  ${IMAGE_NAME}:${IMAGE_TAG}
```

### Step 5: Push to Google Container Registry
```bash
# Authenticate with GCP
gcloud auth configure-docker

# Push the image
docker push ${IMAGE_NAME}:${IMAGE_TAG}
```

### Step 6: Deploy to Cloud Run
```bash
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME}:${IMAGE_TAG} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10 \
  --port 8080 \
  --set-env-vars "NODE_ENV=production,PORT=8080,COOKIE_SECURE=true,COOKIE_SAME_SITE=none" \
  --project ${PROJECT_ID}
```

---

## 🚀 Single Command Deployment (All-in-One)

```bash
#!/bin/bash

# Configuration
export PROJECT_ID="your-gcp-project-id"
export SERVICE_NAME="khanannetra-backend"
export REGION="asia-south1"
export IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
export TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Navigate to backend
cd /Users/soumyadiptadey/Developer/KhananNetra_backend

# Build
echo "🔨 Building Docker image..."
docker buildx build \
  --platform linux/amd64 \
  -t ${IMAGE_NAME}:latest \
  -t ${IMAGE_NAME}:${TIMESTAMP} \
  --load \
  .

# Push
echo "📤 Pushing to GCR..."
docker push ${IMAGE_NAME}:latest
docker push ${IMAGE_NAME}:${TIMESTAMP}

# Deploy
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME}:latest \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10 \
  --port 8080 \
  --project ${PROJECT_ID}

echo "✅ Deployment complete!"
```

---

## 🔍 Post-Deployment Verification

### 1. Health Check
```bash
curl https://your-service-xxxxx-uc.a.run.app/api/health
```

Expected Response:
```json
{
  "status": "success",
  "message": "Server is healthy",
  "timestamp": "2024-11-22T..."
}
```

### 2. Test CORS
```bash
curl -H "Origin: https://your-frontend.vercel.app" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://your-service-xxxxx-uc.a.run.app/api/auth/login \
     -v
```

Should see:
```
access-control-allow-origin: https://your-frontend.vercel.app
access-control-allow-credentials: true
```

### 3. Check Logs
```bash
gcloud run services logs read ${SERVICE_NAME} \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --limit 50
```

---

## ⚠️ Important Notes

1. **No Custom Domain Required**: Cloud Run default URLs work perfectly with current CORS/cookie setup

2. **Cookie Domain**: DO NOT set `COOKIE_DOMAIN` env var - let it default to undefined for Cloud Run URLs

3. **Frontend CORS**: Update your frontend `.env` to use Cloud Run backend URL:
   ```
   NEXT_PUBLIC_API_URL=https://your-service-xxxxx-uc.a.run.app/api
   ```

4. **SameSite Settings**:
   - Production (HTTPS): `COOKIE_SAME_SITE=none` + `COOKIE_SECURE=true`
   - Local Dev: Auto-falls back to `lax` + `secure=false`

5. **Memory**: 2GB allocated for Python ML model inference (365MB model file)

6. **Cleanup**: Remove old revisions to save costs:
   ```bash
   gcloud run revisions list --service ${SERVICE_NAME} --region ${REGION}
   gcloud run revisions delete <revision-name> --region ${REGION}
   ```

---

## ✅ Final Checklist Before Deploy

- [ ] MongoDB Atlas connection string ready
- [ ] JWT_SECRET and SESSION_SECRET generated (32+ chars)
- [ ] Kaggle credentials configured
- [ ] Frontend URL updated in CLIENT_URL and ALLOWED_ORIGINS
- [ ] GCP project ID and region confirmed
- [ ] Docker buildx installed and configured
- [ ] gcloud CLI authenticated (`gcloud auth login`)
- [ ] GCR authentication configured (`gcloud auth configure-docker`)

---

## 🆘 Troubleshooting

### Issue: CORS errors in browser
**Solution**: Verify `ALLOWED_ORIGINS` includes exact frontend URL (with https://)

### Issue: Cookies not persisting
**Solution**: Ensure `COOKIE_SECURE=true` and `COOKIE_SAME_SITE=none` for HTTPS

### Issue: 401 Unauthorized on requests
**Solution**: Check `trust proxy` is set to 1 (already configured ✓)

### Issue: Python backend not starting
**Solution**: Check logs for model download issues; ensure 2GB memory allocated

### Issue: Build fails
**Solution**: Ensure building for `linux/amd64` platform explicitly

---

Generated: November 22, 2025
Backend Status: ✅ PRODUCTION READY
