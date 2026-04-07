import { useState } from 'react'
import type { ReactNode } from 'react'
import { Deferred, router, Link, usePage } from '@inertiajs/react'
import type { ColumnDef } from '@tanstack/react-table'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent } from '@/components/admin/ui/card'
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
import type { AdminUserDetail, AdminProjectRow, AdminProjectData, PagyProps } from '@/types'

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

interface PageProps {
  user: AdminUserDetail
  valid_roles: string[]
  is_self: boolean
  project_data?: AdminProjectData
  audit_log?: AuditLogEntry[]
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
  const editableRoles = validRoles.filter((r) => r !== 'user')
  const [selectedRoles, setSelectedRoles] = useState<string[]>(user.roles.filter((r) => r !== 'user'))
  const [processing, setProcessing] = useState(false)
  const currentEditable = user.roles.filter((r) => r !== 'user')
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

export default function AdminUsersShow({
  user,
  valid_roles,
  is_self,
  project_data,
  audit_log,
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
          </dl>
        </CardContent>
      </Card>

      {valid_roles.length > 0 && (
        <div className="mb-6">
          <RolesEditor user={user} validRoles={valid_roles} isSelf={is_self} />
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

      {isAdmin && audit_log !== undefined && (
        <div className="mt-8">
          <Deferred data="audit_log" fallback={<AuditLogLoading />}>
            <AuditLog entries={audit_log!} />
          </Deferred>
        </div>
      )}
    </div>
  )
}

AdminUsersShow.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
