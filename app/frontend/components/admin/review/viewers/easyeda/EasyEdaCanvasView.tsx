import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { EasyEdaVisualDocument, EasyEdaVisualPrimitive } from './easyedaVisual'

interface EasyEdaCanvasViewProps {
  document: EasyEdaVisualDocument
}

interface ViewBoxState {
  x: number
  y: number
  width: number
  height: number
}

interface PanState {
  pointerId: number
  startClientX: number
  startClientY: number
  startViewBox: ViewBoxState
}

const FIT_PADDING_SCALE = 1.06

export default function EasyEdaCanvasView({ document }: EasyEdaCanvasViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const panStateRef = useRef<PanState | null>(null)

  const fitViewBox = useMemo(() => createFitViewBox(document), [document])
  const [viewBox, setViewBox] = useState<ViewBoxState>(fitViewBox)
  const [isPanning, setIsPanning] = useState(false)

  useEffect(() => {
    setViewBox(fitViewBox)
  }, [fitViewBox])

  const resetView = useCallback(() => {
    setViewBox(fitViewBox)
  }, [fitViewBox])

  const zoomBy = useCallback(
    (scale: number) => {
      setViewBox((previous) => {
        const clampedScale = clamp(scale, 0.2, 5)
        const centerX = previous.x + previous.width / 2
        const centerY = previous.y + previous.height / 2
        const minWidth = document.bounds.width * 0.01
        const maxWidth = document.bounds.width * 100
        const nextWidth = clamp(previous.width * clampedScale, minWidth, maxWidth)
        const nextHeight = (nextWidth / previous.width) * previous.height
        return {
          x: centerX - nextWidth / 2,
          y: centerY - nextHeight / 2,
          width: nextWidth,
          height: nextHeight,
        }
      })
    },
    [document.bounds.width],
  )

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()

      const rect = svg.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top
      const zoomScale = event.deltaY < 0 ? 0.9 : 1.1

      setViewBox((previous) => {
        const cursorX = previous.x + (mouseX / rect.width) * previous.width
        const cursorY = previous.y + (mouseY / rect.height) * previous.height

        const minWidth = document.bounds.width * 0.01
        const maxWidth = document.bounds.width * 100
        const nextWidth = clamp(previous.width * zoomScale, minWidth, maxWidth)
        const scaleFactor = nextWidth / previous.width
        const nextHeight = previous.height * scaleFactor

        return {
          x: cursorX - (cursorX - previous.x) * scaleFactor,
          y: cursorY - (cursorY - previous.y) * scaleFactor,
          width: nextWidth,
          height: nextHeight,
        }
      })
    }

    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [document.bounds.width])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (event.button !== 0) return
      const svg = svgRef.current
      if (!svg) return

      svg.setPointerCapture(event.pointerId)
      panStateRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startViewBox: viewBox,
      }
      setIsPanning(true)
    },
    [viewBox],
  )

  const handlePointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const panState = panStateRef.current
    const svg = svgRef.current
    if (!panState || !svg || panState.pointerId !== event.pointerId) return

    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const dx = event.clientX - panState.startClientX
    const dy = event.clientY - panState.startClientY
    const unitsPerPixelX = panState.startViewBox.width / rect.width
    const unitsPerPixelY = panState.startViewBox.height / rect.height

    setViewBox({
      x: panState.startViewBox.x - dx * unitsPerPixelX,
      y: panState.startViewBox.y - dy * unitsPerPixelY,
      width: panState.startViewBox.width,
      height: panState.startViewBox.height,
    })
  }, [])

  const handlePointerUp = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const panState = panStateRef.current
    if (!panState || panState.pointerId !== event.pointerId) return
    panStateRef.current = null
    setIsPanning(false)
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <button
          type="button"
          className="rounded-md border border-border bg-background px-2 py-0.5 hover:bg-accent"
          onClick={() => zoomBy(0.85)}
        >
          Zoom In
        </button>
        <button
          type="button"
          className="rounded-md border border-border bg-background px-2 py-0.5 hover:bg-accent"
          onClick={() => zoomBy(1.18)}
        >
          Zoom Out
        </button>
        <button
          type="button"
          className="rounded-md border border-border bg-background px-2 py-0.5 hover:bg-accent"
          onClick={resetView}
        >
          Fit
        </button>
        <span className="ml-auto text-muted-foreground">
          Primitives: <strong>{document.primitives.length}</strong>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-zinc-950">
        <svg
          ref={svgRef}
          className={`h-full w-full touch-none ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <rect
            x={document.bounds.minX}
            y={document.bounds.minY}
            width={document.bounds.width}
            height={document.bounds.height}
            fill="#0f1016"
          />
          {document.primitives.map((primitive, index) => renderPrimitive(primitive, index))}
        </svg>
      </div>
    </div>
  )
}

function renderPrimitive(primitive: EasyEdaVisualPrimitive, index: number) {
  if (primitive.kind === 'polyline') {
    const points = primitive.points.map((point) => `${point.x},${point.y}`).join(' ')
    if (primitive.closed) {
      return (
        <polygon
          key={`shape-${index}`}
          points={points}
          stroke={primitive.stroke}
          strokeWidth={primitive.strokeWidth}
          fill={primitive.fill ?? 'none'}
          opacity={primitive.opacity}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )
    }
    return (
      <polyline
        key={`shape-${index}`}
        points={points}
        stroke={primitive.stroke}
        strokeWidth={primitive.strokeWidth}
        fill="none"
        opacity={primitive.opacity}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    )
  }

  if (primitive.kind === 'path') {
    return (
      <path
        key={`shape-${index}`}
        d={primitive.path}
        stroke={primitive.stroke}
        strokeWidth={primitive.strokeWidth}
        fill={primitive.fill ?? 'none'}
        opacity={primitive.opacity}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    )
  }

  if (primitive.kind === 'circle') {
    return (
      <circle
        key={`shape-${index}`}
        cx={primitive.cx}
        cy={primitive.cy}
        r={primitive.r}
        stroke={primitive.stroke}
        strokeWidth={primitive.strokeWidth}
        fill={primitive.fill ?? 'none'}
        opacity={primitive.opacity}
      />
    )
  }

  if (primitive.kind === 'rect') {
    const centerX = primitive.x + primitive.width / 2
    const centerY = primitive.y + primitive.height / 2
    const transform = primitive.rotation !== 0 ? `rotate(${primitive.rotation} ${centerX} ${centerY})` : undefined
    return (
      <rect
        key={`shape-${index}`}
        x={primitive.x}
        y={primitive.y}
        width={primitive.width}
        height={primitive.height}
        rx={primitive.rx}
        ry={primitive.ry}
        transform={transform}
        stroke={primitive.stroke}
        strokeWidth={primitive.strokeWidth}
        fill={primitive.fill ?? 'none'}
        opacity={primitive.opacity}
      />
    )
  }

  const transform = primitive.rotation !== 0 ? `rotate(${primitive.rotation} ${primitive.x} ${primitive.y})` : undefined
  return (
    <text
      key={`shape-${index}`}
      x={primitive.x}
      y={primitive.y}
      transform={transform}
      fill="#a0b6e8"
      opacity={primitive.opacity}
      fontSize={primitive.size}
      textAnchor={primitive.anchor}
      dominantBaseline="middle"
      style={{ userSelect: 'none', pointerEvents: 'none' }}
    >
      {truncateText(primitive.text)}
    </text>
  )
}

function createFitViewBox(document: EasyEdaVisualDocument): ViewBoxState {
  const width = Math.max(1, document.bounds.width * FIT_PADDING_SCALE)
  const height = Math.max(1, document.bounds.height * FIT_PADDING_SCALE)
  const x = document.bounds.minX - (width - document.bounds.width) / 2
  const y = document.bounds.minY - (height - document.bounds.height) / 2
  return { x, y, width, height }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function truncateText(value: string): string {
  if (value.length <= 120) return value
  return `${value.slice(0, 117)}...`
}
