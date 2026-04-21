import { useRef, useCallback, useState } from 'react'
import Graph from 'graphology'
import { circular } from 'graphology-layout'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import { graphAPI } from '../api'

const NODE_SIZES = { root: 24, organismo: 12, llamado: 7, item: 8, supplier: 9 }

export function useGraph() {
  const graphRef  = useRef(null)
  const sigmaRef  = useRef(null)
  const [loading, setLoading]         = useState(false)
  const [expandedNodes, setExpanded]  = useState(new Set())
  const [nodeCount, setNodeCount]     = useState(0)
  const [edgeCount, setEdgeCount]     = useState(0)

  // ── init graph ────────────────────────────────────────────────────────────
  const initGraph = useCallback(() => {
    if (graphRef.current) return graphRef.current
    graphRef.current = new Graph({ multi: false, allowSelfLoops: false })
    return graphRef.current
  }, [])

  // ── merge nodes + edges without duplicates ────────────────────────────────
  const mergeData = useCallback(({ nodes, edges }) => {
    const g = graphRef.current
    if (!g) return

    nodes.forEach(n => {
      if (!g.hasNode(n.id)) {
        // Random position near parent if available
        g.addNode(n.id, {
          label: n.label,
          size:  NODE_SIZES[n.type] || 7,
          color: n.color,
          type:  n.type,
          x:     Math.random() * 1000 - 500,
          y:     Math.random() * 1000 - 500,
          ...n.data,
        })
      }
    })
    edges.forEach(e => {
      const eid = `${e.source}__${e.target}`
      if (!g.hasEdge(eid) && g.hasNode(e.source) && g.hasNode(e.target)) {
        g.addEdgeWithKey(eid, e.source, e.target, {
          size: 0.5, color: '#374151',
        })
      }
    })
    setNodeCount(g.order)
    setEdgeCount(g.size)
  }, [])

  // ── layout pass ───────────────────────────────────────────────────────────
  const runLayout = useCallback((iterations = 100) => {
    const g = graphRef.current
    if (!g || g.order === 0) return
    // Gentle ForceAtlas2 pass
    forceAtlas2.assign(g, {
      iterations,
      settings: {
        gravity: 1,
        scalingRatio: 2,
        strongGravityMode: false,
        barnesHutOptimize: g.order > 1000,
      },
    })
    sigmaRef.current?.refresh()
  }, [])

  // ── expand root → organismos ──────────────────────────────────────────────
  const expandRoot = useCallback(async () => {
    if (expandedNodes.has('ROOT')) return
    setLoading(true)
    try {
      const g = initGraph()
      const { data } = await graphAPI.root()
      mergeData(data)
      setExpanded(prev => new Set([...prev, 'ROOT']))
      setTimeout(() => runLayout(80), 50)
    } finally {
      setLoading(false)
    }
  }, [expandedNodes, initGraph, mergeData, runLayout])

  // ── expand organismo → llamados ───────────────────────────────────────────
  const expandOrganismo = useCallback(async (orgId, params = {}) => {
    const key = `org:${orgId}`
    if (expandedNodes.has(key)) return
    setLoading(true)
    try {
      const { data } = await graphAPI.organismo(orgId, params)
      mergeData(data)
      setExpanded(prev => new Set([...prev, key]))
      setTimeout(() => runLayout(60), 50)
      return data.meta
    } finally {
      setLoading(false)
    }
  }, [expandedNodes, mergeData, runLayout])

  // ── expand llamado → items ────────────────────────────────────────────────
  const expandLlamado = useCallback(async (ocid) => {
    const key = `llamado:${ocid}`
    if (expandedNodes.has(key)) return
    setLoading(true)
    try {
      const { data } = await graphAPI.llamado(ocid)
      mergeData(data)
      setExpanded(prev => new Set([...prev, key]))
      setTimeout(() => runLayout(40), 50)
    } finally {
      setLoading(false)
    }
  }, [expandedNodes, mergeData, runLayout])

  // ── expand item → suppliers ───────────────────────────────────────────────
  const expandItem = useCallback(async (itemId) => {
    const key = `item:${itemId}`
    if (expandedNodes.has(key)) return
    setLoading(true)
    try {
      const { data } = await graphAPI.item(itemId)
      mergeData(data)
      setExpanded(prev => new Set([...prev, key]))
      setTimeout(() => runLayout(40), 50)
    } finally {
      setLoading(false)
    }
  }, [expandedNodes, mergeData, runLayout])

  // ── expand supplier → items ───────────────────────────────────────────────
  const expandSupplier = useCallback(async (supplierId) => {
    const key = `sup:${supplierId}`
    if (expandedNodes.has(key)) return
    setLoading(true)
    try {
      const { data } = await graphAPI.supplier(supplierId)
      mergeData(data)
      setExpanded(prev => new Set([...prev, key]))
      setTimeout(() => runLayout(60), 50)
    } finally {
      setLoading(false)
    }
  }, [expandedNodes, mergeData, runLayout])

  // ── focus node on sigma ───────────────────────────────────────────────────
  const focusNode = useCallback((nodeId) => {
    const sigma = sigmaRef.current
    const g     = graphRef.current
    if (!sigma || !g || !g.hasNode(nodeId)) return
    const pos = sigma.getNodeDisplayedCoordinates(nodeId)
    sigma.getCamera().animate({ x: pos.x, y: pos.y, ratio: 0.4 }, { duration: 500 })
  }, [])

  // ── highlight node ────────────────────────────────────────────────────────
  const highlightNode = useCallback((nodeId) => {
    const g = graphRef.current
    if (!g) return
    g.forEachNode((n, attrs) => {
      g.setNodeAttribute(n, 'highlighted', n === nodeId)
    })
    sigmaRef.current?.refresh()
  }, [])

  return {
    graphRef,
    sigmaRef,
    loading,
    nodeCount,
    edgeCount,
    expandedNodes,
    initGraph,
    mergeData,
    runLayout,
    expandRoot,
    expandOrganismo,
    expandLlamado,
    expandItem,
    expandSupplier,
    focusNode,
    highlightNode,
  }
}
