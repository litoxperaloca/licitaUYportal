import { useState } from 'react'
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom'
import { 
  LayoutDashboard, Share2, Database, ShieldCheck, LogOut, 
  Menu, Sparkles, Compass, Sun, Moon, Palette, HardDrive
} from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { motion, AnimatePresence } from 'framer-motion'

const THEME_ICONS = { light: Sun, dark: Moon, midnight: Sparkles, ocean: Compass }
const THEME_LABELS = { light: 'Claro', dark: 'Oscuro', midnight: 'Midnight', ocean: 'Ocean' }

export default function MainLayout() {
  const [isSidebarOpen, setSidebarOpen] = useState(true)
  const location = useLocation()
  const navigate = useNavigate()
  const { theme, cycleTheme, THEMES } = useTheme()

  const navItems = [
    { name: 'Dashboard',       path: '/dashboard', icon: LayoutDashboard },
    { name: 'Análisis de Grafo', path: '/graph',   icon: Share2 },
    { name: 'Insight Hub AI',  path: '/insights',  icon: Sparkles },
    { name: 'Historial',       path: '/history',   icon: Database },
    { name: 'OCDS DATA',       path: '/admin',     icon: HardDrive },
  ]

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated')
    localStorage.removeItem('auth_token')
    navigate('/', { replace: true })
  }

  const ThemeIcon = THEME_ICONS[theme] || Palette
  const nextTheme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <motion.aside
        initial={false}
        animate={{ width: isSidebarOpen ? 256 : 72 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-50 flex flex-col h-full border-r border-border overflow-hidden"
        style={{ background: 'hsl(var(--card))', flexShrink: 0 }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 h-16 px-4 border-b border-border">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 shrink-0">
            <Compass className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <AnimatePresence mode="wait">
            {isSidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                <span className="font-black text-lg tracking-tight">LicitaUY</span>
                <span className="block text-[9px] text-muted-foreground font-medium tracking-widest uppercase">Contratos Públicos</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                title={!isSidebarOpen ? item.name : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <item.icon className={`w-5 h-5 shrink-0 ${isActive ? '' : 'group-hover:scale-110 transition-transform'}`} />
                <AnimatePresence mode="wait">
                  {isSidebarOpen && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                      className="font-medium text-sm whitespace-nowrap"
                    >
                      {item.name}
                    </motion.span>
                  )}
                </AnimatePresence>
                {isActive && (
                  <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-primary-foreground/60" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Bottom actions */}
        <div className="px-2 pb-3 border-t border-border pt-2 space-y-0.5">
          <button
            onClick={cycleTheme}
            title={`Cambiar a tema ${THEME_LABELS[nextTheme]}`}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
          >
            <ThemeIcon className="w-5 h-5 shrink-0" />
            <AnimatePresence mode="wait">
              {isSidebarOpen && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-medium">
                  {THEME_LABELS[theme]}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <AnimatePresence mode="wait">
              {isSidebarOpen && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-medium">
                  Cerrar Sesión
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.aside>

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col relative overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-card/60 backdrop-blur-sm z-40 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-xl hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-sm font-bold capitalize tracking-tight">
                {navItems.find(i => i.path === location.pathname)?.name || 'LicitaUY'}
              </h1>
              <p className="text-[10px] text-muted-foreground">
                {new Date().toLocaleDateString('es-UY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-primary/40 flex items-center justify-center text-xs font-black text-primary-foreground shadow-inner shadow-primary/20">
              AD
            </div>
          </div>
        </header>

        {/* View container */}
        <div className="flex-1 overflow-auto relative">
          <div className="page-enter h-full">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}
