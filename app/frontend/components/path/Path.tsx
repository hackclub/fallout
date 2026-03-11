import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

const HORIZON_PCT = 0
const PERSPECTIVE = 800
const MAX_WIDTH = 1024 // 5xl
const RIGHT_MARGIN = 100 // px reserved on the right for sidebar content (e.g. leaderboard)
const GROUND_ANGLE = 60 // degrees
const LANES = 3
const BILLBOARD_CULL_H = 600 // estimated max height for culling buffer
const BILLBOARD_Y_OFFSET = 60 // vertical offset for billboard content (px)
const BILLBOARD_SPACING = 400 // px between rows on the ground plane
const INFLECTION_PCT = 20 // % from top of screen where sky ends and ground begins
const TOP_PCT = 50 // % from top of ground area where billboard bottoms peak
const BOTTOM_PCT = 30 // % from bottom of ground area where closest billboard appears
const SCROLL_SPEED = 1.5
const SCROLL_TO_BOTTOM_PCT = 40 // clicked node's bottom lands this % from screen bottom

const GRASS_DENSITY = 7 // blades per 1000px of ground depth
const GRASS_X_MIN = -150 // % of ground plane width
const GRASS_X_MAX = 250 // % of ground plane width
const GRASS_W = 80
const GRASS_H = 120
const GRASS_Y_OFFSET = 20
const GRASS_BASE_SCALE = 0.5
const GRASS_SCALE_RANGE = 0.1 // scale varies ± this from base
const GRASS_BASE_ROTATION = 0 // degrees (rotateZ lean)
const GRASS_ROTATION_RANGE = 15 // rotation varies ± this from base
const GRASS_IMAGES = Array.from({ length: 11 }, (_, i) => `/grass/${i + 1}.svg`)

function screenYAt(d: number, R: number, H: number) {
  const cZ = (d * d) / (2 * R)
  const yw = H - d * COS_A + cZ * SIN_A
  const zw = -d * SIN_A - cZ * COS_A
  return PERSPECTIVE_OFFSET_PX + ((yw - PERSPECTIVE_OFFSET_PX) * PERSPECTIVE) / (PERSPECTIVE - zw)
}

function findGroundD(targetScreenY: number, R: number, H: number, peakD: number) {
  let lo = 0,
    hi = peakD
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (screenYAt(mid, R, H) > targetScreenY) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

const LANE_PATTERN = [1, 2, 1, 0] // middle, right, middle, left

const COS_A = Math.cos((GROUND_ANGLE * Math.PI) / 180)
const SIN_A = Math.sin((GROUND_ANGLE * Math.PI) / 180)

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function generateGrass(minY: number, maxY: number) {
  const rng = mulberry32(42)
  const range = maxY - minY
  const count = Math.round((GRASS_DENSITY * range) / 1000)
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: GRASS_X_MIN + rng() * (GRASS_X_MAX - GRASS_X_MIN),
    y: minY + rng() * range,
    src: GRASS_IMAGES[Math.floor(rng() * GRASS_IMAGES.length)],
    scale: GRASS_BASE_SCALE + (rng() - 0.5) * 2 * GRASS_SCALE_RANGE,
    rotation: GRASS_BASE_ROTATION + (rng() - 0.5) * 2 * GRASS_ROTATION_RANGE,
    flipX: rng() > 0.5 ? -1 : 1,
  })).sort((a, b) => b.y - a.y)
}

function generateBillboards(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    lane: LANE_PATTERN[(count - 1 - i) % LANE_PATTERN.length],
    y: i * BILLBOARD_SPACING + 200,
  }))
}

// With rotateX < 90°, edges converge d*cot(θ) pixels ABOVE perspectiveOrigin.
// Offset perspectiveOrigin down so the visual vanishing point lands at the horizon.
const COT_ANGLE = Math.cos((GROUND_ANGLE * Math.PI) / 180) / Math.sin((GROUND_ANGLE * Math.PI) / 180)
const PERSPECTIVE_OFFSET_PX = Math.round(PERSPECTIVE * COT_ANGLE)

type PathProps = {
  nodes: ReactNode[]
}

export default function Path({ nodes }: PathProps) {
  const billboards = useMemo(() => generateBillboards(nodes.length), [nodes.length])

  const [ready, setReady] = useState(false)
  const [windowSize, setWindowSize] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1920,
    h: typeof window !== 'undefined' ? window.innerHeight : 900,
  }))
  const centerPct = ((windowSize.w - RIGHT_MARGIN) / 2 / windowSize.w) * 100
  const scrollRef = useRef(0)
  const rafRef = useRef(0)
  const backBillboardRefs = useRef<(HTMLDivElement | null)[]>([])
  const frontBillboardRefs = useRef<(HTMLDivElement | null)[]>([])
  const backCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const frontCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const backCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const frontCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const grassImagesRef = useRef<Map<string, HTMLImageElement>>(new Map())

  useEffect(() => {
    let timeout: number
    const handleResize = () => {
      clearTimeout(timeout)
      timeout = window.setTimeout(() => {
        setWindowSize({ w: window.innerWidth, h: window.innerHeight })
      }, 300)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(timeout)
    }
  }, [])

  const { planetRadius, inflectionScreenY, inflectionGroundY, topGroundY, bottomGroundY } = useMemo(() => {
    const H = windowSize.h
    const targetSY = (INFLECTION_PCT / 100) * H

    const findPeakD = (R: number) => {
      let dLo = 0,
        dHi = 50000
      for (let i = 0; i < 60; i++) {
        const mid = (dLo + dHi) / 2
        const eps = 0.5
        const deriv = (screenYAt(mid + eps, R, H) - screenYAt(mid - eps, R, H)) / (2 * eps)
        if (deriv < 0) dLo = mid
        else dHi = mid
      }
      return (dLo + dHi) / 2
    }

    let rLo = 100,
      rHi = 1000000
    for (let i = 0; i < 60; i++) {
      const rMid = (rLo + rHi) / 2
      const peakD = findPeakD(rMid)
      const peakScreenY = screenYAt(peakD, rMid, H)
      if (peakScreenY < targetSY) rHi = rMid
      else rLo = rMid
    }
    const radius = (rLo + rHi) / 2
    const peakD = findPeakD(radius)
    const screenY = screenYAt(peakD, radius, H)

    const groundHeight = H - screenY
    const topScreenY = screenY + (TOP_PCT / 100) * groundHeight
    const bottomScreenY = H - (BOTTOM_PCT / 100) * groundHeight

    return {
      planetRadius: radius,
      inflectionScreenY: screenY,
      inflectionGroundY: peakD,
      topGroundY: findGroundD(topScreenY, radius, H, peakD),
      bottomGroundY: findGroundD(bottomScreenY, radius, H, peakD),
    }
  }, [windowSize.h])

  const firstBillboardY = billboards[0].y
  const lastBillboardY = billboards[billboards.length - 1].y

  const grass = useMemo(() => {
    const grassMinY = firstBillboardY - bottomGroundY
    const grassMaxY = lastBillboardY - topGroundY + inflectionGroundY
    return generateGrass(grassMinY, grassMaxY)
  }, [firstBillboardY, lastBillboardY, topGroundY, bottomGroundY, inflectionGroundY])
  const maxScroll = (lastBillboardY - firstBillboardY + bottomGroundY - topGroundY) / SCROLL_SPEED

  const scrollToNode = useCallback(
    (nodeIndex: number) => {
      const H = windowSize.h
      const billboardIndex = billboards.length - 1 - nodeIndex
      if (billboardIndex < 0 || billboardIndex >= billboards.length) return
      const b = billboards[billboardIndex]
      const targetScreenY = H * (1 - SCROLL_TO_BOTTOM_PCT / 100)
      const targetGroundD = findGroundD(targetScreenY, planetRadius, H, inflectionGroundY)
      // rawY = b.y + scrollY * SCROLL_SPEED + topGroundY - lastBillboardY = targetGroundD
      const scrollY = (targetGroundD - b.y - topGroundY + lastBillboardY) / SCROLL_SPEED
      window.scrollTo({ top: Math.max(0, Math.min(maxScroll, scrollY)), behavior: 'smooth' })
    },
    [billboards, windowSize.h, planetRadius, inflectionGroundY, topGroundY, lastBillboardY, maxScroll],
  )

  useEffect(() => {
    const W = windowSize.w
    const H = windowSize.h
    const O = PERSPECTIVE_OFFSET_PX
    const P = PERSPECTIVE
    const dpr = window.devicePixelRatio || 1
    const invTwoR = 1 / (2 * planetRadius)
    const centerX = (W - RIGHT_MARGIN) / 2

    const setupCanvas = (canvas: HTMLCanvasElement) => {
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      const ctx = canvas.getContext('2d')!
      ctx.scale(dpr, dpr)
      return ctx
    }

    if (backCanvasRef.current) backCtxRef.current = setupCanvas(backCanvasRef.current)
    if (frontCanvasRef.current) frontCtxRef.current = setupCanvas(frontCanvasRef.current)

    GRASS_IMAGES.forEach((src) => {
      if (!grassImagesRef.current.has(src)) {
        const img = new Image()
        img.src = src
        grassImagesRef.current.set(src, img)
      }
    })

    const drawGrass = (ctx: CanvasRenderingContext2D, scrollOffset: number, showPast: boolean) => {
      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      for (const g of grass) {
        if (g.y + scrollOffset <= 0) break
        const effectiveY = g.y + scrollOffset
        const pastInflection = effectiveY >= inflectionGroundY
        if (showPast && !pastInflection) break
        if (!showPast && pastInflection) continue

        const curveZ = effectiveY * effectiveY * invTwoR
        const worldY = H - effectiveY * COS_A + curveZ * SIN_A
        const worldZ = -effectiveY * SIN_A - curveZ * COS_A
        const perspScale = P / (P - worldZ)
        const screenY = O + (worldY - O) * perspScale

        const s = perspScale * g.scale
        const h = GRASS_H * s
        if (screenY - h > H || screenY < 0) continue

        const pivotX = (g.x / 100) * W + GRASS_W / 2
        const screenX = centerX + (pivotX - centerX) * perspScale
        const w = GRASS_W * s
        const yOff = GRASS_Y_OFFSET * s

        const img = grassImagesRef.current.get(g.src)
        if (!img?.complete) continue

        ctx.save()
        ctx.translate(screenX, screenY + yOff)
        ctx.rotate((g.rotation * Math.PI) / 180)
        ctx.scale(g.flipX, 1)
        ctx.drawImage(img, -w / 2, -h, w, h)
        ctx.restore()
      }

      ctx.restore()
    }

    let prevLow = 0
    let prevHigh = billboards.length - 1

    const update = () => {
      const scrollOffset = scrollRef.current * SCROLL_SPEED + topGroundY - lastBillboardY

      const lowIdx = Math.max(0, Math.ceil((-BILLBOARD_CULL_H - scrollOffset - firstBillboardY) / BILLBOARD_SPACING))

      for (let i = prevLow; i < Math.min(lowIdx, billboards.length); i++) {
        const back = backBillboardRefs.current[i]
        const front = frontBillboardRefs.current[i]
        if (back) back.style.display = 'none'
        if (front) front.style.display = 'none'
      }

      let highIdx = lowIdx - 1
      for (let i = lowIdx; i < billboards.length; i++) {
        const b = billboards[i]
        const rawY = b.y + scrollOffset
        const effectiveY = Math.max(0, rawY)
        const curveZ = effectiveY * effectiveY * invTwoR
        const worldZ = -effectiveY * SIN_A - curveZ * COS_A

        if (P / (P - worldZ) < 0.03) break

        highIdx = i
        const pastInflection = effectiveY >= inflectionGroundY
        const bottom = `${rawY}px`
        const transform = `translateZ(${-curveZ}px) rotateX(-${GROUND_ANGLE}deg)`

        const back = backBillboardRefs.current[i]
        if (back) {
          back.style.display = ''
          back.style.bottom = bottom
          back.style.transform = transform
          back.style.visibility = pastInflection ? 'visible' : 'hidden'
        }
        const front = frontBillboardRefs.current[i]
        if (front) {
          front.style.display = ''
          front.style.bottom = bottom
          front.style.transform = transform
          front.style.visibility = pastInflection ? 'hidden' : 'visible'
        }
      }

      for (let i = Math.max(highIdx + 1, lowIdx); i <= prevHigh; i++) {
        const back = backBillboardRefs.current[i]
        const front = frontBillboardRefs.current[i]
        if (back) back.style.display = 'none'
        if (front) front.style.display = 'none'
      }

      prevLow = lowIdx
      prevHigh = highIdx

      if (backCtxRef.current) drawGrass(backCtxRef.current, scrollOffset, true)
      if (frontCtxRef.current) drawGrass(frontCtxRef.current, scrollOffset, false)
    }

    let ticking = false
    const handleScroll = () => {
      scrollRef.current = window.scrollY
      if (!ticking) {
        rafRef.current = requestAnimationFrame(() => {
          update()
          ticking = false
        })
        ticking = true
      }
    }

    const loadPromises = GRASS_IMAGES.map((src) => {
      const img = grassImagesRef.current.get(src)
      return img?.decode().catch(() => {})
    })
    Promise.all(loadPromises).then(() => update())

    window.addEventListener('scroll', handleScroll, { passive: true })
    update()
    setReady(true)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      cancelAnimationFrame(rafRef.current)
    }
  }, [billboards, grass, planetRadius, inflectionGroundY, topGroundY, lastBillboardY, windowSize.w])

  return (
    <>
      <div style={{ height: `calc(100vh + ${maxScroll}px)` }} />
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
        {/* Sky */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: `${INFLECTION_PCT}%`,
            background: 'var(--color-light-blue)',
          }}
        />
        {/* Clouds — behind all 3D content, constrained to sky band */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: `${INFLECTION_PCT}%`,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <img src="/clouds/4.webp" alt="" className="absolute bottom-0 left-0 h-30 md:h-50 -translate-x-1/3" />
          <img src="/clouds/1.webp" alt="" className="absolute bottom-0 left-40 h-30 translate-x-1/3" />
          <img src="/clouds/2.webp" alt="" className="absolute bottom-0 right-0 -translate-x-5/6 h-30" />
          <img src="/clouds/3.webp" alt="" className="absolute bottom-0 right-0 h-30 md:h-50 w-auto translate-x-1/3" />
        </div>

        {/* Back grass canvas */}
        <canvas
          ref={backCanvasRef}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', visibility: ready ? 'visible' : 'hidden' }}
        />
        {/* Back billboard scene — past inflection (behind cover) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            perspective: `${PERSPECTIVE}px`,
            perspectiveOrigin: `${centerPct}% calc(${HORIZON_PCT}% + ${PERSPECTIVE_OFFSET_PX}px)`,
            pointerEvents: 'none',
            visibility: ready ? 'visible' : 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '-10000%',
              bottom: 0,
              left: `${centerPct}%`,
              marginLeft: -MAX_WIDTH / 2,
              width: MAX_WIDTH,
              transformOrigin: 'bottom center',
              transformStyle: 'preserve-3d',
              transform: `rotateX(${GROUND_ANGLE}deg)`,
            }}
          >
            {billboards.map((b, i) => (
              <div
                key={b.id}
                ref={(el) => {
                  backBillboardRefs.current[i] = el
                }}
                style={{
                  position: 'absolute',
                  left: `${(b.lane * 100) / LANES}%`,
                  width: `${100 / LANES}%`,
                  height: 'auto',
                  transformOrigin: 'bottom center',
                }}
              >
                <div
                  style={{ width: '100%', transform: `translateY(${BILLBOARD_Y_OFFSET}px)`, cursor: 'pointer' }}
                  onClick={() => scrollToNode(billboards.length - 1 - i)}
                >
                  {(() => {
                    const node = nodes[billboards.length - 1 - i]
                    return React.isValidElement(node)
                      ? React.cloneElement(node as React.ReactElement<{ interactive?: boolean }>, {
                          interactive: false,
                        })
                      : node
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Hill cover */}
        <div
          style={{
            position: 'absolute',
            top: inflectionScreenY,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'var(--color-light-green)',
            pointerEvents: 'none',
          }}
        />
        {/* Front grass canvas */}
        <canvas
          ref={frontCanvasRef}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', visibility: ready ? 'visible' : 'hidden' }}
        />
        {/* Front billboard scene — before inflection (in front of cover) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            perspective: `${PERSPECTIVE}px`,
            perspectiveOrigin: `${centerPct}% calc(${HORIZON_PCT}% + ${PERSPECTIVE_OFFSET_PX}px)`,
            pointerEvents: 'none',
            visibility: ready ? 'visible' : 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '-10000%',
              bottom: 0,
              left: `${centerPct}%`,
              marginLeft: -MAX_WIDTH / 2,
              width: MAX_WIDTH,
              transformOrigin: 'bottom center',
              transformStyle: 'preserve-3d',
              transform: `rotateX(${GROUND_ANGLE}deg)`,
            }}
          >
            {billboards.map((b, i) => (
              <div
                key={b.id}
                ref={(el) => {
                  frontBillboardRefs.current[i] = el
                }}
                style={{
                  position: 'absolute',
                  left: `${(b.lane * 100) / LANES}%`,
                  width: `${100 / LANES}%`,
                  height: 'auto',
                  transformOrigin: 'bottom center',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    transform: `translateY(${BILLBOARD_Y_OFFSET}px)`,
                    cursor: 'pointer',
                  }}
                  onClick={() => scrollToNode(billboards.length - 1 - i)}
                >
                  {nodes[billboards.length - 1 - i]}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
