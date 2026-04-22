"""
OCDS Uruguay – Graph Dashboard API
===================================
Run:  uvicorn main:app --reload --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from database import init_db, get_backend_mode
import auth
from routers import process, graph, nodes, ai

app = FastAPI(
    title="OCDS Uruguay Dashboard API",
    description="API para el dashboard de contrataciones públicas de Uruguay",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB on startup
@app.on_event("startup")
def startup():
    init_db()

# Routers
app.include_router(auth.router)
app.include_router(process.router)
app.include_router(graph.router)
app.include_router(nodes.router)
app.include_router(ai.router)

# Serve built frontend (if exists)
dist = Path(__file__).parent.parent / "frontend" / "dist"
if dist.exists():
    app.mount("/", StaticFiles(directory=str(dist), html=True), name="static")

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "OCDS Uruguay Dashboard", "db_backend": get_backend_mode()}
