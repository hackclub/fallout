import { useCallback, useMemo, useState } from 'react'
import {
  DataEditor,
  GridCellKind,
  GridColumnIcon,
  type GridCell,
  type GridColumn,
  type GridMouseEventArgs,
  type Item,
  type Theme,
} from '@glideapps/glide-data-grid'
import '@glideapps/glide-data-grid/dist/index.css'

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === delimiter) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''))
}

// Glide blends theme colours with its own parser, which doesn't understand the oklch() values in
// our CSS variables — so resolve each one to hex through a 1×1 canvas first.
let probe: CanvasRenderingContext2D | null = null
function cssToHex(value: string, fallback: string): string {
  probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!probe || !value) return fallback
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = '#000'
  probe.fillStyle = value
  probe.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
  if (a === 0) return fallback
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

// Sheets/Airtable look: white cells, hairline borders, quiet grey header, blue selection.
function sheetTheme(dark: boolean): Partial<Theme> {
  const css = getComputedStyle(document.querySelector('.admin') ?? document.documentElement)
  const v = (name: string, fallback: string) => cssToHex(css.getPropertyValue(name).trim(), fallback)
  const bg = v('--background', dark ? '#0a0a0a' : '#ffffff')
  const header = dark ? '#1f1f22' : '#f8f9fa'
  const fg = v('--foreground', dark ? '#fafafa' : '#1f1f1f')
  const fgMuted = v('--muted-foreground', dark ? '#9a9a9a' : '#5f6368')
  const border = dark ? '#2e2e33' : '#e3e3e3'
  const accent = dark ? '#8ab4f8' : '#1a73e8'
  const accentWash = dark ? '#1c2a44' : '#e8f0fe'
  return {
    bgCell: bg,
    bgCellMedium: header,
    bgHeader: header,
    bgHeaderHasFocus: accentWash,
    bgHeaderHovered: dark ? '#2a2a2e' : '#f1f3f4',
    bgBubble: header,
    bgBubbleSelected: accentWash,
    textDark: fg,
    textMedium: fgMuted,
    textLight: fgMuted,
    textBubble: fg,
    textHeader: fgMuted,
    textHeaderSelected: accent,
    textGroupHeader: fgMuted,
    borderColor: border,
    horizontalBorderColor: border,
    drilldownBorder: border,
    accentColor: accent,
    accentLight: accentWash,
    accentFg: '#ffffff',
    bgSearchResult: dark ? '#4a3a12' : '#fff3c4',
    linkColor: accent,
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    baseFontStyle: '13px',
    headerFontStyle: '600 12px',
    editorFontSize: '13px',
    cellHorizontalPadding: 10,
    cellVerticalPadding: 4,
    lineHeight: 1.4,
    headerIconSize: 16,
    roundingRadius: 4,
    bgIconHeader: fgMuted,
    fgIconHeader: bg,
  }
}

type ColumnType = 'number' | 'url' | 'text'
const NUMBER_RE = /^\s*[-+]?[$€£¥]?\s*(\d{1,3}(,\d{3})*|\d+)?(\.\d+)?\s*%?\s*$/
const URL_RE = /^(https?:\/\/|www\.)\S+$/i

function inferType(values: string[]): ColumnType {
  const sample = values.filter((v) => v.trim() !== '').slice(0, 200)
  if (sample.length === 0) return 'text'
  if (sample.every((v) => URL_RE.test(v.trim()))) return 'url'
  if (sample.every((v) => NUMBER_RE.test(v) && /\d/.test(v))) return 'number'
  return 'text'
}

const TYPE_ICON: Record<ColumnType, GridColumnIcon> = {
  number: GridColumnIcon.HeaderNumber,
  url: GridColumnIcon.HeaderUri,
  text: GridColumnIcon.HeaderString,
}

export default function CsvGrid({ text, delimiter, dark }: { text: string; delimiter: string; dark: boolean }) {
  const rows = useMemo(() => parseDelimited(text, delimiter), [text, delimiter])
  const [head, ...body] = rows
  const types = useMemo(() => (head ?? []).map((_, i) => inferType(body.map((r) => r[i] ?? ''))), [head, body])

  const [widths, setWidths] = useState<Record<number, number>>({})
  const columns: GridColumn[] = useMemo(
    () =>
      (head ?? []).map((title, i) => {
        const longest = Math.max(title.length, ...body.slice(0, 200).map((r) => (r[i] ?? '').length))
        return {
          id: String(i),
          title: title || `Column ${i + 1}`,
          icon: TYPE_ICON[types[i]],
          width: widths[i] ?? Math.min(types[i] === 'url' ? 320 : 420, Math.max(90, longest * 7.2 + 44)),
        }
      }),
    [head, body, types, widths],
  )
  const theme = useMemo(() => sheetTheme(dark), [dark])
  const [hoverRow, setHoverRow] = useState<number | undefined>()

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const data = body[row]?.[col] ?? ''
      switch (types[col]) {
        case 'url':
          return {
            kind: GridCellKind.Uri,
            data,
            displayData: data,
            allowOverlay: true,
            readonly: true,
            hoverEffect: true,
          }
        case 'number':
          return {
            kind: GridCellKind.Text,
            data,
            displayData: data.trim(),
            allowOverlay: true,
            readonly: true,
            contentAlign: 'right',
          }
        default:
          return {
            kind: GridCellKind.Text,
            data,
            displayData: data,
            allowOverlay: true,
            readonly: true,
            allowWrapping: true,
          }
      }
    },
    [body, types],
  )

  const onItemHovered = useCallback((args: GridMouseEventArgs) => {
    setHoverRow(args.kind === 'cell' ? args.location[1] : undefined)
  }, [])
  const getRowThemeOverride = useCallback(
    (row: number): Partial<Theme> | undefined => (row === hoverRow ? { bgCell: theme.bgHeaderHovered } : undefined),
    [hoverRow, theme.bgHeaderHovered],
  )

  if (!head) return <p className="p-6 text-sm text-muted-foreground">This file is empty.</p>

  return (
    <div className="h-full w-full">
      {/* Glide mounts its cell overlay (expanded long text) into #portal */}
      <div id="portal" className="fixed top-0 left-0 z-50" />
      <DataEditor
        columns={columns}
        rows={body.length}
        getCellContent={getCellContent}
        theme={theme}
        width="100%"
        height="100%"
        rowMarkers={{ kind: 'number', width: 44 }}
        rowHeight={32}
        headerHeight={34}
        verticalBorder
        smoothScrollX
        smoothScrollY
        getCellsForSelection
        rangeSelect="rect"
        columnSelect="single"
        rowSelect="single"
        drawFocusRing
        keybindings={{ search: true, selectAll: true, copy: true }}
        onColumnResize={(_, width, index) => setWidths((w) => ({ ...w, [index]: width }))}
        onItemHovered={onItemHovered}
        getRowThemeOverride={getRowThemeOverride}
        onCellActivated={([col, row]) => {
          if (types[col] !== 'url') return
          const raw = (body[row]?.[col] ?? '').trim()
          const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
          window.open(href, '_blank', 'noopener,noreferrer')
        }}
      />
    </div>
  )
}
