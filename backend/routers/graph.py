"""
/api/graph  –  lazy graph data for Sigma.js.

The graph is NEVER returned whole. Clients expand level by level:
  GET /api/graph/root              → ESTADO + all organismos
  GET /api/graph/organismo/{id}    → llamados of organismo (paginated)
  GET /api/graph/llamado/{ocid}    → items of llamado
  GET /api/graph/item/{id}         → suppliers of item
  GET /api/graph/supplier/{id}     → all items (→ llamados → organismos) won

Node colours (returned so frontend can stay stateless):
  root      → #f59e0b   (amber)
  organismo → #6366f1   (indigo)
  llamado   → #22c55e   (green)
  item      → #f97316   (orange)
  supplier  → #ec4899   (pink)
"""
from fastapi import APIRouter, Query
from database import get_conn

router = APIRouter(prefix="/api/graph", tags=["graph"])

NODE_COLORS = {
    "root":      "#f59e0b",
    "organismo": "#6366f1",
    "llamado":   "#22c55e",
    "item":      "#f97316",
    "supplier":  "#ec4899",
}

def _color(t): return NODE_COLORS.get(t, "#94a3b8")


# ── root ─────────────────────────────────────────────────────────────────────

@router.get("/root")
def graph_root():
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, name FROM organismos ORDER BY name"
    ).fetchall()
    conn.close()

    nodes = [{"id": "ROOT", "label": "ESTADO URUGUAYO", "type": "root",
              "color": _color("root"), "size": 24}]
    edges = []

    for r in rows:
        nid = f"org:{r['id']}"
        nodes.append({"id": nid, "label": r["name"], "type": "organismo",
                      "color": _color("organismo"), "size": 10,
                      "data": {"org_id": r["id"]}})
        edges.append({"source": "ROOT", "target": nid})

    return {"nodes": nodes, "edges": edges}


# ── organismo ────────────────────────────────────────────────────────────────

@router.get("/organismo/{org_id}")
def graph_organismo(
    org_id: str,
    year: str = Query(None),   # str to tolerate empty string
    method: str = Query(None),
    limit: int = Query(200, le=500),
    offset: int = Query(0),
):
    conn = get_conn()
    year = int(year) if year and year.strip().isdigit() else None
    q = "SELECT ocid, title, method, date, year, status FROM llamados WHERE buyer_id=?"
    params = [org_id]
    if year:
        q += " AND year=?"; params.append(year)
    if method:
        q += " AND method=?"; params.append(method)
    q += f" ORDER BY date DESC LIMIT ? OFFSET ?"
    params += [limit, offset]

    rows = conn.execute(q, params).fetchall()
    total = conn.execute(
        "SELECT COUNT(*) FROM llamados WHERE buyer_id=?", (org_id,)
    ).fetchone()[0]
    conn.close()

    nodes, edges = [], []
    src = f"org:{org_id}"
    for r in rows:
        nid = f"llamado:{r['ocid']}"
        nodes.append({"id": nid, "label": r["title"] or r["ocid"],
                      "type": "llamado", "color": _color("llamado"), "size": 6,
                      "data": {
                          "ocid": r["ocid"], "method": r["method"],
                          "date": r["date"], "year": r["year"],
                          "status": r["status"],
                      }})
        edges.append({"source": src, "target": nid})

    return {"nodes": nodes, "edges": edges,
            "meta": {"total": total, "offset": offset, "limit": limit}}


# ── llamado ──────────────────────────────────────────────────────────────────

@router.get("/llamado/{ocid:path}")
def graph_llamado(ocid: str, limit: int = Query(100, le=300)):
    conn = get_conn()
    rows = conn.execute("""
        SELECT i.id, i.description, i.cat_id, i.scheme, i.unit
        FROM llamado_items li
        JOIN items i ON i.id = li.item_id
        WHERE li.llamado_ocid = ?
        LIMIT ?
    """, (ocid, limit)).fetchall()
    conn.close()

    src = f"llamado:{ocid}"
    nodes, edges = [], []
    for r in rows:
        nid = f"item:{r['id']}"
        nodes.append({"id": nid, "label": r["description"],
                      "type": "item", "color": _color("item"), "size": 7,
                      "data": {
                          "item_id": r["id"], "cat_id": r["cat_id"],
                          "scheme": r["scheme"], "unit": r["unit"],
                      }})
        edges.append({"source": src, "target": nid})

    return {"nodes": nodes, "edges": edges}


# ── item ─────────────────────────────────────────────────────────────────────

@router.get("/item/{item_id:path}")
def graph_item(item_id: str, limit: int = Query(50, le=200)):
    conn = get_conn()
    rows = conn.execute("""
        SELECT DISTINCT s.id, s.name
        FROM adjudicaciones a
        JOIN suppliers s ON s.id = a.supplier_id
        WHERE a.item_id = ?
        LIMIT ?
    """, (item_id, limit)).fetchall()
    conn.close()

    src = f"item:{item_id}"
    nodes, edges = [], []
    for r in rows:
        nid = f"sup:{r['id']}"
        nodes.append({"id": nid, "label": r["name"],
                      "type": "supplier", "color": _color("supplier"), "size": 8,
                      "data": {"supplier_id": r["id"]}})
        edges.append({"source": src, "target": nid})

    return {"nodes": nodes, "edges": edges}


# ── supplier ─────────────────────────────────────────────────────────────────

@router.get("/supplier/{supplier_id:path}")
def graph_supplier(supplier_id: str, limit: int = Query(100, le=500)):
    """All items won by a supplier (distinct items → llamados → organismos)."""
    conn = get_conn()
    rows = conn.execute("""
        SELECT DISTINCT i.id, i.description, i.cat_id, i.scheme, i.unit
        FROM adjudicaciones a
        JOIN items i ON i.id = a.item_id
        WHERE a.supplier_id = ?
        LIMIT ?
    """, (supplier_id, limit)).fetchall()
    conn.close()

    src = f"sup:{supplier_id}"
    nodes, edges = [], []
    for r in rows:
        nid = f"item:{r['id']}"
        nodes.append({"id": nid, "label": r["description"],
                      "type": "item", "color": _color("item"), "size": 7,
                      "data": {
                          "item_id": r["id"], "cat_id": r["cat_id"],
                          "scheme": r["scheme"], "unit": r["unit"],
                      }})
        edges.append({"source": src, "target": nid})

    return {"nodes": nodes, "edges": edges}
