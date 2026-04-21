export default function TopBar({ nodeCount, edgeCount, loading, onProcess, onResetLayout, onExpandAll }) {
  return (
    <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 py-2.5 bg-gray-950/80 backdrop-blur border-b border-gray-800 pointer-events-auto">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <div className="hidden sm:block">
          <p className="text-xs font-bold text-white leading-none">LicitaUy</p>
          <p className="text-[9px] text-gray-500 leading-none">Historial de adjudicaciones</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px]">
        {[
          { label: 'Estado', color: '#f59e0b' },
          { label: 'Organismo', color: '#6366f1' },
          { label: 'Llamado', color: '#22c55e' },
          { label: 'Ítem', color: '#f97316' },
          { label: 'Proveedor', color: '#ec4899' },
        ].map(({ label, color }) => (
          <div key={label} className="hidden md:flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-gray-400">{label}</span>
          </div>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Stats */}
      <div className="flex items-center gap-3 text-[10px] text-gray-400 mr-2">
        {loading && (
          <div className="flex items-center gap-1.5 text-indigo-400">
            <div className="w-3 h-3 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span>Cargando...</span>
          </div>
        )}
        <span className="hidden sm:block">
          <span className="text-white font-mono">{nodeCount.toLocaleString()}</span> nodos
        </span>
        <span className="hidden sm:block">
          <span className="text-white font-mono">{edgeCount.toLocaleString()}</span> aristas
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onResetLayout}
          className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2.5 py-1.5 rounded-lg transition-colors"
          title="Reorganizar grafo"
        >
          ↺ Layout
        </button>
        <button
          onClick={onExpandAll}
          className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2.5 py-1.5 rounded-lg transition-colors pointer-events-auto"
          title="Expandir organismos"
        >
          ⊕ Organismos
        </button>
        <button
          onClick={onProcess}
          className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 pointer-events-auto"
        >
          ⚙️ <span className="hidden sm:inline">Datos</span>
        </button>
      </div>
    </div>
  )
}
