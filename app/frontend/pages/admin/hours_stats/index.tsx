import { useState } from 'react'
import type { ReactNode } from 'react'
import { router } from '@inertiajs/react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { Button } from '@/components/admin/ui/button'
import { Badge } from '@/components/admin/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'

type UserEntry = {
  email: string
  slack_id: string | null
  hours: number
}

type Bucket = {
  range: string
  users: UserEntry[]
}

type Props = {
  buckets: Bucket[]
  cached_at: string
  mode: string
}

export default function AdminHoursStatsIndex({ buckets, cached_at, mode }: Props) {
  const totalUsers = buckets.reduce((sum, b) => sum + b.users.length, 0)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)

  function toggleCollapsed(range: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(range) ? next.delete(range) : next.add(range)
      return next
    })
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  function switchMode(newMode: string) {
    router.visit(newMode === 'logged' ? '/admin/hours_stats' : `/admin/hours_stats?mode=${newMode}`)
  }

  function refresh() {
    router.post('/admin/hours_stats/refresh', {}, { preserveScroll: false })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hours Stats</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalUsers} users · last updated {new Date(cached_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden text-sm">
            <button
              onClick={() => switchMode('logged')}
              className={`px-3 py-1.5 transition-colors ${mode === 'logged' ? 'bg-muted font-medium' : 'hover:bg-muted/50'}`}
            >
              Logged
            </button>
            <button
              onClick={() => switchMode('build_approved')}
              className={`px-3 py-1.5 border-l border-border transition-colors ${mode === 'build_approved' ? 'bg-muted font-medium' : 'hover:bg-muted/50'}`}
            >
              Build Approved
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={refresh}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {buckets.map((bucket) => {
          const isCollapsed = collapsed.has(bucket.range)
          return (
            <div key={bucket.range}>
              <div
                className="flex items-center gap-2 mb-2 cursor-pointer select-none"
                onClick={() => toggleCollapsed(bucket.range)}
              >
                {isCollapsed ? (
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                )}
                <h2 className="text-base font-medium">{bucket.range}</h2>
                <Badge variant="secondary">{bucket.users.length}</Badge>
                {!isCollapsed && bucket.users.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs ml-auto"
                    onClick={(e) => {
                      e.stopPropagation()
                      copy(bucket.users.map((u) => u.email).join('\n'), `emails-${bucket.range}`)
                    }}
                  >
                    {copied === `emails-${bucket.range}` ? 'Copied!' : 'Copy all emails'}
                  </Button>
                )}
              </div>
              {!isCollapsed &&
                (bucket.users.length === 0 ? (
                  <p className="text-sm text-muted-foreground pl-1">No users in this range.</p>
                ) : (
                  <div className="rounded-md border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Slack ID</TableHead>
                          <TableHead className="text-right">Hours</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bucket.users.map((user) => (
                          <TableRow key={user.email}>
                            <TableCell
                              className="font-mono text-sm cursor-pointer select-none"
                              onClick={() => copy(user.email, `email-${user.email}`)}
                              title="Click to copy"
                            >
                              {copied === `email-${user.email}` ? (
                                <span className="text-green-600 dark:text-green-400">Copied!</span>
                              ) : (
                                user.email
                              )}
                            </TableCell>
                            <TableCell
                              className={`font-mono text-sm ${user.slack_id ? 'cursor-pointer select-none' : ''}`}
                              onClick={() => user.slack_id && copy(user.slack_id, `slack-${user.email}`)}
                              title={user.slack_id ? 'Click to copy' : undefined}
                            >
                              {!user.slack_id ? (
                                <span className="text-muted-foreground">—</span>
                              ) : copied === `slack-${user.email}` ? (
                                <span className="text-green-600 dark:text-green-400">Copied!</span>
                              ) : (
                                user.slack_id
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{user.hours}h</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

AdminHoursStatsIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
