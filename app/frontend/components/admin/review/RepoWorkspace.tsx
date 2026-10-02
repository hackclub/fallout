import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { FileTree, useFileTree } from '@pierre/trees/react'
import { ArrowUpRightIcon, CheckIcon, ChevronRightIcon, CopyIcon, PinIcon } from 'lucide-react'
import { Button } from '@/components/admin/ui/button'
import { Kbd } from '@/components/admin/ui/kbd'
import { cn } from '@/lib/utils'
import RepoFileViewer, { type RepoFileRef } from './RepoFileViewer'
import { REPO_TREE_ICONS } from './treeIcons'
import { fileKind, fileName, isReadme, isSignalPath, KIND_LABEL } from '@/lib/repoFileKinds'
import type { RepoTreeData } from '@/types'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function encodePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/')
}

// Tracks the `.admin.dark` class toggled by useAdminDark so viewers can pick a matching theme.
function subscribeAdminDark(cb: () => void) {
  const root = document.querySelector('.admin')
  if (!root) return () => {}
  const mo = new MutationObserver(cb)
  mo.observe(root, { attributes: true, attributeFilter: ['class'] })
  return () => mo.disconnect()
}
const readAdminDark = () => document.querySelector('.admin')?.classList.contains('dark') ?? false

export default function RepoWorkspace({ data, repoLink }: { data: RepoTreeData; repoLink: string }) {
  const dark = useSyncExternalStore(subscribeAdminDark, readAdminDark, () => false)
  const repo = useMemo(() => {
    const m = repoLink.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/)
    return m ? { owner: m[1], name: m[2] } : null
  }, [repoLink])
  const branch = data.default_branch
  const blobs = useMemo(() => data.entries.filter((e) => e.type === 'blob'), [data.entries])
  const sizes = useMemo(() => new Map(blobs.map((b) => [b.path, b.size ?? null])), [blobs])
  const paths = useMemo(() => blobs.map((b) => b.path), [blobs])
  const pinnedPaths = useMemo(() => paths.filter(isSignalPath), [paths])

  const rawRoot = repo
    ? `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${encodeURIComponent(branch)}/`
    : ''
  const blobRoot = repo ? `https://github.com/${repo.owner}/${repo.name}/blob/${encodeURIComponent(branch)}/` : ''

  // Path AND bare filename → raw URL, so KiCad sub-sheet references ("Sheetfile") resolve.
  const resolver = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of paths) {
      const url = rawRoot + encodePath(p)
      map.set(p, url)
      const base = fileName(p)
      if (!map.has(base)) map.set(base, url)
    }
    return map
  }, [paths, rawRoot])

  const [pinned, setPinned] = useState(false)
  const [selected, setSelected] = useState<string | null>(
    () => paths.find((p) => isReadme(p) && !p.includes('/')) ?? null,
  )
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  const treeOptions = {
    icons: REPO_TREE_ICONS,
    initialExpansion: 1,
    search: true,
    flattenEmptyDirectories: true,
    stickyFolders: true,
    onSelectionChange: (sel: readonly string[]) => {
      const path = sel[0]
      if (path && path !== selectedRef.current && sizes.has(path)) setSelected(path)
    },
  } as const
  // Density is fixed at construction, so Pinned gets its own relaxed tree — same folder
  // hierarchy with non-signal files removed.
  const { model: allModel } = useFileTree({ ...treeOptions, paths, density: 'compact' })
  const { model: pinnedModel } = useFileTree({ ...treeOptions, paths: pinnedPaths, density: 'relaxed' })
  const model = pinned ? pinnedModel : allModel

  useEffect(() => {
    allModel.resetPaths(paths)
  }, [allModel, paths])

  useEffect(() => {
    pinnedModel.resetPaths(pinnedPaths)
  }, [pinnedModel, pinnedPaths])

  useEffect(() => {
    if (selected) model.getItem(selected)?.select()
  }, [model, selected])

  const file: RepoFileRef | null = useMemo(() => {
    if (!selected || !repo) return null
    const dir = selected.includes('/') ? selected.slice(0, selected.lastIndexOf('/') + 1) : ''
    return {
      path: selected,
      name: fileName(selected),
      size: sizes.get(selected) ?? null,
      rawUrl: rawRoot + encodePath(selected),
      blobUrl: blobRoot + encodePath(selected),
      rawBase: rawRoot + encodePath(dir),
      blobBase: blobRoot + encodePath(dir),
    }
  }, [selected, repo, rawRoot, blobRoot, sizes])

  const [copied, setCopied] = useState(false)

  // @pierre/trees paints with light-dark(), so it follows color-scheme rather than our .dark class.
  const treeStyle = {
    display: 'block',
    colorScheme: dark ? 'dark' : 'light',
    '--trees-padding-inline-override': '6px',
    '--trees-bg-override': 'transparent',
    '--trees-bg-muted-override': 'var(--muted)',
    '--trees-fg-override': 'var(--foreground)',
    '--trees-fg-muted-override': 'var(--muted-foreground)',
    '--trees-border-color-override': 'var(--border)',
    '--trees-accent-override': 'var(--foreground)',
  } as CSSProperties

  if (!repo) return <p className="p-6 text-sm text-muted-foreground">Not a GitHub repository.</p>

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-muted/40">
        <FileTree key={pinned ? 'pinned' : 'all'} model={model} style={treeStyle} className="min-h-0 flex-1" />
        <div className="flex items-center gap-2 border-t border-border px-2 py-1.5 text-[11px] text-muted-foreground">
          <span className="min-w-0 truncate">
            {pinned ? `${pinnedPaths.length} of ${paths.length}` : paths.length} files · {branch}
          </span>
          <button
            type="button"
            onClick={() => setPinned((v) => !v)}
            aria-pressed={pinned}
            title="Show only hardware files (README, CAD, PCB, Gerbers, BOM, PDFs)"
            className={cn(
              'ml-auto inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium transition-colors',
              pinned
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-background hover:bg-accent',
            )}
          >
            <PinIcon className="size-3" />
            Pinned
            <Kbd
              variant={pinned ? undefined : 'muted'}
              className={cn('ml-0.5', pinned && 'border-background/40 bg-transparent text-background')}
            >
              P
            </Kbd>
          </button>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-xs">
          {file ? (
            <>
              <nav className="flex min-w-0 items-center gap-0.5 text-muted-foreground">
                {file.path.split('/').map((seg, i, arr) => (
                  <span key={i} className="flex items-center gap-0.5">
                    {i > 0 && <ChevronRightIcon className="size-3" />}
                    <span className={i === arr.length - 1 ? 'truncate font-medium text-foreground' : 'truncate'}>
                      {seg}
                    </span>
                  </span>
                ))}
              </nav>
              <span className="ml-auto shrink-0 text-muted-foreground">
                {KIND_LABEL[fileKind(file.path)]}
                {file.size != null && ` · ${formatFileSize(file.size)}`}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                title="Copy raw URL"
                onClick={() => {
                  navigator.clipboard.writeText(file.rawUrl)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1200)
                }}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </Button>
              <Button variant="raised" size="xs" asChild>
                <a href={file.blobUrl} target="_blank" rel="noopener noreferrer">
                  GitHub <ArrowUpRightIcon data-icon="inline-end" />
                </a>
              </Button>
            </>
          ) : (
            <span className="text-muted-foreground">
              {repo.owner}/{repo.name}
            </span>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-auto bg-background">
          <RepoFileViewer file={file} ctx={{ resolver, dark }} />
        </div>
      </section>
    </div>
  )
}
