import { useEffect, useRef, useState } from 'react'
import { fetchRepoText } from '@/lib/repoFetch'
import { ViewerSpinner } from './ModelViewer'

// KiCanvas (MIT, Alethea Flowers) is vendored at public/vendor/kicanvas/kicanvas.js so nothing
// loads from a third-party origin at review time.
const KICANVAS_SRC = '/vendor/kicanvas/kicanvas.js'
let kicanvasLoad: Promise<void> | null = null

function loadKiCanvas() {
  if (customElements.get('kicanvas-embed')) return Promise.resolve()
  if (!kicanvasLoad) {
    kicanvasLoad = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.type = 'module'
      script.src = KICANVAS_SRC
      script.onload = () => customElements.whenDefined('kicanvas-embed').then(() => resolve())
      script.onerror = () => {
        kicanvasLoad = null
        reject(new Error('Failed to load KiCanvas'))
      }
      document.head.appendChild(script)
    })
  }
  return kicanvasLoad
}

function sheetfiles(sch: string): string[] {
  return [...sch.matchAll(/\(property\s+"Sheetfile"\s+"([^"]+)"/g)].map((m) => m[1])
}

// Pulls the selected file plus every sub-sheet it references (BFS) and any .kicad_pro beside it,
// then hands KiCanvas the sources inline — raw.githubusercontent.com has no directory listing for
// it to resolve neighbours itself.
async function collectSources(path: string, resolver: Map<string, string>): Promise<Map<string, string>> {
  const rootUrl = resolver.get(path)
  if (!rootUrl) throw new Error('File not found in repository tree')
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
  const base = path.slice(dir.length)
  const rootText = await fetchRepoText(rootUrl)

  const sources = new Map<string, string>([
    [path, rootText],
    [base, rootText],
  ])
  let pending = new Set(sheetfiles(rootText))
  const seen = new Set(pending)
  while (pending.size > 0) {
    const level = [...pending]
    pending = new Set()
    await Promise.all(
      level.map(async (name) => {
        const url = resolver.get(dir + name) ?? resolver.get(name)
        if (!url) return
        try {
          const text = await fetchRepoText(url)
          sources.set(dir + name, text)
          sources.set(name, text)
          for (const sf of sheetfiles(text)) {
            if (!seen.has(sf)) {
              seen.add(sf)
              pending.add(sf)
            }
          }
        } catch {
          // Missing sub-sheet — KiCanvas shows what it has
        }
      }),
    )
  }

  // Siblings: the .kicad_pro next to a schematic/board, or — when the project file itself was
  // picked — every schematic and board in its directory, so KiCanvas has a root to open.
  const wantSiblings = path.endsWith('.kicad_pro') ? /\.kicad_(sch|pcb)$/ : /\.kicad_pro$/
  await Promise.all(
    [...resolver].map(async ([key, url]) => {
      if (!key.includes('/') && !!dir) return // bare-filename alias, not a repo path
      if (!wantSiblings.test(key) || sources.has(key)) return
      const inDir = dir ? key.startsWith(dir) && !key.slice(dir.length).includes('/') : !key.includes('/')
      if (!inDir) return
      try {
        const text = await fetchRepoText(url)
        sources.set(key, text)
        sources.set(key.slice(dir.length), text)
      } catch {
        // Optional sibling
      }
    }),
  )
  return sources
}

export default function KiCadViewer({
  path,
  resolver,
  dark,
}: {
  path: string
  resolver: Map<string, string>
  dark: boolean
}) {
  // React never renders into mountRef — the embed is appended imperatively so re-renders can't
  // recreate it and reset the open sheet.
  const mountRef = useRef<HTMLDivElement>(null)
  const resolverRef = useRef(resolver)
  resolverRef.current = resolver
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let embed: HTMLElement | null = null
    setState('loading')
    setError(null)

    Promise.all([loadKiCanvas(), collectSources(path, resolverRef.current)])
      .then(([, sources]) => {
        if (cancelled || !mountRef.current) return
        embed = document.createElement('kicanvas-embed')
        embed.setAttribute('controls', 'full')
        embed.setAttribute('controlslist', 'nooverlay')
        embed.setAttribute('theme', dark ? 'kicad' : 'witchhazel')
        embed.style.cssText = 'display:block;width:100%;height:100%'
        for (const [name, text] of sources) {
          const source = document.createElement('kicanvas-source')
          source.setAttribute('name', name)
          source.textContent = text
          embed.appendChild(source)
        }
        mountRef.current.replaceChildren(embed)
        setState('ready')
      })
      .catch((e: Error) => {
        if (cancelled) return
        setError(e.message)
        setState('error')
      })

    return () => {
      cancelled = true
      embed?.remove()
    }
  }, [path, dark])

  if (state === 'error')
    return <p className="p-6 text-sm text-muted-foreground">Couldn't open this KiCad file ({error}).</p>
  return (
    <div className="relative h-full">
      {state === 'loading' && (
        <div className="absolute inset-0 z-10 bg-background">
          <ViewerSpinner label="Loading KiCanvas…" />
        </div>
      )}
      <div ref={mountRef} className="h-full" />
    </div>
  )
}
