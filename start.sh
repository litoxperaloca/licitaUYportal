#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  OCDS Uruguay Dashboard – Local dev startup
#  Requires: Python 3.10+, Node 18+
# ─────────────────────────────────────────────────────────────
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT_DIR/backend"
FRONTEND="$ROOT_DIR/frontend"

# ── Backend ──────────────────────────────────────────────────
echo "📦 Installing backend dependencies..."
cd "$BACKEND"
pip install -r requirements.txt --quiet

echo "🚀 Starting FastAPI backend on http://localhost:8000"
uvicorn main:app --reload --port 8000 --host 0.0.0.0 &
BACKEND_PID=$!

# ── Frontend ─────────────────────────────────────────────────
echo "📦 Installing frontend dependencies..."
cd "$FRONTEND"
npm install --silent

echo "⚡ Starting Vite dev server on http://localhost:5173"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Dashboard running!"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:8000"
echo "   API docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all services."

# ── Cleanup on exit ───────────────────────────────────────────
trap "echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
