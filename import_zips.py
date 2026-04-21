#!/usr/bin/env python3
"""
import_zips.py  –  CLI bulk importer (faster than API for initial load)

Usage:
    python import_zips.py /path/to/ocds-*.zip
    python import_zips.py /data/zips/  # import all ZIPs in a directory
"""
import sys
import os
import glob
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from database import init_db, get_conn
from routers.process import _ingest_zip

def main():
    args = sys.argv[1:]
    if not args:
        print("Usage: python import_zips.py <zip_file_or_dir> [...]")
        sys.exit(1)

    # Resolve files
    files = []
    for arg in args:
        p = Path(arg)
        if p.is_dir():
            files.extend(sorted(p.glob("ocds-*.zip")))
        elif p.is_file() and p.suffix == ".zip":
            files.append(p)
        else:
            files.extend(sorted(Path(".").glob(arg)))

    if not files:
        print(f"No ZIP files found for: {args}")
        sys.exit(1)

    print(f"Found {len(files)} ZIP file(s)")
    init_db()

    conn = get_conn()
    for zf in files:
        year = int("".join(filter(str.isdigit, zf.stem[-4:])) or "0")
        row = conn.execute(
            "INSERT INTO process_jobs (filename, year, status) VALUES (?,?,?)",
            (zf.name, year, "pending"),
        )
        conn.commit()
        job_id = row.lastrowid
        conn.close()

        print(f"\n{'─'*50}")
        print(f"  Procesando: {zf.name}  (año {year})")
        print(f"{'─'*50}")

        _ingest_zip(job_id, zf, year)

        conn = get_conn()
        job = conn.execute("SELECT * FROM process_jobs WHERE id=?", (job_id,)).fetchone()
        print(f"  Estado: {job['status']}  –  {job['message']}")

    # Print final stats
    tables = ["organismos","llamados","items","suppliers","llamado_items","adjudicaciones"]
    print(f"\n{'═'*50}")
    print("  Base de datos final:")
    for t in tables:
        c = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"    {t:<20} {c:>12,}")
    conn.close()
    print(f"{'═'*50}")
    print("\n✅ Importación completa.")

if __name__ == "__main__":
    main()
