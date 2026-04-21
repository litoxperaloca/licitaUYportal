import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Sparkles, TrendingUp, PieChart, BarChart, ChevronDown, ChevronUp, Database } from 'lucide-react'
import axios from 'axios'
import { 
  BarChart as ReBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell
} from 'recharts'
import toast from 'react-hot-toast'

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6']

export default function InsightHub() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [showSql, setShowSql] = useState(false)

  const suggestions = [
    '¿Cuáles son los 5 organismos con mayor gasto total estimado en la base de datos?',
    'Muestra la evolución de adjudicaciones por año',
    '¿Cuáles son los proveedores que más ganaron licitaciones?',
    'Promedio de precios para notebooks por organismo'
  ]

  const handleAnalize = async (overrideQuery) => {
    const q = overrideQuery || query
    if (!q.trim()) return
    setQuery(q)
    setLoading(true)
    setResult(null)
    setShowSql(false)
    try {
      const { data } = await axios.post('/api/ai/query', { query: q })
      if (data.error) toast.error('Error en la consulta: ' + data.error)
      setResult(data)
    } catch (e) {
      toast.error('Falló la conexión con la IA.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-up">
      {/* Header & Search */}
      <div className="flex flex-col items-center text-center space-y-4 pt-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary to-primary/40 flex items-center justify-center shadow-2xl shadow-primary/20 mb-2">
          <Sparkles className="w-8 h-8 text-primary-foreground" />
        </div>
        <h2 className="text-4xl font-black tracking-tighter">Insight Hub AI</h2>
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
          Consulta la base OCDS en lenguaje natural. LicitaUY Intelligence traducirá, buscará y analizará los datos por ti.
        </p>
      </div>

      <div className="max-w-4xl mx-auto relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 to-secondary/50 rounded-[32px] blur opacity-25 transition duration-1000 group-hover:opacity-60" />
        <div className="relative flex items-center bg-card border border-border rounded-[28px] p-2 shadow-2xl">
          <Search className="w-6 h-6 ml-6 text-muted-foreground" />
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalize()}
            placeholder="Ej: Muestra el gasto total en combustible por año..." 
            className="flex-1 bg-transparent border-none outline-none px-6 py-4 text-base font-medium"
            disabled={loading}
          />
          <button 
            onClick={() => handleAnalize()}
            disabled={loading}
            className="bg-primary text-primary-foreground px-8 py-4 rounded-[22px] font-bold text-sm shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? 'Procesando...' : 'Analizar Datos'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map(s => (
          <button 
            key={s} onClick={() => handleAnalize(s)} disabled={loading}
            className="px-4 py-2 rounded-full border border-border bg-card/50 hover:bg-accent text-xs font-bold text-muted-foreground hover:text-foreground transition-all truncate max-w-xs"
          >
            {s}
          </button>
        ))}
      </div>

      <hr className="border-border/50" />

      {/* Loading State */}
      {loading && (
        <div className="py-20 flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-500">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="font-bold text-primary animate-pulse tracking-widest text-sm uppercase">Generando SQL y analizando...</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-20">
          
          {/* Analysis & KPIs */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 p-8 rounded-3xl bg-card border border-border shadow-sm">
              <h3 className="font-black text-xl mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" /> Resumen Ejecutivo
              </h3>
              <p className="text-muted-foreground leading-relaxed text-sm whitespace-pre-wrap">{result.analysis}</p>
            </div>
            
            <div className="flex flex-col gap-4">
              {result.kpis?.map((kpi, i) => (
                <div key={i} className="p-6 rounded-3xl bg-card border border-border shadow-sm flex flex-col justify-center flex-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{kpi.label}</span>
                  <span className="text-3xl font-black text-primary font-mono">{kpi.value}</span>
                </div>
              ))}
              {(!result.kpis || result.kpis.length === 0) && (
                <div className="p-6 rounded-3xl bg-card border border-border shadow-sm flex items-center justify-center flex-1 text-muted-foreground text-sm font-medium">
                  Sin KPIs relevantes
                </div>
              )}
            </div>
          </div>

          {/* Charts */}
          {result.chart_suggestions?.length > 0 && (
             <div className="p-8 rounded-3xl bg-card border border-border shadow-sm">
               <h3 className="font-black text-xl mb-6">{result.chart_suggestions[0].title}</h3>
               <div className="h-80">
                 <ResponsiveContainer width="100%" height="100%">
                   {result.chart_suggestions[0].type === 'pie' ? (
                     <RePieChart>
                       <Pie data={result.chart_suggestions[0].data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120} label>
                         {result.chart_suggestions[0].data.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                         ))}
                       </Pie>
                       <RechartsTooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12 }} />
                     </RePieChart>
                   ) : (
                     <ReBarChart data={result.chart_suggestions[0].data}>
                       <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                       <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                       <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickFormatter={v => v.toLocaleString()} />
                       <RechartsTooltip cursor={{fill: 'hsl(var(--accent))'}} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12 }} />
                       <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                     </ReBarChart>
                   )}
                 </ResponsiveContainer>
               </div>
             </div>
          )}

          {/* Data & SQL */}
          <div className="rounded-3xl border border-border bg-card overflow-hidden">
             <div 
               className="p-5 flex items-center justify-between cursor-pointer hover:bg-accent/50 transition-colors"
               onClick={() => setShowSql(!showSql)}
             >
               <div className="flex items-center gap-3">
                 <Database className="w-5 h-5 text-muted-foreground" />
                 <h4 className="font-bold">Datos Crudos y Consulta SQL</h4>
               </div>
               {showSql ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
             </div>
             
             <AnimatePresence>
               {showSql && (
                 <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="border-t border-border overflow-hidden">
                   <div className="p-5 bg-accent/30 font-mono text-xs text-muted-foreground break-all whitespace-pre-wrap border-b border-border">
                     {result.sql_query}
                   </div>
                   <div className="overflow-x-auto max-h-96">
                     <table className="w-full text-xs">
                       <thead className="bg-card sticky top-0 border-b border-border">
                         <tr>
                           {result.data && result.data.length > 0 && Object.keys(result.data[0]).map(k => (
                             <th key={k} className="text-left py-3 px-4 font-black uppercase tracking-widest text-muted-foreground">{k}</th>
                           ))}
                         </tr>
                       </thead>
                       <tbody>
                         {result.data?.map((row, i) => (
                           <tr key={i} className="border-b border-border/50 hover:bg-accent/20">
                             {Object.values(row).map((v, idx) => (
                               <td key={idx} className="py-2.5 px-4 font-mono">{String(v)}</td>
                             ))}
                           </tr>
                         ))}
                       </tbody>
                     </table>
                     {(!result.data || result.data.length === 0) && (
                       <div className="p-8 text-center text-muted-foreground">Sin resultados en la tabla.</div>
                     )}
                   </div>
                 </motion.div>
               )}
             </AnimatePresence>
          </div>
          
        </motion.div>
      )}

      {/* Placeholder Features */}
      {!result && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-20">
          <div className="p-8 rounded-3xl bg-card border border-border space-y-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-lg">Análisis de Tendencias</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">Pide a la IA que correlacione gastos a lo largo del tiempo o evalúe patrones cíclicos.</p>
          </div>
          <div className="p-8 rounded-3xl bg-card border border-border space-y-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
              <PieChart className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-lg">Distribución de Mercado</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">Genera gráficos automáticos para descubrir quién concentra los contratos del Estado.</p>
          </div>
          <div className="p-8 rounded-3xl bg-card border border-border space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <Database className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-lg">Text-to-SQL Nativo</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">Tu pregunta se traduce instantáneamente en consultas SQL, manteniendo control total y auditoría.</p>
          </div>
        </div>
      )}
    </div>
  )
}
