"""
Database abstraction for OCDS Uruguay / LicitaUY.

Legacy mode:
- SQLite remains the default and compatibility fallback.

PostgreSQL mode:
- Enabled with DB_BACKEND=postgres and DATABASE_URL.
"""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

DB_PATH = Path(__file__).parent / "data" / "ocds.db"
DB_BACKEND = os.getenv("DB_BACKEND", "sqlite").strip().lower()
USE_LEGACY_SQLITE = os.getenv("USE_LEGACY_SQLITE", "false").strip().lower() in {"1", "true", "yes", "on"}
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if USE_LEGACY_SQLITE:
    DB_BACKEND = "sqlite"


def get_backend_mode() -> str:
    if USE_LEGACY_SQLITE:
        return "sqlite"
    if DB_BACKEND == "postgres" and DATABASE_URL:
        return "postgres"
    return "sqlite"


def _sqlite_conn():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-64000")
    conn.execute("PRAGMA temp_store=MEMORY")
    conn.execute("PRAGMA mmap_size=268435456")
    conn.execute("PRAGMA foreign_keys=OFF")
    return conn


def _postgres_conn():
    try:
        import psycopg
        from psycopg.rows import dict_row
    except Exception as exc:  # pragma: no cover
        raise RuntimeError("PostgreSQL backend requested but psycopg is not installed.") from exc

    conn = psycopg.connect(DATABASE_URL)
    conn.row_factory = dict_row
    return conn


def get_conn():
    return _postgres_conn() if get_backend_mode() == "postgres" else _sqlite_conn()


def _init_sqlite_db(conn):
    cur = conn.cursor()
    cur.executescript(
        """
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
            id          TEXT PRIMARY KEY,
            cat_id      TEXT,
            description TEXT NOT NULL,
            scheme      TEXT,
            unit        TEXT
        );

        CREATE TABLE IF NOT EXISTS suppliers (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL
        );

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

        CREATE TABLE IF NOT EXISTS process_jobs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            filename    TEXT NOT NULL,
            year        INTEGER,
            status      TEXT DEFAULT 'pending',
            progress    INTEGER DEFAULT 0,
            total       INTEGER DEFAULT 0,
            message     TEXT,
            started_at  TEXT,
            finished_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_llamados_buyer  ON llamados(buyer_id);
        CREATE INDEX IF NOT EXISTS idx_llamados_year   ON llamados(year);
        CREATE INDEX IF NOT EXISTS idx_llamados_method ON llamados(method);
        CREATE INDEX IF NOT EXISTS idx_llamados_date   ON llamados(date);
        CREATE INDEX IF NOT EXISTS idx_llamados_status ON llamados(status);
        CREATE INDEX IF NOT EXISTS idx_llamados_buyer_year ON llamados(buyer_id, year);
        CREATE INDEX IF NOT EXISTS idx_li_item         ON llamado_items(item_id);
        CREATE INDEX IF NOT EXISTS idx_li_llamado      ON llamado_items(llamado_ocid);
        CREATE INDEX IF NOT EXISTS idx_adj_item        ON adjudicaciones(item_id);
        CREATE INDEX IF NOT EXISTS idx_adj_supplier    ON adjudicaciones(supplier_id);
        CREATE INDEX IF NOT EXISTS idx_adj_org         ON adjudicaciones(org_id);
        CREATE INDEX IF NOT EXISTS idx_adj_year        ON adjudicaciones(year);
        CREATE INDEX IF NOT EXISTS idx_adj_ocid        ON adjudicaciones(ocid);
        CREATE INDEX IF NOT EXISTS idx_adj_date        ON adjudicaciones(date);
        CREATE INDEX IF NOT EXISTS idx_adj_item_year   ON adjudicaciones(item_id, year);
        CREATE INDEX IF NOT EXISTS idx_adj_supplier_year ON adjudicaciones(supplier_id, year);

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
        """
    )
    conn.commit()


def _init_postgres_db(conn):
    cur = conn.cursor()
    cur.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    cur.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS organismos (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS llamados (
            ocid TEXT PRIMARY KEY,
            title TEXT,
            method TEXT,
            buyer_id TEXT REFERENCES organismos(id) ON DELETE SET NULL,
            date DATE,
            year INTEGER,
            description TEXT,
            status TEXT DEFAULT 'unknown'
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            cat_id TEXT,
            description TEXT NOT NULL,
            scheme TEXT,
            unit TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS suppliers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS llamado_items (
            llamado_ocid TEXT REFERENCES llamados(ocid) ON DELETE CASCADE,
            item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
            PRIMARY KEY (llamado_ocid, item_id)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS adjudicaciones (
            id BIGSERIAL PRIMARY KEY,
            item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
            supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
            org_id TEXT REFERENCES organismos(id) ON DELETE SET NULL,
            ocid TEXT REFERENCES llamados(ocid) ON DELETE SET NULL,
            amount NUMERIC(18,4),
            currency TEXT,
            quantity NUMERIC(18,4),
            unit TEXT,
            date DATE,
            year INTEGER
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS process_jobs (
            id BIGSERIAL PRIMARY KEY,
            filename TEXT NOT NULL,
            year INTEGER,
            status TEXT DEFAULT 'pending',
            progress INTEGER DEFAULT 0,
            total INTEGER DEFAULT 0,
            message TEXT,
            started_at TIMESTAMPTZ,
            finished_at TIMESTAMPTZ
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_llamados_buyer ON llamados(buyer_id)",
        "CREATE INDEX IF NOT EXISTS idx_llamados_year ON llamados(year)",
        "CREATE INDEX IF NOT EXISTS idx_llamados_method ON llamados(method)",
        "CREATE INDEX IF NOT EXISTS idx_llamados_date ON llamados(date)",
        "CREATE INDEX IF NOT EXISTS idx_llamados_status ON llamados(status)",
        "CREATE INDEX IF NOT EXISTS idx_llamados_buyer_year ON llamados(buyer_id, year)",
        "CREATE INDEX IF NOT EXISTS idx_li_item ON llamado_items(item_id)",
        "CREATE INDEX IF NOT EXISTS idx_li_llamado ON llamado_items(llamado_ocid)",
        "CREATE INDEX IF NOT EXISTS idx_adj_item ON adjudicaciones(item_id)",
        "CREATE INDEX IF NOT EXISTS idx_adj_supplier ON adjudicaciones(supplier_id)",
        "CREATE INDEX IF NOT EXISTS idx_adj_org ON adjudicaciones(org_id)",
        "CREATE INDEX IF NOT EXISTS idx_adj_year ON adjudicaciones(year)",
        "CREATE INDEX IF NOT EXISTS idx_adj_ocid ON adjudicaciones(ocid)",
        "CREATE INDEX IF NOT EXISTS idx_adj_date ON adjudicaciones(date)",
        "CREATE INDEX IF NOT EXISTS idx_adj_item_year ON adjudicaciones(item_id, year)",
        "CREATE INDEX IF NOT EXISTS idx_adj_supplier_year ON adjudicaciones(supplier_id, year)",
        "CREATE INDEX IF NOT EXISTS idx_organismos_name_trgm ON organismos USING GIN (name gin_trgm_ops)",
        "CREATE INDEX IF NOT EXISTS idx_suppliers_name_trgm ON suppliers USING GIN (name gin_trgm_ops)",
        "CREATE INDEX IF NOT EXISTS idx_items_desc_trgm ON items USING GIN (description gin_trgm_ops)",
        "CREATE INDEX IF NOT EXISTS idx_llamados_title_trgm ON llamados USING GIN (title gin_trgm_ops)",
    ]
    for stmt in indexes:
        try:
            cur.execute(stmt)
        except Exception:
            pass

    cur.execute(
        """
        CREATE OR REPLACE VIEW v_adjudicaciones_totales AS
        SELECT
            a.*,
            COALESCE(a.amount, 0) * COALESCE(NULLIF(a.quantity, 0), 1) AS total_amount
        FROM adjudicaciones a
        """
    )
    conn.commit()


def init_db():
    mode = get_backend_mode()
    conn = get_conn()
    try:
        if mode == "postgres":
            _init_postgres_db(conn)
        else:
            DB_PATH.parent.mkdir(parents=True, exist_ok=True)
            _init_sqlite_db(conn)
        print(f"DB initialized in {mode} mode")
    finally:
        conn.close()


def sqlite_compatible_insert(table: str, cols: Iterable[str]) -> str:
    cols_list = ",".join(cols)
    if get_backend_mode() == "postgres":
        return f"INSERT INTO {table} ({cols_list}) VALUES ({','.join(['%s'] * len(list(cols)))}) ON CONFLICT DO NOTHING"
    return f"INSERT OR IGNORE INTO {table} ({cols_list}) VALUES ({','.join(['?'] * len(list(cols)))})"


def sql_param() -> str:
    return "%s" if get_backend_mode() == "postgres" else "?"


def sql_limit_offset(limit: int | None = None, offset: int | None = None) -> tuple[str, list[int]]:
    parts: list[str] = []
    params: list[int] = []
    ph = sql_param()
    if limit is not None:
        parts.append(f"LIMIT {ph}")
        params.append(limit)
    if offset is not None:
        parts.append(f"OFFSET {ph}")
        params.append(offset)
    return (" " + " ".join(parts)) if parts else "", params


def insert_ignore_or_upsert(
    table: str,
    cols: Sequence[str],
    conflict_cols: Sequence[str] | None = None,
    update_cols: Sequence[str] | None = None,
) -> str:
    placeholders = ",".join([sql_param()] * len(cols))
    col_str = ",".join(cols)
    if not conflict_cols or not update_cols:
        if get_backend_mode() == "postgres":
            return f"INSERT INTO {table} ({col_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"
        return f"INSERT OR IGNORE INTO {table} ({col_str}) VALUES ({placeholders})"

    conflict_str = ",".join(conflict_cols)
    updates = ",".join(f"{c}=excluded.{c}" for c in update_cols)
    return (
        f"INSERT INTO {table} ({col_str}) VALUES ({placeholders}) "
        f"ON CONFLICT ({conflict_str}) DO UPDATE SET {updates}"
    )


def insert_returning_id(cur, table: str, data: Mapping[str, Any], id_column: str = "id") -> Any:
    cols = list(data.keys())
    values = [data[c] for c in cols]
    placeholders = ",".join([sql_param()] * len(cols))
    col_str = ",".join(cols)

    if get_backend_mode() == "postgres":
        cur.execute(
            f"INSERT INTO {table} ({col_str}) VALUES ({placeholders}) RETURNING {id_column}",
            values,
        )
        row = cur.fetchone()
        if isinstance(row, dict):
            return row[id_column]
        return row[0]

    cur.execute(f"INSERT INTO {table} ({col_str}) VALUES ({placeholders})", values)
    return cur.lastrowid


def run_script_multi_stmt(cur, script: str) -> None:
    if get_backend_mode() == "sqlite":
        cur.executescript(script)
        return

    for statement in (chunk.strip() for chunk in script.split(";")):
        if statement:
            cur.execute(statement)
