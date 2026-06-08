# 3D Perspective Ground Plane

File: app/frontend/components/path/Path.tsx

Rendered by the path page: `app/frontend/pages/path/index.tsx`. (This doc is named "test-page" for historical reasons — the feature is now the live Path page.)

## Architecture Overview

**Hybrid rendering**: Billboards are DOM elements with direct style manipulation (bypassing React re-renders). Grass is rendered on two `<canvas>` elements with manual perspective projection. React renders once on mount; all scroll updates happen imperatively via refs and `requestAnimationFrame`.

## Constants (top of file)

```ts
HORIZON_PCT = 0          // vanishing point at top of screen
PERSPECTIVE = 800        // camera distance in px
MAX_WIDTH = 1024         // billboard ground plane bottom edge (5xl)
RIGHT_MARGIN = 100       // px reserved on the right for sidebar content (shifts center left)
GROUND_ANGLE = 60        // plane tilt in degrees (θ)
LANES = 3                // billboard columns
BILLBOARD_CULL_H = 600   // estimated max billboard height, used as culling buffer
BILLBOARD_Y_OFFSET = 60  // vertical offset for billboard content (px, via 2D translateY)
BILLBOARD_SPACING = 400  // px between billboard rows on ground plane
INFLECTION_PCT = 20      // screen % from top where sky ends and ground begins (vanishing-point peak)
TOP_PCT = 50             // % from top of ground area where billboard bottoms peak
BOTTOM_PCT = 30          // % from bottom of ground area where closest billboard appears
SCROLL_SPEED = 1.5       // native scroll multiplier (higher = less page height, faster travel)
SCROLL_TO_BOTTOM_PCT = 40 // clicked node's bottom lands this % from screen bottom

GRASS_DENSITY = 7        // blades per 1000px of ground depth
GRASS_X_MIN = -150       // % of ground plane width (left bound for random x)
GRASS_X_MAX = 250        // % of ground plane width (right bound for random x)
GRASS_W = 80             // grass container width in px
GRASS_H = 120            // grass container height in px
GRASS_Y_OFFSET = 20      // vertical offset for grass content (px)
GRASS_BASE_SCALE = 0.5   // base scale factor
GRASS_SCALE_RANGE = 0.1  // scale varies ± this from base (so 0.4 to 0.6)
GRASS_BASE_ROTATION = 0  // base lean in degrees (rotateZ)
GRASS_ROTATION_RANGE = 15 // rotation varies ± this from base (so -15° to +15°)
GRASS_IMAGES = ['/grass/1.svg' ... '/grass/11.svg']  // 11 SVG grass sprites
```

Billboards are not images: each billboard renders one of the React `nodes` passed in
as a prop (e.g. `PathNode`). The number of billboards equals `nodes.length` (no fixed
`BILLBOARD_COUNT`). There is also a separate "bulletin board" decoration system (`boards`)
that renders `/path/board.svg` `ModalLink`s interspersed along the path.

There is no `DEBUG` constant or debug-visual system in the current code.

### Precomputed trig constants (module level)

```ts
COS_A = cos(60°)  // ≈ 0.5
SIN_A = sin(60°)  // ≈ 0.866
COT_ANGLE = cos(60°) / sin(60°)              // ≈ 0.577
PERSPECTIVE_OFFSET_PX = round(800 × 0.577)   // = 462
```

## DOM Structure

```
<ScrollToNodeContext.Provider> / <PathCenterContext.Provider>
├── spacer div  (height: calc(100vh + maxScroll px), creates native scroll height)
└── viewport    (fixed, inset: 0, overflow: hidden)
    ├── sky           (top: 0, height: INFLECTION_PCT%, var(--color-light-blue))
    ├── clouds band   (top: 0, height: INFLECTION_PCT%, overflow hidden — /clouds/*.webp)
    ├── onboarding grass overlay (absolute, inset: 0, ONBOARDING_GRASS_SPRITES, opacity-gated)
    ├── back grass canvas   (absolute, inset: 0, pointerEvents: none, visibility gated)
    ├── 3D scene BACK (motion.div — billboards past inflection — behind cover)
    │   └── perspective container (perspective: 800px, perspectiveOrigin centerPct, visibility gated)
    │       └── billboard ground plane (rotateX 60deg, preserve-3d, width MAX_WIDTH, centered via left/marginLeft)
    │           ├── bulletin boards (display/visibility controlled imperatively)
    │           └── ALL billboards (display/visibility controlled imperatively)
    ├── hill cover    (top: inflectionScreenY, bottom: 0, var(--color-light-green))
    ├── front grass canvas  (absolute, inset: 0, pointerEvents: none, visibility gated)
    └── 3D scene FRONT (motion.div — billboards before inflection — in front of cover)
        └── perspective container (perspective: 800px, perspectiveOrigin centerPct, visibility gated)
            ├── bulletin boards (display/visibility controlled imperatively)
            └── ALL billboards (display/visibility controlled imperatively)
```

DOM order controls stacking — no z-index needed. The order is:
sky/clouds → back grass → back billboards → hill cover → front grass → front billboards.

There is no static `ground` div, no `instructions` overlay, and no DEBUG grid/horizon
line in the current code. The 3D scenes are `motion.div`s whose opacity is driven by the
optional `introTransition` prop (intro/onboarding entry animation).

**Grass ground planes removed**: Grass no longer uses DOM elements or `preserve-3d` containers. Two `<canvas>` elements replace them entirely, eliminating ~200 DOM nodes and their compositor overhead.

**Visibility gating**: The 4 dynamic elements (2 canvases + 2 billboard perspective containers) use `visibility: ready ? 'visible' : 'hidden'`. Static elements (sky, clouds, cover) are always visible. This prevents rendering incomplete state while keeping FCP fast.

---

## Rendering Architecture

### Strategy 1: Direct DOM Manipulation (Billboards)

React renders billboard DOM elements once on mount. All scroll-driven style updates bypass React entirely:

```
scroll event → scrollRef.current = scrollY → rAF → direct element.style mutations
```

- `scrollY` stored in a `useRef`, never in state
- `useEffect` sets up scroll listener + `requestAnimationFrame` loop
- Billboard refs (`backBillboardRefs`, `frontBillboardRefs`) used for direct `.style` mutations
- React never re-renders after mount (except one `setReady(true)` call)

### Strategy 4 (partial): Canvas Grass Rendering

Grass is drawn on two `<canvas>` elements using 2D context with manual perspective projection matching the CSS 3D math. Each frame clears and redraws visible grass blades.

Two canvases maintain the stacking order:

- **Back canvas**: draws grass past the inflection point (behind cover)
- **Front canvas**: draws grass before the inflection point (in front of cover)

### Strategy 2: Billboard Culling

Billboards outside the visible range get `display: none` (removed from layout entirely). Three cull conditions:

1. **Scrolled past** (below viewport): `rawY < -BILLBOARD_CULL_H`
2. **Too far away** (perspective scale < 0.03): extremely small on screen
3. **Range tracking**: `prevLow`/`prevHigh` indices track the previously visible range, so only boundary elements toggle `display`, not the entire array

#### O(1) low cutoff computation

Since billboards are linearly spaced (`y = i * BILLBOARD_SPACING + 200`), the lowest visible index is computed directly:

```ts
const lowIdx = Math.max(
  0,
  Math.ceil(
    (-BILLBOARD_CULL_H - scrollOffset - firstBillboardY) / BILLBOARD_SPACING,
  ),
);
```

#### Update loop structure

```ts
// 1. Hide newly-scrolled-past billboards (prevLow → lowIdx)
for (let i = prevLow; i < Math.min(lowIdx, billboards.length); i++) {
  display = "none";
}

// 2. Process visible range (lowIdx → break on far cull)
let highIdx = lowIdx - 1;
for (let i = lowIdx; i < billboards.length; i++) {
  if (perspScale < 0.03) break; // far cull — early exit
  highIdx = i;
  // set bottom, transform, visibility
}

// 3. Hide newly-far-culled billboards (highIdx+1 → prevHigh)
for (let i = Math.max(highIdx + 1, lowIdx); i <= prevHigh; i++) {
  display = "none";
}

prevLow = lowIdx;
prevHigh = highIdx;
```

This is O(visible + delta) per frame — only elements entering/leaving the visible range get `display` toggled.

**Why `display: none` instead of `visibility: hidden`?** Culled elements have large buffers ensuring transitions happen well off-screen, so there's no flicker risk from DOM removal. `display: none` fully removes elements from layout and compositor.

---

## CSS 3D Coordinate System

### CSS axes

- **X**: right
- **Y**: down (opposite of math convention)
- **Z**: toward viewer

### rotateX(θ) rotation matrix

Rotates Y axis toward -Z (top of element tilts away from viewer):

```
[1      0       0    ]   [x]
[0   cos(θ)  -sin(θ) ] × [y]
[0   sin(θ)   cos(θ) ]   [z]
```

After rotateX(60°), the basis vectors in world space:

- local X → (1, 0, 0) unchanged
- local Y → (0, cos60°, sin60°) = (0, 0.5, 0.866)
- local Z → (0, -sin60°, cos60°) = (0, -0.866, 0.5)

---

## Layer 1: Perspective Container

```jsx
<motion.div style={{
  position: 'absolute', inset: 0,
  perspective: '800px',
  perspectiveOrigin: `${centerPct}% calc(0% + 462px)`,
}}>
```

- `perspective: 800px` — camera is 800px in front of the screen plane
- `perspectiveOrigin` — the vanishing point on screen. The X is `centerPct`, not 50% —
  `RIGHT_MARGIN` shifts the visual center left to leave room for sidebar content.

### Vanishing point correction

With `rotateX(θ)` where θ < 90°, a plane's left/right edges converge at a point
`P × cot(θ)` pixels **above** perspectiveOrigin (not at perspectiveOrigin itself).

```
convergence_offset = P × cot(θ) = 800 × cot(60°) = 800 × (cos60°/sin60°) ≈ 462px
```

To make convergence land at `HORIZON_PCT = 0%` (top of screen), we set:

```
perspectiveOrigin Y = 0% + 462px = 462px from top
```

---

## Layer 2: Billboard Ground Plane

```jsx
<div style={{
  position: 'absolute',
  top: '-10000%',                 // extremely tall
  bottom: 0,                      // anchored to viewport bottom
  left: `${centerPct}%`,          // centered on the perspective center, not viewport center
  marginLeft: -MAX_WIDTH / 2,     // pull back by half-width to center the plane
  width: MAX_WIDTH,               // 1024, controls bottom edge width
  transformOrigin: 'bottom center',
  transformStyle: 'preserve-3d',
  transform: 'rotateX(60deg)',
}}>
```

**Why `top: -10000%`?** After rotateX(60°) + perspective, the far edge (top of div)
projects to nearly a single point at the vanishing point. A short div would show a
visible trapezoid top edge.

**Why `transformOrigin: bottom center`?** The bottom edge stays fixed at viewport
bottom. Rotation tilts the rest backward. Bottom edge = closest to viewer.

**Why `preserve-3d`?** Billboard children have their own transforms (`translateZ`,
`rotateX`) and must exist in the same 3D space as the ground plane.

---

## Layer 3: Billboards (DOM elements, imperatively styled)

Each billboard is rendered once by React, then styled imperatively via refs:

```jsx
<div
  ref={(el) => {
    backBillboardRefs.current[i] = el;
  }}
  style={{
    position: "absolute",
    left: `${(b.lane * 100) / LANES}%`,
    width: `${100 / LANES}%`,
    height: "auto",
    transformOrigin: "bottom center",
  }}
>
  <div
    style={{
      width: "100%",
      transform: `translateY(${BILLBOARD_Y_OFFSET}px)`,
      cursor: "pointer",
    }}
    onClick={() => scrollToNode(billboards.length - 1 - i)}
  >
    {nodes[billboards.length - 1 - i]}
  </div>
</div>
```

Billboards render the React `nodes` passed in (most recent node at the front/closest;
billboard index `i` maps to `nodes[billboards.length - 1 - i]`), not `<img>` elements.
Clicking a billboard calls `scrollToNode`. In the back scene, nodes are cloned with
`interactive: false`.

Styles set imperatively each frame (via `element.style`):

- `bottom` — ground-plane distance
- `transform` — `translateZ(-curveZ) rotateX(-60deg)`
- `visibility` — `visible`/`hidden` based on inflection
- `display` — `none` for culled elements, `''` for visible

**`rotateX(-60deg)`** cancels the ground plane's `rotateX(60deg)`, making the
billboard face the viewer (stand upright on the ground surface).

**`translateZ(-curveZ)`** pushes the billboard into the ground plane's surface,
creating the planet curvature effect.

**Inner `<div>` with `translateY(BILLBOARD_Y_OFFSET)`**: a 2D vertical offset for
billboard content. Does NOT affect 3D positioning, inflection logic, or curvature.

### Billboard data

- `effectiveY = Math.max(0, b.y + scrollOffset)` — current distance from viewer
- `curveZ = effectiveY² × invTwoR` — parabolic curvature (precomputed `invTwoR = 1/(2R)`)
- `pastInflection = effectiveY >= inflectionGroundY` — determines which scene shows it
- Snake pattern: lanes follow `LANE_PATTERN = [1, 2, 1, 0]` (middle, right, middle, left),
  indexed by `(count - 1 - i)` so the pattern is anchored at the star/most-recent end
- Each billboard renders a React node; index `i` → `nodes[billboards.length - 1 - i]`
- Each row 400px apart (`BILLBOARD_SPACING`), first row at 200px

---

## Layer 4: Grass (Canvas rendering)

Grass uses two `<canvas>` elements with manual 2D perspective projection that matches the CSS 3D math.

### Canvas setup

```ts
const setupCanvas = (canvas: HTMLCanvasElement) => {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  return ctx;
};
```

High-DPI support via `devicePixelRatio` scaling. SVGs loaded as `Image` objects render as vectors on canvas — they scale cleanly at any size.

### Projection math (inside drawGrass)

For a grass blade at ground position `(g.x%, effectiveY)`:

```ts
const curveZ = effectiveY * effectiveY * invTwoR;
const worldY = H - effectiveY * COS_A + curveZ * SIN_A;
const worldZ = -effectiveY * SIN_A - curveZ * COS_A;
const perspScale = P / (P - worldZ);
const screenY = O + (worldY - O) * perspScale;

const pivotX = (g.x / 100) * W + GRASS_W / 2;
const screenX = centerX + (pivotX - centerX) * perspScale;
```

`centerX = (W - RIGHT_MARGIN) / 2` — grass projects toward the same shifted center as
the billboards, not the raw viewport center.

This replicates the same formulas as the CSS 3D pipeline (`rotateX(60deg)` + `translateZ(-curveZ)` + perspective projection).

### Drawing each blade

```ts
ctx.save();
ctx.translate(screenX, screenY + yOff);
ctx.rotate((g.rotation * Math.PI) / 180);
ctx.scale(g.flipX, 1);
ctx.drawImage(img, -w / 2, -h, w, h);
ctx.restore();
```

- `screenY` = where the grass base projects to on screen
- `+ yOff` = shifts content down (matches the billboard inner div `translateY` pattern)
- `rotate` = screen-space lean (matches CSS `rotateZ` after counter-rotation)
- `scale(flipX, 1)` = horizontal flip
- `drawImage` at `(-w/2, -h)` = bottom-center anchor

### Grass loop optimizations

Grass is **pre-sorted by `y` descending** at generation time. This enables early exits:

```ts
for (const g of grass) {
  if (g.y + scrollOffset <= 0) break; // all remaining also scrolled past
  if (showPast && !pastInflection) break; // back canvas: done at inflection boundary
  if (!showPast && pastInflection) continue; // front canvas: skip far blades
  // ... project and draw
}
```

Additional culling: skip blades where `screenY - h > H` (below viewport) or `screenY < 0` (above viewport).

### Image preloading

Grass SVGs are preloaded as `Image` objects in the `useEffect`. A separate `Promise.all(img.decode())` triggers a redraw once all images are decoded, but `setReady(true)` does NOT wait for this — grass appears progressively as images load to avoid blocking page display (important for Safari where SVG decode is slow).

### Grass data generation (mulberry32 PRNG)

Uses **mulberry32** seeded PRNG (seed=42) for deterministic randomness.

`generateGrass(minY, maxY)` is called with ground bounds derived from the billboard
range and the computed `topGroundY`/`bottomGroundY`/`inflectionGroundY` (not a fixed
0..maxY). `range = maxY - minY`. Each grass blade gets 6 random values (in order):

1. `x` — horizontal position: `GRASS_X_MIN + rng() * (GRASS_X_MAX - GRASS_X_MIN)`
2. `y` — depth position: `minY + rng() * range`
3. `src` — random image from 11 SVGs
4. `scale` — `GRASS_BASE_SCALE + (rng() - 0.5) * 2 * GRASS_SCALE_RANGE`
5. `rotation` — `GRASS_BASE_ROTATION + (rng() - 0.5) * 2 * GRASS_ROTATION_RANGE`
6. `flipX` — `rng() > 0.5 ? -1 : 1`

Density-based count: `Math.round(GRASS_DENSITY * range / 1000)` — scales with the depth
span of the path, so the blade count grows with the number of nodes.

Array is sorted `b.y - a.y` (descending) at generation time for loop optimization.

### Why x range extends past 0–100%

After `rotateX(60deg)` + perspective, the visible ground near the camera is wider than
the viewport (edges extend beyond screen). `GRASS_X_MIN = -150` and `GRASS_X_MAX = 250`
ensure grass fills the full visible field, not just the viewport-width strip.

---

## Planet Curvature Math

### Goal

Simulate standing on a small planet. Far-away objects should visually sink below
the horizon, as if the ground curves away.

### How translateZ(-curveZ) creates curvature

The billboard gets `translateZ(-curveZ)` inside the ground plane's `preserve-3d` space.
Grass uses the equivalent math computed manually for canvas projection.

After the parent's `rotateX(60°)`, the local Z axis maps to world coordinates:

```
local Z axis → world (0, -sin60°, cos60°) = (0, -0.866, 0.5)
```

So `translateZ(-curveZ)` displaces the billboard by:

```
-curveZ × (0, -0.866, 0.5) = (0, +0.866·curveZ, -0.5·curveZ)
```

In world coordinates, a billboard bottom at ground distance `d` with curvature `cZ`:

```
World Y = H - d·cos(θ) + cZ·sin(θ)     // H = viewport height
World Z = -d·sin(θ) - cZ·cos(θ)
```

Where `cZ = d² / (2R)` and `θ = 60°`. Computed as `cZ = d² × invTwoR` where `invTwoR = 1/(2R)` is precomputed once.

**The `+cZ·sin(θ)` term is critical**: curvature pushes World Y **higher** (further
down on screen in CSS), making the billboard visually sink.

### Perspective projection to screen

```
screenY = O + (worldY - O) × P / (P - worldZ)
```

Where `O = PERSPECTIVE_OFFSET_PX` (≈462) and `P = PERSPECTIVE` (800).

### What happens as d increases

1. **Close (small d)**: perspective dominates → billboard projects upward on screen
2. **Inflection point**: curvature's downward push balances perspective's upward pull → screenY reaches minimum
3. **Far (large d)**: curvature dominates → billboard projects back downward (sinks below horizon)

---

## The Inflection Point & Nested Bisection

### What INFLECTION_PCT / TOP_PCT / BOTTOM_PCT control

`INFLECTION_PCT = 20` is the target screen Y for the **peak** (highest point billboard
bottoms reach), i.e. where the sky ends and the ground begins: 20% from the top. The
peak's screen position becomes `inflectionScreenY`, which positions the hill cover.

`TOP_PCT` and `BOTTOM_PCT` then carve out scroll bounds within the ground area below the
peak: `topScreenY` is `TOP_PCT%` down from the peak into the ground area, and
`bottomScreenY` is `BOTTOM_PCT%` up from the bottom of the viewport.

The `useMemo` (keyed on `windowSize.h`) derives `planetRadius`, `inflectionScreenY`,
`inflectionGroundY`, `topGroundY`, and `bottomGroundY`.

### 1. screenYAt(d, R, H) — projection function (module-level)

Projects a billboard bottom at ground distance `d` with radius `R` to screen Y:

```ts
const cZ = (d * d) / (2 * R);
const yw = H - d * COS_A + cZ * SIN_A;
const zw = -d * SIN_A - cZ * COS_A;
return PERSPECTIVE_OFFSET_PX + ((yw - PERSPECTIVE_OFFSET_PX) * PERSPECTIVE) / (PERSPECTIVE - zw);
```

### 2. findPeakD(R) — inner bisection

For a given radius R, finds the ground distance `d` where `d(screenY)/dd = 0`
(the visual peak — minimum screenY value).

Uses central difference with `eps = 0.5`: `deriv ≈ (screenY(d+eps) - screenY(d-eps)) / (2·eps)`

Bisection logic (d ranges from 0 to 50,000, 60 iterations):

- `deriv < 0` → screenY still decreasing (going up) → peak is further → `dLo = mid`
- `deriv ≥ 0` → screenY increasing (going down) → past peak → `dHi = mid`

### 3. Outer bisection on R

Finds the planet radius R (range 100 to 1,000,000) such that the peak's screenY equals
`targetSY = INFLECTION_PCT% × H`.

- **Large R** (gentle curve) → peak is far away → projects high on screen
- **Small R** (tight curve) → peak is close → projects low on screen

### 4. findGroundD(targetScreenY, R, H, peakD) — module-level bisection

Inverse of `screenYAt`: finds the ground-plane distance (in `0..peakD`) that projects to
a given screen Y. Used to compute `topGroundY` (from `topScreenY`) and `bottomGroundY`
(from `bottomScreenY`), and also by `scrollTopForNode` to scroll a clicked node to
`SCROLL_TO_BOTTOM_PCT`.

### Output

```ts
planetRadius; // curvature radius (used in curveZ = d² × invTwoR)
inflectionGroundY; // ground-plane distance where peak occurs (splits visibility)
inflectionScreenY; // screen pixel Y of the peak (positions hill cover)
topGroundY; // ground distance projecting to topScreenY (scroll bounds)
bottomGroundY; // ground distance projecting to bottomScreenY (scroll bounds)
```

---

## Hill Cover — Billboard & Grass Clipping

### The problem

Billboards and grass past the inflection point visually sink below the horizon. But
they're rendered by the browser as elements that still appear on screen. We need to hide them.

### The solution: two layers + a cover div

DOM order controls stacking:

1. **Back grass canvas**: draws grass past inflection. Positioned before the cover in DOM.
2. **Back billboard scene**: all billboards rendered, only those past inflection are `visibility: visible`. Culled billboards get `display: none`.
3. **Hill cover div**: positioned at `inflectionScreenY`, extending to the bottom. Uses `var(--color-light-green)`. DOM order places it ON TOP of the back layers.
4. **Front grass canvas**: draws grass before inflection. Positioned after cover in DOM.
5. **Front billboard scene**: all billboards rendered, only those before inflection are `visibility: visible`. Culled billboards get `display: none`.

### Why billboards use visibility instead of conditional rendering?

Chrome's compositor creates/destroys GPU layers when 3D-transformed DOM nodes are
mounted/unmounted inside `preserve-3d` containers. This causes severe flickering.
Using `visibility: hidden` keeps DOM nodes stable. Fully off-screen billboards use
`display: none` instead, which is safe because the cull buffers ensure transitions
happen well outside the visible area.

---

## Scrolling — Native Scroll

### Architecture

```
<>
  <div style={{ height: `calc(100vh + ${maxScroll}px)` }} />   ← spacer
  <div style={{ position: 'fixed', inset: 0 }}>               ← viewport
    ...
  </div>
</>
```

The spacer creates scroll height. The fixed viewport floats over it. `window.scrollY` drives the offset.

### Scroll offset formula

```ts
const firstBillboardY = billboards[0].y; // 200
const lastBillboardY = billboards[billboards.length - 1].y; // depends on node count
const maxScroll = (lastBillboardY - firstBillboardY + bottomGroundY - topGroundY) / SCROLL_SPEED;
const scrollOffset = scrollRef.current * SCROLL_SPEED + topGroundY - lastBillboardY;
```

### Scroll event handling

```ts
let ticking = false;
const handleScroll = () => {
  scrollRef.current = window.scrollY;
  if (!ticking) {
    rafRef.current = requestAnimationFrame(() => {
      update();
      ticking = false;
    });
    ticking = true;
  }
};
window.addEventListener("scroll", handleScroll, { passive: true });
```

Uses `passive: true`. `scrollY` stored in ref (not state) — no React re-renders.
`ticking` flag prevents multiple rAF callbacks per frame.

The real handler also checks `scrollLockRef`: after the intro entry animation, scroll is
locked to its target for ~2s and forced back if the browser tries to move it (guards
against browser scroll restoration). `history.scrollRestoration = 'manual'` is set at
module scope for the same reason.

### Scroll direction

**Scrolling DOWN** increases `scrollY` → increases `scrollOffset` → increases
`effectiveY` → billboards move **away** from viewer (toward horizon).

---

## Page Load & FCP Optimization

### Ready state gating

`useEffect` calls `setReady(true)` immediately after the first `update()` call.
The 4 dynamic elements (2 canvases + 2 billboard scenes) use `visibility: ready ? 'visible' : 'hidden'`.
Static elements (sky, clouds, cover) are always visible, keeping FCP fast.

### Non-blocking Google Fonts

`app/views/layouts/inertia.html.erb` loads fonts non-blocking:

```erb
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="...Outfit..." media="print" onload="this.media='all'">
```

### Image loading

- Grass SVGs are preloaded as `Image` objects with async `decode()` — page doesn't wait for decode to display
- Billboard content is whatever React `nodes` are passed in (no `<img fetchPriority>` in this component)

---

## Intro / Onboarding Entry Transition

The optional `introTransition` prop drives an entry animation. When `active`, the scene
starts scrolled to `maxScroll` (the star/far end) and animates scroll toward the target
node over `PATH_ENTRY_SCROLL_DURATION_MS` using `easeOutCubic`, syncing billboard
positions each frame via `updateBillboardsRef`. The two 3D scenes are `motion.div`s whose
opacity fades in (`PATH_ENTRY_NODE_DURATION_MS`) gated on `nodesVisible`. In `onboarding`
mode, a static `ONBOARDING_GRASS_SPRITES` overlay covers the scene until it is ready, and
the live grass canvases fade in via `liveGroundFadeStyle`. `prefersReducedMotion()` skips
the board-pop spring animations. There is no DEBUG constant or debug-visual system in the
current code.
