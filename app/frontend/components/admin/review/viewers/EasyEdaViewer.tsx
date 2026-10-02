import { useEffect, useMemo, useState } from 'react'
import { fetchRepoBuffer } from '@/lib/repoFetch'
import { fileExt } from '@/lib/repoFileKinds'
import { cn } from '@/lib/utils'
import { ViewerSpinner } from './ModelViewer'
import EasyEdaCanvasView from './easyeda/EasyEdaCanvasView'
import {
  analyzeEasyEdaJson,
  extractPrimaryEasyEdaArchiveJsonDocument,
  inspectEasyEdaArchive,
  tryParseJsonContent,
  type EasyEdaArchiveInspection,
  type EasyEdaDocumentKind,
} from './easyeda/easyeda'
import { buildEasyEdaVisualDocument, type EasyEdaVisualDocument } from './easyeda/easyedaVisual'
import {
  buildEasyEdaProPcbVisual,
  buildEasyEdaProSchematicVisual,
  extractEasyEdaProArchive,
  parseProDocument,
  type ProArchive,
} from './easyeda/easyedaPro'

interface Sheet {
  id: string
  label: string
  kind: EasyEdaDocumentKind
  build: () => EasyEdaVisualDocument | null
}

type Result =
  | { mode: 'sheets'; sheets: Sheet[]; defaultIndex: number }
  | { mode: 'json'; kind: EasyEdaDocumentKind; visual: EasyEdaVisualDocument | null; preview: string }
  | { mode: 'archive'; inspection: EasyEdaArchiveInspection }

const PREVIEW_LIMIT = 18_000

function emptyArchive(): ProArchive {
  return { projectInfo: null, pcbs: new Map(), schematicSheets: new Map(), footprints: new Map(), symbols: new Map() }
}

function sheetsFromArchive(archive: ProArchive): Sheet[] {
  const sheets: Sheet[] = []
  for (const [id, doc] of archive.pcbs) {
    const label = archive.projectInfo?.pcbs.find((p) => p.uuid === id)?.name ?? id
    sheets.push({
      id: `pcb:${id}`,
      label: `PCB · ${label}`,
      kind: 'pcb',
      build: () => buildEasyEdaProPcbVisual(archive, doc, label),
    })
  }
  const ordered: string[] = []
  for (const sch of archive.projectInfo?.schematics ?? []) {
    for (const sheet of sch.sheets) {
      const key = `${sch.uuid}/${sheet.id}`
      if (archive.schematicSheets.has(key)) ordered.push(key)
    }
  }
  for (const key of archive.schematicSheets.keys()) if (!ordered.includes(key)) ordered.push(key)
  for (const key of ordered) {
    const doc = archive.schematicSheets.get(key)!
    const [schUuid, sheetId] = key.split('/')
    const sch = archive.projectInfo?.schematics.find((s) => s.uuid === schUuid)
    const name = sch?.sheets.find((s) => String(s.id) === sheetId || s.uuid === sheetId)?.name ?? key
    sheets.push({
      id: `sch:${key}`,
      label: `Schematic · ${name}`,
      kind: 'schematic',
      build: () => buildEasyEdaProSchematicVisual(archive, doc, name),
    })
  }
  return sheets
}

function jsonResult(value: unknown, name: string, text?: string): Result {
  const inspection = analyzeEasyEdaJson(value, name)
  const source = text ?? JSON.stringify(value, null, 2)
  const preview = source.length > PREVIEW_LIMIT ? `${source.slice(0, PREVIEW_LIMIT)}\n…` : source
  return {
    mode: 'json',
    kind: inspection.documentKind,
    visual: buildEasyEdaVisualDocument(value, name, inspection.documentKind),
    preview,
  }
}

async function read(url: string, name: string): Promise<Result> {
  const content = await fetchRepoBuffer(url)
  const ext = fileExt(name)

  if (ext === 'epro' || ext === 'eproproject') {
    try {
      const sheets = sheetsFromArchive(await extractEasyEdaProArchive(content))
      if (sheets.length > 0)
        return {
          mode: 'sheets',
          sheets,
          defaultIndex: Math.max(
            0,
            sheets.findIndex((s) => s.kind === 'pcb'),
          ),
        }
    } catch {
      // Not a Pro archive — fall through to the legacy JSON paths
    }
  }

  const parsed = tryParseJsonContent(content)
  if (ext === 'esch' || ext === 'epcb') {
    if (!parsed) {
      const doc = parseProDocument(new TextDecoder().decode(content))
      if (!doc) throw new Error('Not a readable EasyEDA Pro document')
      const archive = emptyArchive()
      const isPcb = ext === 'epcb' || /^pcb$/i.test(doc.docType)
      const sheet: Sheet = isPcb
        ? { id: 'pcb', label: name, kind: 'pcb', build: () => buildEasyEdaProPcbVisual(archive, doc, name) }
        : { id: 'sch', label: name, kind: 'schematic', build: () => buildEasyEdaProSchematicVisual(archive, doc, name) }
      return { mode: 'sheets', sheets: [sheet], defaultIndex: 0 }
    }
    return jsonResult(parsed.value, name, parsed.text)
  }
  if (parsed) return jsonResult(parsed.value, name, parsed.text)

  const doc = await extractPrimaryEasyEdaArchiveJsonDocument(content)
  if (doc) return jsonResult(doc.value, doc.name, doc.text)
  return { mode: 'archive', inspection: await inspectEasyEdaArchive(content) }
}

export default function EasyEdaViewer({ url, name }: { url: string; name: string }) {
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setResult(null)
    setError(null)
    read(url, name).then(
      (r) => !cancelled && setResult(r),
      (e: Error) => !cancelled && setError(e.message),
    )
    return () => {
      cancelled = true
    }
  }, [url, name])

  if (error) return <p className="p-6 text-sm text-muted-foreground">Couldn't read this EasyEDA file ({error}).</p>
  if (!result) return <ViewerSpinner label="Reading EasyEDA project…" />
  if (result.mode === 'sheets') return <SheetsView sheets={result.sheets} defaultIndex={result.defaultIndex} />
  if (result.mode === 'json') {
    if (result.visual) return <EasyEdaCanvasView document={result.visual} />
    return (
      <div className="p-4 text-xs">
        <p className="mb-2 text-muted-foreground">
          {result.kind === 'unknown'
            ? 'No EasyEDA drawing found in this JSON.'
            : `EasyEDA ${result.kind} without renderable shapes.`}
        </p>
        <pre className="overflow-auto rounded-md bg-muted p-3 font-mono">{result.preview}</pre>
      </div>
    )
  }
  const entries = result.inspection.entries
  return (
    <div className="p-4 text-xs">
      <p className="mb-2 text-muted-foreground">
        Archive with {entries.length} entries · {entries.filter((e) => e.isEasyEdaJson).length} EasyEDA documents
        detected
      </p>
      <ul className="divide-y divide-border rounded-md border border-border">
        {entries.slice(0, 140).map((e, i) => (
          <li key={`${e.name}-${i}`} className="flex gap-3 px-2 py-1">
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            <span className="text-muted-foreground">{e.easyEdaDocumentKind ?? (e.isEasyEdaJson ? 'json' : '')}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SheetsView({ sheets, defaultIndex }: { sheets: Sheet[]; defaultIndex: number }) {
  const [index, setIndex] = useState(defaultIndex)
  const sheet = sheets[index] ?? sheets[0]
  const document = useMemo(() => sheet.build(), [sheet])
  return (
    <div className="flex h-full min-h-0 flex-col">
      {sheets.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-border p-2">
          {sheets.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                'rounded-md border px-2 py-0.5 text-xs',
                i === index ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-muted',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      {document ? (
        <EasyEdaCanvasView document={document} />
      ) : (
        <p className="p-6 text-sm text-muted-foreground">
          This sheet uses primitives the renderer doesn't support yet.
        </p>
      )}
    </div>
  )
}
