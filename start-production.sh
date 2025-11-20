#!/bin/bash

# ==============================================================================
# Production Startup Script for KhananNetra Backend
# Uses environment variables for dynamic configuration
# ==============================================================================

set -e

echo "🚀 Starting KhananNetra Backend Services..."

# Use environment variables with defaults
PUBLIC_PORT=${PORT:-8080}
PYTHON_INTERNAL_PORT=${PYTHON_BACKEND_PORT:-9000}
BASE_URL=${BASE_URL:-http://localhost:8080}
HEALTH_CHECK_PATH=${HEALTH_CHECK_PATH:-/api/health}

echo "📍 Public port: $PUBLIC_PORT"
echo "📍 Python internal port: $PYTHON_INTERNAL_PORT"
echo "📍 Base URL: $BASE_URL"
echo "📍 Health check path: $HEALTH_CHECK_PATH"

# Set environment variables
export PORT=$PUBLIC_PORT
export PYTHON_BACKEND_PORT=$PYTHON_INTERNAL_PORT
export PYTHON_BACKEND_URL="http://127.0.0.1:$PYTHON_INTERNAL_PORT"
export BASE_URL=$BASE_URL
export HEALTH_CHECK_PATH=$HEALTH_CHECK_PATH

# Python virtual environment is already in PATH from Dockerfile
echo "🐍 Python virtual environment: $(which python3)"
echo "🐍 Python version: $(python3 --version)"

# ------------------------------------------------------------------------------
# Start Python Backend (FastAPI) - INTERNAL ONLY
# ------------------------------------------------------------------------------
echo "🐍 Starting Python FastAPI backend (internal only)..."
cd /app/python-backend

# Start FastAPI internally (only accessible within container)
uvicorn main:app \
    --host 127.0.0.1 \
    --port $PYTHON_INTERNAL_PORT \
    --workers 1 \
    --log-level info \
    --no-access-log \
    --timeout-keep-alive 30 &

PYTHON_PID=$!
echo "✅ Python backend started (PID: $PYTHON_PID)"

# ------------------------------------------------------------------------------
# Wait for Python backend to be healthy
# ------------------------------------------------------------------------------
echo "⏳ Waiting for Python backend health check..."

MAX_RETRIES=150
RETRY_COUNT=0
SLEEP_TIME=2
PYTHON_HEALTH_URL="http://127.0.0.1:$PYTHON_INTERNAL_PORT/health"

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s -f "$PYTHON_HEALTH_URL" > /dev/null 2>&1; then
        echo "✅ Python backend is healthy and ready!"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "⏳ [$RETRY_COUNT/$MAX_RETRIES] Waiting for Python backend..."
    sleep $SLEEP_TIME
    
    # Check if Python process is still running
    if ! kill -0 $PYTHON_PID 2>/dev/null; then
        echo "❌ Python backend process died during startup"
        exit 1
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Python backend failed to start within $((MAX_RETRIES * SLEEP_TIME)) seconds"
    exit 1
fi

# ------------------------------------------------------------------------------
# Start Node.js Backend - PUBLIC FACING (Cloud Run entrypoint)
# ------------------------------------------------------------------------------
echo "🟢 Starting Node.js backend on public port $PUBLIC_PORT..."
cd /app

# Node.js runs in foreground (keeps container alive for Cloud Run)
echo "✅ All services started successfully!"
echo "🌐 Node.js API available on: $BASE_URL"
echo "🔧 Python backend available internally on port $PYTHON_INTERNAL_PORT"
echo "🏥 Health check endpoint: ${BASE_URL}${HEALTH_CHECK_PATH}"

exec node server.js

# ------------------------------------------------------------------------------
# Cleanup on exit
# ------------------------------------------------------------------------------
trap "echo '🛑 Shutting down...'; kill $PYTHON_PID 2>/dev/null || true; wait" EXIT