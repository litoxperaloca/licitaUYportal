import { useEffect, useRef, useCallback } from 'react'
import { Sigma } from 'sigma'
import { circular } from 'graphology-layout'

const NODE_PROGRAM_TYPES = {
  root:      'circle',
  organismo: 'circle',
  llamado:   'circle',
  item:      'circle',
  supplier:  'circle',
}

export default function SigmaGraph({
  graphRef,
  sigmaRef,
  onNodeClick,
  onNodeHover,
}) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || !graphRef.current) return

    // Destroy previous instance
    if (sigmaRef.current) {
      sigmaRef.current.kill()
      sigmaRef.current = null
    }

    const sigma = new Sigma(graphRef.current, containerRef.current, {
      renderEdgeLabels: false,
      labelRenderedSizeThreshold: 8,
      labelFont: 'Inter, sans-serif',
      labelSize: 11,
      labelWeight: '500',
      labelColor: { color: '#e5e7eb' },
      defaultNodeColor: '#6366f1',
      defaultEdgeColor: '#374151',
      edgeReducer(edge, data) {
        return { ...data, color: '#334155', size: 0.6 }
      },
      nodeReducer(node, data) {
        const res = { ...data }
        if (data.highlighted) {
          res.highlighted = true
          res.size = (data.size || 7) * 1.6
          res.zIndex = 100
        }
        return res
      },
    })

    sigmaRef.current = sigma

    // Click events
    sigma.on('clickNode', ({ node }) => {
      const attrs = graphRef.current.getNodeAttributes(node)
      onNodeClick?.({ id: node, ...attrs })
    })

    sigma.on('enterNode', ({ node }) => {
      const attrs = graphRef.current.getNodeAttributes(node)
      onNodeHover?.({ id: node, ...attrs })
      containerRef.current.style.cursor = 'pointer'
    })

    sigma.on('leaveNode', () => {
      containerRef.current.style.cursor = 'grab'
    })

    sigma.on('clickStage', () => {
      onNodeClick?.(null)
    })

    return () => {
      sigma.kill()
      sigmaRef.current = null
    }
  }, [graphRef.current]) // Re-init when graph instance changes

  return (
    <div
      ref={containerRef}
      id="sigma-container"
      className="w-full h-full"
      style={{ cursor: 'grab' }}
    />
  )
}
