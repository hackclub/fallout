import { useState, useMemo, useRef, useEffect } from 'react'
import { FolderIcon, FileIcon, ChevronRightIcon, ChevronDownIcon, RefreshCwIcon } from 'lucide-react'
import type { RepoTreeEntry, RepoTreeData } from '@/types'
import FilePreviewPanel from '@/components/admin/FilePreviewPanel'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface TreeNode {
  name: string
  path: string
  type: 'blob' | 'tree'
  size?: number | null
  children: TreeNode[]
}

function buildTree(entries: RepoTreeEntry[]): TreeNode[] {
  const root: TreeNode[] = []
  const dirs = new Map<string, TreeNode>()

  for (const entry of entries) {
    const parts = entry.path.split('/')
    const name = parts[parts.length - 1]
    const node: TreeNode = { name, path: entry.path, type: entry.type, size: entry.size, children: [] }

    if (parts.length === 1) {
      root.push(node)
    } else {
      const parentPath = parts.slice(0, -1).join('/')
      const parent = dirs.get(parentPath)
      if (parent) parent.children.push(node)
    }

    if (entry.type === 'tree') dirs.set(entry.path, node)
  }

  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'tree' ? -1 : 1
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    })
    for (const n of nodes) if (n.children.length) sort(n.children)
  }
  sort(root)
  return root
}

function TreeFolder({
  node,
  depth,
  onFileClick,
  selectedPath,
}: {
  node: TreeNode
  depth: number
  onFileClick: (path: string, size?: number | null) => void
  selectedPath: string | null
}) {
  const [open, setOpen] = useState(depth === 0)
  const contentRef = useRef<HTMLDivElement>(null)
  const fullHeightRef = useRef<number>(0)
  const [height, setHeight] = useState<number | 'auto'>(depth === 0 ? 'auto' : 0)

  function toggle() {
    const el = contentRef.current
    if (!el) return setOpen((v) => !v)
    if (!open) {
      setOpen(true)
      setHeight(0)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fullHeightRef.current = el.scrollHeight
          setHeight(el.scrollHeight)
          setTimeout(() => setHeight('auto'), 300)
        })
      })
    } else {
      fullHeightRef.current = el.scrollHeight
      setHeight(el.scrollHeight)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setHeight(0)
          setTimeout(() => setOpen(false), 300)
        })
      })
    }
  }

  return (
    <div>
      <button
        onClick={toggle}
        className="flex items-center gap-1 w-full text-left py-0.5 hover:bg-muted/50 rounded transition-colors cursor-pointer"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {open ? (
          <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
        )}
        <FolderIcon className="size-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
        <span className="truncate">{node.name}</span>
      </button>
      <div
        style={{
          position: 'relative',
          height: height === 'auto' ? 'auto' : `${height}px`,
          overflow: 'hidden',
          transition: 'height 300ms cubic-bezier(0.19, 1, 0.22, 1)',
        }}
      >
        <div ref={contentRef}>
          {open &&
            node.children.map((child) =>
              child.type === 'tree' ? (
                <TreeFolder
                  key={child.path}
                  node={child}
                  depth={depth + 1}
                  onFileClick={onFileClick}
                  selectedPath={selectedPath}
                />
              ) : (
                <FileEntry
                  key={child.path}
                  node={child}
                  depth={depth + 1}
                  onFileClick={onFileClick}
                  isSelected={selectedPath === child.path}
                />
              ),
            )}
        </div>
        {/* Fade gradient — visible when clipping, fades as content fully reveals */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '24px',
            background: 'linear-gradient(to bottom, transparent, var(--color-background, white))',
            pointerEvents: 'none',
            opacity: height === 'auto' || height === 0 ? 0 : 1 - height / (fullHeightRef.current || 1),
            transition: 'opacity 300ms cubic-bezier(0.19, 1, 0.22, 1)',
          }}
        />
      </div>
    </div>
  )
}

function FileEntry({
  node,
  depth,
  onFileClick,
  isSelected,
}: {
  node: TreeNode
  depth: number
  onFileClick: (path: string, size?: number | null) => void
  isSelected: boolean
}) {
  return (
    <button
      onClick={() => onFileClick(node.path, node.size)}
      className={`flex items-center gap-1 py-0.5 rounded transition-colors w-full text-left cursor-pointer ${isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50 text-foreground'}`}
      style={{ paddingLeft: `${depth * 16 + 4 + 12}px` }}
    >
      <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate flex-1">{node.name}</span>
      {node.size != null && (
        <span className="text-muted-foreground shrink-0 ml-1 pr-1">{formatFileSize(node.size)}</span>
      )}
    </button>
  )
}

function formatRepoDate(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 1) return 'today'
  if (diffDays === 1) return '1 day ago'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

export default function RepoTree({
  data,
  repoLink,
  refreshing,
  onRefresh,
  bare,
  gerberZipFilesPath,
}: {
  data: RepoTreeData
  repoLink: string
  refreshing?: boolean
  onRefresh?: () => void
  bare?: boolean
  gerberZipFilesPath?: string
}) {
  const tree = useMemo(() => buildTree(data.entries), [data.entries])
  const githubBase = repoLink.replace(/\/+$/, '').replace(/\/tree\/[^/]+$/, '')
  const branch = data.default_branch || 'main'
  const nwo = githubBase.match(/github\.com\/([^/]+\/[^/]+)/)?.[1] ?? 'Repository'
  const updatedStr = formatRepoDate(data.pushed_at)
  const createdStr = formatRepoDate(data.created_at)

  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [selectedSize, setSelectedSize] = useState<number | null | undefined>(null)
  const treeScrollRef = useRef<HTMLDivElement>(null)
  const scrollPosRef = useRef(0)

  const handleFileClick = (path: string, size?: number | null) => {
    if (selectedFile === path) {
      setSelectedFile(null)
    } else {
      // Save scroll position before panel opens
      if (treeScrollRef.current) {
        scrollPosRef.current = treeScrollRef.current.scrollTop
      }
      setSelectedFile(path)
      setSelectedSize(size)
      // Restore scroll position after render
      requestAnimationFrame(() => {
        if (treeScrollRef.current) {
          treeScrollRef.current.scrollTop = scrollPosRef.current
        }
      })
    }
  }

  const splitContent = (
    <div className="flex h-[500px] overflow-hidden">
      {/* Tree pane — always present, shrinks when preview is open */}
      <div
        ref={treeScrollRef}
        className="overflow-y-auto shrink-0"
        style={{
          width: selectedFile ? '50%' : '100%',
          transition: 'width 300ms cubic-bezier(0.19, 1, 0.22, 1)',
        }}
      >
        <div className="p-2 text-xs">
          {tree.map((node) =>
            node.type === 'tree' ? (
              <TreeFolder
                key={node.path}
                node={node}
                depth={0}
                onFileClick={handleFileClick}
                selectedPath={selectedFile}
              />
            ) : (
              <FileEntry
                key={node.path}
                node={node}
                depth={0}
                onFileClick={handleFileClick}
                isSelected={selectedFile === node.path}
              />
            ),
          )}
        </div>
      </div>
      {/* Preview pane — slides in from the right */}
      <div
        className="overflow-hidden"
        style={{
          width: selectedFile ? '50%' : '0%',
          opacity: selectedFile ? 1 : 0,
          transition: 'width 300ms cubic-bezier(0.19, 1, 0.22, 1), opacity 300ms cubic-bezier(0.19, 1, 0.22, 1)',
        }}
      >
        {selectedFile && (
          <FilePreviewPanel
            filePath={selectedFile}
            fileSize={selectedSize}
            githubBase={githubBase}
            branch={branch}
            gerberZipFilesPath={gerberZipFilesPath}
            onClose={() => setSelectedFile(null)}
          />
        )}
      </div>
    </div>
  )

  if (bare) return splitContent

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="px-3 py-2 bg-muted/50 flex items-center gap-2">
        <svg className="size-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        <a
          href={githubBase}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold hover:underline"
        >
          {nwo}
        </a>
        {(updatedStr || createdStr) && (
          <span className="text-xs text-muted-foreground flex items-center gap-1 flex-1">
            {updatedStr && <span>Updated: {updatedStr}</span>}
            {updatedStr && createdStr && <span>|</span>}
            {createdStr && <span>Created: {createdStr}</span>}
          </span>
        )}
        {!updatedStr && !createdStr && <span className="flex-1" />}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh tree"
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCwIcon className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
      <div className="border-t border-border">{splitContent}</div>
    </div>
  )
}
