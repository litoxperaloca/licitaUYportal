import { useEffect, useRef, useState, useCallback } from 'react'
import Graph from 'graphology'
import { Sigma } from 'sigma'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import toast from 'react-hot-toast'

import { graphAPI, nodeAPI, searchAPI } from '../api'
import LeftPanel from '../components/LeftPanel'
import NodeDetails from '../components/NodeDetails'
import GlobalSearch from '../components/GlobalSearch'
import GraphTopBar from '../components/GraphTopBar'

const NODE_SIZES = { root: 22, organismo: 13, llamado: 6, item: 7, supplier: 9 }

export default function GraphExplorer() {
  const containerRef = useRef(null)
  const graphRef = useRef(null)
  const sigmaRef = useRef(null)
  const expandedRef = useRef(new Set())
  const layoutTimerRef = useRef(null)

  const [leftOpen, setLeftOpen] = useState(true)
  const [selectedNode, setSelectedNode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [nodeCount, setNodeCount] = useState(0)
  const [edgeCount, setEdgeCount] = useState(0)
  const [currentFilters, setCurrentFilters] = useState({ org_id: '', year: '' })

  // ── init graph + sigma ───────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const g = new Graph({ multi: false, allowSelfLoops: false })
    graphRef.current = g

    const sigma = new Sigma(g, containerRef.current, {
      renderEdgeLabels: false,
      labelRenderedSizeThreshold: 10,
      labelFont: 'Inter, ui-sans-serif, sans-serif',
      labelSize: 11,
      labelWeight: '600',
      labelColor: { color: '#f3f4f6' }, // White/Light gray for contrast
      defaultNodeColor: '#6366f1',
      defaultEdgeColor: '#1e293b',
      // Better hover/selection contrast
      labelBackgroundColor: '#111827',
      hoverRenderer: (node, data, context, settings) => {
        // Simple custom renderer logic or just use sigma's default but with fixed colors
        // If we don't provide a function, it uses default. 
        // We ensure labelBackgroundColor is set above.
      },
      edgeReducer: (edge, data) => ({ ...data, color: '#2d3f54', size: 0.8 }),
      nodeReducer: (node, data) => {
        const res = { ...data }
        if (data.highlighted) { 
          res.size = (data.size || 8) * 1.8; 
          res.zIndex = 99;
          res.color = '#fff'; // Highlighted node becomes white
        }
        return res
      },
    })
    sigmaRef.current = sigma

    sigma.on('clickNode', ({ node }) => {
      const attrs = g.getNodeAttributes(node)
      setSelectedNode({ id: node, ...attrs })
      g.forEachNode((n) => g.setNodeAttribute(n, 'highlighted', n === node))
      sigma.refresh()
    })
    sigma.on('clickStage', () => {
      setSelectedNode(null)
      g.forEachNode((n) => g.setNodeAttribute(n, 'highlighted', false))
      sigma.refresh()
    })
    sigma.on('enterNode', () => { if (containerRef.current) containerRef.current.style.cursor = 'pointer' })
    sigma.on('leaveNode', () => { if (containerRef.current) containerRef.current.style.cursor = 'grab' })

    loadRoot(g, sigma)

    return () => { sigma.kill(); sigmaRef.current = null }
  }, [])

  // ── helpers ──────────────────────────────────────────────────────────────
  const mergeData = useCallback(({ nodes, edges }, g, sigma) => {
    const gr = g || graphRef.current
    const sg = sigma || sigmaRef.current
    if (!gr) return

    nodes.forEach(n => {
      if (!gr.hasNode(n.id)) {
        gr.addNode(n.id, {
          label: n.label,
          size: NODE_SIZES[n.type] ?? 7,
          color: n.color,
          nodeType: n.type,
          x: Math.random() * 2000 - 1000,
          y: Math.random() * 2000 - 1000,
          ...n.data,
        })
      }
    })
    edges.forEach(e => {
      const eid = `${e.source}__${e.target}`
      if (!gr.hasEdge(eid) && gr.hasNode(e.source) && gr.hasNode(e.target)) {
        gr.addEdgeWithKey(eid, e.source, e.target, { size: 0.8, color: '#2d3f54' })
      }
    })
    setNodeCount(gr.order)
    setEdgeCount(gr.size)
    scheduleLayout(gr, sg)
  }, [])

  const scheduleLayout = useCallback((g, sigma, iters = 80) => {
    clearTimeout(layoutTimerRef.current)
    layoutTimerRef.current = setTimeout(() => {
      const gr = g || graphRef.current
      const sg = sigma || sigmaRef.current
      if (!gr || gr.order === 0 || !sg) return
      forceAtlas2.assign(gr, {
        iterations: iters,
        settings: {
          gravity: 1.2, scalingRatio: 3,
          barnesHutOptimize: gr.order > 800,
          strongGravityMode: false, slowDown: 5,
        },
      })
      sg.refresh()
    }, 80)
  }, [])

  // Apply filters to graph
  useEffect(() => {
    const g = graphRef.current
    if (!g) return
    const { org_id, year } = currentFilters
    
    g.forEachNode((node, attrs) => {
      let isHidden = false
      
      // Filter by Org
      if (org_id) {
        if (attrs.nodeType === 'organismo' && (attrs.org_id !== org_id && node !== `org:${org_id}`)) isHidden = true
        if (attrs.nodeType === 'llamado' && attrs.buyer_id !== org_id) isHidden = true
        // items and suppliers are harder to filter by org strictly without data overhead, 
        // but we can hide them if we want a "clean" view
      }
      
      // Filter by Year
      if (year && attrs.nodeType === 'llamado' && String(attrs.year) !== String(year)) {
        isHidden = true
      }

      g.setNodeAttribute(node, 'hidden', isHidden)
    })
    
    sigmaRef.current?.refresh()
  }, [currentFilters])

  const loadRoot = useCallback(async (g, sigma) => {
    setLoading(true)
    try {
      const { data } = await graphAPI.root()
      mergeData(data, g, sigma)
      expandedRef.current.add('ROOT')
    } catch (err) {
      console.error('Root load failed', err)
    } finally {
      setLoading(false)
    }
  }, [mergeData])

  const expandOrganismo = useCallback(async (orgId) => {
    const key = `org:${orgId}`
    if (expandedRef.current.has(key)) return
    setLoading(true)
    try {
      const { data } = await graphAPI.organismo(orgId, { limit: 200 })
      mergeData(data)
      expandedRef.current.add(key)
      if (data.nodes?.length) toast.success(`${data.nodes.length} llamados cargados`)
    } catch { toast.error('Error expandiendo organismo') }
    finally { setLoading(false) }
  }, [mergeData])

  const expandSupplier = useCallback(async (suppId) => {
    const key = `sup:${suppId}`
    if (expandedRef.current.has(key)) return
    setLoading(true)
    try {
      const { data } = await graphAPI.supplier(suppId)
      mergeData(data)
      expandedRef.current.add(key)
      if (data.nodes?.length) toast.success(`${data.nodes.length} ítems del proveedor cargados`)
    } catch { toast.error('Error expandiendo proveedor') }
    finally { setLoading(false) }
  }, [mergeData])

  const expandLlamado = useCallback(async (ocid) => {
    const key = `llamado:${ocid}`
    if (expandedRef.current.has(key)) return
    setLoading(true)
    try {
      const { data } = await graphAPI.llamado(ocid)
      mergeData(data)
      expandedRef.current.add(key)
      if (data.nodes?.length) toast.success(`${data.nodes.length} ítems de la licitación cargados`)
      else toast('Sin ítems para esta licitación', { icon: 'ℹ️' })
    } catch { toast.error('Error expandiendo licitación') }
    finally { setLoading(false) }
  }, [mergeData])

  const expandItem = useCallback(async (itemId) => {
    const key = `item:${itemId}`
    if (expandedRef.current.has(key)) return
    setLoading(true)
    try {
      const { data } = await graphAPI.item(itemId)
      mergeData(data)
      expandedRef.current.add(key)
      if (data.nodes?.length) toast.success(`${data.nodes.length} proveedores del ítem cargados`)
      else toast('Sin proveedores registrados para este ítem', { icon: 'ℹ️' })
    } catch { toast.error('Error expandiendo ítem') }
    finally { setLoading(false) }
  }, [mergeData])

  const handleExpand = useCallback((node) => {
    if (!node) return
    const ntype = node.nodeType || node.type
    const id = node.id
    switch (ntype) {
      case 'organismo': expandOrganismo(node.org_id || id.replace('org:', '')); break
      case 'supplier':  expandSupplier(node.supplier_id || id.replace('sup:', '')); break
      case 'llamado':   expandLlamado(node.ocid || id.replace('llamado:', '')); break
      case 'item':      expandItem(node.item_id || id.replace('item:', '')); break
    }
  }, [expandOrganismo, expandSupplier, expandLlamado, expandItem])

  const focusNode = useCallback((nodeId) => {
    const sigma = sigmaRef.current
    const g = graphRef.current
    if (!sigma || !g || !g.hasNode(nodeId)) return
    const { x, y } = g.getNodeAttributes(nodeId)
    const pos = sigma.graphToViewport({ x, y })
    sigma.getCamera().animate(
      { x: pos.x / sigma.getContainer().clientWidth, y: pos.y / sigma.getContainer().clientHeight, ratio: 0.3 },
      { duration: 600 }
    )
  }, [])

  const handleSearchResult = useCallback(async (result) => {
    const { type, id } = result
    let nodeId = id
    if (type === 'organismo') { nodeId = `org:${id}`; await expandOrganismo(id) }
    else if (type === 'supplier') { nodeId = `sup:${id}`; await expandSupplier(id) }
    else if (type === 'llamado') { nodeId = `llamado:${id}` }
    else if (type === 'item') { nodeId = `item:${id}` }
    setTimeout(() => {
      const g = graphRef.current
      if (g?.hasNode(nodeId)) {
        const attrs = g.getNodeAttributes(nodeId)
        setSelectedNode({ id: nodeId, ...attrs })
        g.forEachNode(n => g.setNodeAttribute(n, 'highlighted', n === nodeId))
        sigmaRef.current?.refresh()
        focusNode(nodeId)
      }
    }, 300)
  }, [expandOrganismo, expandSupplier, focusNode])

  return (
    // Root: full area, no pointer-events override here
    <div className="relative w-full h-full overflow-hidden" style={{ background: 'hsl(var(--background))' }}>

      {/* ── LAYER 0: Sigma canvas (receives all unhandled pointer events) ── */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ cursor: 'grab', zIndex: 0 }}
      />

      {/* ── LAYER 1: Top bar (always on top, full width) ── */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}>
          <GraphTopBar
            nodeCount={nodeCount}
            edgeCount={edgeCount}
            loading={loading}
            onResetLayout={() => scheduleLayout(graphRef.current, sigmaRef.current, 200)}
            onExpandAll={() => {
              const g = graphRef.current
              if (!g) return
              let count = 0
              g.forEachNode((n, attrs) => { 
                if (count < 50 && attrs.nodeType === 'organismo') {
                  expandOrganismo(attrs.org_id || n.replace('org:', ''))
                  count++
                }
              })
              if (count > 0) toast.success(`Expandiendo ${count} organismos principais...`)
            }}
          />
        </div>
      </div>

      {/* ── LAYER 2: Global Search (below topbar, centered) ── */}
      <div style={{ position: 'absolute', top: 64, left: 48, right: 48, zIndex: 25, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}>
          <GlobalSearch onResultClick={handleSearchResult} />
        </div>
      </div>

      {/* ── LAYER 3: Left panel (tall panel, width-constrained) ── */}
      <div style={{ position: 'absolute', top: 56, left: 0, bottom: 0, zIndex: 20, pointerEvents: 'none', width: leftOpen ? 388 : 40 }}>
        <div style={{ pointerEvents: 'auto', height: '100%' }}>
          <LeftPanel
            open={leftOpen}
            onToggle={() => setLeftOpen(v => !v)}
            onFiltersChange={setCurrentFilters}
            onLlamadoClick={async (item) => {
              const orgId = item.buyer_id || ''
              if (orgId) await expandOrganismo(orgId)
              setTimeout(() => {
                focusNode(`llamado:${item.ocid}`)
                // Selecting it too
                const g = graphRef.current
                if (g?.hasNode(`llamado:${item.ocid}`)) {
                   const attrs = g.getNodeAttributes(`llamado:${item.ocid}`)
                   setSelectedNode({ id: `llamado:${item.ocid}`, ...attrs })
                   g.forEachNode(n => g.setNodeAttribute(n, 'highlighted', n === `llamado:${item.ocid}`))
                   sigmaRef.current?.refresh()
                }
              }, 400)
            }}
          />
        </div>
      </div>

      {/* ── LAYER 4: Node detail panel (right side, width-constrained) ── */}
      {selectedNode && (
        <div style={{ position: 'absolute', top: 56, right: 0, bottom: 0, zIndex: 20, width: 390, pointerEvents: 'auto' }}>
          <NodeDetails
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onExpand={handleExpand}
          />
        </div>
      )}
    </div>
  )
}
