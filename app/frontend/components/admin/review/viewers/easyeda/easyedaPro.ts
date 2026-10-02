import { parseEasyEdaZipEntries, readEasyEdaZipEntry } from './easyeda'
import type { EasyEdaVisualBounds, EasyEdaVisualDocument, EasyEdaVisualPrimitive } from './easyedaVisual'

// ---------- Types ----------

export type ProRecord = unknown[]

export interface ProDocument {
  docType: string
  records: ProRecord[]
}

export interface ProArchive {
  projectInfo: ProjectInfo | null
  pcbs: Map<string, ProDocument>
  schematicSheets: Map<string, ProDocument> // key: sheetUuid (folder)/sheetId
  footprints: Map<string, ProDocument>
  symbols: Map<string, ProDocument>
}

export interface ProjectInfo {
  schematics: Array<{
    uuid: string
    name: string
    sheets: Array<{ id: number | string; name: string; uuid: string }>
  }>
  pcbs: Array<{ uuid: string; name: string }>
}

// ---------- NDJSON parser ----------

export function parseProDocument(text: string): ProDocument | null {
  const lines = text.split(/\r?\n/)
  const records: ProRecord[] = []
  let docType = ''
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    let record: unknown
    try {
      record = JSON.parse(line)
    } catch {
      continue
    }
    if (!Array.isArray(record) || record.length === 0) continue
    const tag = record[0]
    if (typeof tag !== 'string') continue
    if (tag === 'DOCTYPE' && typeof record[1] === 'string') {
      docType = record[1]
    }
    records.push(record as ProRecord)
  }
  if (records.length === 0) return null
  return { docType, records }
}

// ---------- Archive extraction ----------

const PRO_TEXT_EXTENSIONS = ['.epcb', '.esch', '.efoo', '.esym']
const TEXT_DECODER = new TextDecoder('utf-8')

function isProTextEntry(name: string): boolean {
  const lower = name.toLowerCase()
  return PRO_TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function entryBaseId(name: string): string {
  const lastSlash = name.lastIndexOf('/')
  const file = lastSlash >= 0 ? name.slice(lastSlash + 1) : name
  const dot = file.lastIndexOf('.')
  return dot >= 0 ? file.slice(0, dot) : file
}

export async function extractEasyEdaProArchive(content: ArrayBuffer): Promise<ProArchive> {
  const entries = parseEasyEdaZipEntries(content)
  const archiveBytes = new Uint8Array(content)

  const archive: ProArchive = {
    projectInfo: null,
    pcbs: new Map(),
    schematicSheets: new Map(),
    footprints: new Map(),
    symbols: new Map(),
  }

  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue
    const lower = entry.name.toLowerCase()
    try {
      if (lower.endsWith('project.json')) {
        const data = await readEasyEdaZipEntry(archiveBytes, entry)
        const text = TEXT_DECODER.decode(data)
        archive.projectInfo = parseProjectInfo(text)
      } else if (isProTextEntry(entry.name)) {
        const data = await readEasyEdaZipEntry(archiveBytes, entry)
        const text = TEXT_DECODER.decode(data)
        const doc = parseProDocument(text)
        if (!doc) continue
        if (lower.endsWith('.epcb')) {
          archive.pcbs.set(entryBaseId(entry.name), doc)
        } else if (lower.endsWith('.esch')) {
          // .esch lives at SHEET/{schematicUuid}/{sheetId}.esch
          const key = sheetKey(entry.name)
          archive.schematicSheets.set(key, doc)
        } else if (lower.endsWith('.efoo')) {
          archive.footprints.set(entryBaseId(entry.name), doc)
        } else if (lower.endsWith('.esym')) {
          archive.symbols.set(entryBaseId(entry.name), doc)
        }
      }
    } catch {
      // ignore single bad entry
    }
  }

  return archive
}

function sheetKey(entryName: string): string {
  // For SHEET/{schUuid}/{sheetId}.esch we want "{schUuid}/{sheetId}".
  const parts = entryName.split('/')
  if (parts.length >= 2) {
    const file = parts[parts.length - 1]
    const sheetId = file.replace(/\.esch$/i, '')
    const schUuid = parts[parts.length - 2]
    return `${schUuid}/${sheetId}`
  }
  return entryBaseId(entryName)
}

function parseProjectInfo(text: string): ProjectInfo | null {
  try {
    const value = JSON.parse(text) as unknown
    if (!value || typeof value !== 'object') return null
    const record = value as Record<string, unknown>
    const schematicsRaw = (record.schematics as Record<string, unknown> | undefined) ?? undefined
    const pcbsRaw = (record.pcbs as Record<string, unknown> | undefined) ?? undefined

    const schematics: ProjectInfo['schematics'] = []
    if (schematicsRaw && typeof schematicsRaw === 'object') {
      for (const [uuid, rawEntry] of Object.entries(schematicsRaw)) {
        if (!rawEntry || typeof rawEntry !== 'object') continue
        const entry = rawEntry as Record<string, unknown>
        const name = typeof entry.name === 'string' ? entry.name : uuid
        const sheets: ProjectInfo['schematics'][number]['sheets'] = []
        if (Array.isArray(entry.sheets)) {
          for (const sheet of entry.sheets) {
            if (!sheet || typeof sheet !== 'object') continue
            const s = sheet as Record<string, unknown>
            sheets.push({
              id: typeof s.id === 'number' || typeof s.id === 'string' ? s.id : '',
              name: typeof s.name === 'string' ? s.name : String(s.id ?? ''),
              uuid: typeof s.uuid === 'string' ? s.uuid : '',
            })
          }
        }
        schematics.push({ uuid, name, sheets })
      }
    }

    const pcbs: ProjectInfo['pcbs'] = []
    if (pcbsRaw && typeof pcbsRaw === 'object') {
      for (const [uuid, name] of Object.entries(pcbsRaw)) {
        pcbs.push({ uuid, name: typeof name === 'string' ? name : uuid })
      }
    }

    return { schematics, pcbs }
  } catch {
    return null
  }
}

// ---------- Visual builder (PCB) ----------

const PCB_LAYER_COLORS: Record<string, string> = {
  '1': '#ce2929', // top copper
  '2': '#2c8bd6', // bottom copper
  '3': '#dadada', // top silk
  '4': '#9aa0a6', // bottom silk
  '5': '#7a3aa3', // top solder mask
  '6': '#a45cd1', // bottom solder mask
  '7': '#7e7e7e', // top paste mask
  '8': '#a04444', // bottom paste mask
  '9': '#33cc99', // top assembly
  '10': '#5566ff', // bottom assembly
  '11': '#ff66ff', // outline
  '12': '#cccccc', // multi
  '13': '#f4f4f4', // document
  '14': '#f022f0', // mechanical
  '47': '#1a1a1a', // hole
  '48': '#33cccc', // component shape
  '49': '#66ffcc', // component marking
  '50': '#cc9999', // pin soldering
  '51': '#ff99ff', // pin floating
}

const COPPER_LAYERS = new Set([
  '1',
  '2',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
  '31',
  '32',
  '33',
  '34',
  '35',
  '36',
  '37',
  '38',
  '39',
  '40',
  '41',
  '42',
  '43',
  '44',
  '45',
  '46',
])

interface LayerInfo {
  id: string
  name: string
  type: string
  color: string
  visible: boolean
}

interface PcbContext {
  layers: Map<string, LayerInfo>
  primitives: EasyEdaVisualPrimitive[]
  footprints: Map<string, ProDocument>
  unknownTags: Set<string>
  pourLayerById: Map<string, string>
}

interface ComponentTransform {
  cx: number
  cy: number
  rotation: number // degrees
  flipY: boolean
  layerSwap: boolean
}

const IDENTITY_TRANSFORM: ComponentTransform = {
  cx: 0,
  cy: 0,
  rotation: 0,
  flipY: false,
  layerSwap: false,
}

export function buildEasyEdaProPcbVisual(
  archive: ProArchive,
  pcbDoc: ProDocument,
  title: string,
): EasyEdaVisualDocument | null {
  const ctx: PcbContext = {
    layers: new Map(),
    primitives: [],
    footprints: archive.footprints,
    unknownTags: new Set(),
    pourLayerById: new Map(),
  }

  // First pass: collect layer info and pour metadata
  for (const rec of pcbDoc.records) {
    if (rec[0] === 'LAYER') readLayer(rec, ctx)
    if (rec[0] === 'POUR') {
      const id = String(rec[1] ?? '')
      const layer = String(rec[4] ?? '')
      if (id && layer) ctx.pourLayerById.set(id, layer)
    }
  }

  // Build attr map: {componentId: {attrKey: value}}
  const attrByComponent = new Map<string, Map<string, string>>()
  for (const rec of pcbDoc.records) {
    if (rec[0] === 'ATTR') {
      const compId = String(rec[3] ?? '')
      const key = String(rec[7] ?? '')
      const val = rec[8] == null ? '' : String(rec[8])
      if (!compId || !key) continue
      let m = attrByComponent.get(compId)
      if (!m) {
        m = new Map()
        attrByComponent.set(compId, m)
      }
      m.set(key, val)
    }
  }

  // Render top-level primitives
  for (const rec of pcbDoc.records) {
    renderRecord(rec, ctx, IDENTITY_TRANSFORM)
  }

  // Render components -> footprints
  for (const rec of pcbDoc.records) {
    if (rec[0] !== 'COMPONENT') continue
    const compId = String(rec[1] ?? '')
    const layerSide = String(rec[3] ?? '1')
    const cx = numberAt(rec, 4)
    const cy = numberAt(rec, 5)
    const rotation = numberAt(rec, 6)
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue

    const attrs = attrByComponent.get(compId)
    const footprintId = attrs?.get('Footprint')
    if (!footprintId) continue
    const footprint = archive.footprints.get(footprintId)
    if (!footprint) continue

    const flipY = layerSide === '2'
    const transform: ComponentTransform = {
      cx,
      cy,
      rotation,
      flipY,
      layerSwap: flipY,
    }

    for (const fpRec of footprint.records) {
      renderRecord(fpRec, ctx, transform)
    }
  }

  if (ctx.primitives.length === 0) return null

  const bounds = computeBounds(ctx.primitives)
  if (!bounds) return null

  return {
    title,
    documentKind: 'pcb',
    primitives: ctx.primitives,
    bounds,
    shapeCount: pcbDoc.records.length,
    unknownShapePrefixes: Array.from(ctx.unknownTags).sort(),
  }
}

function readLayer(rec: ProRecord, ctx: PcbContext): void {
  // ["LAYER", id, type, name, visible(?), color, opacity, color2, ?]
  const id = String(rec[1] ?? '')
  const type = String(rec[2] ?? '')
  const name = String(rec[3] ?? '')
  const visibleFlag = rec[4]
  const visible = !(visibleFlag === 0 || visibleFlag === false)
  const rawColor = typeof rec[5] === 'string' ? rec[5] : ''
  const color = PCB_LAYER_COLORS[id] ?? (rawColor || '#bbbbbb')
  ctx.layers.set(id, { id, name, type, color, visible })
}

function renderRecord(rec: ProRecord, ctx: PcbContext, t: ComponentTransform): void {
  const tag = rec[0]
  if (typeof tag !== 'string') return
  switch (tag) {
    case 'LINE':
      renderLine(rec, ctx, t)
      break
    case 'ARC':
      renderArc(rec, ctx, t)
      break
    case 'VIA':
      renderVia(rec, ctx, t)
      break
    case 'PAD':
      renderPad(rec, ctx, t)
      break
    case 'FILL':
      renderFill(rec, ctx, t)
      break
    case 'POLY':
      renderPoly(rec, ctx, t)
      break
    case 'REGION':
      renderRegion(rec, ctx, t)
      break
    case 'POURED':
      renderPoured(rec, ctx, t)
      break
    case 'STRING':
      renderString(rec, ctx, t)
      break
    case 'IMAGE':
      renderImage(rec, ctx, t)
      break
    case 'COMPONENT':
    case 'ATTR':
    case 'LAYER':
    case 'LAYER_PHYS':
    case 'NET':
    case 'PAD_NET':
    case 'PRIMITIVE':
    case 'CANVAS':
    case 'HEAD':
    case 'DOCTYPE':
    case 'ACTIVE_LAYER':
    case 'PANELIZE':
    case 'PANELIZE_SIDE':
    case 'PANELIZE_STAMP':
    case 'PREFERENCE':
    case 'RULE':
    case 'RULE_TEMPLATE':
    case 'RULE_SELECTOR':
    case 'POUR':
    case 'FONT':
    case 'SILK_OPTS':
    case 'HOLE':
      // Either rendered separately or non-visual.
      break
    default:
      ctx.unknownTags.add(tag)
  }
}

// ---------- Geometry helpers ----------

function applyTransform(t: ComponentTransform, x: number, y: number): { x: number; y: number } {
  if (t === IDENTITY_TRANSFORM) return { x, y }
  const px = t.flipY ? -x : x
  const py = y
  const rad = (t.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return {
    x: t.cx + px * cos - py * sin,
    y: t.cy + px * sin + py * cos,
  }
}

function applyTransformLayer(t: ComponentTransform, layer: string): string {
  if (!t.layerSwap) return layer
  // Swap top<->bottom layer pairs when component is on bottom side.
  const swap: Record<string, string> = {
    '1': '2',
    '2': '1',
    '3': '4',
    '4': '3',
    '5': '6',
    '6': '5',
    '7': '8',
    '8': '7',
    '9': '10',
    '10': '9',
  }
  return swap[layer] ?? layer
}

function layerColor(ctx: PcbContext, layer: string, fallback = '#bbbbbb'): string {
  const info = ctx.layers.get(layer)
  if (info) return info.color
  return PCB_LAYER_COLORS[layer] ?? fallback
}

function isLayerVisible(ctx: PcbContext, layer: string): boolean {
  const info = ctx.layers.get(layer)
  if (!info) return true
  if (!info.visible) return false
  // Hide deep inner copper, keepouts, dielectrics, etc to keep render readable.
  if (info.type === 'SUBSTRATE') return false
  return true
}

function numberAt(rec: ProRecord, idx: number, fallback = 0): number {
  const v = rec[idx]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

// ---------- Render functions ----------

function renderLine(rec: ProRecord, ctx: PcbContext, t: ComponentTransform): void {
  // ["LINE", id, ?, net, layer, x1, y1, x2, y2, width, ...]
  const layerRaw = String(rec[4] ?? '')
  const layer = applyTransformLayer(t, layerRaw)
  if (!isLayerVisible(ctx, layer)) return
  const x1 = numberAt(rec, 5)
  const y1 = numberAt(rec, 6)
  const x2 = numberAt(rec, 7)
  const y2 = numberAt(rec, 8)
  const width = Math.max(0.4, numberAt(rec, 9, 1))
  const a = applyTransform(t, x1, y1)
  const b = applyTransform(t, x2, y2)
  const isCopper = COPPER_LAYERS.has(layer)
  ctx.primitives.push({
    kind: 'polyline',
    points: [a, b],
    closed: false,
    stroke: layerColor(ctx, layer),
    strokeWidth: width,
    fill: null,
    opacity: isCopper ? 0.95 : 0.9,
  })
}

function renderArc(rec: ProRecord, ctx: PcbContext, t: ComponentTransform): void {
  // ["ARC", id, ?, net, layer, cx, cy, x1, y1, sweepAngle, width, ...]
  const layerRaw = String(rec[4] ?? '')
  const layer = applyTransformLayer(t, layerRaw)
  if (!isLayerVisible(ctx, layer)) return
  const cx = numberAt(rec, 5)
  const cy = numberAt(rec, 6)
  const x1 = numberAt(rec, 7)
  const y1 = numberAt(rec, 8)
  const sweep = numberAt(rec, 9)
  const width = Math.max(0.4, numberAt(rec, 10, 1))

  const r = Math.hypot(x1 - cx, y1 - cy)
  if (!Number.isFinite(r) || r <= 0) return
  const startAngle = Math.atan2(y1 - cy, x1 - cx)
  const endAngle = startAngle + (sweep * Math.PI) / 180
  const x2 = cx + r * Math.cos(endAngle)
  const y2 = cy + r * Math.sin(endAngle)
  const largeArc = Math.abs(sweep) > 180 ? 1 : 0
  const sweepFlag = sweep >= 0 ? 1 : 0

  const a = applyTransform(t, x1, y1)
  const b = applyTransform(t, x2, y2)
  // SVG arc radii are unaffected by rotation since uniform rotation preserves circles.
  const path = `M ${a.x} ${a.y} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${b.x} ${b.y}`
  ctx.primitives.push({
    kind: 'path',
    path,
    stroke: layerColor(ctx, layer),
    strokeWidth: width,
    fill: null,
    opacity: 0.95,
  })
}

function renderVia(rec: ProRecord, ctx: PcbContext, t: ComponentTransform): void {
  // ["VIA", id, ?, net, padId, x, y, holeDiameter, padDiameter, ...]
  const x = numberAt(rec, 5)
  const y = numberAt(rec, 6)
  const holeD = numberAt(rec, 7)
  const padD = numberAt(rec, 8)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  const p = applyTransform(t, x, y)
  // Annular ring (copper)
  ctx.primitives.push({
    kind: 'circle',
    cx: p.x,
    cy: p.y,
    r: Math.max(padD / 2, holeD / 2 + 1),
    stroke: '#c9a227',
    strokeWidth: 0,
    fill: '#c9a227',
    opacity: 0.95,
  })
  // Hole
  ctx.primitives.push({
    kind: 'circle',
    cx: p.x,
    cy: p.y,
    r: holeD / 2,
    stroke: '#000',
    strokeWidth: 0,
    fill: '#0a0a0a',
    opacity: 1,
  })
}

function renderPad(rec: ProRecord, ctx: PcbContext, t: ComponentTransform): void {
  // ["PAD", id, ?, net, layer, name, x, y, rotation, holeShape|null, padShape, ...]
  const layerRaw = String(rec[4] ?? '')
  const layer = applyTransformLayer(t, layerRaw)
  if (!isLayerVisible(ctx, layer)) return
  const x = numberAt(rec, 6)
  const y = numberAt(rec, 7)
  const rot = numberAt(rec, 8)
  const padShape = rec[10]
  const p = applyTransform(t, x, y)
  const fill = layerColor(ctx, layer === '12' ? '1' : layer)

  if (Array.isArray(padShape) && padShape.length >= 3) {
    const shapeKind = String(padShape[0]).toUpperCase()
    const w = numberAt(padShape, 1)
    const h = numberAt(padShape, 2)
    const padRot = numberAt(padShape, 3) + rot + t.rotation
    if (shapeKind === 'ROUND' || shapeKind === 'ELLIPSE' || shapeKind === 'OVAL') {
      const r = Math.min(w, h) / 2
      if (Math.abs(w - h) < 0.01) {
        ctx.primitives.push({
          kind: 'circle',
          cx: p.x,
          cy: p.y,
          r,
          stroke: fill,
          strokeWidth: 0,
          fill,
          opacity: 0.95,
        })
      } else {
        ctx.primitives.push({
          kind: 'rect',
          x: p.x - w / 2,
          y: p.y - h / 2,
          width: w,
          height: h,
          rx: r,
          ry: r,
          rotation: padRot,
          stroke: fill,
          strokeWidth: 0,
          fill,
          opacity: 0.95,
        })
      }
    } else if (shapeKind === 'RECT' || shapeKind === 'SQUARE') {
      ctx.primitives.push({
        kind: 'rect',
        x: p.x - w / 2,
        y: p.y - h / 2,
        width: w,
        height: h,
        rx: 0,
        ry: 0,
        rotation: padRot,
        stroke: fill,
        strokeWidth: 0,
        fill,
        opacity: 0.95,
      })
    } else if (shapeKind === 'ROUNDRECT') {
      const corner = numberAt(padShape, 4, Math.min(w, h) * 0.2)
      ctx.primitives.push({
        kind: 'rect',
        x: p.x - w / 2,
        y: p.y - h / 2,
        width: w,
        height: h,
        rx: corner,
        ry: corner,
        rotation: padRot,
        stroke: fill,
        strokeWidth: 0,
        fill,
        opacity: 0.95,
      })
    }
  }

  // Hole if present
  const holeShape = rec[9]
  if (Array.isArray(holeShape) && holeShape.length >= 3) {
    const w = numberAt(holeShape, 1)
    const h = numberAt(holeShape, 2)
    const r = Math.min(w, h) / 2
    ctx.primitives.push({
      kind: 'circle',
      cx: p.x,
      cy: p.y,
      r,
      stroke: '#000',
      strokeWidth: 0,
      fill: '#080808',
      opacity: 1,
    })
  }
}

function renderFill(rec: ProRecord, ctx: PcbContext, t: ComponentTransform): void {
  // ["FILL", id, ?, net, layer, lineWidth, ?, shapes, ...]
  const layerRaw = String(rec[4] ?? '')
  const layer = applyTransformLayer(t, layerRaw)
  if (!isLayerVisible(ctx, layer)) return
  const shapes = rec[7]
  if (!Array.isArray(shapes)) return
  emitShapeData(shapes as unknown[], ctx, t, layerColor(ctx, layer), true, 0)
}

function renderPoly(rec: ProRecord, ctx: PcbContext, t: ComponentTransform): void {
  // ["POLY", id, ?, net, layer, lineWidth, shapes, ...]
  const layerRaw = String(rec[4] ?? '')
  const layer = applyTransformLayer(t, layerRaw)
  if (!isLayerVisible(ctx, layer)) return
  const lineWidth = numberAt(rec, 5, 1)
  const shape = rec[6]
  if (!Array.isArray(shape)) return
  emitShapeData([shape as unknown[]] as unknown[], ctx, t, layerColor(ctx, layer), false, Math.max(0.4, lineWidth))
}

function renderRegion(rec: ProRecord, ctx: PcbContext, t: ComponentTransform): void {
  // ["REGION", id, ?, layer, lineWidth, [layerList], shapes, ...]
  const layerRaw = String(rec[3] ?? '')
  const layer = applyTransformLayer(t, layerRaw)
  if (!isLayerVisible(ctx, layer)) return
  const shapes = rec[6]
  if (!Array.isArray(shapes)) return
  emitShapeData(shapes as unknown[], ctx, t, layerColor(ctx, layer), false, Math.max(0.4, numberAt(rec, 4, 1)))
}

function renderPoured(rec: ProRecord, ctx: PcbContext, t: ComponentTransform): void {
  // ["POURED", id, parentPourId, ?, dirty, [outline, hole1, hole2, ...]]
  const parentId = String(rec[2] ?? '')
  const drawLayer = ctx.pourLayerById.get(parentId) ?? '1'
  if (!isLayerVisible(ctx, drawLayer)) return
  const shapes = rec[5]
  if (!Array.isArray(shapes)) return
  emitShapeData(shapes as unknown[], ctx, t, layerColor(ctx, drawLayer), true, 0)
}

function renderString(rec: ProRecord, ctx: PcbContext, t: ComponentTransform): void {
  // ["STRING", id, ?, layer, x, y, text, font, size, lineWidth, ...]
  const layerRaw = String(rec[3] ?? '')
  const layer = applyTransformLayer(t, layerRaw)
  if (!isLayerVisible(ctx, layer)) return
  const x = numberAt(rec, 4)
  const y = numberAt(rec, 5)
  const text = typeof rec[6] === 'string' ? rec[6] : ''
  if (!text) return
  const size = Math.max(8, numberAt(rec, 8, 12))
  const rotation = numberAt(rec, 13)
  const p = applyTransform(t, x, y)
  ctx.primitives.push({
    kind: 'text',
    x: p.x,
    y: p.y,
    text,
    size,
    rotation: rotation + t.rotation,
    fill: layerColor(ctx, layer),
    opacity: 0.95,
    anchor: 'start',
  })
}

function renderImage(rec: ProRecord, ctx: PcbContext, t: ComponentTransform): void {
  // ["IMAGE", id, ?, layer, x, y, width, height, rotation, ?, [path-data]]
  const layerRaw = String(rec[3] ?? '')
  const layer = applyTransformLayer(t, layerRaw)
  if (!isLayerVisible(ctx, layer)) return
  const data = rec[10]
  if (!Array.isArray(data)) return
  emitShapeData(data as unknown[], ctx, t, layerColor(ctx, layer), true, 0)
}

// ---------- Shape data emission ----------

interface PointXY {
  x: number
  y: number
}

function emitShapeData(
  shapes: unknown[],
  ctx: PcbContext,
  t: ComponentTransform,
  color: string,
  filled: boolean,
  strokeWidth: number,
): void {
  // shapes can be either a single flat array of tokens, or an array of such arrays.
  if (shapes.length === 0) return
  if (Array.isArray(shapes[0]) && typeof (shapes[0] as unknown[])[0] !== 'string') {
    // flat outline alone => wrap
    emitShapeArray(shapes as unknown[], ctx, t, color, filled, strokeWidth)
    return
  }
  if (typeof shapes[0] === 'string' || typeof shapes[0] === 'number') {
    emitShapeArray(shapes, ctx, t, color, filled, strokeWidth)
    return
  }
  // Array of arrays
  for (const sub of shapes) {
    if (Array.isArray(sub)) {
      emitShapeArray(sub as unknown[], ctx, t, color, filled, strokeWidth)
    }
  }
}

function emitShapeArray(
  shape: unknown[],
  ctx: PcbContext,
  t: ComponentTransform,
  color: string,
  filled: boolean,
  strokeWidth: number,
): void {
  if (shape.length === 0) return

  // Special primitive shapes: ["CIRCLE", cx, cy, r], ["R", x, y, w, h, rx, ry], ["ELLIPSE", ...]
  const head = shape[0]
  if (typeof head === 'string') {
    const tag = head.toUpperCase()
    if (tag === 'CIRCLE' && shape.length >= 4) {
      const cx = numberAt(shape, 1)
      const cy = numberAt(shape, 2)
      const r = numberAt(shape, 3)
      const p = applyTransform(t, cx, cy)
      ctx.primitives.push({
        kind: 'circle',
        cx: p.x,
        cy: p.y,
        r,
        stroke: color,
        strokeWidth,
        fill: filled ? color : null,
        opacity: filled ? 0.55 : 0.9,
      })
      return
    }
    if (tag === 'R' && shape.length >= 5) {
      const x = numberAt(shape, 1)
      const y = numberAt(shape, 2)
      const w = numberAt(shape, 3)
      const h = numberAt(shape, 4)
      const rx = numberAt(shape, 5, 0)
      const ry = numberAt(shape, 6, rx)
      const a = applyTransform(t, x, y)
      const b = applyTransform(t, x + w, y + h)
      const minX = Math.min(a.x, b.x)
      const minY = Math.min(a.y, b.y)
      ctx.primitives.push({
        kind: 'rect',
        x: minX,
        y: minY,
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y),
        rx,
        ry,
        rotation: t.rotation,
        stroke: color,
        strokeWidth,
        fill: filled ? color : null,
        opacity: filled ? 0.45 : 0.9,
      })
      return
    }
    if (tag === 'ELLIPSE' && shape.length >= 5) {
      const cx = numberAt(shape, 1)
      const cy = numberAt(shape, 2)
      const rx = numberAt(shape, 3)
      const ry = numberAt(shape, 4)
      const p = applyTransform(t, cx, cy)
      ctx.primitives.push({
        kind: 'circle',
        cx: p.x,
        cy: p.y,
        r: Math.max(rx, ry),
        stroke: color,
        strokeWidth,
        fill: filled ? color : null,
        opacity: filled ? 0.55 : 0.9,
      })
      return
    }
  }

  // Token stream: numbers and tokens "L" / "ARC".
  const points: PointXY[] = []
  let pathSegments: string[] = []
  let i = 0
  // Read first pair as starting point.
  const startX = numberAt(shape, i)
  const startY = numberAt(shape, i + 1)
  if (!Number.isFinite(startX) || !Number.isFinite(startY)) return
  let cur = applyTransform(t, startX, startY)
  pathSegments.push(`M ${cur.x} ${cur.y}`)
  points.push(cur)
  i = 2

  while (i < shape.length) {
    const token = shape[i]
    if (typeof token === 'string') {
      const tag = token.toUpperCase()
      if (tag === 'L') {
        i += 1
        // Sequence of x,y pairs until the next string token
        while (i + 1 < shape.length && typeof shape[i] === 'number' && typeof shape[i + 1] === 'number') {
          const x = numberAt(shape, i)
          const y = numberAt(shape, i + 1)
          cur = applyTransform(t, x, y)
          pathSegments.push(`L ${cur.x} ${cur.y}`)
          points.push(cur)
          i += 2
        }
      } else if (tag === 'ARC') {
        // ["ARC", angle, x, y]
        const sweep = numberAt(shape, i + 1)
        const ex = numberAt(shape, i + 2)
        const ey = numberAt(shape, i + 3)
        const end = applyTransform(t, ex, ey)
        // Compute radius from sweep and chord.
        const dx = end.x - cur.x
        const dy = end.y - cur.y
        const chord = Math.hypot(dx, dy)
        const halfChord = chord / 2
        const halfAngleRad = (Math.abs(sweep) * Math.PI) / 360
        const r = halfChord && Math.sin(halfAngleRad) ? halfChord / Math.sin(halfAngleRad) : halfChord
        const largeArc = Math.abs(sweep) > 180 ? 1 : 0
        const sweepFlag = sweep >= 0 ? 0 : 1
        pathSegments.push(`A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${end.x} ${end.y}`)
        points.push(end)
        cur = end
        i += 4
      } else {
        // Unknown command, abort
        break
      }
    } else if (typeof token === 'number') {
      // implicit continuation: pair of numbers (line-to)
      const x = numberAt(shape, i)
      const y = numberAt(shape, i + 1)
      cur = applyTransform(t, x, y)
      pathSegments.push(`L ${cur.x} ${cur.y}`)
      points.push(cur)
      i += 2
    } else {
      i += 1
    }
  }

  if (pathSegments.length <= 1) return

  if (filled) {
    pathSegments.push('Z')
    ctx.primitives.push({
      kind: 'path',
      path: pathSegments.join(' '),
      stroke: color,
      strokeWidth: strokeWidth || 0.5,
      fill: color,
      opacity: 0.45,
    })
  } else {
    ctx.primitives.push({
      kind: 'path',
      path: pathSegments.join(' '),
      stroke: color,
      strokeWidth: strokeWidth || 1,
      fill: null,
      opacity: 0.9,
    })
  }
}

// ---------- Visual builder (Schematic) ----------

export function buildEasyEdaProSchematicVisual(
  archive: ProArchive,
  schDoc: ProDocument,
  title: string,
): EasyEdaVisualDocument | null {
  const primitives: EasyEdaVisualPrimitive[] = []
  const unknownTags = new Set<string>()

  // Build symbol map: for each COMPONENT lookup associated symbol via ATTR
  const attrByComponent = new Map<string, Map<string, string>>()
  for (const rec of schDoc.records) {
    if (rec[0] === 'ATTR') {
      const compId = String(rec[2] ?? '')
      const key = String(rec[3] ?? '')
      const val = rec[4] == null ? '' : String(rec[4])
      if (!compId || !key) continue
      let m = attrByComponent.get(compId)
      if (!m) {
        m = new Map()
        attrByComponent.set(compId, m)
      }
      m.set(key, val)
    }
  }

  for (const rec of schDoc.records) {
    const tag = rec[0]
    switch (tag) {
      case 'WIRE':
      case 'BUS': {
        // ["WIRE", id, parent, layer, [x1,y1,x2,y2,...]]
        const points = rec[4]
        if (!Array.isArray(points) || points.length < 4) break
        const pts: PointXY[] = []
        for (let k = 0; k + 1 < points.length; k += 2) {
          pts.push({ x: numberAt(points, k), y: numberAt(points, k + 1) })
        }
        primitives.push({
          kind: 'polyline',
          points: pts,
          closed: false,
          stroke: tag === 'WIRE' ? '#5fc16e' : '#7d97f7',
          strokeWidth: tag === 'WIRE' ? 2 : 4,
          fill: null,
          opacity: 0.95,
        })
        break
      }
      case 'COMPONENT': {
        // ["COMPONENT", id, source, x, y, rotation, mirror, ...]
        const compId = String(rec[1] ?? '')
        const x = numberAt(rec, 3)
        const y = numberAt(rec, 4)
        const rot = numberAt(rec, 5)
        const attrs = attrByComponent.get(compId)
        const symbolId = attrs?.get('Symbol')
        if (symbolId) {
          const symbol = archive.symbols.get(symbolId)
          if (symbol) {
            renderSymbol(symbol, x, y, rot, primitives, unknownTags)
          }
        }
        break
      }
      case 'JUNCTION':
      case 'NETLABEL':
      case 'NETPORT': {
        const x = numberAt(rec, 3)
        const y = numberAt(rec, 4)
        primitives.push({
          kind: 'circle',
          cx: x,
          cy: y,
          r: 4,
          stroke: '#5fc16e',
          strokeWidth: 0,
          fill: '#5fc16e',
          opacity: 0.95,
        })
        break
      }
      case 'ATTR': {
        // ["ATTR", id, parent, key, value, ?, visibleFlag, x, y, ...]
        const value = rec[4]
        const visible = rec[6]
        const x = numberAt(rec, 7)
        const y = numberAt(rec, 8)
        if (typeof value !== 'string' || value === '') break
        if (visible !== 1 && visible !== '1') break
        if (!Number.isFinite(x) || !Number.isFinite(y)) break
        primitives.push({
          kind: 'text',
          x,
          y,
          text: value,
          size: 14,
          rotation: 0,
          fill: '#a0b6e8',
          opacity: 0.85,
          anchor: 'start',
        })
        break
      }
      default: {
        if (typeof tag === 'string') unknownTags.add(tag)
      }
    }
  }

  if (primitives.length === 0) return null

  const bounds = computeBounds(primitives)
  if (!bounds) return null

  return {
    title,
    documentKind: 'schematic',
    primitives,
    bounds,
    shapeCount: schDoc.records.length,
    unknownShapePrefixes: Array.from(unknownTags).sort(),
  }
}

function renderSymbol(
  symbol: ProDocument,
  cx: number,
  cy: number,
  rotation: number,
  primitives: EasyEdaVisualPrimitive[],
  unknownTags: Set<string>,
): void {
  const t: ComponentTransform = {
    cx,
    cy,
    rotation,
    flipY: false,
    layerSwap: false,
  }
  for (const rec of symbol.records) {
    const tag = rec[0]
    switch (tag) {
      case 'LINE':
      case 'POLY': {
        // ["LINE", id, parent, x1, y1, x2, y2, width, ...] or symbol-specific format
        const pts: PointXY[] = []
        // Try numeric points starting from index 2
        for (let i = 2; i + 1 < rec.length; i += 2) {
          const a = rec[i]
          const b = rec[i + 1]
          if (typeof a === 'number' && typeof b === 'number') {
            const p = applyTransform(t, a, b)
            pts.push(p)
          } else break
        }
        if (pts.length >= 2) {
          primitives.push({
            kind: 'polyline',
            points: pts,
            closed: tag === 'POLY',
            stroke: '#a06e2c',
            strokeWidth: 1.5,
            fill: null,
            opacity: 0.9,
          })
        }
        break
      }
      case 'RECT': {
        const x = numberAt(rec, 2)
        const y = numberAt(rec, 3)
        const w = numberAt(rec, 4)
        const h = numberAt(rec, 5)
        const a = applyTransform(t, x, y)
        const b = applyTransform(t, x + w, y + h)
        primitives.push({
          kind: 'rect',
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.abs(b.x - a.x),
          height: Math.abs(b.y - a.y),
          rx: 0,
          ry: 0,
          rotation: t.rotation,
          stroke: '#a06e2c',
          strokeWidth: 1.5,
          fill: null,
          opacity: 0.9,
        })
        break
      }
      case 'CIRCLE': {
        const x = numberAt(rec, 2)
        const y = numberAt(rec, 3)
        const r = numberAt(rec, 4)
        const p = applyTransform(t, x, y)
        primitives.push({
          kind: 'circle',
          cx: p.x,
          cy: p.y,
          r,
          stroke: '#a06e2c',
          strokeWidth: 1.5,
          fill: null,
          opacity: 0.9,
        })
        break
      }
      case 'PIN': {
        // ["PIN", id, parent, x, y, length, rotation, ...]
        const x = numberAt(rec, 3)
        const y = numberAt(rec, 4)
        const len = numberAt(rec, 5, 10)
        const pinRot = numberAt(rec, 6)
        const rad = ((pinRot + t.rotation) * Math.PI) / 180
        const a = applyTransform(t, x, y)
        const bx = a.x + len * Math.cos(rad)
        const by = a.y + len * Math.sin(rad)
        primitives.push({
          kind: 'polyline',
          points: [
            { x: a.x, y: a.y },
            { x: bx, y: by },
          ],
          closed: false,
          stroke: '#d4a23c',
          strokeWidth: 1,
          fill: null,
          opacity: 0.9,
        })
        break
      }
      default: {
        if (typeof tag === 'string') unknownTags.add(`sym:${tag}`)
      }
    }
  }
}

// ---------- Bounds ----------

function computeBounds(primitives: EasyEdaVisualPrimitive[]): EasyEdaVisualBounds | null {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  const include = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  for (const p of primitives) {
    switch (p.kind) {
      case 'polyline':
        for (const pt of p.points) include(pt.x, pt.y)
        break
      case 'circle':
        include(p.cx - p.r, p.cy - p.r)
        include(p.cx + p.r, p.cy + p.r)
        break
      case 'rect':
        include(p.x, p.y)
        include(p.x + p.width, p.y + p.height)
        break
      case 'path': {
        // Cheap parse: take all numeric pairs.
        const nums = p.path.match(/-?\d+(?:\.\d+)?/g)
        if (!nums) break
        for (let k = 0; k + 1 < nums.length; k += 2) {
          include(parseFloat(nums[k]), parseFloat(nums[k + 1]))
        }
        break
      }
      case 'text':
        include(p.x, p.y)
        include(p.x + p.text.length * p.size * 0.55, p.y + p.size)
        break
    }
  }

  if (!Number.isFinite(minX)) return null
  const padding = Math.max(2, (maxX - minX) * 0.02)
  const minXP = minX - padding
  const minYP = minY - padding
  const maxXP = maxX + padding
  const maxYP = maxY + padding
  return {
    minX: minXP,
    minY: minYP,
    maxX: maxXP,
    maxY: maxYP,
    width: Math.max(1, maxXP - minXP),
    height: Math.max(1, maxYP - minYP),
  }
}
