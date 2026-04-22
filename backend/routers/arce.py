from fastapi import APIRouter, Query
from database import get_conn

router = APIRouter(prefix="/api/arce", tags=["arce"])

@router.get("/search")
def search_arce(q: str = Query(..., min_length=2), limit: int = 20):
    conn = get_conn()
    cur = conn.cursor()
    rows = cur.execute(
        """
        SELECT cod, descripcion
        FROM arce_catalogo
        WHERE descripcion_normalized ILIKE %s
        LIMIT %s
        """,
        (f"%{q}%", limit),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@router.get("/item/{item_id}")
def arce_for_item(item_id: str):
    conn = get_conn()
    cur = conn.cursor()
    row = cur.execute(
        """
        SELECT a.cod, a.descripcion, m.match_score
        FROM item_arce_match m
        JOIN arce_catalogo a ON a.cod = m.arce_cod
        WHERE m.item_id = %s
        """,
        (item_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else {}
