#!/usr/bin/env python3
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

SQLITE_DB = Path(__file__).parent / "data" / "ocds.db"
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

TABLES = [
    "organismos",
    "llamados",
    "items",
    "suppliers",
    "llamado_items",
    "adjudicaciones",
    "process_jobs",
]


def _normalize_row(table: str, row: sqlite3.Row):
    data = dict(row)
    for key in ('date', 'started_at', 'finished_at'):
        if key in data and data[key] == '':
            data[key] = None
    return data


def main():
    if not SQLITE_DB.exists():
        raise SystemExit(f"SQLite DB not found: {SQLITE_DB}")
    if not DATABASE_URL:
        raise SystemExit("DATABASE_URL is required")

    sconn = sqlite3.connect(str(SQLITE_DB))
    sconn.row_factory = sqlite3.Row
    pconn = psycopg.connect(DATABASE_URL)
    pconn.row_factory = dict_row

    with pconn:
        cur = pconn.cursor()
        cur.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        cur.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
        cur.execute("CREATE TABLE IF NOT EXISTS organismos (id TEXT PRIMARY KEY, name TEXT NOT NULL)")
        cur.execute("CREATE TABLE IF NOT EXISTS llamados (ocid TEXT PRIMARY KEY, title TEXT, method TEXT, buyer_id TEXT, date DATE, year INTEGER, description TEXT, status TEXT DEFAULT 'unknown')")
        cur.execute("CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, cat_id TEXT, description TEXT NOT NULL, scheme TEXT, unit TEXT)")
        cur.execute("CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY, name TEXT NOT NULL)")
        cur.execute("CREATE TABLE IF NOT EXISTS llamado_items (llamado_ocid TEXT, item_id TEXT, PRIMARY KEY (llamado_ocid, item_id))")
        cur.execute("CREATE TABLE IF NOT EXISTS adjudicaciones (id BIGSERIAL PRIMARY KEY, item_id TEXT, supplier_id TEXT, org_id TEXT, ocid TEXT, amount NUMERIC(18,4), currency TEXT, quantity NUMERIC(18,4), unit TEXT, date DATE, year INTEGER)")
        cur.execute("CREATE TABLE IF NOT EXISTS process_jobs (id BIGSERIAL PRIMARY KEY, filename TEXT NOT NULL, year INTEGER, status TEXT DEFAULT 'pending', progress INTEGER DEFAULT 0, total INTEGER DEFAULT 0, message TEXT, started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ)")

        for table in TABLES:
            rows = sconn.execute(f"SELECT * FROM {table}").fetchall()
            if not rows:
                print(f"{table}: 0 rows")
                continue
            cols = rows[0].keys()
            placeholders = ",".join(["%s"] * len(cols))
            col_list = ",".join(cols)
            insert_sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"
            values = [[_normalize_row(table, row).get(c) for c in cols] for row in rows]
            cur.executemany(insert_sql, values)
            print(f"{table}: {len(rows)} rows migrated")

        for stmt in [
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
            "CREATE INDEX IF NOT EXISTS idx_organismos_name_trgm ON organismos USING GIN (unaccent(lower(name)) gin_trgm_ops)",
            "CREATE INDEX IF NOT EXISTS idx_suppliers_name_trgm ON suppliers USING GIN (unaccent(lower(name)) gin_trgm_ops)",
            "CREATE INDEX IF NOT EXISTS idx_items_desc_trgm ON items USING GIN (unaccent(lower(description)) gin_trgm_ops)",
            "CREATE INDEX IF NOT EXISTS idx_items_cat_id_trgm ON items USING GIN (unaccent(lower(COALESCE(cat_id, ''))) gin_trgm_ops)",
            "CREATE INDEX IF NOT EXISTS idx_llamados_title_trgm ON llamados USING GIN (unaccent(lower(title)) gin_trgm_ops)",
            "CREATE INDEX IF NOT EXISTS idx_llamados_desc_trgm ON llamados USING GIN (unaccent(lower(COALESCE(description, ''))) gin_trgm_ops)",
        ]:
            try:
                cur.execute(stmt)
            except Exception as e:
                print(f"index skipped: {stmt} -> {e}")

    print("Migration completed.")


if __name__ == "__main__":
    main()
