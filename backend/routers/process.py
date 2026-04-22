"""
/api/process  –  ZIP ingestion pipeline.

Endpoints
---------
POST /api/process/upload      multipart ZIP upload → queues job
GET  /api/process/jobs        list all jobs + status
GET  /api/process/jobs/{id}   single job status
POST /api/process/jobs/{id}/start   start processing (async background)
DELETE /api/process/jobs/{id} delete job record
"""
import asyncio
import json
import re
import zipfile
import io
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse

from database import (
    get_backend_mode,
    get_conn,
    insert_ignore_or_upsert,
    insert_returning_id,
    run_script_multi_stmt,
    sql_param,
)

router = APIRouter(prefix="/api/process", tags=["process"])

UPLOAD_DIR = Path(__file__).resolve().parents[1] / "data" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

BATCH = 500   # rows per INSERT batch


# ── helpers ──────────────────────────────────────────────────────────────────

def _year_from_filename(name: str) -> Optional[int]:
    m = re.search(r"(\d{4})", name)
    return int(m.group(1)) if m else None


def _upsert_batch(cur, table, cols, rows):
    if not rows:
        return
    sql = insert_ignore_or_upsert(table, cols)
    cur.executemany(sql, rows)


def _item_key(cat_id, scheme, description):
    if cat_id and cat_id not in ("0", ""):
        return f"{scheme}:{cat_id}"
    slug = re.sub(r"\s+", " ", (description or "").strip())[:60]
    return f"desc:{slug}"


# ── core ingestion ────────────────────────────────────────────────────────────

def _ingest_zip(job_id: int, zip_path: Path, year: int):
    conn = get_conn()
    cur = conn.cursor()
    ph = sql_param()

    def _upd(status, progress=None, msg=""):
        now = datetime.utcnow().isoformat()
        if status == "running" and progress is None:
            cur.execute(
                f"UPDATE process_jobs SET status={ph}, message={ph}, started_at={ph} WHERE id={ph}",
                (status, msg, now, job_id),
            )
        elif status in ("done", "error"):
            cur.execute(
                f"UPDATE process_jobs SET status={ph}, progress={ph}, message={ph}, finished_at={ph} WHERE id={ph}",
                (status, progress or 0, msg, now, job_id),
            )
        else:
            cur.execute(
                f"UPDATE process_jobs SET status={ph}, progress={ph}, message={ph} WHERE id={ph}",
                (status, progress, msg, job_id),
            )
        conn.commit()

    try:
        _upd("running", msg=f"Abriendo {zip_path.name}...")

        with zipfile.ZipFile(zip_path) as zf:
            json_files = [n for n in zf.namelist() if n.endswith(".json")]
            cur.execute(
                f"UPDATE process_jobs SET total={ph} WHERE id={ph}",
                (len(json_files), job_id),
            )
            conn.commit()

            organismos_buf, suppliers_buf, items_buf = [], [], []
            llamados_buf, li_buf, adj_buf = [], [], []

            for idx, fname in enumerate(json_files):
                is_llamado = "/l-" in fname
                is_adj = "/a-" in fname

                with zf.open(fname) as f:
                    data = json.load(f)

                releases = data.get("releases", [])

                for r in releases:
                    ocid = r.get("ocid", "")
                    buyer = r.get("buyer", {}) or {}
                    org_id = buyer.get("id", "")
                    org_name = buyer.get("name", "")

                    if org_id and org_name:
                        organismos_buf.append((org_id, org_name))

                    if is_llamado:
                        tender = r.get("tender", {}) or {}
                        if ocid:
                            llamados_buf.append((
                                ocid,
                                (tender.get("title") or "")[:500],
                                tender.get("procurementMethodDetails") or "",
                                org_id,
                                (tender.get("tenderPeriod") or {}).get("startDate") or "",
                                year,
                                (tender.get("description") or "")[:1000],
                                "open",
                            ))

                        for item in (tender.get("items") or []):
                            cl = item.get("classification") or {}
                            cat_id = cl.get("id") or ""
                            scheme = cl.get("scheme") or ""
                            desc = cl.get("description") or item.get("description") or ""
                            unit = (item.get("unit") or {}).get("name") or ""
                            if not desc:
                                continue
                            key = _item_key(cat_id, scheme, desc)
                            items_buf.append((key, cat_id, desc[:500], scheme, unit))
                            if ocid:
                                li_buf.append((ocid, key))

                    elif is_adj:
                        # Stub-insert the llamado so ocid always exists in the table
                        # (the real data may come from a different year's ZIP)
                        if ocid:
                            llamados_buf.append((
                                ocid, "", "", org_id, "", year, "", "unknown",
                            ))

                        for award in (r.get("awards") or []):
                            award_date = (award.get("date") or "")[:10]
                            sups = award.get("suppliers") or []
                            for sup in sups:
                                sid = sup.get("id") or ""
                                sname = sup.get("name") or ""
                                if sid and sname:
                                    suppliers_buf.append((sid, sname))

                            for ai in (award.get("items") or []):
                                cl = ai.get("classification") or {}
                                cat_id = cl.get("id") or ""
                                scheme = cl.get("scheme") or ""
                                desc = cl.get("description") or ""
                                unit_info = ai.get("unit") or {}
                                unit_name = unit_info.get("name") or ""
                                val = unit_info.get("value") or {}
                                amount = val.get("amount")
                                currency = val.get("currency")
                                quantity = ai.get("quantity")

                                if not desc:
                                    continue
                                key = _item_key(cat_id, scheme, desc)
                                items_buf.append((key, cat_id, desc[:500], scheme, unit_name))
                                if ocid:
                                    li_buf.append((ocid, key))

                                for sup in sups:
                                    sid = sup.get("id") or ""
                                    if sid and key:
                                        adj_buf.append((
                                            key, sid, org_id, ocid,
                                            amount, currency, quantity,
                                            unit_name, award_date, year,
                                        ))

                # flush every BATCH files
                if len(organismos_buf) >= BATCH:
                    _upsert_batch(cur, "organismos", ["id","name"], organismos_buf)
                    organismos_buf.clear()
                if len(suppliers_buf) >= BATCH:
                    _upsert_batch(cur, "suppliers", ["id","name"], suppliers_buf)
                    suppliers_buf.clear()
                if len(items_buf) >= BATCH:
                    _upsert_batch(cur, "items", ["id","cat_id","description","scheme","unit"], items_buf)
                    items_buf.clear()
                if len(llamados_buf) >= BATCH:
                    _upsert_batch(cur, "llamados",
                        ["ocid","title","method","buyer_id","date","year","description","status"],
                        llamados_buf)
                    llamados_buf.clear()
                if len(li_buf) >= BATCH * 5:
                    _upsert_batch(cur, "llamado_items", ["llamado_ocid","item_id"], li_buf)
                    li_buf.clear()
                if len(adj_buf) >= BATCH:
                    cur.executemany(
                        f"""INSERT {'OR IGNORE' if get_backend_mode() == 'sqlite' else ''} INTO adjudicaciones
                           (item_id,supplier_id,org_id,ocid,amount,currency,quantity,unit,date,year)
                           VALUES ({','.join([ph] * 10)}){" ON CONFLICT DO NOTHING" if get_backend_mode() == "postgres" else ""}""",
                        adj_buf,
                    )
                    adj_buf.clear()

                if idx % 4 == 0:
                    conn.commit()
                    _upd("running", idx + 1, f"Procesando {fname}")

            # final flush
            _upsert_batch(cur, "organismos", ["id","name"], organismos_buf)
            _upsert_batch(cur, "suppliers", ["id","name"], suppliers_buf)
            _upsert_batch(cur, "items", ["id","cat_id","description","scheme","unit"], items_buf)
            _upsert_batch(cur, "llamados",
                ["ocid","title","method","buyer_id","date","year","description","status"],
                llamados_buf)
            _upsert_batch(cur, "llamado_items", ["llamado_ocid","item_id"], li_buf)
            if adj_buf:
                cur.executemany(
                    f"""INSERT {'OR IGNORE' if get_backend_mode() == 'sqlite' else ''} INTO adjudicaciones
                       (item_id,supplier_id,org_id,ocid,amount,currency,quantity,unit,date,year)
                       VALUES ({','.join([ph] * 10)}){" ON CONFLICT DO NOTHING" if get_backend_mode() == "postgres" else ""}""",
                    adj_buf,
                )

            # rebuild FTS indexes
            _upd("running", len(json_files), "Reconstruyendo índices FTS...")
            if get_backend_mode() == "sqlite":
                run_script_multi_stmt(cur, """
                    INSERT OR REPLACE INTO fts_items(item_id,description,cat_id)
                        SELECT id,description,cat_id FROM items;
                    INSERT OR REPLACE INTO fts_llamados(ocid,title,description)
                        SELECT ocid,title,description FROM llamados;
                    INSERT OR REPLACE INTO fts_suppliers(supplier_id,name)
                        SELECT id,name FROM suppliers;
                    INSERT OR REPLACE INTO fts_organismos(org_id,name)
                        SELECT id,name FROM organismos;
                """)
            conn.commit()

        _upd("done", len(json_files), f"Completado: {year}")

    except Exception as e:
        _upd("error", 0, str(e))
        raise
    finally:
        conn.close()


# ── routes ────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_zip(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    if not file.filename.endswith(".zip"):
        raise HTTPException(400, "Solo se aceptan archivos .zip")

    year = _year_from_filename(file.filename)
    dest = UPLOAD_DIR / file.filename
    content = await file.read()
    dest.write_bytes(content)

    conn = get_conn()
    cur = conn.cursor()
    job_id = insert_returning_id(cur, "process_jobs", {
        "filename": file.filename,
        "year": year,
        "status": "pending",
    })
    conn.commit()
    conn.close()

    background_tasks.add_task(_ingest_zip, job_id, dest, year or 0)
    return {"job_id": job_id, "filename": file.filename, "year": year}


@router.get("/jobs")
def list_jobs():
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM process_jobs ORDER BY id DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.get("/jobs/{job_id}")
def get_job(job_id: int):
    conn = get_conn()
    row = conn.execute(f"SELECT * FROM process_jobs WHERE id={sql_param()}", (job_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Job no encontrado")
    return dict(row)


@router.delete("/jobs/{job_id}")
def delete_job(job_id: int):
    conn = get_conn()
    conn.execute(f"DELETE FROM process_jobs WHERE id={sql_param()}", (job_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.get("/stats")
def db_stats():
    conn = get_conn()
    tables = ["organismos","llamados","items","suppliers","llamado_items","adjudicaciones"]
    result = {}
    for t in tables:
        row = conn.execute(f"SELECT COUNT(*) as c FROM {t}").fetchone()
        result[t] = row["c"]
    conn.close()
    return result
