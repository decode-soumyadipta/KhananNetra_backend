"""
KhananNetra Python FastAPI Backend
Integrated with MERN stack for geospatial analysis
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import sys

# Add the old_back/backend to path to import existing modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../old_back/backend'))

from app.routers import aoi, imagery
from app.routers import analysis_realtime as analysis

# Initialize FastAPI app
app = FastAPI(
    title="KhananNetra Python API",
    description="Geospatial analysis backend for mining detection using satellite imagery",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js frontend
        "http://localhost:5000",  # Node.js backend
        "http://localhost:3001",  # Alternative frontend port
        "*"  # Allow all for development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers from old backend
app.include_router(aoi.router, prefix="/api/v1/aoi", tags=["AOI"])
app.include_router(analysis.router, prefix="/api/v1/analysis", tags=["Analysis"])
app.include_router(imagery.router, prefix="/api/v1/imagery", tags=["Imagery"])


@app.get("/")
async def root():
    """Root endpoint providing API information."""
    return {
        "message": "KhananNetra Python API - Integrated with MERN Stack",
        "version": "2.0.0",
        "status": "running",
        "docs": "/api/docs",
        "endpoints": {
            "aoi": "/api/v1/aoi",
            "analysis": "/api/v1/analysis",
            "imagery": "/api/v1/imagery"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "python-backend",
        "version": "2.0.0"
    }


if __name__ == "__main__":
    # Run on port 8000 to avoid conflict with Node.js backend (port 5000)
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
