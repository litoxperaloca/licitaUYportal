export default function GraphTopBar({ nodeCount, edgeCount, loading, onResetLayout, onExpandAll }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10"
      style={{ background: 'hsl(var(--background) / 0.85)', backdropFilter: 'blur(16px)' }}>
      {/* Logo */}
      <div className="hidden sm:block mr-2">
        <p className="text-xs font-black text-foreground leading-none tracking-tight">LicitaUY</p>
        <p className="text-[9px] text-muted-foreground leading-none mt-0.5">Historial OCDS</p>
      </div>

      {/* Node type legend */}
      <div className="flex items-center gap-3 text-[10px]">
        {[
          { label: 'Estado',    color: '#f59e0b' },
          { label: 'Organismo', color: '#6366f1' },
          { label: 'Llamado',   color: '#22c55e' },
          { label: 'Ítem',      color: '#f97316' },
          { label: 'Proveedor', color: '#ec4899' },
        ].map(({ label, color }) => (
          <div key={label} className="hidden lg:flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      <div className="flex-1" />

      {/* Stats */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mr-2">
        {loading && (
          <div className="flex items-center gap-1.5 text-primary">
            <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
            <span>Cargando...</span>
          </div>
        )}
        <span className="hidden sm:block font-mono">
          <span className="text-foreground font-bold">{nodeCount.toLocaleString()}</span> nodos
        </span>
        <span className="hidden sm:block font-mono">
          <span className="text-foreground font-bold">{edgeCount.toLocaleString()}</span> aristas
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onResetLayout}
          className="text-xs px-2.5 py-1.5 rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
          title="Reorganizar grafo"
        >
          ↺ Layout
        </button>
        <button
          onClick={onExpandAll}
          className="text-xs px-2.5 py-1.5 rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
          title="Expandir los 50 organismos con más actividad"
        >
          ⊕ Top 50
        </button>
      </div>
    </div>
  )
}
