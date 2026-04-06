import { useState } from 'react'
import type { ReactNode } from 'react'
import { router, Link } from '@inertiajs/react'
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
import { SearchIcon, SlidersHorizontalIcon } from 'lucide-react'
import type { AdminProjectRow, PagyProps } from '@/types'

const columns: ColumnDef<AdminProjectRow>[] = [
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
    accessorKey: 'user_display_name',
    header: 'Owner',
    cell: ({ row }) => (
      <Link href={`/admin/users/${row.original.user_id}`} className="text-primary hover:underline">
        {row.original.user_display_name}
      </Link>
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
  projects: AdminProjectRow[]
  pagy: PagyProps
  query: string
  include_deleted: boolean
  hide_unlisted: boolean
  with_journals: boolean
  total_count: number
}

export default function AdminProjectsIndex({
  projects,
  pagy,
  query,
  include_deleted,
  hide_unlisted,
  with_journals,
  total_count,
}: PageProps) {
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
    router.get('/admin/projects', buildParams(), { preserveState: true })
  }

  function toggleDeleted(checked: boolean) {
    setIncludeDeleted(checked)
    router.get('/admin/projects', buildParams({ deleted: checked }), { preserveState: true })
  }

  function toggleUnlisted(checked: boolean) {
    setHideUnlisted(checked)
    router.get('/admin/projects', buildParams({ unlisted: checked }), { preserveState: true })
  }

  function toggleJournals(checked: boolean) {
    setWithJournals(checked)
    router.get('/admin/projects', buildParams({ journals: checked }), { preserveState: true })
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <Badge variant="secondary" className="text-sm">
          {total_count}
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

      <DataTable columns={columns} data={projects} pagy={pagy} noun="projects" />
    </div>
  )
}

AdminProjectsIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
