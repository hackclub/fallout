import { useMemo, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@inertiajs/react'
import FlashMessages from '@/components/FlashMessages'

const GRASS_IMAGES = Array.from({ length: 11 }, (_, i) => `/grass/${i + 1}.svg`)
const GRASS_COUNT = 50
const BLUE_NOISE_CANDIDATES = 100

// Oval exclusion zone (vw/vh from center of ground area)
const OVAL_RADIUS_X = 20 // vw
const OVAL_RADIUS_Y = 25 // vh
const OVAL_OFFSET_Y = 2.5 // vh — vertical shift of oval center

// Minimum spacing between critter feet (px)
const CRITTER_MIN_DIST_X = 100 // px
const CRITTER_MIN_DIST_Y = 100 // px

// Minimum distance from edges of the ground area (px)
const EDGE_PADDING_X = 80 // px from left/right
const EDGE_PADDING_Y = 80 // px from top/bottom of ground

// How strongly critters prefer being near the center (0 = no preference, 1 = strong preference)
const CENTER_BIAS = 0.8

const DEBUG = false

function seededRandom(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function blueNoisePoints(count: number, rng: () => number) {
  const points: { x: number; y: number }[] = []
  points.push({ x: rng() * 100, y: rng() * 100 })
  for (let i = 1; i < count; i++) {
    let bestCandidate = { x: 0, y: 0 }
    let bestDist = -1
    for (let c = 0; c < BLUE_NOISE_CANDIDATES; c++) {
      const candidate = { x: rng() * 100, y: rng() * 100 }
      let minDist = Infinity
      for (const p of points) {
        const dx = candidate.x - p.x
        const dy = candidate.y - p.y
        minDist = Math.min(minDist, dx * dx + dy * dy)
      }
      if (minDist > bestDist) {
        bestDist = minDist
        bestCandidate = candidate
      }
    }
    points.push(bestCandidate)
  }
  return points
}

function placeCritters(count: number, groundW: number, groundH: number, iconShift: number, rng: () => number) {
  const placed: { x: number; y: number }[] = []
  const halfW = groundW / 2
  const halfH = groundH / 2
  const vw = groundW / 100
  const vh = groundH / 80 // ground is 80vh tall

  const ovalRxPx = OVAL_RADIUS_X * vw
  const ovalRyPx = OVAL_RADIUS_Y * vh
  const ovalOffPx = OVAL_OFFSET_Y * vh

  // Critter positions are relative to the icon center, which is shifted up
  // by iconShift from the ground center. Adjust edge bounds accordingly.
  const topEdge = -(halfH - EDGE_PADDING_Y) + iconShift
  const bottomEdge = halfH - EDGE_PADDING_Y + iconShift

  const isValid = (cx: number, cy: number) => {
    const nx = cx / ovalRxPx
    const ny = (cy - ovalOffPx) / ovalRyPx
    if (nx * nx + ny * ny < 1) return false
    if (Math.abs(cx) > halfW - EDGE_PADDING_X) return false
    if (cy < topEdge || cy > bottomEdge) return false
    return !placed.some((p) => Math.abs(cx - p.x) < CRITTER_MIN_DIST_X && Math.abs(cy - p.y) < CRITTER_MIN_DIST_Y)
  }

  for (let i = 0; i < count; i++) {
    let bestPos: { x: number; y: number } | null = null
    let bestDist = -1

    for (let c = 0; c < BLUE_NOISE_CANDIDATES; c++) {
      const cx = (rng() - 0.5) * (halfW - EDGE_PADDING_X) * 2
      const cy = topEdge + rng() * (bottomEdge - topEdge)
      if (!isValid(cx, cy)) continue

      const minDist =
        placed.length === 0
          ? Infinity
          : Math.min(
              ...placed.map((p) => {
                const dx = cx - p.x
                const dy = cy - p.y
                return dx * dx + dy * dy
              }),
            )

      // Penalize candidates far from center so critters cluster inward when space allows
      const centerDist = (cx * cx) / (halfW * halfW) + (cy * cy) / (halfH * halfH)
      const score = minDist / (1 + CENTER_BIAS * centerDist)

      if (score > bestDist) {
        bestDist = score
        bestPos = { x: cx, y: cy }
      }
    }

    if (!bestPos) {
      for (let c = 0; c < 500; c++) {
        const cx = (rng() - 0.5) * (halfW - EDGE_PADDING_X) * 2
        const cy = topEdge + rng() * (bottomEdge - topEdge)
        const nx = cx / ovalRxPx
        const ny = (cy - ovalOffPx) / ovalRyPx
        if (nx * nx + ny * ny >= 1) {
          bestPos = { x: cx, y: cy }
          break
        }
      }
      bestPos ??= { x: ovalRxPx + 20, y: 0 }
    }

    placed.push(bestPos)
  }

  return placed
}

type CritterItem = {
  id: number
  variant: string
  image_path: string
  created_at: string
  count: number
}

type PageProps = {
  critters: CritterItem[]
}

export default function ClearingIndex({ critters }: PageProps) {
  const grassBlades = useMemo(() => {
    const rng = seededRandom(123)
    const positions = blueNoisePoints(GRASS_COUNT, rng)
    return positions.map((p, i) => ({
      id: i,
      src: GRASS_IMAGES[Math.floor(rng() * GRASS_IMAGES.length)],
      left: p.x,
      top: p.y,
      scale: 0.4 + rng() * 0.4,
      rotation: (rng() - 0.5) * 30,
      flipX: rng() > 0.5,
    }))
  }, [])

  const [windowSize, setWindowSize] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1920,
    h: typeof window !== 'undefined' ? window.innerHeight : 900,
  }))

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    const onResize = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => setWindowSize({ w: window.innerWidth, h: window.innerHeight }), 300)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      clearTimeout(timeout)
    }
  }, [])

  const critterPositions = useMemo(() => {
    const rng = seededRandom(42)
    return placeCritters(critters.length, windowSize.w, windowSize.h * 0.8, windowSize.h * 0.05, rng)
  }, [critters.length, windowSize.w, windowSize.h])

  return (
    <>
      <FlashMessages />

      {/* Sky */}
      <div className="fixed top-0 left-0 right-0 h-[20vh] bg-light-blue overflow-hidden">
        <img src="/clouds/4.webp" alt="" className="absolute bottom-0 left-0 h-full -translate-x-1/3" />
        <img src="/clouds/1.webp" alt="" className="absolute bottom-0 left-40 h-full translate-x-1/3" />
        <img src="/clouds/2.webp" alt="" className="absolute bottom-0 right-0 -translate-x-5/6 h-full" />
        <img src="/clouds/3.webp" alt="" className="absolute bottom-0 right-0 h-full translate-x-1/3" />
      </div>

      {/* Ground */}
      <div className="fixed top-[20vh] left-0 right-0 bottom-0 bg-light-green">
        {grassBlades.map((g) => (
          <img
            key={g.id}
            src={g.src}
            alt=""
            className="absolute pointer-events-none select-none"
            style={{
              left: `${g.left}%`,
              top: `${g.top}%`,
              width: 40,
              height: 60,
              transform: `translate(-50%, -50%) scale(${g.flipX ? -g.scale : g.scale}, ${g.scale}) rotate(${g.rotation}deg)`,
            }}
          />
        ))}

        <div className="absolute inset-0 flex items-center justify-center z-1">
          <div className="relative -translate-y-[5vh]">
            <img src="/icon/clearing.webp" alt="Clearing" className="w-60 max-w-[70vw] xs:w-80 sm:w-100" />

            {DEBUG && (
              <>
                <div
                  className="absolute border-2 border-dashed border-dark-brown pointer-events-none"
                  style={{
                    left: '50%',
                    top: '50%',
                    width: `${OVAL_RADIUS_X * 2}vw`,
                    height: `${OVAL_RADIUS_Y * 2}vh`,
                    transform: `translate(-50%, calc(-50% + ${OVAL_OFFSET_Y}vh))`,
                    borderRadius: '50%',
                  }}
                />
                <div
                  className="absolute border-2 border-dotted border-coral pointer-events-none"
                  style={{
                    left: '50%',
                    top: '50%',
                    width: `calc(100vw - ${EDGE_PADDING_X * 2}px)`,
                    height: `calc(80vh - ${EDGE_PADDING_Y * 2}px)`,
                    transform: `translate(-50%, calc(-50% + 5vh + ${OVAL_OFFSET_Y}vh))`,
                  }}
                />
              </>
            )}
            {critters.map((critter, i) => {
              const pos = critterPositions[i]
              if (!pos) return null
              return (
                <Link
                  key={critter.id}
                  href={`/spin/${critter.id}`}
                  className="group absolute w-28 xs:w-32 sm:w-40"
                  style={{
                    left: '50%',
                    top: '50%',
                    transform: `translate(-50%, -100%) translate(${pos.x}px, ${pos.y + OVAL_OFFSET_Y}px)`,
                    zIndex: Math.round(pos.y + 1000),
                  }}
                >
                  <div className="hidden group-hover:block absolute left-1/2 -translate-x-1/2 -top-9 bg-brown text-light-brown border-2 border-dark-brown px-2 py-0.5 text-xs font-bold whitespace-nowrap">
                    {critter.variant} x{critter.count}
                  </div>
                  <img src={critter.image_path} alt="Critter" className="w-full h-full object-contain" />
                  {DEBUG && (
                    <div
                      className="absolute border border-dashed border-coral pointer-events-none"
                      style={{
                        width: CRITTER_MIN_DIST_X,
                        height: CRITTER_MIN_DIST_Y,
                        left: '50%',
                        bottom: 0,
                        transform: 'translate(-50%, 50%)',
                      }}
                    />
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      <Link
        href="/path"
        className="fixed z-10 top-4 left-4 xs:top-6 xs:left-6 bg-brown text-light-brown border-2 border-dark-brown px-3 py-1 font-bold uppercase text-sm"
      >
        Back
      </Link>
    </>
  )
}

ClearingIndex.layout = (page: ReactNode) => page
