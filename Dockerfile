# ==============================================================================
# Production Dockerfile for KhananNetra Backend (Node.js + Python)
# Single stage, always uses port 8080
# ==============================================================================

FROM node:22-slim

WORKDIR /app

# Install system dependencies for Python backend and geospatial libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    wget \
    gdal-bin \
    libgdal-dev \
    libgeos-dev \
    libproj-dev \
    proj-bin \
    proj-data \
    dos2unix \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy package files first for better caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy the rest of the application
COPY . .

# Fix line endings and make script executable
RUN dos2unix /app/start-production.sh && \
    chmod +x /app/start-production.sh

# Create and activate Python virtual environment
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# Set up Python backend in virtual environment
RUN cd python-backend && \
    pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir certifi==2023.11.17 && \
    pip install --no-cache-dir -r requirements.txt

# Create cache directory
RUN mkdir -p /tmp/kagglehub /app/logs

# Environment variables (defaults - can be overridden in Cloud Run)
ENV NODE_ENV=production
ENV PORT=8080
ENV PYTHON_BACKEND_PORT=9000
ENV PYTHON_BACKEND_URL=http://127.0.0.1:9000

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

# Start the application
CMD ["./start-production.sh"]