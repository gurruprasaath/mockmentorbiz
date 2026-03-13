# =============================================================================
# GoToMock — Multi-stage Dockerfile
# Stages:
#   deps-backend   – pip install (cached separately from code)
#   backend        – runtime image served by uvicorn
#   deps-frontend  – npm install (cached separately from code)
#   frontend-build – vite build (produces /app/dist)
#   production     – nginx serving frontend + proxying /api to backend
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Install Python dependencies (cache-friendly)
# -----------------------------------------------------------------------------
FROM python:3.12-slim AS deps-backend

WORKDIR /install

# System libs needed by opencv-python-headless, Pillow, lxml, cryptography
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        libglib2.0-0 \
        libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .

# Replace opencv-python with headless variant (no GUI/X11 needed in container)
# Note: requirements.txt already references opencv-python-headless directly.
RUN pip install --no-cache-dir --prefix=/install/pkg -r requirements.txt

# -----------------------------------------------------------------------------
# Stage 2: Backend runtime
# -----------------------------------------------------------------------------
FROM python:3.12-slim AS backend

WORKDIR /app

# Runtime libs only (no gcc)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgl1 \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from deps stage
COPY --from=deps-backend /install/pkg /usr/local

# Copy application source
COPY backend/ .

# Create uploads dir and non-root user
RUN mkdir -p /app/uploads \
    && useradd -m -u 1000 appuser \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# -----------------------------------------------------------------------------
# Stage 3: Install Node dependencies (cache-friendly)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps-frontend

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps

# -----------------------------------------------------------------------------
# Stage 4: Build the Vite/React frontend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-build

# Build-time env vars injected by docker-compose (VITE_* are baked into the bundle)
ARG VITE_API_BASE_URL=""
ARG VITE_WS_BASE_URL=""
ARG VITE_APP_NAME="GoToMock"
ARG VITE_APP_VERSION="1.0.0"
ARG VITE_ENABLE_VOICE_RECORDING="true"
ARG VITE_ENABLE_VIDEO_PROCTORING="true"
ARG VITE_ENABLE_ANALYTICS="true"
ARG VITE_ENABLE_PROCTORING="true"
ARG VITE_ENABLE_VOICE_FEATURES="true"
ARG VITE_DEBUG_MODE="false"
ARG VITE_LOG_LEVEL="info"
ARG VITE_MAX_FILE_SIZE="10485760"
ARG VITE_ALLOWED_FILE_TYPES=".pdf,.doc,.docx"

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_WS_BASE_URL=${VITE_WS_BASE_URL} \
    VITE_APP_NAME=${VITE_APP_NAME} \
    VITE_APP_VERSION=${VITE_APP_VERSION} \
    VITE_ENABLE_VOICE_RECORDING=${VITE_ENABLE_VOICE_RECORDING} \
    VITE_ENABLE_VIDEO_PROCTORING=${VITE_ENABLE_VIDEO_PROCTORING} \
    VITE_ENABLE_ANALYTICS=${VITE_ENABLE_ANALYTICS} \
    VITE_ENABLE_PROCTORING=${VITE_ENABLE_PROCTORING} \
    VITE_ENABLE_VOICE_FEATURES=${VITE_ENABLE_VOICE_FEATURES} \
    VITE_DEBUG_MODE=${VITE_DEBUG_MODE} \
    VITE_LOG_LEVEL=${VITE_LOG_LEVEL} \
    VITE_MAX_FILE_SIZE=${VITE_MAX_FILE_SIZE} \
    VITE_ALLOWED_FILE_TYPES=${VITE_ALLOWED_FILE_TYPES}

WORKDIR /app

# Reuse node_modules from deps stage
COPY --from=deps-frontend /app/node_modules ./node_modules
COPY frontend/ .

# vite.config.ts auto-detects whether the parent .env exists;
# in Docker it falls back to __dirname so no patching needed.
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 5: Production — nginx serves frontend, proxies /api + /ws to backend
# -----------------------------------------------------------------------------
FROM nginx:1.27-alpine AS production

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

COPY --from=frontend-build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/index.html || exit 1

CMD ["nginx", "-g", "daemon off;"]

# -----------------------------------------------------------------------------
# Stage 6: MySQL with schema + seed baked in
# Recipients using docker-compose.hub.yml get this image — no SQL files needed
# on the host. Data is initialised automatically on first container start.
# -----------------------------------------------------------------------------
FROM mysql:8.0 AS mysql-seeded

COPY database/schema.sql    /docker-entrypoint-initdb.d/01_schema.sql
COPY database/seed_users.sql /docker-entrypoint-initdb.d/02_seed_users.sql
