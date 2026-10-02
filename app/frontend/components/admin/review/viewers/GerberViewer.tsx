import { useEffect, useMemo, useState } from 'react'
import { createParser } from '@tracespace/parser'
import { plot } from '@tracespace/plotter'
import { render } from '@tracespace/renderer'
import { toHtml } from 'hast-util-to-html'
import whatsThatGerber, { type GerberLayerInfo } from 'whats-that-gerber'
import { fetchRepoBuffer } from '@/lib/repoFetch'
import { listZipEntries } from '@/lib/unzip'
import { Button } from '@/components/admin/ui/button'
import { cn } from '@/lib/utils'
import { ViewerSpinner } from './ModelViewer'

const GERBER_RE = /\.(gbr|ger|gtl|gbl|gts|gbs|gto|gbo|gtp|gbp|gm1|gm2|gko|drl|xln)$/i

type Tone = 'copper' | 'mask' | 'silkscreen' | 'paste' | 'drill' | 'outline' | 'other'
const TONE_COLOR: Record<Tone, string> = {
  copper: '#f0a030',
  mask: '#2fbf71',
  silkscreen: '#f4f4f5',
  paste: '#a6c8ff',
  drill: '#67e8f9',
  outline: '#fde047',
  other: '#a1a1aa',
}
// Bottom-to-top paint order so copper reads under silkscreen and drills punch through.
const TONE_ORDER: Tone[] = ['outline', 'copper', 'mask', 'paste', 'silkscreen', 'drill', 'other']

interface Layer {
  name: string
  svg: string
  tone: Tone
  label: string
  visible: boolean
}

function toneFor(info: GerberLayerInfo | undefined, name: string): Tone {
  const type = (info?.type ?? '').toLowerCase()
  if (type in TONE_COLOR) return type as Tone
  const lower = name.toLowerCase()
  if (/edge|outline|cuts|gko|gm1/.test(lower)) return 'outline'
  if (/\.(drl|xln)$/.test(lower)) return 'drill'
  return 'other'
}

function labelFor(info: GerberLayerInfo | undefined, name: string): string {
  if (!info?.type && !info?.side) return name
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  return [info.side && cap(info.side), info.type && cap(info.type)].filter(Boolean).join(' ')
}

type ViewBox = [number, number, number, number]

function parseViewBox(svg: string): ViewBox | null {
  const m = svg.match(/\bviewBox="([^"]+)"/i)
  const parts = m?.[1].trim().split(/\s+/).map(Number)
  return parts && parts.length === 4 && parts.every(Number.isFinite) ? (parts as ViewBox) : null
}

function renderSvg(text: string): string {
  const parser = createParser()
  parser.feed(text)
  // tracespace v5 alpha ships loose typings between packages; the trees are compatible at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const image = plot(parser.results() as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return toHtml(render(image) as any, { space: 'svg' })
}

function normalize(svg: string, color: string, box: ViewBox | null): string {
  let out = svg.replace(/<rect\b[^>]*\bfill="black"[^>]*>\s*<\/rect>/gi, '')
  if (box) out = out.replace(/\bviewBox="[^"]*"/i, `viewBox="${box.join(' ')}"`)
  out = out.replace(/\bwidth="[^"]*"/i, 'width="100%"').replace(/\bheight="[^"]*"/i, 'height="100%"')
  if (!/preserveAspectRatio=/i.test(out)) out = out.replace(/<svg\b/i, '<svg preserveAspectRatio="xMidYMid meet"')
  return out.replace(/\b(fill|stroke)="(black|currentColor)"/gi, `$1="${color}"`)
}

async function loadLayers(url: string, name: string, zip: boolean): Promise<Layer[]> {
  const buffer = await fetchRepoBuffer(url)
  const files: { name: string; text: string }[] = []
  if (zip) {
    for (const entry of listZipEntries(buffer)) {
      if (!GERBER_RE.test(entry.name)) continue
      files.push({ name: entry.name.split('/').pop()!, text: new TextDecoder().decode(await entry.read()) })
    }
    if (files.length === 0) throw new Error('No Gerber files found in this archive')
  } else {
    files.push({ name, text: new TextDecoder().decode(buffer) })
  }

  const info = whatsThatGerber(files.map((f) => f.name))
  const rendered: { name: string; svg: string; tone: Tone; label: string }[] = []
  for (const f of files) {
    try {
      rendered.push({
        name: f.name,
        svg: renderSvg(f.text),
        tone: toneFor(info[f.name], f.name),
        label: labelFor(info[f.name], f.name),
      })
    } catch {
      // Unparseable layer (e.g. a job file) — skip rather than fail the whole board
    }
  }
  if (rendered.length === 0) throw new Error('None of the Gerber layers could be parsed')

  const boxes = rendered.map((l) => parseViewBox(l.svg)).filter((b): b is ViewBox => !!b)
  const merged: ViewBox | null = boxes.length
    ? (() => {
        const minX = Math.min(...boxes.map((b) => b[0]))
        const minY = Math.min(...boxes.map((b) => b[1]))
        const maxX = Math.max(...boxes.map((b) => b[0] + b[2]))
        const maxY = Math.max(...boxes.map((b) => b[1] + b[3]))
        return [minX, minY, maxX - minX, maxY - minY]
      })()
    : null

  return rendered
    .sort((a, b) => TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone) || a.name.localeCompare(b.name))
    .map((l) => ({ ...l, svg: normalize(l.svg, TONE_COLOR[l.tone], merged), visible: true }))
}

export default function GerberViewer({ url, name, zip }: { url: string; name: string; zip: boolean }) {
  const [layers, setLayers] = useState<Layer[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLayers(null)
    setError(null)
    loadLayers(url, name, zip).then(
      (l) => !cancelled && setLayers(l),
      (e: Error) => !cancelled && setError(e.message),
    )
    return () => {
      cancelled = true
    }
  }, [url, name, zip])

  const visible = useMemo(() => layers?.filter((l) => l.visible) ?? [], [layers])
  const toggle = (i: number) =>
    setLayers((prev) => prev && prev.map((l, j) => (j === i ? { ...l, visible: !l.visible } : l)))
  const setAll = (on: boolean) => setLayers((prev) => prev && prev.map((l) => ({ ...l, visible: on })))

  if (error) return <p className="p-6 text-sm text-muted-foreground">Couldn't render these Gerbers ({error}).</p>
  if (!layers) return <ViewerSpinner label={zip ? 'Unpacking and plotting layers…' : 'Plotting layer…'} />

  return (
    <div className="flex h-full min-h-0">
      {layers.length > 1 && (
        <aside className="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-2 text-xs">
          <div className="flex gap-1 pb-1">
            <Button variant="ghost" size="xs" onClick={() => setAll(true)}>
              All
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setAll(false)}>
              None
            </Button>
            <span className="ml-auto self-center text-muted-foreground">
              {visible.length}/{layers.length}
            </span>
          </div>
          {layers.map((l, i) => (
            <button
              key={l.name}
              type="button"
              onClick={() => toggle(i)}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted',
                !l.visible && 'opacity-40',
              )}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: TONE_COLOR[l.tone] }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{l.label}</span>
                <span className="block truncate text-muted-foreground">{l.name}</span>
              </span>
            </button>
          ))}
        </aside>
      )}
      <div className="repo-gerber-board relative min-w-0 flex-1 overflow-hidden">
        {visible.map((l) => (
          <div
            key={l.name}
            className={cn('absolute inset-0 p-4', l.tone === 'mask' && 'mix-blend-screen opacity-60')}
            dangerouslySetInnerHTML={{ __html: l.svg }}
          />
        ))}
        {visible.length === 0 && (
          <p className="absolute inset-0 grid place-items-center text-sm text-zinc-400">No layers selected</p>
        )}
      </div>
    </div>
  )
}
