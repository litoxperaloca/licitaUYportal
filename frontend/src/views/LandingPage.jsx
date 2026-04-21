import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { 
  ArrowRight, 
  BarChart3, 
  Share2, 
  Zap, 
  ShieldCheck, 
  Database,
  Compass
} from 'lucide-react'

export default function LandingPage() {
  const features = [
    {
      title: 'Análisis de Grafos AI',
      desc: 'Visualiza conexiones complejas entre compradores, proveedores y contratos instantáneamente.',
      icon: Share2,
      color: 'text-indigo-500',
    },
    {
      title: 'Magic Search Hub',
      desc: 'Consulta datos de compras públicas usando lenguaje natural impulsado por Azure OpenAI.',
      icon: Zap,
      color: 'text-amber-500',
    },
    {
      title: 'KPIs en Tiempo Real',
      desc: 'Generación automática de indicadores clave y mapas de calor sobre el mercado público.',
      icon: BarChart3,
      color: 'text-emerald-500',
    },
    {
      title: 'Histórico Completo',
      desc: 'Accede a años de datos normalizados bajo el estándar OCDS con un solo click.',
      icon: Database,
      color: 'text-pink-500',
    }
  ]

  return (
    <div className="min-h-screen bg-background selection:bg-primary/30">
      {/* Navbar */}
      <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Compass className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-bold text-2xl tracking-tight">LicitaUY</span>
          </div>
          <div className="flex items-center gap-8">
            <nav className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Características</a>
              <a href="#about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Arquitectura</a>
            </nav>
            <Link 
              to="/login"
              className="px-6 py-2.5 rounded-full bg-foreground text-background font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Acceso Portal
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/20 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-8">
          <div className="flex flex-col items-center text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="px-4 py-1.5 rounded-full bg-accent border border-border text-xs font-bold tracking-widest uppercase mb-8"
            >
              Inteligencia de Datos Gubernamentales
            </motion.div>
            
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9] mb-8"
            >
              Explora el mercado <br />
              <span className="text-primary">público de Uruguay</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="max-w-2xl text-xl text-muted-foreground leading-relaxed mb-12"
            >
              LicitaUY transforma datos complejos de OCDS en visualizaciones directas, 
              análisis predictivos y reportes inteligentes mediante IA generativa.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex items-center gap-4"
            >
              <Link 
                to="/login" 
                className="px-8 py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-lg shadow-xl shadow-primary/30 hover:scale-105 transition-transform flex items-center gap-3"
              >
                Comenzar ahora <ArrowRight className="w-5 h-5" />
              </Link>
              <button className="px-8 py-4 rounded-2xl bg-card border border-border font-bold text-lg hover:bg-accent transition-colors">
                Ver Demo
              </button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 bg-card/30">
        <div className="max-w-7xl mx-auto px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                viewport={{ once: true }}
                className="p-8 rounded-3xl bg-card border border-border hover:border-primary/50 transition-all group"
              >
                <div className={`w-14 h-14 rounded-2xl bg-background border border-border flex items-center justify-center mb-6 group-hover:scale-110 transition-transform ${feature.color}`}>
                  <feature.icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-24 border-y border-border overflow-hidden relative">
         <div className="max-w-7xl mx-auto px-8 flex justify-between items-center flex-wrap gap-12">
            <div>
               <div className="text-5xl font-black tracking-tight mb-2">+600K</div>
               <div className="text-muted-foreground font-medium">Registros Indexados</div>
            </div>
            <div>
               <div className="text-5xl font-black tracking-tight mb-2">99.9%</div>
               <div className="text-muted-foreground font-medium">Uptime de Datos</div>
            </div>
            <div>
               <div className="text-5xl font-black tracking-tight mb-2">3ms</div>
               <div className="text-muted-foreground font-medium">Latencia de Búsqueda</div>
            </div>
            <div>
               <div className="text-5xl font-black tracking-tight mb-2">Full</div>
               <div className="text-muted-foreground font-medium">Estándar OCDS</div>
            </div>
         </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border mt-auto">
        <div className="max-w-7xl mx-auto px-8 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3 opacity-50">
            <Compass className="w-5 h-5" />
            <span className="font-bold">LicitaUY &copy; 2026</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground">Términos</a>
            <a href="#" className="hover:text-foreground">Privacidad</a>
            <a href="#" className="hover:text-foreground">Ucayali Lab</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
