# KhananNetra - Complete Setup Guide

## 🏗️ Architecture Overview

This project integrates **three** separate services:

1. **Next.js Frontend** (Port 3000) - Modern React UI with Leaflet maps
2. **Node.js Backend** (Port 5000) - MERN stack with authentication
3. **Python Backend** (Port 8000) - FastAPI with ML/geospatial analysis

```
┌─────────────────┐
│  Next.js        │
│  Frontend       │  http://localhost:3000
│  (Port 3000)    │
└────────┬────────┘
         │
         ↓ API Calls
┌─────────────────┐
│  Node.js        │
│  Express        │  http://localhost:5000
│  (Port 5000)    │
└────────┬────────┘
         │
         ↓ Proxy Requests
┌─────────────────┐
│  Python         │
│  FastAPI        │  http://localhost:8000
│  (Port 8000)    │
└─────────────────┘
```

## 📦 Prerequisites

### System Requirements
- **Node.js**: v18+ 
- **Python**: 3.9+
- **MongoDB**: v5+
- **npm** or **yarn**

### Required Tools
```bash
# Install Node.js (if not installed)
brew install node  # macOS

# Install Python (if not installed)
brew install python  # macOS

# Install MongoDB (if not installed)
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

## 🚀 Installation Steps

### 1. Backend Setup (Node.js + MongoDB)

```bash
cd KhananNetra_backend

# Install dependencies
npm install

# Install axios for Python proxy
npm install axios

# Create .env file
cat > .env << 'EOF'
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/khanannetra
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRE=7d
CLIENT_URL=http://localhost:3000
PYTHON_API_URL=http://localhost:8000
EOF

# Start Node.js backend
npm start
```

Expected output:
```
🎯 KhananNetra Backend Server Started!
📍 Port: 5000
🌍 Environment: development
🔗 API URL: http://0.0.0.0:5000/api
❤️  Health Check: http://0.0.0.0:5000/api/health
```

### 2. Python Backend Setup

```bash
cd KhananNetra_backend/python-backend

# Make start script executable
chmod +x start.sh

# Run the setup script (creates venv, installs dependencies, starts server)
./start.sh
```

**Alternative manual setup:**
```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # macOS/Linux
# OR
venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Start Python backend
python main.py
```

Expected output:
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

### 3. Frontend Setup (Next.js)

```bash
cd Khanan

# Install dependencies
npm install

# Create .env.local file
cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:5000/api
EOF

# Start Next.js development server
npm run dev
```

Expected output:
```
▲ Next.js 16.0.3 (Turbopack)
- Local:         http://localhost:3000
- Network:       http://192.0.0.2:3000
✓ Ready in 452ms
```

## 🔑 Default Login Credentials

### Super Admin
- **Email**: `superadmin@khanannetra.gov.in`
- **Password**: `Admin@123`
- **Redirects to**: `/admin`

### Geo-Analyst
- **Email**: `geo5@gmail.com` or `geoanalyst1@gmail.com`
- **Password**: `Geo@123`
- **Redirects to**: `/geoanalyst-dashboard`

## 🧪 Testing the Integration

### 1. Test Backend Health

```bash
# Node.js backend
curl http://localhost:5000/api/health

# Python backend through Node.js proxy
curl http://localhost:5000/api/python/health

# Python backend direct
curl http://localhost:8000/health
```

### 2. Test AOI Creation

```bash
curl -X POST http://localhost:5000/api/python/aoi/create \
  -H "Content-Type: application/json" \
  -d '{
    "geometry": {
      "type": "Polygon",
      "coordinates": [[[77.5, 28.5], [77.6, 28.5], [77.6, 28.6], [77.5, 28.6], [77.5, 28.5]]]
    },
    "properties": {
      "name": "Test AOI",
      "area_km2": 100
    }
  }'
```

### 3. Test Complete Workflow

1. **Login**: Go to `http://localhost:3000/login`
2. **Use geo-analyst credentials**: `geo5@gmail.com` / `Geo@123`
3. **Auto-redirect**: Should redirect to `/geoanalyst-dashboard`
4. **Search Location**: 
   - Type "Delhi" in search bar
   - Click on result → Map zooms and places marker
5. **Draw AOI**:
   - Click "Draw Area of Interest"
   - Left-click on map to add points (min 3)
   - Right-click to finish
   - See real-time area calculation
6. **Lock AOI**: Click "Lock AOI Selection"
7. **Start Analysis**: Click "Start Analysis" → Calls backend

## 📁 Project Structure

```
KhananNetra/
├── src/
│   ├── app/
│   │   ├── geoanalyst-dashboard/     # Geo-analyst dashboard
│   │   ├── admin/                    # Admin panel
│   │   └── login/                    # Login page
│   ├── components/
│   │   └── geoanalyst/
│   │       └── EnhancedMapComponent.tsx  # Main map component
│   ├── services/
│   │   └── geoanalyst/
│   │       └── api.ts                # API client
│   └── contexts/
│       └── AuthContext.tsx           # Authentication

KhananNetra_backend/
├── routes/
│   ├── auth.js                       # Authentication routes
│   ├── users.js                      # User management
│   ├── adminRoutes.js                # Admin routes
│   └── pythonProxy.js                # Python backend proxy ⭐ NEW
├── python-backend/                   # ⭐ NEW
│   ├── main.py                       # FastAPI entry point
│   ├── requirements.txt              # Python dependencies
│   └── start.sh                      # Startup script
└── old_back/backend/                 # Original Python code
    └── app/
        ├── routers/                  # FastAPI routers
        │   ├── aoi.py
        │   ├── imagery.py
        │   └── analysis_realtime.py
        └── services/                 # Geospatial services
            ├── earth_engine_service.py
            ├── geospatial_service.py
            └── ml_inference_service.py
```

## 🔧 Troubleshooting

### Port Already in Use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Kill process on port 5000
lsof -ti:5000 | xargs kill -9

# Kill process on port 8000
lsof -ti:8000 | xargs kill -9
```

### MongoDB Connection Issues

```bash
# Check if MongoDB is running
brew services list | grep mongodb

# Start MongoDB
brew services start mongodb-community

# Or run manually
mongod --config /opt/homebrew/etc/mongod.conf
```

### Python Backend Not Starting

```bash
# Check Python version
python3 --version  # Should be 3.9+

# Ensure virtual environment is activated
source venv/bin/activate

# Check if dependencies are installed
pip list

# Reinstall if needed
pip install -r requirements.txt --force-reinstall
```

### Frontend Build Errors

```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Restart dev server
npm run dev
```

## 🌐 API Endpoints

### Node.js Backend (Port 5000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | User logout |
| GET | `/api/python/health` | Python backend health |
| POST | `/api/python/aoi/create` | Create AOI |
| POST | `/api/python/analysis/start` | Start analysis |
| GET | `/api/python/analysis/:id` | Get analysis status |

### Python Backend (Port 8000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API info |
| GET | `/health` | Health check |
| GET | `/api/docs` | Swagger UI |
| POST | `/api/v1/aoi/create` | Create AOI |
| POST | `/api/v1/aoi/upload` | Upload AOI file |
| POST | `/api/v1/analysis/start` | Start analysis |
| GET | `/api/v1/analysis/{id}` | Get analysis status |

## 📝 Development Notes

### Environment Variables

**Frontend (.env.local)**:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

**Backend (.env)**:
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/khanannetra
JWT_SECRET=your-jwt-secret
CLIENT_URL=http://localhost:3000
PYTHON_API_URL=http://localhost:8000
```

### Key Features Implemented

✅ **Location Search** - Nominatim/OpenStreetMap geocoding with autocomplete  
✅ **Marker Placement** - Custom markers with auto-zoom on location select  
✅ **Polygon Drawing** - Visible vertex markers with real-time area calculation  
✅ **AOI Workflow** - Lock AOI → Start Analysis with backend integration  
✅ **Python-Node.js Bridge** - Express proxy to FastAPI  
✅ **MERN + Python Integration** - Seamless communication between stacks  

## 🚧 Next Steps

1. **Earth Engine Authentication**: Set up Google Earth Engine credentials
2. **ML Model Loading**: Ensure TensorFlow model is accessible
3. **Results Display**: Create analysis results UI
4. **Progress Tracking**: Implement WebSocket for real-time updates
5. **Error Handling**: Add comprehensive error boundaries

## 📞 Support

For issues or questions, check the logs:

```bash
# Frontend logs
cd Khanan && npm run dev

# Node.js backend logs
cd KhananNetra_backend && npm start

# Python backend logs
cd KhananNetra_backend/python-backend && python main.py
```

---

**Happy Analyzing! 🛰️🗺️**
