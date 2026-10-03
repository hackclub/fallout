import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import hljs from 'highlight.js/lib/common'
import 'highlight.js/styles/github.css'
import { ArrowUpRightIcon, FileIcon } from 'lucide-react'
import { Button } from '@/components/admin/ui/button'
import { fetchRepoText, isLfsPointer, looksBinary } from '@/lib/repoFetch'
import { codeLanguage, fileKind, KIND_LABEL, type RepoFileKind } from '@/lib/repoFileKinds'
import { ViewerSpinner } from './viewers/ModelViewer'

const ModelViewer = lazy(() => import('./viewers/ModelViewer'))
const StepViewer = lazy(() => import('./viewers/StepViewer'))
const PdfViewer = lazy(() => import('./viewers/PdfViewer'))
const KiCadViewer = lazy(() => import('./viewers/KiCadViewer'))
const GerberViewer = lazy(() => import('./viewers/GerberViewer'))
const EasyEdaViewer = lazy(() => import('./viewers/EasyEdaViewer'))

const MAX_TEXT_BYTES = 1_500_000
// READMEs are untrusted student HTML rendered inside the admin origin. rehype-raw is needed for
// GitHub-style <img width>/<picture>, so it MUST be followed by this allowlist (GitHub's own schema):
// a blocklist misses vectors like inline style overlays or <svg><animate attributeName=href>.
const MARKDOWN_SANITIZE_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img ?? []), 'height', 'align'],
    source: [...(defaultSchema.attributes?.source ?? []), 'media'],
  },
}

export interface RepoFileRef {
  path: string
  name: string
  size: number | null
  rawUrl: string
  blobUrl: string
  rawBase: string // raw URL of the file's directory, for resolving relative markdown links
  blobBase: string
}

export interface RepoContext {
  resolver: Map<string, string> // repo path AND bare filename → raw URL, for cross-file references
  dark: boolean
}

export default function RepoFileViewer({ file, ctx }: { file: RepoFileRef | null; ctx: RepoContext }) {
  if (!file) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <FileIcon className="size-6" />
        <p className="text-sm">Pick a file to preview it here</p>
      </div>
    )
  }
  const kind = fileKind(file.path)
  // Only text-ish kinds get fetched into memory, so only they have a size ceiling.
  const tooBig = (kind === 'markdown' || kind === 'code' || kind === 'csv') && (file.size ?? 0) > MAX_TEXT_BYTES
  if (tooBig) return <Fallback file={file} kind={kind} reason="This file is too large to preview inline." />

  switch (kind) {
    case 'markdown':
      return <MarkdownView file={file} />
    case 'code':
      return <CodeView file={file} />
    case 'csv':
      return <CsvView file={file} dark={ctx.dark} />
    case 'image':
      return <ImageView file={file} />
    case 'pdf':
      return <Lazy children={<PdfViewer url={file.rawUrl} />} />
    case 'model':
      return <Lazy children={<ModelViewer url={file.rawUrl} path={file.path} dark={ctx.dark} />} />
    case 'step':
      return <Lazy children={<StepViewer url={file.rawUrl} dark={ctx.dark} />} />
    case 'kicad':
      return <Lazy children={<KiCadViewer path={file.path} resolver={ctx.resolver} dark={ctx.dark} />} />
    case 'gerber':
    case 'gerber_zip':
      return <Lazy children={<GerberViewer url={file.rawUrl} name={file.name} zip={kind === 'gerber_zip'} />} />
    case 'easyeda':
      return <Lazy children={<EasyEdaViewer url={file.rawUrl} name={file.name} />} />
    default:
      return <Fallback file={file} kind={kind} />
  }
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<ViewerSpinner />}>{children}</Suspense>
}

function Fallback({ file, kind, reason }: { file: RepoFileRef; kind: RepoFileKind; reason?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <FileIcon className="size-7 text-muted-foreground" />
      <div>
        <p className="font-medium">{file.name}</p>
        <p className="text-sm text-muted-foreground">
          {reason ?? `No inline preview for ${KIND_LABEL[kind].toLowerCase()} files.`}
        </p>
      </div>
      <Button variant="raised" size="sm" asChild>
        <a href={file.blobUrl} target="_blank" rel="noopener noreferrer">
          View on GitHub <ArrowUpRightIcon data-icon="inline-end" />
        </a>
      </Button>
    </div>
  )
}

function useText(url: string) {
  const [state, setState] = useState<{ url: string; text: string | null; error: string | null }>({
    url,
    text: null,
    error: null,
  })
  useEffect(() => {
    let cancelled = false
    fetchRepoText(url).then(
      (text) => !cancelled && setState({ url, text, error: null }),
      (e: Error) => !cancelled && setState({ url, text: null, error: e.message }),
    )
    return () => {
      cancelled = true
    }
  }, [url])
  return state.url === url ? state : { url, text: null, error: null }
}

function TextState({ error }: { error: string | null }) {
  if (error) return <p className="p-6 text-sm text-muted-foreground">Couldn't load this file ({error}).</p>
  return <ViewerSpinner />
}

function MarkdownView({ file }: { file: RepoFileRef }) {
  const { text, error } = useText(file.rawUrl)
  if (text == null) return <TextState error={error} />
  // Relative links/images resolve against the file's directory; defaultUrlTransform then drops
  // javascript:/data: and other unsafe schemes exactly like react-markdown would on its own.
  const resolve = (url: string, key: string) => {
    const base = key === 'src' ? file.rawBase : file.blobBase
    let absolute = url
    if (!/^([a-z][a-z0-9+.-]*:|#)/i.test(url)) {
      try {
        absolute = new URL(url, base).toString()
      } catch {
        absolute = url
      }
    }
    return defaultUrlTransform(absolute)
  }
  return (
    <div className="markdown-content max-w-3xl p-6 text-sm">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA]]}
        urlTransform={resolve}
      >
        {text}
      </Markdown>
    </div>
  )
}

const EASYEDA_JSON_SIGNATURE = /"docType"\s*:|"head"\s*:\s*\{|"shape"\s*:\s*\[/

function CodeView({ file }: { file: RepoFileRef }) {
  const { text, error } = useText(file.rawUrl)
  const lang = codeLanguage(file.path)
  const html = useMemo(() => {
    if (text == null || looksBinary(text)) return null
    try {
      const out = lang && hljs.getLanguage(lang) ? hljs.highlight(text, { language: lang }) : hljs.highlightAuto(text)
      return out.value
    } catch {
      return null
    }
  }, [text, lang])

  if (text == null) return <TextState error={error} />
  if (isLfsPointer(text))
    return (
      <p className="p-6 text-sm text-muted-foreground">
        This file is stored in Git LFS — the raw URL only has the pointer.
      </p>
    )
  if (html == null) return <p className="p-6 text-sm text-muted-foreground">This looks like a binary file.</p>
  // EasyEDA (classic) exports are plain .json — route them to the schematic/PCB renderer.
  if (lang === 'json' && EASYEDA_JSON_SIGNATURE.test(text.slice(0, 4000)))
    return <Lazy children={<EasyEdaViewer url={file.rawUrl} name={file.name} />} />

  const lines = html.split('\n')
  return (
    <div className="repo-code hljs min-h-full text-[12.5px] leading-5">
      <table className="w-full border-collapse font-mono">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i}>
              <td className="w-px select-none pr-3 pl-4 text-right align-top text-muted-foreground tabular-nums">
                {i + 1}
              </td>
              <td className="whitespace-pre pr-4 align-top" dangerouslySetInnerHTML={{ __html: line || '\n' }} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const CsvGrid = lazy(() => import('./viewers/CsvGrid'))

function CsvView({ file, dark }: { file: RepoFileRef; dark: boolean }) {
  const { text, error } = useText(file.rawUrl)
  if (text == null) return <TextState error={error} />
  return <Lazy children={<CsvGrid text={text} delimiter={file.path.endsWith('.tsv') ? '\t' : ','} dark={dark} />} />
}

function ImageView({ file }: { file: RepoFileRef }) {
  return (
    <div className="repo-checker flex h-full items-center justify-center p-6">
      <img src={file.rawUrl} alt={file.path} className="max-h-full max-w-full rounded-md object-contain shadow-sm" />
    </div>
  )
}
