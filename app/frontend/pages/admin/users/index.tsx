import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { router, Link, usePage } from '@inertiajs/react'
import type { ColumnDef } from '@tanstack/react-table'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/admin/ui/input-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/admin/ui/dropdown-menu'
import { DataTable } from '@/components/admin/DataTable'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { SearchIcon, SlidersHorizontalIcon, Loader2 } from 'lucide-react'
import type { AdminUserRow, PagyProps } from '@/types'

const baseColumns: ColumnDef<AdminUserRow>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.id}</span>,
  },
  {
    accessorKey: 'display_name',
    header: 'Username',
    cell: ({ row }) => (
      <div className="font-medium">
        <Link href={`/admin/users/${row.original.id}`} className="text-primary hover:underline">
          {row.original.display_name}
        </Link>
        {row.original.is_discarded && (
          <Badge variant="destructive" className="ml-1.5 text-[10px] py-0">
            Deleted
          </Badge>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'slack_id',
    header: 'Slack ID',
    cell: ({ row }) => row.original.slack_id ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: 'roles',
    header: 'Roles',
    cell: ({ row }) => (
      <div className="flex gap-1 flex-wrap">
        {row.original.roles.map((role) => (
          <Badge key={role} variant="outline" className="text-[10px]">
            {role}
          </Badge>
        ))}
      </div>
    ),
  },
  {
    accessorKey: 'projects_count',
    header: () => <div className="text-center">Projects</div>,
    cell: ({ row }) => <div className="text-center">{row.original.projects_count}</div>,
  },
  {
    accessorKey: 'created_at',
    header: 'Joined',
  },
]

const emailColumn: ColumnDef<AdminUserRow> = {
  accessorKey: 'email',
  header: 'Email',
}

interface PageProps {
  users: AdminUserRow[]
  pagy: PagyProps
  query: string
  include_trial: boolean
  include_deleted: boolean
  total_count: number
}

export default function AdminUsersIndex({
  users,
  pagy,
  query,
  include_trial,
  include_deleted,
  total_count,
}: PageProps) {
  const { admin_permissions } = usePage<{ admin_permissions?: { is_admin: boolean } }>().props
  const isAdmin = admin_permissions?.is_admin ?? false
  const columns = useMemo(() => {
    if (!isAdmin) return baseColumns
    // Insert email column after display_name
    const cols = [...baseColumns]
    cols.splice(2, 0, emailColumn)
    return cols
  }, [isAdmin])
  const [searchQuery, setSearchQuery] = useState(query)
  const [includeTrial, setIncludeTrial] = useState(include_trial)
  const [includeDeleted, setIncludeDeleted] = useState(include_deleted)
  const [searching, setSearching] = useState(false)
  const debouncedQuery = useDebouncedValue(searchQuery, 250)
  // Skip the very first effect run — initial render's debounced value already matches `query`.
  const initialQueryRef = useRef(query)

  function buildParams(overrides: Partial<{ query: string; trial: boolean; deleted: boolean }> = {}) {
    const q = overrides.query ?? searchQuery
    const trial = overrides.trial ?? includeTrial
    const deleted = overrides.deleted ?? includeDeleted
    const params: Record<string, string> = {}
    if (q) params.query = q
    if (trial) params.include_trial = '1'
    if (deleted) params.include_deleted = '1'
    return params
  }

  // Live search via Inertia partial reload — only refetches the props the table needs,
  // preserves component state (filters, focus, scroll), and rewrites the URL without
  // remounting the page.
  useEffect(() => {
    if (debouncedQuery === initialQueryRef.current) {
      initialQueryRef.current = '__INITIAL_DONE__'
      return
    }
    setSearching(true)
    router.get('/admin/users', buildParams({ query: debouncedQuery }), {
      preserveState: true,
      preserveScroll: true,
      replace: true,
      only: ['users', 'pagy', 'query', 'total_count'],
      onFinish: () => setSearching(false),
    })
    // buildParams reads from current state intentionally; the debouncedQuery dep is what drives the search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery])

  function search(e: React.FormEvent) {
    e.preventDefault()
    // Form submit just flushes the debounce — visit immediately so Enter feels snappy.
    router.get('/admin/users', buildParams(), {
      preserveState: true,
      preserveScroll: true,
      replace: true,
      only: ['users', 'pagy', 'query', 'total_count'],
    })
  }

  function toggleTrial(checked: boolean) {
    setIncludeTrial(checked)
    router.get('/admin/users', buildParams({ trial: checked }), {
      preserveState: true,
      preserveScroll: true,
      replace: true,
    })
  }

  function toggleDeleted(checked: boolean) {
    setIncludeDeleted(checked)
    router.get('/admin/users', buildParams({ deleted: checked }), {
      preserveState: true,
      preserveScroll: true,
      replace: true,
    })
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <Badge variant="secondary" className="text-sm">
          {total_count}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <form onSubmit={search} className="flex gap-2 flex-1 min-w-0">
          <InputGroup className="flex-1 min-w-0">
            <InputGroupAddon align="inline-start">
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              placeholder="Search users..."
            />
            {searching && (
              <InputGroupAddon align="inline-end">
                <Loader2 className="animate-spin text-muted-foreground" />
              </InputGroupAddon>
            )}
          </InputGroup>
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
              <DropdownMenuCheckboxItem checked={includeTrial} onCheckedChange={toggleTrial}>
                Show trial users
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={includeDeleted} onCheckedChange={toggleDeleted}>
                Show deleted users
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <DataTable columns={columns} data={users} pagy={pagy} noun="users" />
    </div>
  )
}

AdminUsersIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
