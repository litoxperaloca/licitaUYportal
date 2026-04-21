import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  ShieldCheck, FileText, ShoppingCart, Users, TrendingUp, Database, 
  Activity, Server, Command, Cpu
} from 'lucide-react'
import axios from 'axios'
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from 'recharts'

const STAT_META = {
  organismos:   { label: 'Organismos',    icon: ShieldCheck,   color: 'text-indigo-500',  bg: 'bg-indigo-500/10' },
  llamados:     { label: 'Llamados',      icon: FileText,      color: 'text-green-500',   bg: 'bg-green-500/10'  },
  items:        { label: 'Ítems únicos',  icon: ShoppingCart,  color: 'text-orange-500',  bg: 'bg-orange-500/10' },
  suppliers:    { label: 'Proveedores',   icon: Users,         color: 'text-pink-500',    bg: 'bg-pink-500/10'   },
  llamado_items:{ label: 'Vínculos',      icon: TrendingUp,    color: 'text-primary',     bg: 'bg-primary/10'    },
  adjudicaciones:{ label: 'Adjudicaciones', icon: Database,    color: 'text-amber-500',   bg: 'bg-amber-500/10'  },
}

// Datos de gráfico decorativo/simulado que aporta estética de operativa viva
const FAKE_CHART_DATA = Array.from({length: 15}).map((_, i) => ({
  time: `T-${15-i}h`,
  requests: Math.floor(Math.random() * 500) + 100,
  latency: Math.floor(Math.random() * 50) + 10
}))

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [logs, setLogs] = useState([])
  const [cpuUsage, setCpuUsage] = useState(12)

  const fetchStats = async () => {
    try {
      const { data } = await axios.get('/api/process/stats')
      setStats(data)
      
      // Simulate live logs and cpu changes
      const actions = ["Indexando", "Cacheando", "Validando", "Compilando", "Enrutando"]
      const docs = ["adjudicaciones", "llamado_items", "proveedores", "ocds_core"]
      const newLog = `> ${actions[Math.floor(Math.random() * actions.length)]} ${docs[Math.floor(Math.random() * docs.length)]}... OK [${Math.floor(Math.random() * 40)+2}ms]`
      
      setLogs(prev => [newLog, ...prev].slice(0, 5))
      setCpuUsage(Math.floor(Math.random() * 40) + 10) // simulated metric
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-up">
      <div className="flex flex-col mb-4">
        <h2 className="text-4xl font-black tracking-tighter">Panel Central</h2>
        <p className="text-muted-foreground text-sm font-medium mt-1">Ecosistema general de contrataciones y estado del motor inteligente.</p>
      </div>

      {/* KPIs Section */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Object.entries(STAT_META).map(([key, meta]) => (
          <div key={key} className="bg-card border border-border p-4 rounded-3xl shadow-sm flex flex-col hover:border-border/80 transition-colors">
            <div className={`w-10 h-10 rounded-2xl ${meta.bg} flex items-center justify-center mb-4`}>
              <meta.icon className={`w-5 h-5 ${meta.color}`} />
            </div>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">{meta.label}</span>
            <span className="text-2xl font-black text-foreground font-mono">
              {stats ? (stats[key] || 0).toLocaleString() : '---'}
            </span>
          </div>
        ))}
      </div>

      {/* Charts & Monitor Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-card border border-border p-6 rounded-3xl flex flex-col min-h-[300px]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">Tráfico OCDS (Simulado)</h3>
              <span className="text-xs text-muted-foreground">Volumen de transacciones analizadas</span>
            </div>
          </div>
          <div className="flex-1 min-h-[220px]">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={FAKE_CHART_DATA}>
                 <defs>
                   <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                     <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                   </linearGradient>
                 </defs>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                 <XAxis dataKey="time" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} />
                 <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} />
                 <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12 }} />
                 <Area type="monotone" dataKey="requests" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorReq)" />
               </AreaChart>
             </ResponsiveContainer>
          </div>
        </div>

        {/* Live Server / CPU Monitor */}
        <div className="bg-card border border-border p-6 rounded-3xl flex flex-col">
           <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center">
              <Server className="w-4 h-4 text-rose-500" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">Live Telemetry</h3>
              <span className="text-xs text-muted-foreground bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded font-black mt-1 inline-block">ONLINE</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-end gap-6 pb-2">
            <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5" /> CPU Load</span>
                  <span className="text-sm font-mono font-bold text-foreground">{cpuUsage}%</span>
                </div>
                <div className="w-full bg-accent/50 rounded-full h-2 overflow-hidden">
                  <motion.div 
                    animate={{ width: `${cpuUsage}%` }} 
                    transition={{ type: "spring", stiffness: 100 }}
                    className="h-full bg-rose-500" 
                  />
                </div>
            </div>

            <div className="bg-background/50 rounded-2xl border border-border/50 p-4 font-mono text-[10px] overflow-hidden flex flex-col gap-1.5 min-h-[100px]">
              {logs.length > 0 ? logs.map((log, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }} 
                  animate={{ opacity: 1, x: 0 }} 
                  key={i} 
                  className="text-emerald-400 opacity-90 truncate"
                >
                  {log}
                </motion.div>
              )) : (
                <span className="text-muted-foreground/50">Wating for connection...</span>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
