import type { ReactNode } from 'react'
import { Deferred, Link } from '@inertiajs/react'
import type { ColumnDef } from '@tanstack/react-table'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent } from '@/components/admin/ui/card'
import { DataTable } from '@/components/admin/DataTable'
import HoursDisplay from '@/components/admin/HoursDisplay'
import AuditLog, { AuditLogLoading } from '@/components/admin/AuditLog'
import type { AuditLogEntry } from '@/components/admin/AuditLog'
import { ChevronLeftIcon, ExternalLinkIcon, ClockIcon } from 'lucide-react'
import type { AdminProjectDetail, PagyProps, SiblingStatuses } from '@/types'

interface JournalEntry {
  id: number
  content_html: string
  images: string[]
  author_display_name: string
  author_avatar: string
  created_at: string
  ship_id: number | null
  total_duration: number
  recordings: {
    id: number
    type: string
    name: string
    duration: number
    removed_seconds: number
    description: string | null
  }[]
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function recordingTypeLabel(type: string): string {
  switch (type) {
    case 'LookoutTimelapse':
      return 'Lookout'
    case 'LapseTimelapse':
      return 'Lapse'
    case 'YouTubeVideo':
      return 'YouTube'
    default:
      return type
  }
}

function recordingTypeBadgeColor(type: string): string {
  switch (type) {
    case 'LookoutTimelapse':
      return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800'
    case 'LapseTimelapse':
      return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800'
    case 'YouTubeVideo':
      return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'
    default:
      return 'bg-zinc-100 text-zinc-700 border-zinc-200'
  }
}

interface ShipRow {
  id: number
  status: string
  approved_public_hours: number | null
  approved_internal_hours: number | null
  review_statuses: SiblingStatuses
  created_at: string
}

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  returned: 'outline',
}

function StepBadge({ label, status }: { label: string; status: string | null }) {
  if (!status) return null
  const color =
    status === 'approved'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
      : status === 'returned' || status === 'rejected'
        ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
        : status === 'cancelled'
          ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500'
          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${color}`}>
      {label}: {status}
    </span>
  )
}

const shipColumns: ColumnDef<ShipRow>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => (
      <Link href={`/admin/reviews/${row.original.id}`} className="text-muted-foreground hover:underline">
        {row.original.id}
      </Link>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const { status, review_statuses } = row.original
      const showSteps = status === 'pending' && review_statuses
      if (showSteps) {
        return (
          <div className="flex flex-wrap gap-1">
            <StepBadge label="TA" status={review_statuses.time_audit} />
            <StepBadge label="RC" status={review_statuses.requirements_check} />
            <StepBadge label="Design" status={review_statuses.design_review} />
            <StepBadge label="Build" status={review_statuses.build_review} />
          </div>
        )
      }
      return (
        <Badge variant={statusColors[status] ?? 'outline'} className="capitalize">
          {status}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'approved_public_hours',
    header: 'Hours Approved',
    cell: ({ row }) => (
      <HoursDisplay
        publicHours={row.original.approved_public_hours}
        internalHours={row.original.approved_internal_hours}
        className="text-xs"
      />
    ),
  },
  {
    accessorKey: 'created_at',
    header: 'Created',
  },
]

function isSafeUrl(url: string | null): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function formatUrl(url: string): string {
  const match = url.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)/)
  return match ? match[1] : url
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm mt-0.5">{children}</dd>
    </div>
  )
}

export default function AdminProjectsShow({
  project,
  ships,
  pagy_ships,
  journal_entries,
  pagy_entries,
  audit_log,
}: {
  project: AdminProjectDetail
  ships: ShipRow[]
  pagy_ships: PagyProps
  journal_entries: JournalEntry[]
  pagy_entries: PagyProps
  audit_log?: AuditLogEntry[]
}) {
  return (
    <div>
      <button
        onClick={() => window.history.back()}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeftIcon className="size-4" />
        Back
      </button>

      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {project.name}
            {project.is_unlisted && (
              <Badge variant="outline" className="ml-2 align-middle">
                Unlisted
              </Badge>
            )}
            {project.is_discarded && (
              <Badge variant="destructive" className="ml-2 align-middle">
                Deleted {project.discarded_at}
              </Badge>
            )}
          </h1>
          <div className="flex items-center flex-wrap gap-1 text-sm text-muted-foreground mt-1">
            <span>by</span>
            <Link
              href={`/admin/users/${project.user_id}`}
              className="inline-flex items-center gap-1 text-foreground hover:underline"
            >
              <img src={project.user_avatar} alt={project.user_display_name} className="size-4 rounded-full" />
              {project.user_display_name}
            </Link>
            {project.collaborators.length > 0 && (
              <>
                <span>in collaboration with</span>
                {project.collaborators.map((collab, i) => (
                  <span key={collab.id} className="inline-flex items-center gap-1">
                    {i > 0 && (
                      <span className="text-muted-foreground">
                        {i === project.collaborators.length - 1 ? 'and' : ','}
                      </span>
                    )}
                    <Link
                      href={`/admin/users/${collab.id}`}
                      className="inline-flex items-center gap-1 text-foreground hover:underline"
                    >
                      <img src={collab.avatar} alt={collab.display_name} className="size-4 rounded-full" />
                      {collab.display_name}
                    </Link>
                  </span>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/projects/${project.id}`}>
              <ExternalLinkIcon data-icon="inline-start" />
              User Facing
            </Link>
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Entries">{project.journal_entries_count}</Field>
            <Field label="Repo Link">
              {isSafeUrl(project.repo_link) ? (
                <a
                  href={project.repo_link!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline truncate block"
                >
                  {formatUrl(project.repo_link!)}
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Field>
            <Field label="Hrs Tracked">{project.hours_tracked}</Field>
            <Field label="Last Entry">
              {project.last_entry_at ?? <span className="text-muted-foreground">—</span>}
            </Field>
            <Field label="Demo Link">
              {isSafeUrl(project.demo_link) ? (
                <a
                  href={project.demo_link!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline truncate block"
                >
                  {formatUrl(project.demo_link!)}
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Field>
            <Field label="Tags">{project.tags.length > 0 ? project.tags.join(', ') : '—'}</Field>
            <Field label="Created">{project.created_at}</Field>
          </dl>
          {project.description && (
            <div className="mt-4 pt-4 border-t border-border">
              <Field label="Description">{project.description}</Field>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Ships</h2>
        <Badge variant="secondary" className="text-sm">
          {pagy_ships.count}
        </Badge>
      </div>

      <DataTable columns={shipColumns} data={ships} pagy={pagy_ships} noun="ships" pageParam="ships_page" />

      <div className="flex items-center gap-2 mb-4 mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Journal Entries</h2>
        <Badge variant="secondary" className="text-sm">
          {pagy_entries.count}
        </Badge>
      </div>

      {journal_entries.length > 0 ? (
        <>
          <Card className="py-0">
            <div className="divide-y divide-border">
              {journal_entries.map((entry) => (
                <div key={entry.id} className="p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <img src={entry.author_avatar} alt="" className="size-4 rounded-full" />
                    <span>{entry.author_display_name}</span>
                    <span>|</span>
                    <span>{entry.created_at}</span>
                    <span className="flex items-center gap-1">
                      <ClockIcon className="size-3" />
                      {formatDuration(entry.total_duration)}
                    </span>
                    {entry.ship_id && (
                      <Badge variant="outline" className="text-[10px]">
                        Ship {entry.ship_id}
                      </Badge>
                    )}
                  </div>

                  {entry.recordings.length > 0 && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {entry.recordings.map((rec) => (
                        <div key={rec.id} className="text-xs rounded border border-border p-2 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Badge
                              className={`text-[10px] shrink-0 ${recordingTypeBadgeColor(rec.type)}`}
                              variant="outline"
                            >
                              {recordingTypeLabel(rec.type)}
                            </Badge>
                            <span className="text-muted-foreground">{formatDuration(rec.duration)}</span>
                            {rec.removed_seconds > 0 && (
                              <span className="text-red-600 dark:text-red-400">
                                → {formatDuration(rec.duration - rec.removed_seconds)}
                              </span>
                            )}
                          </div>
                          {rec.description && <p className="text-muted-foreground leading-snug">{rec.description}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    className="markdown-content max-w-none text-xs"
                    style={{ zoom: 0.85 }}
                    dangerouslySetInnerHTML={{ __html: entry.content_html }}
                  />
                  {entry.images.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {entry.images.map((img, j) => (
                        <a key={j} href={img} target="_blank" rel="noopener noreferrer">
                          <img src={img} alt="" className="rounded border border-border object-cover w-full max-h-24" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {pagy_entries.pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={!pagy_entries.prev}
                onClick={() => {
                  const url = new URL(window.location.href)
                  url.searchParams.set('entries_page', String(pagy_entries.prev!))
                  window.location.href = url.toString()
                }}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                {pagy_entries.page} / {pagy_entries.pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagy_entries.next}
                onClick={() => {
                  const url = new URL(window.location.href)
                  url.searchParams.set('entries_page', String(pagy_entries.next!))
                  window.location.href = url.toString()
                }}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No journal entries.</p>
      )}

      {audit_log !== undefined && (
        <div className="mt-8">
          <Deferred data="audit_log" fallback={<AuditLogLoading />}>
            <AuditLog entries={audit_log!} />
          </Deferred>
        </div>
      )}
    </div>
  )
}

AdminProjectsShow.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
