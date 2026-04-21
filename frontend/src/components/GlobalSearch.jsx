import { useState, useEffect, useRef, useCallback } from 'react'
import { searchAPI } from '../api'

const TYPE_ICONS = {
  item:      { icon: '📦', color: 'text-orange-400', bg: 'bg-orange-900/30' },
  supplier:  { icon: '🏢', color: 'text-pink-400',   bg: 'bg-pink-900/30' },
  organismo: { icon: '🏛️', color: 'text-indigo-400', bg: 'bg-indigo-900/30' },
  llamado:   { icon: '📄', color: 'text-green-400',  bg: 'bg-green-900/30' },
}

export default function GlobalSearch({ onResultClick }) {
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  // Open with Ctrl+K
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const doSearch = useCallback((q) => {
    if (!q || q.length < 2) { setResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await searchAPI.search(q)
        setResults(data.results || [])
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [])

  const handleChange = (e) => {
    setQuery(e.target.value)
    doSearch(e.target.value)
  }

  const handleSelect = (result) => {
    onResultClick(result)
    setOpen(false)
    setQuery('')
    setResults([])
  }

  // Group results by type
  const grouped = results.reduce((acc, r) => {
    if (!acc[r.type]) acc[r.type] = []
    acc[r.type].push(r)
    return acc
  }, {})

  return (
    <>
      {/* Floating search button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95"
        title="Buscar (Ctrl+K)"
      >
        <span className="text-lg">🔍</span>
        <span className="text-sm font-medium hidden sm:block">Buscar</span>
        <kbd className="hidden sm:block text-xs bg-indigo-700 px-1.5 py-0.5 rounded opacity-70">Ctrl+K</kbd>
      </button>

      {/* Search overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-xl bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
              <span className="text-gray-400 text-lg">{loading ? '⏳' : '🔍'}</span>
              <input
                ref={inputRef}
                type="text"
                placeholder="Buscar ítems, proveedores, organismos, llamados..."
                value={query}
                onChange={handleChange}
                className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none"
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus() }}
                  className="text-gray-500 hover:text-white text-sm"
                >
                  ✕
                </button>
              )}
              <kbd
                onClick={() => setOpen(false)}
                className="text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded cursor-pointer hover:text-white"
              >
                Esc
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-96 overflow-y-auto">
              {results.length === 0 && query.length >= 2 && !loading && (
                <div className="flex flex-col items-center py-10 text-gray-500 gap-2">
                  <span className="text-3xl">🔎</span>
                  <p className="text-sm">Sin resultados para "{query}"</p>
                </div>
              )}

              {query.length < 2 && (
                <div className="flex flex-col items-center py-8 text-gray-500 gap-1">
                  <p className="text-sm">Escribe al menos 2 caracteres</p>
                  <p className="text-xs text-gray-600">Busca por nombre de ítem, código, proveedor u organismo</p>
                </div>
              )}

              {Object.entries(grouped).map(([type, items]) => {
                const meta = TYPE_ICONS[type] || { icon: '●', color: 'text-gray-400', bg: 'bg-gray-800' }
                return (
                  <div key={type}>
                    <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500 bg-gray-900/80 sticky top-0">
                      {meta.icon} {type === 'item' ? 'Ítems' : type === 'supplier' ? 'Proveedores' : type === 'organismo' ? 'Organismos' : 'Llamados'}
                    </div>
                    {items.map((r, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelect(r)}
                        className={`w-full flex items-start gap-3 px-4 py-2.5 hover:bg-gray-800 transition-colors text-left group`}
                      >
                        <span className={`shrink-0 text-sm mt-0.5 ${meta.color}`}>{meta.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white leading-tight line-clamp-1 group-hover:text-indigo-300 transition-colors">
                            {r.label}
                          </p>
                          <p className="text-xs text-gray-500 font-mono truncate mt-0.5">{r.id}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
