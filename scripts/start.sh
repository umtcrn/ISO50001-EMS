#!/bin/bash
set -e

cd /home/runner/workspace

# Install dependencies if needed
echo "[start] Installing dependencies..."
pnpm install --frozen-lockfile=false

# Build API server
echo "[start] Building API server..."
pnpm --filter @workspace/api-server run build

# Free ports if in use
fuser -k 8080/tcp 2>/dev/null || true
fuser -k 5000/tcp 2>/dev/null || true
sleep 1

# Start API server in background
echo "[start] Starting API server on port 8080..."
PORT=8080 node --enable-source-maps artifacts/api-server/dist/index.mjs &
API_PID=$!

# Wait for API server to be ready (migrations run during this window)
sleep 3

# Bootstrap MGM reference data (idempotent — skips if already imported)
# This is system reference data, NOT demo/internal data.
# Runs automatically so every fresh Replit environment has MGM data ready.
echo "[start] Bootstrapping MGM reference data..."
pnpm --filter @workspace/scripts run import:mgm || echo "[start] MGM bootstrap warning (non-fatal, continuing)"

# Start Vite dev server on port 5000
echo "[start] Starting frontend dev server on port 5000..."
PORT=5000 BASE_PATH="/" pnpm --filter @workspace/ems-dashboard run dev &
VITE_PID=$!

# Trap signals to kill both processes
trap "kill $API_PID $VITE_PID 2>/dev/null" EXIT INT TERM

wait $VITE_PID
