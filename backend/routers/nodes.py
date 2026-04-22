"""
/api/nodes  –  full detail for any node by type + id
/api/search –  FTS across all entity types
/api/llamados – paginated list with filters (left panel)
"""
import json
import os
import re
from math import ceil

from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

from database import get_conn, sql_limit_offset, sql_param
from routers.ai import client as ai_client, DEPLOYMENT_NAME

router = APIRouter(tags=["nodes"])


NUMERIC_FILTER_RE = re.compile(r"^\s*(<=|>=|=|<|>)?\s*(-?\d+(?:[.,]\d+)?)\s*$")
DATE_FILTER_RE = re.compile(r"^\s*(<=|>=|=|<|>)?\s*(\d{4}(?:-\d{2}(?:-\d{2})?)?)\s*$")

HISTORY_SORT_FIELDS = {
    "date": "COALESCE(a.date, '')",
    "year": "COALESCE(a.year, 0)",
    "org_name": "LOWER(COALESCE(o.name, ''))",
    "supplier_name": "LOWER(COALESCE(s.name, ''))",
    "item_code": "LOWER(COALESCE(NULLIF(i.cat_id, ''), i.id, ''))",
    "unit": "LOWER(COALESCE(NULLIF(a.unit, ''), i.unit, ''))",
    "item_description": "LOWER(COALESCE(i.description, ''))",
    "quantity": "COALESCE(a.quantity, 1)",
    "amount": "COALESCE(a.amount, 0)",
    "total": "(COALESCE(a.amount, 0) * COALESCE(NULLIF(a.quantity, 0), 1))",
    "currency": "LOWER(COALESCE(a.currency, ''))",
}


class HistorySmartSearchRequest(BaseModel):
    query: str


def _sanitize_fts_query(q: str) -> str:
    """
    Sanitiza la consulta para FTS5 envolviendo términos en comillas para
    evitar errores de sintaxis con palabras reservadas (NOT, AND, OR).
    """
    if not q:
        return ""
    # Extraer palabras y envolver cada una en comillas dobles + asterisco
    # Ejemplo: 'lap top' -> '"lap"* AND "top"*'
    words = [w.strip() for w in q.split() if w.strip()]
    if not words:
        return ""
    return " AND ".join(f'"{w}"*' for w in words)


def _normalize_smart_keywords(raw: str | None):
    if not raw:
        return []

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            values = parsed
        elif isinstance(parsed, str):
            values = [parsed]
        else:
            values = []
    except json.JSONDecodeError:
        values = [chunk.strip() for chunk in raw.split("|")]

    keywords = []
    seen = set()
    for value in values:
        if not isinstance(value, str):
            continue
        cleaned = value.strip().lower()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        keywords.append(cleaned)
    return keywords[:12]


def _append_text_filter(base: str, params: list, expr: str, value: str | None):
    if not value or not value.strip():
        return base, params
    base += f" AND LOWER(COALESCE({expr}, '')) LIKE {sql_param()}"
    params.append(f"%{value.strip().lower()}%")
    return base, params


def _append_numeric_filter(base: str, params: list, expr: str, value: str | None):
    if not value or not value.strip():
        return base, params
    match = NUMERIC_FILTER_RE.match(value)
    if match:
        op = match.group(1) or "="
        number = float(match.group(2).replace(",", "."))
        base += f" AND {expr} {op} {sql_param()}"
        params.append(number)
    return base, params


def _append_date_filter(base: str, params: list, expr: str, value: str | None):
    if not value or not value.strip():
        return base, params
    match = DATE_FILTER_RE.match(value)
    if match:
        op = match.group(1) or "="
        base += f" AND substr(COALESCE({expr}, ''), 1, 10) {op} {sql_param()}"
        params.append(match.group(2))
    else:
        base += f" AND substr(COALESCE({expr}, ''), 1, 10) LIKE {sql_param()}"
        params.append(f"%{value.strip()}%")
    return base, params


def _build_keyword_clause(alias: str, keywords: list[str]):
    if not keywords:
        return "", []

    clauses = []
    params = []
    for keyword in keywords:
        clauses.append(
            f"(LOWER(COALESCE({alias}.description, '')) LIKE {sql_param()} "
            f"OR LOWER(COALESCE({alias}.cat_id, '')) LIKE {sql_param()} "
            f"OR LOWER(COALESCE({alias}.id, '')) LIKE {sql_param()})"
        )
        token = f"%{keyword}%"
        params.extend([token, token, token])
    return " OR ".join(clauses), params


def _apply_smart_history_filter(base: str, params: list, smart_mode: str | None, smart_keywords: list[str]):
    if not smart_mode or not smart_keywords:
        return base, params

    keyword_clause, keyword_params = _build_keyword_clause("i2", smart_keywords)
    if not keyword_clause:
        return base, params

    if smart_mode == "suppliers_of_matched_items":
        base += (
            " AND a.supplier_id IN ("
            "SELECT DISTINCT a2.supplier_id "
            "FROM adjudicaciones a2 "
            "JOIN items i2 ON i2.id = a2.item_id "
            f"WHERE {keyword_clause})"
        )
    else:
        base += f" AND a.item_id IN (SELECT i2.id FROM items i2 WHERE {keyword_clause})"

    params.extend(keyword_params)
    return base, params



# ── ORGANISMO detail ─────────────────────────────────────────────────────────

@router.get("/api/nodes/organismo/{org_id}")
def node_organismo(org_id: str):
    conn = get_conn()
    org = conn.execute("SELECT * FROM organismos WHERE id=?", (org_id,)).fetchone()
    if not org:
        raise HTTPException(404)
    stats = conn.execute("""
        SELECT
            COUNT(*)                          AS total_llamados,
            COUNT(DISTINCT year)              AS years_active,
            MIN(year)                         AS first_year,
            MAX(year)                         AS last_year,
            COUNT(DISTINCT method)            AS distinct_methods
        FROM llamados WHERE buyer_id=?
    """, (org_id,)).fetchone()
    methods = conn.execute("""
        SELECT method, COUNT(*) as cnt FROM llamados
        WHERE buyer_id=? GROUP BY method ORDER BY cnt DESC
    """, (org_id,)).fetchall()
    years = conn.execute("""
        SELECT year, COUNT(*) as cnt FROM llamados
        WHERE buyer_id=? GROUP BY year ORDER BY year
    """, (org_id,)).fetchall()
    conn.close()
    return {
        "type": "organismo",
        "id": org_id,
        "name": org["name"],
        "stats": dict(stats),
        "methods": [dict(r) for r in methods],
        "by_year": [dict(r) for r in years],
    }


# ── LLAMADO detail ────────────────────────────────────────────────────────────

@router.get("/api/nodes/llamado/{ocid:path}")
def node_llamado(ocid: str):
    conn = get_conn()
    lam = conn.execute("SELECT * FROM llamados WHERE ocid=?", (ocid,)).fetchone()
    if not lam:
        raise HTTPException(404)
    org = conn.execute(
        "SELECT name FROM organismos WHERE id=?", (lam["buyer_id"],)
    ).fetchone()
    items = conn.execute("""
        SELECT i.id, i.description, i.cat_id, i.unit
        FROM llamado_items li JOIN items i ON i.id=li.item_id
        WHERE li.llamado_ocid=?
    """, (ocid,)).fetchall()
    conn.close()
    return {
        "type": "llamado",
        "ocid": ocid,
        "title": lam["title"],
        "method": lam["method"],
        "date": lam["date"],
        "year": lam["year"],
        "description": lam["description"],
        "status": lam["status"],
        "organismo": org["name"] if org else "",
        "items": [dict(r) for r in items],
    }


# ── ITEM detail + price history ───────────────────────────────────────────────

@router.get("/api/nodes/item/{item_id:path}")
def node_item(item_id: str):
    conn = get_conn()
    item = conn.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
    if not item:
        raise HTTPException(404)

    history = conn.execute("""
        SELECT
            a.date, a.year, a.amount, a.currency, a.quantity, a.unit,
            s.name  AS supplier_name, s.id AS supplier_id,
            o.name  AS org_name,
            l.title AS llamado_title, a.ocid
        FROM adjudicaciones a
        LEFT JOIN suppliers s ON s.id = a.supplier_id
        LEFT JOIN organismos o ON o.id = a.org_id
        LEFT JOIN llamados   l ON l.ocid = a.ocid
        WHERE a.item_id = ?
        ORDER BY a.date DESC
        LIMIT 500
    """, (item_id,)).fetchall()

    stats = conn.execute("""
        SELECT
            COUNT(*)            AS total_adjudicaciones,
            MIN(amount)         AS min_price,
            MAX(amount)         AS max_price,
            AVG(amount)         AS avg_price,
            COUNT(DISTINCT supplier_id) AS distinct_suppliers,
            MIN(year)           AS first_year,
            MAX(year)           AS last_year
        FROM adjudicaciones WHERE item_id=? AND amount IS NOT NULL
    """, (item_id,)).fetchone()

    orgs_count = conn.execute("""
        SELECT COUNT(DISTINCT llamado_ocid) FROM llamado_items WHERE item_id=?
    """, (item_id,)).fetchone()[0]

    conn.close()
    return {
        "type": "item",
        "id": item_id,
        "cat_id": item["cat_id"],
        "description": item["description"],
        "scheme": item["scheme"],
        "unit": item["unit"],
        "stats": dict(stats) if stats else {},
        "total_llamados": orgs_count,
        "price_history": [dict(r) for r in history],
    }


# ── SUPPLIER detail ───────────────────────────────────────────────────────────

@router.get("/api/nodes/supplier/{supplier_id:path}")
def node_supplier(supplier_id: str):
    conn = get_conn()
    sup = conn.execute("SELECT * FROM suppliers WHERE id=?", (supplier_id,)).fetchone()
    if not sup:
        raise HTTPException(404)

    stats = conn.execute("""
        SELECT
            COUNT(*)                    AS total_adjudicaciones,
            COUNT(DISTINCT item_id)     AS distinct_items,
            COUNT(DISTINCT org_id)      AS distinct_orgs,
            SUM(amount*quantity)        AS total_facturado,
            MIN(year)                   AS first_year,
            MAX(year)                   AS last_year
        FROM adjudicaciones WHERE supplier_id=?
    """, (supplier_id,)).fetchone()

    by_year = conn.execute("""
        SELECT year, COUNT(*) as adj, SUM(amount*quantity) as total
        FROM adjudicaciones WHERE supplier_id=?
        GROUP BY year ORDER BY year
    """, (supplier_id,)).fetchall()

    top_items = conn.execute("""
        SELECT i.description, COUNT(*) as cnt, AVG(a.amount) as avg_price, a.currency
        FROM adjudicaciones a JOIN items i ON i.id=a.item_id
        WHERE a.supplier_id=?
        GROUP BY a.item_id ORDER BY cnt DESC LIMIT 20
    """, (supplier_id,)).fetchall()

    top_orgs = conn.execute("""
        SELECT o.name, COUNT(*) as cnt
        FROM adjudicaciones a JOIN organismos o ON o.id=a.org_id
        WHERE a.supplier_id=?
        GROUP BY a.org_id ORDER BY cnt DESC LIMIT 10
    """, (supplier_id,)).fetchall()

    conn.close()
    return {
        "type": "supplier",
        "id": supplier_id,
        "name": sup["name"],
        "stats": dict(stats) if stats else {},
        "by_year": [dict(r) for r in by_year],
        "top_items": [dict(r) for r in top_items],
        "top_orgs": [dict(r) for r in top_orgs],
    }


# ── SEARCH ────────────────────────────────────────────────────────────────────

@router.get("/api/search")
def search(q: str = Query(..., min_length=2), limit: int = Query(20, le=50)):
    if not q.strip():
        return {"results": []}
    conn = get_conn()
    fts_q = _sanitize_fts_query(q)
    ph = sql_param()
    limit_clause, limit_params = sql_limit_offset(limit=limit)

    try:
        items = conn.execute(f"""
            SELECT item_id AS id, description AS label, 'item' AS type
            FROM fts_items WHERE fts_items MATCH {ph}{limit_clause}
        """, (fts_q, *limit_params)).fetchall()

        suppliers = conn.execute(f"""
            SELECT supplier_id AS id, name AS label, 'supplier' AS type
            FROM fts_suppliers WHERE fts_suppliers MATCH {ph}{limit_clause}
        """, (fts_q, *limit_params)).fetchall()

        organismos = conn.execute(f"""
            SELECT org_id AS id, name AS label, 'organismo' AS type
            FROM fts_organismos WHERE fts_organismos MATCH {ph}{limit_clause}
        """, (fts_q, *limit_params)).fetchall()

        llamados = conn.execute(f"""
            SELECT ocid AS id, title AS label, 'llamado' AS type
            FROM fts_llamados WHERE fts_llamados MATCH {ph}{limit_clause}
        """, (fts_q, *limit_params)).fetchall()
    except Exception as e:
        # Probable error de corrupción o sintaxis en FTS
        conn.close()
        raise HTTPException(status_code=400, detail=f"Error en la búsqueda: {str(e)}")

    conn.close()
    results = []
    for rows in [items, suppliers, organismos, llamados]:
        for r in rows:
            results.append(dict(r))
    return {"results": results[:limit * 2]}


# ── LLAMADOS LIST (left panel) ────────────────────────────────────────────────

@router.get("/api/llamados")
def list_llamados(
    org_id: str = Query(None),
    year: str = Query(None),   # accept as str to handle empty string from frontend
    method: str = Query(None),
    status: str = Query(None),
    q: str = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
):
    # Sanitize: empty strings → None, year str → int
    org_id  = org_id  or None
    method  = method  or None
    status  = status  or None
    q       = q       or None
    year_int = int(year) if year and year.strip().isdigit() else None
    year = year_int
    conn = get_conn()
    ph = sql_param()

    if q and len(q.strip()) >= 2:
        fts_q = _sanitize_fts_query(q)
        try:
            ocids = conn.execute(f"""
                SELECT ocid FROM fts_llamados WHERE fts_llamados MATCH {ph} LIMIT 2000
            """, (fts_q,)).fetchall()
        except Exception as e:
            conn.close()
            raise HTTPException(status_code=400, detail=f"Error de búsqueda: {str(e)}")

        ocid_list = tuple(r[0] for r in ocids)
        if not ocid_list:
            conn.close()
            return {"items": [], "total": 0}
        in_ph = ",".join([ph] * len(ocid_list))
        base = f"FROM llamados l JOIN organismos o ON o.id=l.buyer_id WHERE l.ocid IN ({in_ph})"
        params = list(ocid_list)
    else:
        base = "FROM llamados l LEFT JOIN organismos o ON o.id=l.buyer_id WHERE 1=1"
        params = []
        if org_id:
            base += f" AND l.buyer_id={ph}"; params.append(org_id)
        if year:
            base += f" AND l.year={ph}"; params.append(year)
        if method:
            base += f" AND l.method={ph}"; params.append(method)
        if status:
            base += f" AND l.status={ph}"; params.append(status)

    page_clause, page_params = sql_limit_offset(limit=limit, offset=offset)
    total = conn.execute(f"SELECT COUNT(*) {base}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT l.ocid, l.title, l.method, l.date, l.year, l.status, o.name AS org_name {base}"
        f" ORDER BY l.date DESC{page_clause}",
        params + page_params,
    ).fetchall()
    conn.close()
    return {"items": [dict(r) for r in rows], "total": total}


# ── FILTER OPTIONS ────────────────────────────────────────────────────────────

@router.get("/api/filters")
def filter_options():
    conn = get_conn()
    years = conn.execute(
        "SELECT DISTINCT year FROM llamados WHERE year>0 ORDER BY year"
    ).fetchall()
    methods = conn.execute(
        "SELECT DISTINCT method FROM llamados WHERE method!='' ORDER BY method"
    ).fetchall()
    orgs = conn.execute(
        "SELECT id, name FROM organismos ORDER BY name"
    ).fetchall()
    conn.close()
    return {
        "years": [r[0] for r in years],
        "methods": [r[0] for r in methods],
        "organismos": [dict(r) for r in orgs],
    }


# ── ITEM PRICE HISTORY (standalone) ──────────────────────────────────────────

@router.get("/api/items/{item_id:path}/price-history")
def item_price_history(item_id: str, year: int = Query(None)):
    conn = get_conn()
    q = """
        SELECT a.date, a.year, a.amount, a.currency, a.quantity, a.unit,
               s.name AS supplier_name, o.name AS org_name
        FROM adjudicaciones a
        LEFT JOIN suppliers s ON s.id=a.supplier_id
        LEFT JOIN organismos o ON o.id=a.org_id
        WHERE a.item_id=?
    """
    params = [item_id]
    if year:
        q += " AND a.year=?"; params.append(year)
    q += " ORDER BY a.date DESC LIMIT 1000"
    rows = conn.execute(q, params).fetchall()
    conn.close()
    return {"history": [dict(r) for r in rows]}


# ── HISTORY TABLE ─────────────────────────────────────────────────────────────

@router.get("/api/history")
def history_table(
    q: str = Query(None),
    year: str = Query(None),
    org_id: str = Query(None),
    supplier_id: str = Query(None),
    date_filter: str = Query(None),
    org_name: str = Query(None),
    supplier_name: str = Query(None),
    item_code: str = Query(None),
    unit: str = Query(None),
    item_description: str = Query(None),
    quantity: str = Query(None),
    amount: str = Query(None),
    total: str = Query(None),
    currency: str = Query(None),
    sort_by: str = Query("date"),
    sort_dir: str = Query("desc"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    smart_mode: str = Query(None),
    smart_keywords_json: str = Query(None),
):
    conn = get_conn()
    org_id  = org_id  or None
    supplier_id = supplier_id or None
    smart_keywords = _normalize_smart_keywords(smart_keywords_json)
    sort_expr = HISTORY_SORT_FIELDS.get(sort_by, HISTORY_SORT_FIELDS["date"])
    sort_direction = "ASC" if str(sort_dir).lower() == "asc" else "DESC"
    offset = (page - 1) * limit
    ph = sql_param()

    # Text search path
    if q and len(q.strip()) >= 2:
        fts_q = _sanitize_fts_query(q)
        try:
            item_ids = [r[0] for r in conn.execute(
                f"SELECT item_id FROM fts_items WHERE fts_items MATCH {ph} LIMIT 2000", (fts_q,)
            ).fetchall()]
            sup_ids = [r[0] for r in conn.execute(
                f"SELECT supplier_id FROM fts_suppliers WHERE fts_suppliers MATCH {ph} LIMIT 2000", (fts_q,)
            ).fetchall()]
            org_ids = [r[0] for r in conn.execute(
                f"SELECT org_id FROM fts_organismos WHERE fts_organismos MATCH {ph} LIMIT 2000", (fts_q,)
            ).fetchall()]
        except Exception as e:
            conn.close()
            raise HTTPException(400, f"Error de búsqueda: {e}")

        all_ids = list(set(item_ids + sup_ids + org_ids))
        if not all_ids:
            conn.close()
            return {"items": [], "total": 0, "page": page, "page_size": limit, "total_pages": 0}

        conds = []
        params = []
        if item_ids:
            in_ph = ",".join([ph] * len(item_ids))
            conds.append(f"a.item_id IN ({in_ph})")
            params.extend(item_ids)
        if sup_ids:
            in_ph = ",".join([ph] * len(sup_ids))
            conds.append(f"a.supplier_id IN ({in_ph})")
            params.extend(sup_ids)
        if org_ids:
            in_ph = ",".join([ph] * len(org_ids))
            conds.append(f"a.org_id IN ({in_ph})")
            params.extend(org_ids)

        where = " OR ".join(conds)
        base = f"""
            FROM adjudicaciones a
            LEFT JOIN items i ON i.id = a.item_id
            LEFT JOIN suppliers s ON s.id = a.supplier_id
            LEFT JOIN organismos o ON o.id = a.org_id
            WHERE ({where})
        """
    else:
        base = """
            FROM adjudicaciones a
            LEFT JOIN items i ON i.id = a.item_id
            LEFT JOIN suppliers s ON s.id = a.supplier_id
            LEFT JOIN organismos o ON o.id = a.org_id
            WHERE 1=1
        """
        params = []

    if org_id:
        base += f" AND a.org_id={ph}"; params.append(org_id)
    if supplier_id:
        base += f" AND a.supplier_id={ph}"; params.append(supplier_id)

    base, params = _apply_smart_history_filter(base, params, smart_mode, smart_keywords)
    base, params = _append_date_filter(base, params, "a.date", date_filter)
    base, params = _append_text_filter(base, params, "o.name", org_name)
    base, params = _append_text_filter(base, params, "s.name", supplier_name)
    base, params = _append_text_filter(base, params, "COALESCE(NULLIF(i.cat_id, ''), i.id)", item_code)
    base, params = _append_text_filter(base, params, "COALESCE(NULLIF(a.unit, ''), i.unit)", unit)
    base, params = _append_text_filter(base, params, "i.description", item_description)
    base, params = _append_numeric_filter(base, params, "COALESCE(a.year, 0)", year)
    base, params = _append_numeric_filter(base, params, "COALESCE(a.quantity, 1)", quantity)
    base, params = _append_numeric_filter(base, params, "COALESCE(a.amount, 0)", amount)
    base, params = _append_numeric_filter(base, params, "(COALESCE(a.amount, 0) * COALESCE(NULLIF(a.quantity, 0), 1))", total)
    base, params = _append_text_filter(base, params, "a.currency", currency)

    page_clause, page_params = sql_limit_offset(limit=limit, offset=offset)
    total = conn.execute(f"SELECT COUNT(*) {base}", params).fetchone()[0]
    rows = conn.execute(
        f"""SELECT
            a.date, a.year, a.amount, a.currency, a.quantity,
            COALESCE(NULLIF(a.unit, ''), i.unit) AS unit,
            a.ocid,
            i.id AS item_id,
            i.description AS item_description,
            COALESCE(NULLIF(i.cat_id, ''), i.id) AS item_code,
            i.cat_id,
            s.name AS supplier_name,
            o.name AS org_name
        {base}
        ORDER BY {sort_expr} {sort_direction}, a.id DESC
        {page_clause}""",
        params + page_params
    ).fetchall()
    conn.close()
    total_pages = ceil(total / limit) if total else 0
    return {
        "items": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": limit,
        "total_pages": total_pages,
    }


@router.post("/api/history/intelligent-search")
async def intelligent_history_search(request: HistorySmartSearchRequest):
    if not os.getenv("AZURE_OPENAI_API_KEY"):
        raise HTTPException(400, "El servicio Azure OpenAI no está configurado.")

    query = (request.query or "").strip()
    if len(query) < 6:
        raise HTTPException(400, "Describe la búsqueda con un poco más de detalle.")

    prompt = [
        {
            "role": "system",
            "content": (
                "Eres un analista de compras públicas especializado en traducir pedidos de lenguaje natural "
                "a filtros para una tabla de adjudicaciones. Responde SOLO un JSON válido con esta forma: "
                "{\"analysis\":\"...\","
                "\"apply_to\":\"matched_items|suppliers_of_matched_items\","
                "\"keywords\":[\"...\"],"
                "\"header_filters\":{"
                "\"year\":\"\","
                "\"org_name\":\"\","
                "\"supplier_name\":\"\","
                "\"item_code\":\"\","
                "\"unit\":\"\","
                "\"item_description\":\"\","
                "\"currency\":\"\""
                "}}. "
                "Usa 'matched_items' cuando el usuario quiera adjudicaciones de rubros/ítems concretos. "
                "Usa 'suppliers_of_matched_items' cuando quiera adjudicaciones de proveedores vinculados a un rubro "
                "aunque la adjudicación específica no sea de ese rubro. "
                "Los keywords deben ser de 3 a 8 términos cortos, en español, pensados para encontrar coincidencias "
                "en descripciones de ítems o códigos. No inventes filtros si no se desprenden claramente del pedido."
            ),
        },
        {"role": "user", "content": query},
    ]

    try:
        response = await ai_client.chat.completions.create(
            model=DEPLOYMENT_NAME,
            messages=prompt,
        )
        content = response.choices[0].message.content.strip()
        if content.startswith("```json"):
            content = content[7:-3].strip()
        elif content.startswith("```"):
            content = content[3:-3].strip()
        result = json.loads(content)
    except Exception as exc:
        raise HTTPException(500, f"No se pudo interpretar la búsqueda inteligente: {exc}")

    raw_keywords = result.get("keywords") or []
    keywords = _normalize_smart_keywords(json.dumps(raw_keywords))
    apply_to = result.get("apply_to")
    if apply_to not in {"matched_items", "suppliers_of_matched_items"}:
        apply_to = "matched_items"

    header_filters = result.get("header_filters") or {}
    safe_header_filters = {
        "year": str(header_filters.get("year", "") or "").strip(),
        "org_name": str(header_filters.get("org_name", "") or "").strip(),
        "supplier_name": str(header_filters.get("supplier_name", "") or "").strip(),
        "item_code": str(header_filters.get("item_code", "") or "").strip(),
        "unit": str(header_filters.get("unit", "") or "").strip(),
        "item_description": str(header_filters.get("item_description", "") or "").strip(),
        "currency": str(header_filters.get("currency", "") or "").strip(),
    }

    preview = {"matching_items": 0, "matching_suppliers": 0, "sample_items": []}
    if keywords:
        clause, params = _build_keyword_clause("i", keywords)
        conn = get_conn()
        try:
            preview["matching_items"] = conn.execute(
                f"SELECT COUNT(*) FROM items i WHERE {clause}",
                params,
            ).fetchone()[0]
            preview["matching_suppliers"] = conn.execute(
                "SELECT COUNT(DISTINCT a.supplier_id) "
                "FROM adjudicaciones a "
                "JOIN items i ON i.id = a.item_id "
                f"WHERE {clause}",
                params,
            ).fetchone()[0]
            rows = conn.execute(
                f"SELECT COALESCE(NULLIF(i.cat_id, ''), i.id) AS item_code, i.description "
                f"FROM items i WHERE {clause} LIMIT 5",
                params,
            ).fetchall()
            preview["sample_items"] = [dict(r) for r in rows]
        finally:
            conn.close()

    return {
        "analysis": result.get("analysis") or "Búsqueda inteligente resuelta.",
        "smart_filter": {
            "mode": apply_to,
            "keywords": keywords,
        },
        "header_filters": safe_header_filters,
        "preview": preview,
    }
