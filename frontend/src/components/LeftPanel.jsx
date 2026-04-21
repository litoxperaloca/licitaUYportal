import { useState, useEffect, useCallback, useRef } from 'react'
import { searchAPI } from '../api'

const TYPE_COLORS = {
  organismo: 'bg-indigo-500',
  llamado: 'bg-green-500',
  item: 'bg-orange-500',
  supplier: 'bg-pink-500',
}

function FilterSelect({ label, value, onChange, options, placeholder }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-accent border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
      >
        <option value="">{placeholder}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

export default function LeftPanel({
  open,
  onToggle,
  onLlamadoClick,
  onFiltersChange,
}) {
  const [filters, setFilters] = useState({ org_id: '', year: '', method: '', q: '' })
  const [filterOpts, setFilterOpts] = useState({ years: [], methods: [], organismos: [] })
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const listRef = useRef(null)
  const LIMIT = 50

  // Load filter options
  useEffect(() => {
    searchAPI.filters().then(r => setFilterOpts(r.data)).catch(() => { })
  }, [])

  // Load llamados
  const loadLlamados = useCallback(async (reset = false) => {
    setLoading(true)
    try {
      const off = reset ? 0 : offset
      const { data } = await searchAPI.llamados({
        ...filters,
        limit: LIMIT,
        offset: off,
      })
      if (reset) {
        setItems(data.items)
        setOffset(LIMIT)
      } else {
        setItems(prev => [...prev, ...data.items])
        setOffset(off + LIMIT)
      }
      setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }, [filters, offset])

  useEffect(() => { 
    loadLlamados(true)
    onFiltersChange?.(filters)
  }, [filters])

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el || loading || items.length >= total) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      loadLlamados(false)
    }
  }, [loading, items.length, total, loadLlamados])

  const setFilter = (key, val) => {
    setFilters(f => ({ ...f, [key]: val }))
    setOffset(0)
  }

  const METHOD_BADGE = {
    'Compra Directa': 'bg-blue-900 text-blue-200',
    'Licitación Abreviada': 'bg-purple-900 text-purple-200',
    'Licitación Pública': 'bg-red-900 text-red-200',
    'Concurso de Precios': 'bg-yellow-900 text-yellow-200',
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="absolute top-1/2 -translate-y-1/2 z-30 border border-border text-muted-foreground hover:text-foreground px-1.5 py-4 rounded-r-xl hover:bg-accent transition-all shadow-lg pointer-events-auto"
        style={{ left: open ? '380px' : '0px', transition: 'left 0.3s cubic-bezier(0.16,1,0.3,1)', background: 'hsl(var(--card))' }}
      >
        <span className="text-xs">{open ? '◀' : '▶'}</span>
      </button>

      {/* Panel */}
      <div
        className="absolute left-0 top-0 h-full z-20 flex flex-col border-r border-border shadow-2xl pointer-events-auto glass-panel"
        style={{
          width: '380px',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1)',
        }}
      >

        {/* Filters */}
        <div className="flex flex-col gap-2 px-3 py-3 border-b border-border bg-card/50">
          <div className="relative">
            <input
              type="text"
              placeholder="Filtrar llamados..."
              value={filters.q}
              onChange={e => setFilter('q', e.target.value)}
              className="w-full bg-accent border border-border rounded-xl pl-8 pr-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
            <span className="absolute left-2.5 top-2 text-muted-foreground text-sm">🔍</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <FilterSelect
              label="Organismo"
              value={filters.org_id}
              onChange={v => setFilter('org_id', v)}
              options={filterOpts.organismos.map(o => ({ value: o.id, label: o.name }))}
              placeholder="Todos"
            />
            <FilterSelect
              label="Año"
              value={filters.year}
              onChange={v => setFilter('year', v)}
              options={filterOpts.years.map(y => ({ value: y, label: y }))}
              placeholder="Todos"
            />
          </div>

          <FilterSelect
            label="Modalidad"
            value={filters.method}
            onChange={v => setFilter('method', v)}
            options={filterOpts.methods.map(m => ({ value: m, label: m }))}
            placeholder="Todas"
          />
        </div>

        {/* Llamados list */}
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto"
        >
          {items.map(item => (
            <div
              key={item.ocid}
              onClick={() => onLlamadoClick(item)}
              className="group flex flex-col gap-1 px-3 py-2.5 border-b border-border/60 cursor-pointer hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span className={`shrink-0 mt-0.5 text-[10px] px-1.5 py-0.5 rounded font-bold ${METHOD_BADGE[item.method] || 'bg-accent text-muted-foreground'}`}>
                  {item.method?.replace('Licitación ', 'Lic. ')?.replace('Compra ', 'CD ') || '?'}
                </span>
                <p className="text-xs text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                  {item.title || item.ocid}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground truncate">{item.org_name}</span>
                <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0 font-mono">{item.year}</span>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center justify-center py-6">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-2">
              <span className="text-3xl">📭</span>
              <p className="text-sm">Sin resultados</p>
            </div>
          )}
        </div>

        {/* Footer stats */}
        <div className="px-3 py-2 border-t border-border bg-card/50 flex items-center gap-3 text-xs text-muted-foreground">
          <span>Mostrando <span className="font-mono text-foreground">{Math.min(items.length, total).toLocaleString()}</span> de <span className="font-mono text-foreground">{total.toLocaleString()}</span></span>
        </div>
      </div>
    </>
  )
}
