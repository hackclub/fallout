import type { ReactNode } from 'react'
import { Link, Deferred, router } from '@inertiajs/react'
import type { ColumnDef } from '@tanstack/react-table'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Skeleton } from '@/components/admin/ui/skeleton'
import { DataTable } from '@/components/admin/DataTable'
import { DataTableSkeleton } from '@/components/admin/DataTableSkeleton'
import TimeAgo from '@/components/shared/TimeAgo'
import type { ProjectFlag, PagyProps } from '@/types'

const STAGE_LABELS: Record<string, string> = {
  time_audit: 'Time Audit',
  requirements_check: 'Requirements',
  design_review: 'Design Review',
  build_review: 'Build Review',
}

const columns: ColumnDef<ProjectFlag>[] = [
  {
    accessorKey: 'project_name',
    header: 'Project',
    cell: ({ row }) => (
      <Link
        href={`/admin/projects/${row.original.project_id}`}
        prefetch
        cacheFor="30s"
        className="font-medium hover:underline"
      >
        {row.original.project_name}
      </Link>
    ),
  },
  {
    accessorKey: 'user_display_name',
    header: 'User',
  },
  {
    accessorKey: 'flagged_by_display_name',
    header: 'Flagged By',
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5">
        <img src={row.original.flagged_by_avatar} alt="" className="size-4 rounded-full" />
        <span>{row.original.flagged_by_display_name}</span>
      </div>
    ),
  },
  {
    accessorKey: 'review_stage',
    header: 'Stage',
    cell: ({ row }) => {
      const stage = row.original.review_stage
      if (!stage) return <span className="text-muted-foreground">—</span>
      return <Badge variant="secondary">{STAGE_LABELS[stage] || stage}</Badge>
    },
  },
  {
    accessorKey: 'ship_id',
    header: 'Ship',
    cell: ({ row }) => row.original.ship_id ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: 'reason',
    header: 'Reason',
    cell: ({ row }) => (
      <span className="max-w-xs truncate block" title={row.original.reason}>
        {row.original.reason}
      </span>
    ),
  },
  {
    accessorKey: 'created_at',
    header: 'Flagged',
    cell: ({ row }) => <TimeAgo datetime={row.original.created_at} />,
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (!confirm('Remove this flag?')) return
          router.delete(`/admin/project_flags/${row.original.id}`)
        }}
      >
        Unflag
      </Button>
    ),
  },
]

export default function ProjectFlagsIndex({ flags, pagy }: { flags?: ProjectFlag[]; pagy?: PagyProps }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">
          Flagged Projects
          <Badge variant="destructive" className="ml-2 text-xs">
            {pagy?.count ?? <Skeleton className="h-4 w-8" />}
          </Badge>
        </h2>
      </div>
      <Deferred data={['flags', 'pagy']} fallback={<DataTableSkeleton columns={columns.length} />}>
        <DataTable columns={columns} data={flags ?? []} pagy={pagy} noun="flagged projects" />
      </Deferred>
    </div>
  )
}

ProjectFlagsIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
