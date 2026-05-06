import { useState } from 'react'
import type { ReactNode } from 'react'
import { Deferred, router, Link, usePage } from '@inertiajs/react'
import type { ColumnDef } from '@tanstack/react-table'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent } from '@/components/admin/ui/card'
import { Input } from '@/components/admin/ui/input'
import { Textarea } from '@/components/admin/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/admin/ui/input-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/admin/ui/dropdown-menu'
import { DataTable } from '@/components/admin/DataTable'
import { Skeleton } from '@/components/admin/ui/skeleton'
import { ChevronLeftIcon, ExternalLinkIcon, SearchIcon, ShieldIcon, SlidersHorizontalIcon } from 'lucide-react'
import { hcbGrantUrl } from '@/lib/hcb'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/admin/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/admin/ui/alert-dialog'
import AuditLog, { AuditLogLoading } from '@/components/admin/AuditLog'
import type { AuditLogEntry } from '@/components/admin/AuditLog'
import StreakCalendar, { StreakCalendarLoading } from '@/components/admin/StreakCalendar'
import type {
  AdminUserDetail,
  AdminProjectRow,
  AdminProjectData,
  AdminStreakData,
  AdminStreakGoal,
  PagyProps,
} from '@/types'

const projectColumns: ColumnDef<AdminProjectRow>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.id}</span>,
  },
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <div className="font-medium">
        <Link href={`/admin/projects/${row.original.id}`} className="text-primary hover:underline">
          {row.original.name}
        </Link>
        {row.original.is_unlisted && (
          <Badge variant="outline" className="ml-1.5 text-[10px] py-0">
            Unlisted
          </Badge>
        )}
        {row.original.is_discarded && (
          <Badge variant="destructive" className="ml-1.5 text-[10px] py-0">
            Deleted
          </Badge>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'journal_entries_count',
    header: () => <div className="text-center">Entries</div>,
    cell: ({ row }) => <div className="text-center">{row.original.journal_entries_count}</div>,
  },
  {
    accessorKey: 'repo_link',
    header: 'Repo Link',
    cell: ({ row }) =>
      row.original.repo_link && /^https?:\/\//i.test(row.original.repo_link) ? (
        <a
          href={row.original.repo_link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline text-sm truncate block max-w-48"
        >
          {row.original.repo_link.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)/)?.[1] ?? row.original.repo_link}
        </a>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: 'hours_tracked',
    header: () => <div className="text-right">Hrs Tracked</div>,
    cell: ({ row }) => <div className="text-right">{row.original.hours_tracked}</div>,
  },
  {
    accessorKey: 'last_entry_at',
    header: 'Last Entry',
    cell: ({ row }) => row.original.last_entry_at ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: 'created_at',
    header: 'Created',
  },
]

interface AdminHcbGrantCard {
  id: number
  hcb_id: string | null
  status: 'active' | 'canceled' | 'expired'
  purpose: string | null
  expires_on: string | null
  amount_cents: number
  balance_cents: number | null
  transferred_in_cents: number
  created_at: string
  canceled_at: string | null
  last_synced_at: string | null
}

interface PageProps {
  user: AdminUserDetail
  valid_roles: string[]
  is_self: boolean
  streak_data?: AdminStreakData
  project_data?: AdminProjectData
  audit_log?: AuditLogEntry[]
  hcb_grant_cards?: AdminHcbGrantCard[]
  project_grant_warnings_count: number
  query: string
  include_deleted: boolean
  hide_unlisted: boolean
  with_journals: boolean
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm mt-0.5">{children}</dd>
    </div>
  )
}

function RolesEditor({ user, validRoles, isSelf }: { user: AdminUserDetail; validRoles: string[]; isSelf: boolean }) {
  // `hcb` is backend-only (console-granted) and is already excluded from validRoles,
  // but we also filter it out of the "current" state so change detection doesn't flag
  // a spurious diff and so the posted `selectedRoles` doesn't need to carry it.
  const NON_EDITABLE = ['user', 'hcb']
  const editableRoles = validRoles.filter((r) => !NON_EDITABLE.includes(r))
  const [selectedRoles, setSelectedRoles] = useState<string[]>(user.roles.filter((r) => !NON_EDITABLE.includes(r)))
  const [processing, setProcessing] = useState(false)
  const currentEditable = user.roles.filter((r) => !NON_EDITABLE.includes(r))
  const hasChanges = JSON.stringify([...selectedRoles].sort()) !== JSON.stringify([...currentEditable].sort())

  function toggleRole(role: string) {
    setSelectedRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]))
  }

  function isDisabled(role: string) {
    // Admins cannot remove admin from themselves
    if (isSelf && role === 'admin' && user.roles.includes('admin')) return true
    return false
  }

  function saveRoles() {
    setProcessing(true)
    // Always preserve the user role if the user currently has it
    const roles = user.roles.includes('user') ? ['user', ...selectedRoles] : selectedRoles
    router.patch(
      `/admin/users/${user.id}/update_roles`,
      { roles },
      {
        preserveState: true,
        onFinish: () => setProcessing(false),
      },
    )
  }

  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium mb-2">Manage Roles</h3>
            <div className="flex items-center gap-2 flex-wrap">
              {editableRoles.map((role) => {
                const active = selectedRoles.includes(role)
                const disabled = isDisabled(role)
                return (
                  <button
                    key={role}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleRole(role)}
                    className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent text-muted-foreground border-border hover:border-foreground/50'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {role}
                  </button>
                )
              })}
            </div>
            {isSelf && user.roles.includes('admin') && (
              <p className="text-xs text-muted-foreground mt-2">You cannot remove the admin role from yourself.</p>
            )}
          </div>
          {hasChanges && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={processing}>
                  Save Roles
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Update roles for {user.display_name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Roles will be set to:{' '}
                    {[...(user.roles.includes('user') ? ['user'] : []), ...selectedRoles].join(', ') || '(none)'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={saveRoles} disabled={processing}>
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function BanEditor({ user }: { user: AdminUserDetail }) {
  const isBanned = user.is_banned
  const isHackatimeBan = user.ban_type === 'hackatime'
  const MANUAL_BAN_TYPES = ['fallout', 'hcb', 'hardware', 'age'] as const
  const [banType, setBanType] = useState<string>(
    user.ban_type && user.ban_type !== 'hackatime' ? user.ban_type : 'fallout',
  )
  const [banReason, setBanReason] = useState('')
  const [processing, setProcessing] = useState(false)

  function submitBan(banning: boolean) {
    setProcessing(true)
    router.patch(
      `/admin/users/${user.id}/update_ban`,
      banning ? { is_banned: true, ban_type: banType, ban_reason: banReason } : { is_banned: false },
      { onFinish: () => setProcessing(false) },
    )
  }

  return (
    <Card>
      <CardContent>
        <h3 className="text-sm font-medium mb-3">Ban Status</h3>
        {isBanned ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="destructive">{isHackatimeBan ? 'Hackatime (auto)' : `Banned — ${user.ban_type}`}</Badge>
              {user.ban_reason && <span className="text-sm text-muted-foreground">{user.ban_reason}</span>}
            </div>
            {isHackatimeBan ? (
              <p className="text-xs text-muted-foreground">
                This ban was set automatically by the Hackatime trust-factor check. Unban will be re-applied by the next
                job run if the trust factor remains red.
              </p>
            ) : null}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={processing}>
                  Unban user
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Unban {user.display_name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will clear their ban and allow them to access Fallout again.
                    {isHackatimeBan && ' The Hackatime job may re-ban them automatically.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => submitBan(false)} disabled={processing}>
                    Unban
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">User is not banned.</p>
            <div className="flex gap-2 flex-wrap items-start">
              <Select value={banType} onValueChange={setBanType}>
                <SelectTrigger className="w-36 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_BAN_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex-1 min-w-48">
                <Textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Reason (required)"
                  className="h-16 text-sm resize-none"
                />
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={processing || !banReason.trim()}>
                  Ban user
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Ban {user.display_name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    They will be banned with type <strong>{banType}</strong> and will see the ban page on next login.
                    Reason: <em>{banReason}</em>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => submitBan(true)}
                    disabled={processing || !banReason.trim()}
                  >
                    Ban
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ProjectsLoading() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-5 w-8 rounded-full" />
      </div>
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-9 w-100" />
        <Skeleton className="h-9 w-20" />
        <div className="ml-auto">
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <Skeleton className="h-64 w-full rounded-md" />
    </div>
  )
}

function ProjectsSection({
  project_data,
  user,
  query,
  include_deleted,
  hide_unlisted,
  with_journals,
}: {
  project_data: AdminProjectData
  user: AdminUserDetail
  query: string
  include_deleted: boolean
  hide_unlisted: boolean
  with_journals: boolean
}) {
  const [searchQuery, setSearchQuery] = useState(query)
  const [includeDeleted, setIncludeDeleted] = useState(include_deleted)
  const [hideUnlisted, setHideUnlisted] = useState(hide_unlisted)
  const [withJournals, setWithJournals] = useState(with_journals)

  function buildParams(
    overrides: Partial<{ query: string; deleted: boolean; unlisted: boolean; journals: boolean }> = {},
  ) {
    const q = overrides.query ?? searchQuery
    const deleted = overrides.deleted ?? includeDeleted
    const unlisted = overrides.unlisted ?? hideUnlisted
    const journals = overrides.journals ?? withJournals
    const params: Record<string, string> = {}
    if (q) params.query = q
    if (deleted) params.include_deleted = '1'
    if (unlisted) params.hide_unlisted = '1'
    if (journals) params.with_journals = '1'
    return params
  }

  function search(e: React.FormEvent) {
    e.preventDefault()
    router.get(`/admin/users/${user.id}`, buildParams(), { preserveState: true })
  }

  function toggleDeleted(checked: boolean) {
    setIncludeDeleted(checked)
    router.get(`/admin/users/${user.id}`, buildParams({ deleted: checked }), { preserveState: true })
  }

  function toggleUnlisted(checked: boolean) {
    setHideUnlisted(checked)
    router.get(`/admin/users/${user.id}`, buildParams({ unlisted: checked }), { preserveState: true })
  }

  function toggleJournals(checked: boolean) {
    setWithJournals(checked)
    router.get(`/admin/users/${user.id}`, buildParams({ journals: checked }), { preserveState: true })
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold tracking-tight">{user.display_name}'s Projects</h2>
        <Badge variant="secondary" className="text-sm">
          {project_data.total_count}
        </Badge>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <form onSubmit={search} className="flex gap-2">
          <InputGroup className="w-100">
            <InputGroupAddon align="inline-start">
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
            />
          </InputGroup>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>

        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <SlidersHorizontalIcon data-icon="inline-start" />
                Options
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuCheckboxItem checked={hideUnlisted} onCheckedChange={toggleUnlisted}>
                Hide unlisted projects
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={includeDeleted} onCheckedChange={toggleDeleted}>
                Show deleted projects
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={withJournals} onCheckedChange={toggleJournals}>
                Only with journal entries
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <DataTable columns={projectColumns} data={project_data.projects} pagy={project_data.pagy} noun="projects" />
    </div>
  )
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function HcbGrantCardsSection({ cards }: { cards: AdminHcbGrantCard[] }) {
  const hcbHost = usePage().props.hcb_host as string | undefined
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight mb-4">HCB Grant Cards</h2>
      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">This user has no grant cards yet.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr className="text-left">
                <th className="p-2">HCB id</th>
                <th className="p-2">Status</th>
                <th className="p-2">Purpose</th>
                <th className="p-2">Transferred in</th>
                <th className="p-2" title="Authoritative card balance from the last HCB sync">
                  Balance
                </th>
                <th className="p-2">Expires</th>
                <th className="p-2">Created</th>
                <th className="p-2" title="Last successful HcbGrantCardSyncJob run — blank means never synced">
                  Last synced
                </th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="p-2 font-mono text-xs text-muted-foreground">
                    {(() => {
                      const hcbUrl = hcbGrantUrl(hcbHost, c.hcb_id)
                      if (!c.hcb_id) return '—'
                      return hcbUrl ? (
                        <a
                          href={hcbUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline text-primary"
                        >
                          {c.hcb_id}
                        </a>
                      ) : (
                        c.hcb_id
                      )
                    })()}
                  </td>
                  <td className="p-2">
                    <Badge
                      variant={c.status === 'active' ? 'default' : 'outline'}
                      className={c.status === 'canceled' ? 'text-muted-foreground' : ''}
                    >
                      {c.status}
                    </Badge>
                  </td>
                  <td className="p-2">{c.purpose ?? '—'}</td>
                  <td className="p-2 font-mono">
                    {(() => {
                      const actual = c.amount_cents
                      const expected = c.transferred_in_cents
                      const match = actual === expected
                      const gapNote = match
                        ? ''
                        : ` — ${formatDollars(Math.abs(actual - expected))} ${actual > expected ? 'extra on HCB' : 'missing from HCB'}`
                      return (
                        <TooltipProvider>
                          <span className={match ? '' : 'text-red-700'}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default">{formatDollars(actual)}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Actual — HCB's amount_cents on this card (reality){gapNote}
                              </TooltipContent>
                            </Tooltip>
                            <span className="text-muted-foreground"> / </span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default text-muted-foreground">{formatDollars(expected)}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Expected — Fallout's ledger net (in minus out) for this card
                              </TooltipContent>
                            </Tooltip>
                          </span>
                        </TooltipProvider>
                      )
                    })()}
                  </td>
                  <td className="p-2 font-mono">{c.balance_cents != null ? formatDollars(c.balance_cents) : '—'}</td>
                  <td className="p-2 text-muted-foreground">{c.expires_on ?? 'no expiry'}</td>
                  <td className="p-2 text-muted-foreground">{c.created_at}</td>
                  <td className="p-2 text-muted-foreground text-xs">{c.last_synced_at ?? 'never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StreakGoalSection({ goals, userId }: { goals: AdminStreakGoal[]; userId: number }) {
  const [processing, setProcessing] = useState(false)

  function restoreGoal(goal: AdminStreakGoal) {
    setProcessing(true)
    router.patch(
      `/admin/users/${userId}/restore_streak_goal`,
      {},
      {
        preserveState: true,
        onSuccess: () => setProcessing(false),
        onError: () => setProcessing(false),
      },
    )
  }

  return (
    <Card>
      <CardContent>
        <h3 className="text-sm font-medium mb-3">Streak Goals</h3>
        {goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No streak goals.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr className="text-left">
                  <th className="p-2">Target</th>
                  <th className="p-2">Progress</th>
                  <th className="p-2">Started</th>
                  <th className="p-2">Status</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {goals.map((g) => (
                  <tr key={g.id} className="border-b border-border last:border-0">
                    <td className="p-2">{g.target_days} days</td>
                    <td className="p-2">
                      {g.progress} / {g.target_days}
                    </td>
                    <td className="p-2 text-muted-foreground">{g.started_on}</td>
                    <td className="p-2">
                      {g.completed ? (
                        <Badge variant="default">Completed</Badge>
                      ) : g.broken ? (
                        <Badge variant="destructive">Broken</Badge>
                      ) : (
                        <Badge variant="secondary">In progress</Badge>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      {g.restorable && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" disabled={processing}>
                              Restore
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Restore streak goal?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Every day in the goal window ({g.started_on} + {g.target_days} days) that is blank or
                                missed will be set to <strong>frozen</strong>. Active days are untouched.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => restoreGoal(g)} disabled={processing}>
                                Restore
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function AdminUsersShow({
  user,
  valid_roles,
  is_self,
  streak_data,
  project_data,
  audit_log,
  hcb_grant_cards,
  project_grant_warnings_count,
  query,
  include_deleted,
  hide_unlisted,
  with_journals,
}: PageProps) {
  const { admin_permissions } = usePage<{ admin_permissions?: { is_admin: boolean } }>().props
  const isAdmin = admin_permissions?.is_admin ?? false

  return (
    <div>
      <button
        onClick={() => window.history.back()}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeftIcon className="size-4" />
        Back
      </button>

      {/* Project-grant warnings banner — admin-only visibility. Count is computed
          inline in the controller (no defer) so it's visible immediately on page load. */}
      {isAdmin && project_grant_warnings_count > 0 && (
        <div className="mb-4 rounded-md border-2 border-red-500 bg-red-50 dark:bg-red-950/30 p-3 flex items-center justify-between">
          <div className="text-sm">
            <strong className="text-red-700 dark:text-red-400">
              ⚠ {project_grant_warnings_count} unresolved project-grant warning
              {project_grant_warnings_count === 1 ? '' : 's'}
            </strong>{' '}
            for this user.
            <span className="text-red-900 dark:text-red-200 block text-xs mt-1">
              Financial state may be out of sync with HCB. Review and resolve before approving new grants.
            </span>
          </div>
          <Link
            href="/admin/project_grants/orders"
            className="text-sm font-medium text-red-700 dark:text-red-400 hover:underline whitespace-nowrap ml-4"
          >
            View warnings →
          </Link>
        </div>
      )}

      <div className="flex items-end justify-between mb-4">
        <div className="flex items-center gap-3">
          <img src={user.avatar} alt={user.display_name} className="size-12 rounded-full" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {user.display_name}
              {user.is_discarded && (
                <Badge variant="destructive" className="ml-2 align-middle">
                  Deleted {user.discarded_at}
                </Badge>
              )}
            </h1>
            {user.email && <p className="text-sm text-muted-foreground">{user.email}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user.slack_id && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={`https://hackclub.enterprise.slack.com/team/${user.slack_id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLinkIcon data-icon="inline-start" />
                See Slack
              </a>
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-6">
        <CardContent>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Slack ID">{user.slack_id ?? <span className="text-muted-foreground">—</span>}</Field>
            <Field label="Roles">
              <div className="flex gap-1 flex-wrap">
                {user.roles.map((role) => (
                  <Badge key={role} variant="outline" className="text-[10px]">
                    {role}
                  </Badge>
                ))}
              </div>
            </Field>
            <Field label="Projects">{user.projects_count}</Field>
            <Field label="Joined">{user.created_at}</Field>
            {user.pronouns != null && <Field label="Pronouns">{user.pronouns}</Field>}
            {user.bio != null && <Field label="Bio">{user.bio}</Field>}
          </dl>
        </CardContent>
      </Card>

      {valid_roles.length > 0 && (
        <div className="mb-6">
          <RolesEditor user={user} validRoles={valid_roles} isSelf={is_self} />
        </div>
      )}

      {isAdmin && (
        <div className="mb-6">
          <BanEditor user={user} />
        </div>
      )}

      <Deferred data="project_data" fallback={<ProjectsLoading />}>
        <ProjectsSection
          project_data={project_data!}
          user={user}
          query={query}
          include_deleted={include_deleted}
          hide_unlisted={hide_unlisted}
          with_journals={with_journals}
        />
      </Deferred>

      {isAdmin && hcb_grant_cards !== undefined && (
        <div className="mt-8">
          <Deferred
            data="hcb_grant_cards"
            fallback={<p className="text-sm text-muted-foreground">Loading grant cards…</p>}
          >
            <HcbGrantCardsSection cards={hcb_grant_cards!} />
          </Deferred>
        </div>
      )}

      {isAdmin && audit_log !== undefined && (
        <div className="mt-8">
          <Deferred data="audit_log" fallback={<AuditLogLoading />}>
            <AuditLog entries={audit_log!} />
          </Deferred>
        </div>
      )}

      <div className="mt-8">
        <Deferred data="streak_data" fallback={<StreakCalendarLoading />}>
          <div className="space-y-4">
            <StreakGoalSection goals={streak_data?.goals ?? []} userId={user.id} />
            <StreakCalendar data={streak_data!} userId={user.id} />
          </div>
        </Deferred>
      </div>
    </div>
  )
}

AdminUsersShow.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
