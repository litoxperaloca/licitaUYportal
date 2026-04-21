import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCcw,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react'

const DEFAULT_PAGE_SIZE = 50
const PAGE_SIZE_OPTIONS = [25, 50, 100, 250]
const DEFAULT_SORT = { by: 'date', dir: 'desc' }
const DEFAULT_COLUMN_FILTERS = {
  date_filter: '',
  year: '',
  org_name: '',
  supplier_name: '',
  item_code: '',
  unit: '',
  item_description: '',
  quantity: '',
  amount: '',
  total: '',
  currency: '',
}

const HISTORY_COLUMNS = [
  {
    key: 'date',
    filterKey: 'date_filter',
    label: 'Fecha',
    placeholder: '2024 o >=2024-01',
    align: 'left',
    render: (row) => row.date?.slice(0, 10) || row.year || '—',
  },
  {
    key: 'year',
    filterKey: 'year',
    label: 'Año',
    placeholder: '2024 o >=2020',
    align: 'left',
    render: (row) => row.year || '—',
  },
  {
    key: 'org_name',
    filterKey: 'org_name',
    label: 'Organismo',
    placeholder: 'Filtrar...',
    align: 'left',
    cellClass: 'max-w-[220px]',
    render: (row) => (
      <span className="truncate block" title={row.org_name || ''}>
        {row.org_name || '—'}
      </span>
    ),
  },
  {
    key: 'supplier_name',
    filterKey: 'supplier_name',
    label: 'Proveedor',
    placeholder: 'Filtrar...',
    align: 'left',
    cellClass: 'max-w-[220px]',
    render: (row) => (
      <span className="truncate block font-medium" title={row.supplier_name || ''}>
        {row.supplier_name || '—'}
      </span>
    ),
  },
  {
    key: 'item_code',
    filterKey: 'item_code',
    label: 'Ítem Código',
    placeholder: 'Código...',
    align: 'left',
    render: (row) => row.item_code || '—',
  },
  {
    key: 'unit',
    filterKey: 'unit',
    label: 'Unidad de medida',
    placeholder: 'Unidad...',
    align: 'left',
    render: (row) => row.unit || '—',
  },
  {
    key: 'item_description',
    filterKey: 'item_description',
    label: 'Características',
    placeholder: 'Descripción...',
    align: 'left',
    cellClass: 'max-w-[320px]',
    render: (row) => (
      <span className="truncate block" title={row.item_description || ''}>
        {row.item_description || '—'}
      </span>
    ),
  },
  {
    key: 'quantity',
    filterKey: 'quantity',
    label: 'Cant.',
    placeholder: '>=1',
    align: 'right',
    render: (row) => formatNumber(getSafeQuantity(row.quantity)),
  },
  {
    key: 'amount',
    filterKey: 'amount',
    label: 'P. Unitario',
    placeholder: '>=100',
    align: 'right',
    render: (row) => formatMoney(row.amount, row.currency),
  },
  {
    key: 'total',
    filterKey: 'total',
    label: 'Total',
    placeholder: '>=1000',
    align: 'right',
    render: (row) => formatMoney(getRowTotal(row), row.currency),
  },
  {
    key: 'currency',
    filterKey: 'currency',
    label: 'Moneda',
    placeholder: 'UYU',
    align: 'center',
    render: (row) => row.currency || '—',
  },
]

function getSafeQuantity(quantity) {
  if (quantity == null || Number(quantity) === 0) return 1
  return Number(quantity)
}

function getRowTotal(row) {
  if (row.amount == null) return null
  return Number(row.amount) * getSafeQuantity(row.quantity)
}

function formatNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return Number(value).toLocaleString('es-UY')
}

function formatMoney(value, currency) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return `${currency || ''} ${Number(value).toLocaleString('es-UY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`.trim()
}

function csvEscape(value) {
  const safe = value == null ? '' : String(value)
  return `"${safe.replaceAll('"', '""')}"`
}

function exportCSV(rows) {
  const headers = [
    'Fecha',
    'Año',
    'Organismo',
    'Proveedor',
    'Ítem Código',
    'Unidad de medida',
    'Características',
    'Cantidad',
    'Precio unitario',
    'Total',
    'Moneda',
  ]

  const lines = [headers.join(',')]
  rows.forEach((row) => {
    lines.push([
      csvEscape(row.date?.slice(0, 10) || ''),
      csvEscape(row.year || ''),
      csvEscape(row.org_name || ''),
      csvEscape(row.supplier_name || ''),
      csvEscape(row.item_code || ''),
      csvEscape(row.unit || ''),
      csvEscape(row.item_description || ''),
      csvEscape(getSafeQuantity(row.quantity)),
      csvEscape(row.amount == null ? '' : Number(row.amount).toFixed(2)),
      csvEscape(getRowTotal(row) == null ? '' : Number(getRowTotal(row)).toFixed(2)),
      csvEscape(row.currency || ''),
    ].join(','))
  })

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const anchor = document.createElement('a')
  anchor.href = URL.createObjectURL(blob)
  anchor.download = `licitauy_historial_${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
}

function SortIndicator({ active, direction }) {
  if (!active) return <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground/70" />
  return direction === 'asc'
    ? <ArrowUp className="w-3.5 h-3.5 text-primary" />
    : <ArrowDown className="w-3.5 h-3.5 text-primary" />
}

export default function History() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [query, setQuery] = useState('')
  const [columnFilters, setColumnFilters] = useState(DEFAULT_COLUMN_FILTERS)
  const [sort, setSort] = useState(DEFAULT_SORT)
  const [smartDraft, setSmartDraft] = useState('')
  const [smartSearch, setSmartSearch] = useState(null)
  const [smartAnalysis, setSmartAnalysis] = useState('')
  const [smartPreview, setSmartPreview] = useState(null)
  const [smartLoading, setSmartLoading] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)

      try {
        const params = {
          q: query.trim() || undefined,
          page,
          limit: pageSize,
          sort_by: sort.by,
          sort_dir: sort.dir,
          smart_mode: smartSearch?.mode || undefined,
          smart_keywords_json: smartSearch ? JSON.stringify(smartSearch.keywords) : undefined,
        }

        Object.entries(columnFilters).forEach(([key, value]) => {
          if (String(value || '').trim()) {
            params[key] = value.trim()
          }
        })

        const { data } = await axios.get('/api/history', { params })
        setRows(data.items || [])
        setTotal(data.total || 0)
        setTotalPages(data.total_pages || 0)
      } catch (error) {
        console.error(error)
        toast.error('No se pudo cargar el historial.')
      } finally {
        setLoading(false)
      }
    }, query.trim() ? 300 : 150)

    return () => clearTimeout(debounceRef.current)
  }, [query, columnFilters, sort, page, pageSize, smartSearch, refreshKey])

  const setColumnFilter = (key, value) => {
    setPage(1)
    setColumnFilters((prev) => ({ ...prev, [key]: value }))
  }

  const handleSort = (columnKey) => {
    setPage(1)
    setSort((prev) => {
      if (prev.by === columnKey) {
        return { by: columnKey, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      }
      return { by: columnKey, dir: columnKey === 'date' ? 'desc' : 'asc' }
    })
  }

  const handleResetFilters = () => {
    setPage(1)
    setQuery('')
    setColumnFilters(DEFAULT_COLUMN_FILTERS)
    setSmartSearch(null)
    setSmartAnalysis('')
    setSmartPreview(null)
  }

  const handleResolveSmartSearch = async () => {
    if (!smartDraft.trim()) {
      toast.error('Describe primero la búsqueda inteligente.')
      return
    }

    setSmartLoading(true)
    try {
      const { data } = await axios.post('/api/history/intelligent-search', { query: smartDraft.trim() })

      setSmartSearch(data.smart_filter || null)
      setSmartAnalysis(data.analysis || '')
      setSmartPreview(data.preview || null)
      setPage(1)
      setColumnFilters((prev) => {
        const next = { ...prev }
        Object.entries(data.header_filters || {}).forEach(([key, value]) => {
          if (String(value || '').trim()) {
            next[key] = String(value).trim()
          }
        })
        return next
      })

      toast.success('Búsqueda inteligente aplicada.')
    } catch (error) {
      console.error(error)
      const message = error?.response?.data?.detail || 'No se pudo resolver la búsqueda inteligente.'
      toast.error(message)
    } finally {
      setSmartLoading(false)
    }
  }

  const clearSmartSearch = () => {
    setPage(1)
    setSmartSearch(null)
    setSmartAnalysis('')
    setSmartPreview(null)
  }

  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const pageEnd = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-col h-full p-6 gap-5 animate-fade-up">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-black tracking-tight">Historial de Adjudicaciones</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className="font-mono text-foreground font-bold">{total.toLocaleString()}</span> registros encontrados
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setRefreshKey((value) => value + 1)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card hover:bg-accent transition-colors text-sm font-semibold"
          >
            <RefreshCcw className="w-4 h-4" /> Actualizar
          </button>
          <button
            onClick={handleResetFilters}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card hover:bg-accent transition-colors text-sm font-semibold"
          >
            <X className="w-4 h-4" /> Limpiar filtros
          </button>
          <button
            disabled={rows.length === 0}
            onClick={() => exportCSV(rows)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 active:scale-95 transition-all shadow-md shadow-primary/20 disabled:opacity-40"
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="p-4 rounded-2xl border border-border bg-card space-y-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
            <Search className="w-3.5 h-3.5" /> Búsqueda rápida
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(event) => {
                setPage(1)
                setQuery(event.target.value)
              }}
              placeholder="Proveedor, organismo, ítem o código..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-accent border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Se combina con los filtros por columna usando lógica <span className="font-mono text-foreground">AND</span>.
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-border bg-card space-y-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5" /> Búsqueda inteligente
          </div>
          <textarea
            value={smartDraft}
            onChange={(event) => setSmartDraft(event.target.value)}
            placeholder="Ej: todas las adjudicaciones de proveedores relacionados a la construcción"
            className="w-full min-h-[110px] px-4 py-3 rounded-xl bg-accent border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-y"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleResolveSmartSearch}
              disabled={smartLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" /> {smartLoading ? 'Resolviendo...' : 'Resolver con IA'}
            </button>
            {smartSearch && (
              <button
                onClick={clearSmartSearch}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card hover:bg-accent transition-colors text-sm font-semibold"
              >
                <X className="w-4 h-4" /> Quitar criterio IA
              </button>
            )}
          </div>
          {smartSearch && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 space-y-2">
              <p className="text-sm text-foreground leading-relaxed">{smartAnalysis}</p>
              <div className="flex flex-wrap gap-2">
                {smartSearch.keywords?.map((keyword) => (
                  <span
                    key={keyword}
                    className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-bold tracking-wide"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
              {smartPreview && (
                <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                  <span>Items detectados: <strong className="text-foreground">{smartPreview.matching_items?.toLocaleString?.() || 0}</strong></span>
                  <span>Proveedores detectados: <strong className="text-foreground">{smartPreview.matching_suppliers?.toLocaleString?.() || 0}</strong></span>
                  <span>Modo: <strong className="text-foreground">{smartSearch.mode === 'suppliers_of_matched_items' ? 'proveedores relacionados' : 'ítems relacionados'}</strong></span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border">
                {HISTORY_COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={`px-3 py-3 font-black text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap ${
                      column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(column.key)}
                      className={`inline-flex items-center gap-1.5 hover:text-foreground transition-colors ${
                        column.align === 'right' ? 'ml-auto' : column.align === 'center' ? 'mx-auto' : ''
                      }`}
                    >
                      <span>{column.label}</span>
                      <SortIndicator active={sort.by === column.key} direction={sort.dir} />
                    </button>
                  </th>
                ))}
              </tr>
              <tr className="border-b border-border bg-card">
                {HISTORY_COLUMNS.map((column) => (
                  <th key={`${column.key}-filter`} className="px-2 py-2">
                    <input
                      value={columnFilters[column.filterKey]}
                      onChange={(event) => setColumnFilter(column.filterKey, event.target.value)}
                      placeholder={column.placeholder}
                      className={`w-full rounded-lg border border-border bg-accent px-2.5 py-2 text-[11px] font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ${
                        column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
                      }`}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={`${row.ocid || 'row'}-${row.item_id || 'item'}-${row.supplier_name || 'supplier'}-${index}`}
                  className="border-b border-border/50 hover:bg-accent/40 transition-colors"
                >
                  {HISTORY_COLUMNS.map((column) => (
                    <td
                      key={`${column.key}-${index}`}
                      className={`px-3 py-2.5 ${
                        column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
                      } ${column.cellClass || ''} ${
                        column.key === 'amount'
                          ? 'font-mono text-amber-500 dark:text-amber-400 font-bold whitespace-nowrap'
                          : column.key === 'total'
                            ? 'font-mono text-orange-500 dark:text-orange-300 font-black whitespace-nowrap'
                            : column.key === 'date' || column.key === 'year' || column.key === 'currency'
                              ? 'font-mono text-muted-foreground whitespace-nowrap'
                              : 'text-foreground'
                      }`}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={HISTORY_COLUMNS.length} className="text-center py-20 text-muted-foreground">
                    <div className="flex flex-col items-center gap-3">
                      <TrendingUp className="w-10 h-10 opacity-20" />
                      <p className="font-medium">Sin resultados</p>
                      <p className="text-xs">Prueba quitar filtros o refinar el criterio inteligente.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-border bg-card/50 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground font-mono">
            <span>
              {pageStart.toLocaleString()} - {pageEnd.toLocaleString()} / {total.toLocaleString()}
            </span>
            <label className="flex items-center gap-2">
              <span>Por página</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPage(1)
                  setPageSize(Number(event.target.value))
                }}
                className="rounded-lg border border-border bg-accent px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-accent hover:bg-accent/80 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <span className="text-xs font-mono text-muted-foreground min-w-[110px] text-center">
              Página {totalPages === 0 ? 0 : page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((current) => Math.min(totalPages || 1, current + 1))}
              disabled={loading || totalPages === 0 || page >= totalPages}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-accent hover:bg-accent/80 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading && (
          <div className="px-4 py-2 border-t border-border text-center">
            <div className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  )
}
