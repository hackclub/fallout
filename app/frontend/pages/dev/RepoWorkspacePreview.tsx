import { useState, type ReactNode } from 'react'
import { FolderIcon, FolderOpenIcon, LayoutGridIcon } from 'lucide-react'
import ReviewLayout from '@/layouts/ReviewLayout'
import RepoWorkspace from '@/components/admin/review/RepoWorkspace'
import { ReviewTabBar, ReviewTabPanel, ReviewTabsRoot, type ReviewTab } from '@/components/admin/review/ReviewTabs'
import type { RepoTreeData } from '@/types'

const TABS: ReviewTab[] = [
  { id: 'overview', title: 'Overview', icon: LayoutGridIcon, tint: 'green' },
  { id: 'repo', title: 'Repo', icon: FolderIcon, activeIcon: FolderOpenIcon, tint: 'violet' },
]

export default function RepoWorkspacePreview({
  repo_link,
  repo_tree,
}: {
  repo_link: string
  repo_tree: RepoTreeData | null
}) {
  const [view, setView] = useState('repo')
  return (
    <ReviewTabsRoot value={view} onValueChange={setView} asChild>
      <div className="h-screen flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-3">
          <span className="text-sm font-semibold">Repo view sandbox</span>
          <span className="text-xs text-muted-foreground">{repo_link}</span>
          <div className="mx-auto">
            <ReviewTabBar tabs={TABS} value={view} onValueChange={setView} />
          </div>
          <span className="text-xs text-muted-foreground">?repo=https://github.com/…</span>
        </div>
        <div className="flex-1 min-h-0 flex">
          <ReviewTabPanel value="overview">
            <p className="p-6 text-sm text-muted-foreground">Overview placeholder — switch to Repo.</p>
          </ReviewTabPanel>
          <ReviewTabPanel value="repo">
            {repo_tree ? (
              <RepoWorkspace data={repo_tree} repoLink={repo_link} />
            ) : (
              <p className="p-6 text-sm text-muted-foreground">Couldn't fetch the repo tree.</p>
            )}
          </ReviewTabPanel>
        </div>
      </div>
    </ReviewTabsRoot>
  )
}

RepoWorkspacePreview.layout = (page: ReactNode) => <ReviewLayout>{page}</ReviewLayout>
