import { useState, useMemo } from 'react'
import { FolderIcon, FileIcon, ChevronRightIcon, ChevronDownIcon, RefreshCwIcon } from 'lucide-react'
import type { RepoTreeEntry, RepoTreeData } from '@/types'

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
  githubBase,
  branch,
  depth,
}: {
  node: TreeNode
  githubBase: string
  branch: string
  depth: number
}) {
  const [open, setOpen] = useState(depth === 0)

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
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
      {open &&
        node.children.map((child) =>
          child.type === 'tree' ? (
            <TreeFolder key={child.path} node={child} githubBase={githubBase} branch={branch} depth={depth + 1} />
          ) : (
            <a
              key={child.path}
              href={`${githubBase}/blob/${branch}/${child.path}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 py-0.5 hover:bg-muted/50 rounded transition-colors text-foreground hover:text-foreground"
              style={{ paddingLeft: `${(depth + 1) * 16 + 4 + 12}px` }}
            >
              <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1">{child.name}</span>
              {child.size != null && (
                <span className="text-muted-foreground shrink-0 ml-1">{formatFileSize(child.size)}</span>
              )}
            </a>
          ),
        )}
    </div>
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
}: {
  data: RepoTreeData
  repoLink: string
  refreshing?: boolean
  onRefresh?: () => void
  bare?: boolean
}) {
  const tree = useMemo(() => buildTree(data.entries), [data.entries])
  const githubBase = repoLink.replace(/\/+$/, '').replace(/\/tree\/[^/]+$/, '')
  const branch = data.default_branch || 'main'
  const nwo = githubBase.match(/github\.com\/([^/]+\/[^/]+)/)?.[1] ?? 'Repository'
  const updatedStr = formatRepoDate(data.pushed_at)
  const createdStr = formatRepoDate(data.created_at)

  const treeContent = (
    <div className="p-2 text-xs max-h-80 overflow-y-auto">
      {tree.map((node) =>
        node.type === 'tree' ? (
          <TreeFolder key={node.path} node={node} githubBase={githubBase} branch={branch} depth={0} />
        ) : (
          <a
            key={node.path}
            href={`${githubBase}/blob/${branch}/${node.path}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 py-0.5 hover:bg-muted/50 rounded transition-colors text-foreground hover:text-foreground"
            style={{ paddingLeft: '16px' }}
          >
            <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate flex-1">{node.name}</span>
            {node.size != null && (
              <span className="text-muted-foreground shrink-0 ml-1">{formatFileSize(node.size)}</span>
            )}
          </a>
        ),
      )}
    </div>
  )

  if (bare) return treeContent

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
      <div className="border-t border-border">{treeContent}</div>
    </div>
  )
}
