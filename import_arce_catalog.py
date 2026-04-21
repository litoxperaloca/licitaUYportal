#!/usr/bin/env python3
"""
Importa el dump de catalogo ARCE a la SQLite del proyecto y genera un
diccionario enriquecido + tabla de match para los items actuales.

Uso:
    python3 import_arce_catalog.py --db backend/data/ocds.db --archive imp_catalogo.tgz
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import re
import sqlite3
import tarfile
import tempfile
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path


INSERT_RE = re.compile(
    r"^insert into\s+([a-z_]+)\s*\((.*?)\)\s*values\s*\((.*)\);\s*$",
    re.IGNORECASE,
)
DATE_LITERAL_RE = re.compile(r"\bdate\s+'([^']+)'\b", re.IGNORECASE)
NUMERIC_RE = re.compile(r"^-?\d+(?:\.\d+)?$")
CREATE_TABLE_RE = re.compile(r"CREATE TABLE\s+([A-Z_]+)", re.IGNORECASE)
ESCAPED_QUOTE_TOKEN = "__ARCE_ESCAPED_QUOTE__"


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.upper()
    value = value.replace("¿", "").replace("�", "")
    value = re.sub(r"[^A-Z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True, help="Ruta a la base SQLite")
    parser.add_argument("--archive", required=True, help="Ruta a imp_catalogo.tgz")
    parser.add_argument(
        "--extract-dir",
        help="Directorio donde extraer el catalogo. Si no se indica, usa un temporal.",
    )
    return parser.parse_args()


def ensure_extracted(archive_path: Path, extract_dir: Path | None) -> tuple[Path, bool]:
    if extract_dir:
        extract_dir.mkdir(parents=True, exist_ok=True)
        with tarfile.open(archive_path, "r:gz") as tar:
            tar.extractall(extract_dir)
        return extract_dir, False

    tmpdir = Path(tempfile.mkdtemp(prefix="arce_catalog_"))
    with tarfile.open(archive_path, "r:gz") as tar:
        tar.extractall(tmpdir)
    return tmpdir, True


def transform_schema(schema_text: str):
    table_names = CREATE_TABLE_RE.findall(schema_text)
    transformed = CREATE_TABLE_RE.sub(
        lambda match: f"CREATE TABLE IF NOT EXISTS arce_{match.group(1).lower()}",
        schema_text,
    )
    return transformed, [f"arce_{name.lower()}" for name in table_names]


def drop_existing_arce_objects(conn: sqlite3.Connection, raw_tables: list[str]):
    derived_tables = [
        "arce_catalogo",
        "arce_catalogo_unidades",
        "arce_catalogo_sinonimos_flat",
        "item_arce_match",
    ]
    views = ["vw_items_arce_match"]

    for view_name in views:
        conn.execute(f"DROP VIEW IF EXISTS {view_name}")
    for table_name in derived_tables + raw_tables:
        conn.execute(f"DROP TABLE IF EXISTS {table_name}")
    conn.commit()


def convert_token(token: str):
    token = token.strip()
    if token.upper() == "NULL":
        return None
    if NUMERIC_RE.match(token):
        return float(token) if "." in token else int(token)
    return token.replace(ESCAPED_QUOTE_TOKEN, "'")


def parse_insert_line(line: str):
    match = INSERT_RE.match(line.strip())
    if not match:
        return None

    table_name = match.group(1).lower()
    columns = [col.strip().lower() for col in match.group(2).split(",")]
    values_sql = DATE_LITERAL_RE.sub(lambda m: f"'{m.group(1)}'", match.group(3))
    values_sql = values_sql.replace("\\'", ESCAPED_QUOTE_TOKEN)
    values = next(
        csv.reader(
            [values_sql],
            delimiter=",",
            quotechar="'",
            doublequote=True,
            skipinitialspace=True,
        )
    )
    return table_name, columns, [convert_token(value) for value in values]


def import_raw_tables(conn: sqlite3.Connection, extract_dir: Path):
    counts = Counter()
    for sql_path in sorted(extract_dir.glob("*.sql")):
        if sql_path.name == "crear_tablas_catalogo.sql":
            continue

        batches: dict[tuple[str, tuple[str, ...]], list[list[object]]] = defaultdict(list)
        with sql_path.open("r", encoding="latin-1") as handle:
            for line in handle:
                parsed = parse_insert_line(line)
                if not parsed:
                    continue
                table_name, columns, values = parsed
                batches[(table_name, tuple(columns))].append(values)

        for (table_name, columns), rows in batches.items():
            placeholders = ",".join("?" for _ in columns)
            sql = (
                f"INSERT INTO arce_{table_name} ({','.join(columns)}) "
                f"VALUES ({placeholders})"
            )
            conn.executemany(sql, rows)
            counts[table_name] += len(rows)
        conn.commit()

    return counts


def create_derived_tables(conn: sqlite3.Connection):
    conn.executescript(
        """
        CREATE TABLE arce_catalogo (
            cod INTEGER PRIMARY KEY,
            descripcion TEXT NOT NULL,
            descripcion_normalized TEXT NOT NULL,
            fami_cod INTEGER,
            fami_desc TEXT,
            subf_cod INTEGER,
            subf_desc TEXT,
            clas_cod INTEGER,
            clas_desc TEXT,
            subc_cod INTEGER,
            subc_desc TEXT,
            var_cod INTEGER,
            var_unme_cod INTEGER,
            unme_cod INTEGER,
            unidad_principal TEXT,
            unidad_principal_normalized TEXT,
            odg INTEGER,
            odg_desc TEXT,
            ind_art_serv TEXT,
            ind_fraccion TEXT,
            ind_gestionable TEXT,
            ind_agrupable TEXT,
            stockeable TEXT,
            stock_contable TEXT,
            ind_tipo_detalle TEXT,
            esp_tecnicas TEXT,
            fecha_baja TEXT,
            motivo_baja TEXT,
            comprable TEXT
        );

        CREATE TABLE arce_catalogo_unidades (
            arce_cod INTEGER NOT NULL,
            unme_cod INTEGER NOT NULL,
            unidad_desc TEXT,
            unidad_normalized TEXT,
            is_primary INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (arce_cod, unme_cod)
        );

        CREATE TABLE arce_catalogo_sinonimos_flat (
            arce_cod INTEGER NOT NULL,
            descripcion TEXT NOT NULL,
            descripcion_normalized TEXT NOT NULL,
            PRIMARY KEY (arce_cod, descripcion)
        );

        CREATE TABLE item_arce_match (
            item_id TEXT PRIMARY KEY,
            arce_cod INTEGER NOT NULL,
            match_type TEXT NOT NULL,
            match_score REAL NOT NULL,
            matched_text TEXT,
            unit_compatible INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        """
    )

    familias = {
        row["cod"]: row["descripcion"]
        for row in conn.execute("SELECT cod, descripcion FROM arce_familias")
    }
    subflias = {
        (row["fami_cod"], row["cod"]): row["descripcion"]
        for row in conn.execute("SELECT fami_cod, cod, descripcion FROM arce_subflias")
    }
    clases = {
        (row["fami_cod"], row["subf_cod"], row["cod"]): row["descripcion"]
        for row in conn.execute("SELECT fami_cod, subf_cod, cod, descripcion FROM arce_clases")
    }
    subclases = {
        (row["fami_cod"], row["subf_cod"], row["clas_cod"], row["cod"]): row["descripcion"]
        for row in conn.execute(
            "SELECT fami_cod, subf_cod, clas_cod, cod, descripcion FROM arce_subclases"
        )
    }
    odgs = {
        row["odg"]: row["descripcion"]
        for row in conn.execute("SELECT odg, descripcion FROM arce_odgs")
    }
    unidades = {
        row["cod"]: row["descripcion"]
        for row in conn.execute("SELECT cod, descripcion FROM arce_unidades_med")
    }

    catalog_rows = []
    catalog_unit_rows = {}
    for row in conn.execute("SELECT * FROM arce_art_serv_obra"):
        primary_unit_desc = unidades.get(row["unme_cod"])
        catalog_rows.append(
            (
                row["cod"],
                row["descripcion"],
                normalize_text(row["descripcion"]),
                row["fami_cod"],
                familias.get(row["fami_cod"]),
                row["subf_cod"],
                subflias.get((row["fami_cod"], row["subf_cod"])),
                row["clas_cod"],
                clases.get((row["fami_cod"], row["subf_cod"], row["clas_cod"])),
                row["subc_cod"],
                subclases.get(
                    (row["fami_cod"], row["subf_cod"], row["clas_cod"], row["subc_cod"])
                ),
                row["var_cod"],
                row["var_unme_cod"],
                row["unme_cod"],
                primary_unit_desc,
                normalize_text(primary_unit_desc),
                row["odg"],
                odgs.get(row["odg"]),
                row["ind_art_serv"],
                row["ind_fraccion"],
                row["ind_gestionable"],
                row["ind_agrupable"],
                row["stockeable"],
                row["stock_contable"],
                row["ind_tipo_detalle"],
                row["esp_tecnicas"],
                row["fecha_baja"],
                row["motivo_baja"],
                row["comprable"],
            )
        )

        if row["unme_cod"] is not None:
            catalog_unit_rows[(row["cod"], row["unme_cod"])] = (
                row["cod"],
                row["unme_cod"],
                primary_unit_desc,
                normalize_text(primary_unit_desc),
                1,
            )

    for row in conn.execute("SELECT arse_cod, unme_cod FROM arce_art_unidades_med"):
        unit_desc = unidades.get(row["unme_cod"])
        key = (row["arse_cod"], row["unme_cod"])
        if key not in catalog_unit_rows:
            catalog_unit_rows[key] = (
                row["arse_cod"],
                row["unme_cod"],
                unit_desc,
                normalize_text(unit_desc),
                0,
            )

    synonym_rows = [
        (row["arse_cod"], row["descripcion"], normalize_text(row["descripcion"]))
        for row in conn.execute("SELECT arse_cod, descripcion FROM arce_sinonimos")
        if row["descripcion"]
    ]

    conn.executemany(
        """
        INSERT INTO arce_catalogo (
            cod, descripcion, descripcion_normalized, fami_cod, fami_desc, subf_cod,
            subf_desc, clas_cod, clas_desc, subc_cod, subc_desc, var_cod, var_unme_cod,
            unme_cod, unidad_principal, unidad_principal_normalized, odg, odg_desc,
            ind_art_serv, ind_fraccion, ind_gestionable, ind_agrupable, stockeable,
            stock_contable, ind_tipo_detalle, esp_tecnicas, fecha_baja, motivo_baja,
            comprable
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        catalog_rows,
    )
    conn.executemany(
        """
        INSERT INTO arce_catalogo_unidades (
            arce_cod, unme_cod, unidad_desc, unidad_normalized, is_primary
        ) VALUES (?,?,?,?,?)
        """,
        list(catalog_unit_rows.values()),
    )
    conn.executemany(
        """
        INSERT INTO arce_catalogo_sinonimos_flat (
            arce_cod, descripcion, descripcion_normalized
        ) VALUES (?,?,?)
        """,
        synonym_rows,
    )

    conn.executescript(
        """
        CREATE INDEX idx_arce_catalogo_desc_norm ON arce_catalogo(descripcion_normalized);
        CREATE INDEX idx_arce_catalogo_comprable ON arce_catalogo(comprable);
        CREATE INDEX idx_arce_catalogo_syn_desc_norm ON arce_catalogo_sinonimos_flat(descripcion_normalized);
        CREATE INDEX idx_arce_catalogo_units_norm ON arce_catalogo_unidades(unidad_normalized);
        CREATE INDEX idx_item_arce_match_cod ON item_arce_match(arce_cod);

        CREATE VIEW vw_items_arce_match AS
        SELECT
            i.id AS item_id,
            i.cat_id,
            i.scheme,
            i.description AS item_description,
            i.unit AS item_unit,
            m.arce_cod,
            m.match_type,
            m.match_score,
            m.unit_compatible,
            c.descripcion AS arce_descripcion,
            c.unidad_principal AS arce_unidad_principal,
            c.fami_desc,
            c.subf_desc,
            c.clas_desc,
            c.subc_desc,
            c.odg_desc,
            c.comprable,
            c.ind_art_serv
        FROM items i
        LEFT JOIN item_arce_match m ON m.item_id = i.id
        LEFT JOIN arce_catalogo c ON c.cod = m.arce_cod;
        """
    )
    conn.commit()


def pick_unique_candidate(candidates: list[int], unit_norm: str, unit_lookup: dict[int, set[str]]):
    unique_candidates = sorted(set(candidates))
    if len(unique_candidates) == 1:
        code = unique_candidates[0]
        return code, int(bool(unit_norm and unit_norm in unit_lookup.get(code, set())))

    if unit_norm:
        compatible = [code for code in unique_candidates if unit_norm in unit_lookup.get(code, set())]
        if len(compatible) == 1:
            return compatible[0], 1
    return None, 0


def build_item_matches(conn: sqlite3.Connection):
    catalog_codes = {
        int(row["cod"])
        for row in conn.execute("SELECT cod FROM arce_catalogo")
    }

    desc_map: dict[str, list[int]] = defaultdict(list)
    for row in conn.execute(
        "SELECT cod, descripcion_normalized FROM arce_catalogo WHERE descripcion_normalized != ''"
    ):
        desc_map[row["descripcion_normalized"]].append(int(row["cod"]))

    syn_map: dict[str, list[int]] = defaultdict(list)
    for row in conn.execute(
        "SELECT arce_cod, descripcion_normalized FROM arce_catalogo_sinonimos_flat WHERE descripcion_normalized != ''"
    ):
        syn_map[row["descripcion_normalized"]].append(int(row["arce_cod"]))

    unit_lookup: dict[int, set[str]] = defaultdict(set)
    for row in conn.execute(
        "SELECT arce_cod, unidad_normalized FROM arce_catalogo_unidades WHERE unidad_normalized != ''"
    ):
        unit_lookup[int(row["arce_cod"])].add(row["unidad_normalized"])

    match_rows = []
    match_counts = Counter()
    created_at = dt.datetime.now(dt.timezone.utc).isoformat()

    for item in conn.execute("SELECT id, cat_id, scheme, description, unit FROM items"):
        item_id = item["id"]
        item_desc = item["description"] or ""
        item_norm = normalize_text(item_desc)
        unit_norm = normalize_text(item["unit"])

        matched = None
        if item["scheme"] == "x_catalogo_arce" and str(item["cat_id"] or "").isdigit():
            code = int(item["cat_id"])
            if code in catalog_codes:
                matched = (
                    item_id,
                    code,
                    "direct_code",
                    1.0,
                    str(item["cat_id"]),
                    int(bool(unit_norm and unit_norm in unit_lookup.get(code, set()))),
                    created_at,
                )

        if matched is None and item_norm:
            code, unit_compatible = pick_unique_candidate(desc_map.get(item_norm, []), unit_norm, unit_lookup)
            if code is not None:
                matched = (
                    item_id,
                    code,
                    "exact_description_unit" if unit_compatible else "exact_description",
                    0.97 if unit_compatible else 0.95,
                    item_desc,
                    unit_compatible,
                    created_at,
                )

        if matched is None and item_norm:
            code, unit_compatible = pick_unique_candidate(syn_map.get(item_norm, []), unit_norm, unit_lookup)
            if code is not None:
                matched = (
                    item_id,
                    code,
                    "synonym_unit" if unit_compatible else "synonym",
                    0.93 if unit_compatible else 0.9,
                    item_desc,
                    unit_compatible,
                    created_at,
                )

        if matched:
            match_rows.append(matched)
            match_counts[matched[2]] += 1

    conn.executemany(
        """
        INSERT INTO item_arce_match (
            item_id, arce_cod, match_type, match_score, matched_text, unit_compatible, created_at
        ) VALUES (?,?,?,?,?,?,?)
        """,
        match_rows,
    )
    conn.commit()
    return match_counts, len(match_rows)


def print_summary(raw_counts: Counter, match_counts: Counter, conn: sqlite3.Connection):
    catalog_items = conn.execute("SELECT COUNT(*) FROM arce_catalogo").fetchone()[0]
    synonym_count = conn.execute("SELECT COUNT(*) FROM arce_catalogo_sinonimos_flat").fetchone()[0]
    matched_items = conn.execute("SELECT COUNT(*) FROM item_arce_match").fetchone()[0]
    total_items = conn.execute("SELECT COUNT(*) FROM items").fetchone()[0]
    direct_arce_items = conn.execute(
        "SELECT COUNT(*) FROM items WHERE scheme='x_catalogo_arce'"
    ).fetchone()[0]

    print("ARCE importado:")
    for table_name, count in raw_counts.most_common():
        print(f"  arce_{table_name:<22} {count:>10,}")
    print(f"  arce_catalogo{'':<18} {catalog_items:>10,}")
    print(f"  arce_catalogo_sinonimos{'':<8} {synonym_count:>10,}")
    print()
    print("Matching generado:")
    print(f"  items totales{'':<18} {total_items:>10,}")
    print(f"  items x_catalogo_arce{'':<9} {direct_arce_items:>10,}")
    print(f"  items macheados{'':<15} {matched_items:>10,}")
    for match_type, count in match_counts.most_common():
        print(f"  {match_type:<28} {count:>10,}")


def main():
    args = parse_args()
    db_path = Path(args.db).resolve()
    archive_path = Path(args.archive).resolve()

    extract_dir, _ = ensure_extracted(archive_path, Path(args.extract_dir).resolve() if args.extract_dir else None)
    schema_path = extract_dir / "crear_tablas_catalogo.sql"
    if not schema_path.exists():
        raise SystemExit(f"No se encontro el esquema en {schema_path}")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA temp_store=MEMORY")

    schema_text = schema_path.read_text(encoding="latin-1")
    transformed_schema, raw_tables = transform_schema(schema_text)

    drop_existing_arce_objects(conn, raw_tables)
    conn.executescript(transformed_schema)
    raw_counts = import_raw_tables(conn, extract_dir)
    create_derived_tables(conn)
    match_counts, _ = build_item_matches(conn)
    print_summary(raw_counts, match_counts, conn)
    conn.close()


if __name__ == "__main__":
    main()
