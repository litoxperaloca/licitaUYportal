# LicitaUY – Historial de adjudicaciones
Dashboard interactivo de grafos para explorar las contrataciones públicas del Estado uruguayo, basado en el estándar **Open Contracting Data Standard (OCDS)** y los datos históricos de [comprasestatales.gub.uy](https://www.comprasestatales.gub.uy).

---

## 📐 Arquitectura

```
ocds-dashboard/
├── backend/              FastAPI + SQLite
│   ├── main.py           Entry point
│   ├── database.py       SQLite WAL + FTS5 + índices optimizados
│   ├── routers/
│   │   ├── process.py    Ingesta de ZIPs (batch, background)
│   │   ├── graph.py      Carga lazy de nodos/aristas
│   │   └── nodes.py      Detalle de nodos + búsqueda FTS + listado
│   └── data/
│       ├── ocds.db       Base de datos SQLite
│       └── uploads/      ZIPs subidos via API
│
├── frontend/             React 18 + Vite + Tailwind
│   └── src/
│       ├── App.jsx       Orquestador principal
│       ├── api/          Clientes HTTP (axios)
│       ├── components/
│       │   ├── SigmaGraph.jsx      Canvas WebGL (Sigma.js v3)
│       │   ├── LeftPanel.jsx       Lista de llamados + filtros
│       │   ├── NodeDetails.jsx     Panel detalle deslizante derecha
│       │   ├── GlobalSearch.jsx    Búsqueda flotante (Ctrl+K)
│       │   ├── ProcessingPanel.jsx Gestión de ingesta
│       │   └── TopBar.jsx          HUD superior
│       └── hooks/
│           └── useGraph.js         Lógica del grafo
│
├── import_zips.py        CLI para carga masiva inicial
├── start.sh              Script de arranque (dev local)
└── docker-compose.yml    Stack completo en Docker
```

---

## 🗄️ Modelo de datos

### Nodos del grafo

| Tipo       | Color     | Descripción                          |
|-----------|-----------|--------------------------------------|
| `root`    | 🟡 Ámbar  | ESTADO URUGUAYO (nodo central)       |
| `organismo`| 🟣 Índigo | Organismos compradores               |
| `llamado` | 🟢 Verde  | Llamados / licitaciones              |
| `item`    | 🟠 Naranja| Ítems del catálogo ARCE              |
| `supplier`| 🩷 Rosa   | Proveedores / empresas adjudicadas   |

### Jerarquía
```
ESTADO URUGUAYO
    └── Organismo (ej: Intendencia de Montevideo)
            └── Llamado (ej: Compra Directa 1/2023)
                    └── Ítem (ej: FENTANILO INYECTABLE)
                            └── Proveedor (ej: MURRY S.A.)
                                         ↑ con precio unitario + total
```

### Tablas SQLite

| Tabla             | Descripción                          |
|-------------------|--------------------------------------|
| `organismos`      | 324 organismos únicos                |
| `llamados`        | ~432K llamados/licitaciones          |
| `items`           | ~210K ítems únicos del catálogo      |
| `suppliers`       | ~28K proveedores únicos              |
| `llamado_items`   | ~2.5M relaciones llamado↔ítem        |
| `adjudicaciones`  | ~2.5M adjudicaciones con precios     |
| `fts_*`           | Índices FTS5 para búsqueda full-text |

---

## 🚀 Inicio rápido

### Opción A – Local (dev)

```bash
# 1. Clonar / descomprimir el proyecto
cd ocds-dashboard

# 2. Importar los ZIPs históricos (recomendado antes de iniciar)
python import_zips.py /ruta/a/ocds-2009.zip /ruta/a/ocds-2010.zip ...
# o carpeta completa:
python import_zips.py /ruta/a/zips/

# 3. Iniciar backend + frontend
./start.sh

# 4. Abrir en el navegador
open http://localhost:5173
```

### Opción B – Docker

```bash
cd ocds-dashboard
docker-compose up --build

# Frontend: http://localhost:5173
# Backend:  http://localhost:8000
# API docs: http://localhost:8000/docs
```

---

## 🔌 API endpoints

### Procesamiento
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/process/upload` | Subir ZIP (multipart) |
| `GET`  | `/api/process/jobs`   | Listar jobs |
| `GET`  | `/api/process/stats`  | Conteos de la DB |

### Grafo (lazy loading)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/graph/root` | Nodo raíz + organismos |
| `GET` | `/api/graph/organismo/{id}` | Llamados de un organismo |
| `GET` | `/api/graph/llamado/{ocid}` | Ítems de un llamado |
| `GET` | `/api/graph/item/{id}` | Proveedores de un ítem |
| `GET` | `/api/graph/supplier/{id}` | Ítems ganados por proveedor |

### Detalle de nodos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/nodes/organismo/{id}` | Info completa + stats |
| `GET` | `/api/nodes/llamado/{ocid}` | Info + ítems |
| `GET` | `/api/nodes/item/{id}` | Info + historial de precios |
| `GET` | `/api/nodes/supplier/{id}` | Info + top ítems y organismos |

### Búsqueda y filtros
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/search?q=...` | FTS en todos los tipos |
| `GET` | `/api/llamados` | Lista paginada con filtros |
| `GET` | `/api/filters` | Opciones para dropdowns |
| `GET` | `/api/items/{id}/price-history` | Historial de precios |

---

## 🎮 Uso del dashboard

### Navegación del grafo
- **Click** en un nodo → abre panel de detalles (derecha)
- **Doble click** → expande el nodo (carga sus hijos)
- **Botón "⊕ Expandir"** en el panel → mismo efecto
- **Scroll** → zoom in/out
- **Arrastrar** → paneo del canvas

### Búsqueda global (Ctrl+K)
Busca simultáneamente en:
- Ítems por nombre o código de catálogo
- Proveedores por nombre
- Organismos por nombre
- Llamados por título o descripción

### Panel izquierdo
- Lista de todos los llamados con scroll infinito
- Filtros por: organismo, año, modalidad, texto libre
- Click en un llamado → foco en el grafo

### Panel de detalles (por tipo de nodo)
- **Organismo**: estadísticas, llamados por año, modalidades
- **Llamado**: info completa, lista de ítems
- **Ítem**: estadísticas de precio (min/avg/max), gráfico de evolución histórica, tabla completa con todos los precios adjudicados
- **Proveedor**: adjudicaciones por año, top ítems ganados, top organismos compradores

---

## ⚙️ Rendimiento

El grafo usa **Sigma.js v3 (WebGL)** con **graphology** como estructura de datos:
- Renderiza 50.000+ nodos sin degradación
- El layout usa **ForceAtlas2** con Barnes-Hut para nodos > 800
- La carga es **lazy**: solo se cargan nodos cuando se expande su padre
- Los ZIPs se procesan con **inserts por batch** y **WAL mode** en SQLite
- **FTS5** para búsqueda full-text O(log n)

---

## 📊 Datos fuente

- **Fuente**: ARCE – Agencia Reguladora de Compras Estatales
- **Portal**: [comprasestatales.gub.uy](https://www.comprasestatales.gub.uy/ocds)
- **Estándar**: OCDS (Open Contracting Data Standard) ⭐⭐⭐⭐
- **Período**: 2009 – 2023
- **Volumen**: ~433K llamados · ~963K adjudicaciones
# licitaUYportal
# licitaUYportal
# licitaUYportal
