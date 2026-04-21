"""
SQLite database with WAL mode, FTS5 full-text search, and optimized indexes.
Schema designed for graph traversal and price history queries.
"""
import sqlite3
import os
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "ocds.db"


def get_conn():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-64000")   # 64 MB
    conn.execute("PRAGMA temp_store=MEMORY")
    conn.execute("PRAGMA mmap_size=268435456")  # 256 MB mmap
    conn.execute("PRAGMA foreign_keys=OFF")  # disabled: cross-file refs during bulk ingest
    return conn


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_conn()
    cur = conn.cursor()

    cur.executescript("""
        -- ── Core node tables ──────────────────────────────────────────────

        CREATE TABLE IF NOT EXISTS organismos (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS llamados (
            ocid        TEXT PRIMARY KEY,
            title       TEXT,
            method      TEXT,
            buyer_id    TEXT,
            date        TEXT,
            year        INTEGER,
            description TEXT,
            status      TEXT DEFAULT 'unknown'
        );

        CREATE TABLE IF NOT EXISTS items (
            id          TEXT PRIMARY KEY,   -- scheme:cat_id  or  desc:slug
            cat_id      TEXT,
            description TEXT NOT NULL,
            scheme      TEXT,
            unit        TEXT
        );

        CREATE TABLE IF NOT EXISTS suppliers (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL
        );

        -- ── Edge tables ───────────────────────────────────────────────────
        -- No FK constraints: adjudicaciones cross-reference llamados from
        -- other years/months processed in separate jobs.

        CREATE TABLE IF NOT EXISTS llamado_items (
            llamado_ocid    TEXT,
            item_id         TEXT,
            PRIMARY KEY (llamado_ocid, item_id)
        );

        CREATE TABLE IF NOT EXISTS adjudicaciones (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id     TEXT,
            supplier_id TEXT,
            org_id      TEXT,
            ocid        TEXT,
            amount      REAL,
            currency    TEXT,
            quantity    REAL,
            unit        TEXT,
            date        TEXT,
            year        INTEGER
        );

        -- ── Processing state ─────────────────────────────────────────────

        CREATE TABLE IF NOT EXISTS process_jobs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            filename    TEXT NOT NULL,
            year        INTEGER,
            status      TEXT DEFAULT 'pending',  -- pending|running|done|error
            progress    INTEGER DEFAULT 0,
            total       INTEGER DEFAULT 0,
            message     TEXT,
            started_at  TEXT,
            finished_at TEXT
        );

        -- ── Indexes ──────────────────────────────────────────────────────

        CREATE INDEX IF NOT EXISTS idx_llamados_buyer  ON llamados(buyer_id);
        CREATE INDEX IF NOT EXISTS idx_llamados_year   ON llamados(year);
        CREATE INDEX IF NOT EXISTS idx_llamados_method ON llamados(method);

        CREATE INDEX IF NOT EXISTS idx_li_item         ON llamado_items(item_id);
        CREATE INDEX IF NOT EXISTS idx_li_llamado      ON llamado_items(llamado_ocid);

        CREATE INDEX IF NOT EXISTS idx_adj_item        ON adjudicaciones(item_id);
        CREATE INDEX IF NOT EXISTS idx_adj_supplier    ON adjudicaciones(supplier_id);
        CREATE INDEX IF NOT EXISTS idx_adj_org         ON adjudicaciones(org_id);
        CREATE INDEX IF NOT EXISTS idx_adj_year        ON adjudicaciones(year);
        CREATE INDEX IF NOT EXISTS idx_adj_ocid        ON adjudicaciones(ocid);

        -- ── FTS5 for full-text search ─────────────────────────────────────

        CREATE VIRTUAL TABLE IF NOT EXISTS fts_items USING fts5(
            item_id UNINDEXED,
            description,
            cat_id
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS fts_llamados USING fts5(
            ocid UNINDEXED,
            title,
            description
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS fts_suppliers USING fts5(
            supplier_id UNINDEXED,
            name
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS fts_organismos USING fts5(
            org_id UNINDEXED,
            name
        );
    """)
    conn.commit()
    conn.close()
    print("DB initialized at", DB_PATH)
