# Performance Optimization Strategies for Test Page

## What's Been Implemented

### Strategy 1: Bypass React — DONE
Direct DOM manipulation via refs. `scrollY` in a ref, not state. `useEffect` + `requestAnimationFrame` loop. React renders once on mount.

### Strategy 4 (partial): Canvas Grass — DONE
Grass moved from DOM (`preserve-3d` containers with ~200 nodes) to two `<canvas>` elements with manual 2D perspective projection. Eliminated 2 `preserve-3d` grass ground planes and all grass DOM nodes.

### Strategy 2: Billboard Culling — DONE
O(1) low cutoff computation for linearly-spaced billboards. Forward iteration with early `break` on far cull (perspScale < 0.03). `prevLow`/`prevHigh` range tracking for O(1) amortized `display: none` updates. Only boundary elements toggle each frame.

### Math Optimizations — DONE
- `invTwoR = 1 / (2 * planetRadius)` precomputed — multiplication instead of division per element
- `COS_A`, `SIN_A` precomputed at module level
- Grass pre-sorted by `y` descending — enables `break` instead of `continue` for scrolled-past and back-canvas-done conditions
- Viewport culling in grass canvas loop (`screenY - h > H` or `screenY < 0`)

### FCP/LCP Optimizations — DONE
- Non-blocking Google Fonts via `media="print" onload="this.media='all'"` in layout
- `fetchPriority="high"` on billboard `<img>` elements
- `useEffect` (not `useLayoutEffect`) with `ready` state — static elements (sky, ground, cover) paint immediately
- Only 4 dynamic elements gated by `visibility: ready ? 'visible' : 'hidden'`
- Grass image `decode()` does NOT block `setReady(true)` — important for Safari SVG decode performance

---

## Remaining Strategies (Not Implemented)

### Strategy 5: CSS Compositor Optimizations — SKIPPED
`will-change: transform` on 100+ elements risks excessive GPU memory. `contain` may conflict with `preserve-3d`. Decided not worth the risk.

### Strategy 6: Flatten DOM per Billboard
Each billboard is currently 3 nodes (outer div → inner div → img). Could merge inner div's `translateY` onto img, saving ~120 nodes. Low risk, trivial to implement.

### Strategy 3: Single Scene — NOT RECOMMENDED
Would require moving elements between `preserve-3d` containers at the inflection boundary. High flicker risk — this is the original problem the two-scene architecture was designed to solve.

### Other minor optimizations
- Eliminate `ready` re-render by using a ref + direct style mutation instead of `useState`
- Move `billboards`/`grass` arrays to module level (outside component) since they're static
- Precompute `g.rotation * Math.PI / 180` (rotationRad) at generation time
