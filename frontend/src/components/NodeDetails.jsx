import { useState, useEffect } from 'react'
import { nodeAPI } from '../api'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ScatterChart, Scatter,
} from 'recharts'

const TYPE_LABELS = {
  root: 'Estado',
  organismo: 'Organismo',
  llamado: 'Llamado',
  item: 'Ítem / Producto',
  supplier: 'Proveedor',
}
const TYPE_COLORS = {
  root: 'border-amber-500 text-amber-400',
  organismo: 'border-indigo-500 text-indigo-400',
  llamado: 'border-green-500 text-green-400',
  item: 'border-orange-500 text-orange-400',
  supplier: 'border-pink-500 text-pink-400',
}

function Stat({ label, value, sub }) {
  return (
    <div className="bg-accent/60 rounded-xl p-3 flex flex-col gap-0.5 border border-border/50 animate-count-up">
      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{label}</span>
      <span className="text-lg font-black text-foreground font-mono">{value ?? '—'}</span>
      {sub && <span className="text-[10px] text-muted-foreground font-mono">{sub}</span>}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1">{title}</h3>
      {children}
    </div>
  )
}

// ── per-type panels ──────────────────────────────────────────────────────────

function OrgPanel({ data }) {
  const { name, stats, methods, by_year } = data
  const chartData = by_year?.map(r => ({ año: r.year, llamados: r.cnt })) || []
  return (
    <>
      <Section title="Estadísticas">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Total llamados" value={stats?.total_llamados?.toLocaleString()} />
          <Stat label="Años activo" value={stats?.years_active} sub={`${stats?.first_year} – ${stats?.last_year}`} />
        </div>
      </Section>
      <Section title="Llamados por año">
        <div className="h-40 bg-accent/30 rounded-xl p-2 border border-border/50">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="año" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12 }} labelStyle={{ color: 'hsl(var(--foreground))' }} />
              <Line type="monotone" dataKey="llamados" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>
      <Section title="Modalidades">
        <div className="flex flex-col gap-1">
          {methods?.slice(0, 8).map(m => (
            <div key={m.method} className="flex items-center gap-2 text-xs">
              <div className="flex-1 text-foreground truncate">{m.method}</div>
              <span className="text-muted-foreground shrink-0 font-mono">{m.cnt?.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}

function LlamadoPanel({ data }) {
  const { title, method, date, year, description, organismo, status, items } = data
  return (
    <>
      <Section title="Información">
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Organismo</span><span className="text-white">{organismo}</span></div>
          <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Modalidad</span><span className="text-white">{method}</span></div>
          <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Año</span><span className="text-white">{year}</span></div>
          <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Fecha</span><span className="text-white">{date?.slice(0, 10)}</span></div>
          {description && <div className="flex gap-2"><span className="text-gray-400 w-20 shrink-0">Descripción</span><span className="text-gray-300 text-xs leading-relaxed">{description}</span></div>}
        </div>
      </Section>
      <Section title={`Ítems (${items?.length || 0})`}>
        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
          {items?.map(item => (
            <div key={item.id} className="flex gap-2 items-start py-1 border-b border-gray-800 text-xs">
              <span className="text-orange-400 shrink-0">●</span>
              <span className="text-gray-300 leading-tight">{item.description}</span>
              <span className="text-gray-500 shrink-0 ml-auto">{item.unit}</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}

function ItemPanel({ data }) {
  const { description, cat_id, scheme, unit, stats, price_history, total_llamados } = data

  // Build chart data: average price per year
  const byYear = {}
  price_history?.forEach(h => {
    if (h.amount == null) return
    if (!byYear[h.year]) byYear[h.year] = { prices: [], currency: h.currency }
    byYear[h.year].prices.push(h.amount)
  })
  const chartData = Object.entries(byYear)
    .sort(([a], [b]) => a - b)
    .map(([year, d]) => ({
      año: Number(year),
      min: Math.min(...d.prices),
      avg: d.prices.reduce((a, b) => a + b, 0) / d.prices.length,
      max: Math.max(...d.prices),
      currency: d.currency,
    }))

  return (
    <>
      <Section title="Información">
        <div className="flex flex-col gap-1.5 text-sm">
          {cat_id && <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">Código</span><span className="text-orange-300 font-mono">{cat_id}</span></div>}
          {scheme && <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">Catálogo</span><span className="text-white">{scheme}</span></div>}
          {unit && <div className="flex gap-2"><span className="text-gray-400 w-16 shrink-0">Unidad</span><span className="text-white">{unit}</span></div>}
        </div>
      </Section>

      <Section title="Estadísticas de precio">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Min precio" value={stats?.min_price != null ? `$${stats.min_price?.toLocaleString('es-UY', { maximumFractionDigits: 0 })}` : '—'} />
          <Stat label="Max precio" value={stats?.max_price != null ? `$${stats.max_price?.toLocaleString('es-UY', { maximumFractionDigits: 0 })}` : '—'} />
          <Stat label="Precio prom." value={stats?.avg_price != null ? `$${Math.round(stats.avg_price).toLocaleString('es-UY')}` : '—'} />
          <Stat label="Proveedores" value={stats?.distinct_suppliers} />
          <Stat label="Adjudicaciones" value={stats?.total_adjudicaciones?.toLocaleString()} />
          <Stat label="En llamados" value={total_llamados?.toLocaleString()} />
        </div>
      </Section>

      {/* -- Comparador de PRECIOS -- */}
      {price_history?.filter(h => h.amount != null && h.quantity > 0).length >= 2 && (() => {
        const validH = price_history
          .filter(h => h.amount != null && h.quantity > 0)
          .map(h => ({
             ...h,
             unitPrice: h.amount
          }))
        
        // Remove outliers and self-comparisons
        if (validH.length < 2) return null;
        
        const sorted = validH.sort((a,b) => a.unitPrice - b.unitPrice)
        const cheapest = sorted[0]
        const mostExpensive = sorted[sorted.length - 1]

        // Only show if there's an actual difference and they are from different orgs to make it interesting
        if (cheapest.unitPrice >= mostExpensive.unitPrice || cheapest.org_name === mostExpensive.org_name) return null;

        const diffPct = ((mostExpensive.unitPrice / cheapest.unitPrice) - 1) * 100

        return (
          <Section title="Comparador Rápido">
             <div className="bg-accent/40 border border-border/50 p-3 rounded-xl flex flex-col gap-3">
                <div className="flex justify-between items-center text-xs">
                   <div className="flex flex-col flex-1 min-w-0 pr-2">
                      <span className="text-[9px] uppercase tracking-widest text-emerald-400 font-bold mb-0.5">Compró Más Barato</span>
                      <span className="truncate text-foreground font-medium" title={cheapest.org_name}>{cheapest.org_name}</span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">a {cheapest.supplier_name}</span>
                   </div>
                   <div className="flex flex-col items-end shrink-0">
                      <span className="font-mono text-emerald-400 font-bold">{cheapest.currency} {cheapest.unitPrice.toLocaleString('es-UY', {maximumFractionDigits:2})}</span>
                      <span className="text-[9px] text-muted-foreground">x {cheapest.unit}</span>
                   </div>
                </div>

                <div className="h-px w-full bg-border/50 relative">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border px-2 py-0.5 rounded-full text-[9px] font-bold text-muted-foreground">
                    vs
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs">
                   <div className="flex flex-col flex-1 min-w-0 pr-2">
                      <span className="text-[9px] uppercase tracking-widest text-rose-400 font-bold mb-0.5">Compró Más Caro</span>
                      <span className="truncate text-foreground font-medium" title={mostExpensive.org_name}>{mostExpensive.org_name}</span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">a {mostExpensive.supplier_name}</span>
                   </div>
                   <div className="flex flex-col items-end shrink-0">
                      <span className="font-mono text-rose-400 font-bold">{mostExpensive.currency} {mostExpensive.unitPrice.toLocaleString('es-UY', {maximumFractionDigits:2})}</span>
                      <span className="text-[9px] text-muted-foreground">x {mostExpensive.unit}</span>
                   </div>
                </div>

                <div className="mt-1 pt-2 border-t border-border/50 text-[10px] text-center text-muted-foreground">
                  Diferencia de <span className="font-bold text-foreground">+{diffPct.toFixed(0)}%</span> en el precio unitario.
                </div>
             </div>
          </Section>
        )
      })()}

      {chartData.length > 0 && (
        <Section title="Evolución de precios por año">
          <div className="h-48 bg-gray-800/40 rounded-xl p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="año" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8 }}
                  formatter={(v, name) => [`$${v?.toLocaleString('es-UY', { maximumFractionDigits: 0 })}`, name]}
                />
                <Line type="monotone" dataKey="min" stroke="#22c55e" strokeWidth={1.5} dot={false} name="Mínimo" />
                <Line type="monotone" dataKey="avg" stroke="#f97316" strokeWidth={2} dot={false} name="Promedio" />
                <Line type="monotone" dataKey="max" stroke="#ec4899" strokeWidth={1.5} dot={false} name="Máximo" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 text-xs justify-center text-gray-400">
            <span className="flex items-center gap-1"><span style={{ color: '#22c55e' }}>—</span> Min</span>
            <span className="flex items-center gap-1"><span style={{ color: '#f97316' }}>—</span> Prom.</span>
            <span className="flex items-center gap-1"><span style={{ color: '#ec4899' }}>—</span> Max</span>
          </div>
        </Section>
      )}

      <Section title={`Historial de precios (${price_history?.length || 0})`}>
        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {price_history?.filter(h => h.amount != null).map((h, i) => {
            const qty = h.quantity || 1
            const total = h.amount * qty
            const unitPrice = h.amount
            return (
              <div key={i} className="py-2 border-b border-gray-800 flex flex-col gap-1 text-xs">
                {/* Supplier & Org */}
                <div className="flex justify-between items-start">
                  <div className="flex flex-col min-w-0">
                    <span className="text-gray-300 truncate font-medium">{h.supplier_name}</span>
                    <span className="text-[10px] text-gray-500 truncate">{h.org_name}</span>
                  </div>
                  <span className="text-[10px] text-gray-600 shrink-0 pl-2">{h.date}</span>
                </div>
                {/* Price breakdown */}
                <div className="grid grid-cols-3 gap-1 bg-gray-800/40 rounded-lg px-2 py-1.5">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-500 uppercase tracking-wide">Cant.</span>
                    <span className="text-gray-300 font-mono">{qty?.toLocaleString('es-UY')} <span className="text-gray-500 text-[9px]">{h.unit}</span></span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-500 uppercase tracking-wide">P. Unit.</span>
                    <span className="text-amber-400 font-mono font-semibold">
                      {unitPrice != null
                        ? `${h.currency} ${unitPrice.toLocaleString('es-UY', { maximumFractionDigits: 2 })}`
                        : `${h.currency} ${h.amount?.toLocaleString('es-UY', { maximumFractionDigits: 2 })}`
                      }
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-gray-500 uppercase tracking-wide">Total</span>
                    <span className="text-orange-300 font-mono font-bold">
                      {h.currency} {total?.toLocaleString('es-UY', { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
          {(!price_history || price_history.filter(h => h.amount != null).length === 0) && (
            <p className="text-gray-500 text-xs py-2">Sin precios registrados</p>
          )}
        </div>
      </Section>
    </>
  )
}

function SupplierPanel({ data }) {
  const { name, stats, by_year, top_items, top_orgs } = data
  const chartData = by_year?.map(r => ({ año: r.year, adj: r.adj, total: r.total })) || []
  return (
    <>
      <Section title="Estadísticas">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Adjudicaciones" value={stats?.total_adjudicaciones?.toLocaleString()} />
          <Stat label="Ítems distintos" value={stats?.distinct_items?.toLocaleString()} />
          <Stat label="Organismos" value={stats?.distinct_orgs} />
          <Stat label="Período" value={`${stats?.first_year}–${stats?.last_year}`} />
        </div>
      </Section>
      <Section title="Adjudicaciones por año">
        <div className="h-36 bg-gray-800/40 rounded-xl p-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="año" tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8 }} />
              <Line type="monotone" dataKey="adj" stroke="#ec4899" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>
      <Section title="Top ítems adjudicados">
        <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
          {top_items?.map((it, i) => (
            <div key={i} className="flex gap-2 items-start text-xs py-1 border-b border-gray-800">
              <span className="text-gray-500 w-5 shrink-0">{i + 1}.</span>
              <span className="text-gray-300 flex-1 truncate">{it.description}</span>
              <span className="text-pink-400 shrink-0">{it.cnt}×</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Organismos compradores">
        <div className="flex flex-col gap-1">
          {top_orgs?.map((o, i) => (
            <div key={i} className="flex gap-2 items-center text-xs">
              <span className="text-indigo-400">●</span>
              <span className="text-gray-300 flex-1 truncate">{o.name}</span>
              <span className="text-gray-500">{o.cnt}×</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function NodeDetails({ node: rawNode, onClose, onExpand }) {
  // Normalize: graphology stores our semantic type as `nodeType` to avoid
  // colliding with Sigma v3's renderer `type` attribute.
  const node = rawNode ? { ...rawNode, type: rawNode.nodeType || rawNode.type } : rawNode
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!node) { setDetail(null); return }
    setLoading(true)
    setDetail(null)
    const fetchers = {
      organismo: () => nodeAPI.organismo(node.org_id || node.id.replace('org:', '')),
      llamado: () => nodeAPI.llamado(node.ocid || node.id.replace('llamado:', '')),
      item: () => nodeAPI.item(node.item_id || node.id.replace('item:', '')),
      supplier: () => nodeAPI.supplier(node.supplier_id || node.id.replace('sup:', '')),
    }
    const fetcher = fetchers[node.type]
    if (fetcher) {
      fetcher()
        .then(r => setDetail(r.data))
        .catch(() => setDetail({ error: true }))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [node?.id])

  if (!node) return null

  const borderColor = TYPE_COLORS[node.type] || 'border-gray-600 text-gray-400'

  return (
    <div
      className="absolute right-0 top-0 h-full z-20 flex flex-col border-l border-border shadow-2xl animate-slide-right glass-panel"
      style={{ width: '390px' }}
    >
      {/* Header */}
      <div className={`flex items-start gap-3 px-4 py-4 border-b border-border border-l-4 ${borderColor}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full bg-accent tracking-widest uppercase ${borderColor}`}>
              {TYPE_LABELS[node.type] || node.type}
            </span>
          </div>
          <h2 className="text-sm font-bold text-foreground leading-tight line-clamp-3">
            {node.label}
          </h2>
          <p className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">{node.id}</p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-accent text-muted-foreground hover:text-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Expand button */}
      {node.type !== 'root' && (
        <div className="px-4 py-2 border-b border-border">
          <button
            onClick={() => onExpand(node)}
            className="w-full bg-primary text-primary-foreground text-xs font-bold px-3 py-2 rounded-xl transition-all hover:opacity-90 active:scale-95 flex items-center justify-center gap-2 shadow-md shadow-primary/20"
          >
            <span>⊕</span> Expandir en el grafo
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && detail?.error && (
          <div className="text-red-400 text-sm text-center py-8">Error cargando datos</div>
        )}

        {!loading && detail && (
          <>
            {node.type === 'organismo' && <OrgPanel data={detail} />}
            {node.type === 'llamado' && <LlamadoPanel data={detail} />}
            {node.type === 'item' && <ItemPanel data={detail} />}
            {node.type === 'supplier' && <SupplierPanel data={detail} />}
          </>
        )}
      </div>
    </div>
  )
}
