import type { ReactNode } from 'react'
import { Link } from '@inertiajs/react'
import type { ColumnDef } from '@tanstack/react-table'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { DataTable } from '@/components/admin/DataTable'
import type { ReviewRow, PagyProps } from '@/types'

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  approved: 'default',
  returned: 'destructive',
  rejected: 'destructive',
  cancelled: 'outline',
}

const pendingColumns: ColumnDef<ReviewRow>[] = [
  {
    accessorKey: 'project_name',
    header: 'Project',
    cell: ({ row }) => (
      <Link href={`/admin/reviews/build_reviews/${row.original.id}`} className="font-medium hover:underline">
        {row.original.project_name}
      </Link>
    ),
  },
  {
    accessorKey: 'user_display_name',
    header: 'Owner',
  },
  {
    accessorKey: 'reviewer_display_name',
    header: 'Reviewer',
    cell: ({ row }) => {
      if (row.original.is_claimed) {
        return (
          <Badge variant="outline" className="text-xs">
            Claimed by {row.original.claimed_by_display_name}
          </Badge>
        )
      }
      return row.original.reviewer_display_name ?? <span className="text-muted-foreground">Unassigned</span>
    },
  },
  {
    accessorKey: 'created_at',
    header: 'Waiting Since',
  },
]

const allColumns: ColumnDef<ReviewRow>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => (
      <Link href={`/admin/reviews/build_reviews/${row.original.id}`} className="text-muted-foreground hover:underline">
        {row.original.id}
      </Link>
    ),
  },
  {
    accessorKey: 'project_name',
    header: 'Project',
    cell: ({ row }) => <span className="font-medium">{row.original.project_name}</span>,
  },
  {
    accessorKey: 'user_display_name',
    header: 'Owner',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={statusColors[row.original.status] ?? 'outline'} className="capitalize">
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: 'reviewer_display_name',
    header: 'Reviewed By',
    cell: ({ row }) => row.original.reviewer_display_name ?? <span className="text-muted-foreground">—</span>,
  },
  {
    accessorKey: 'created_at',
    header: 'Created',
  },
]

export default function BuildReviewsIndex({
  pending_reviews,
  all_reviews,
  pagy,
  start_reviewing_path,
}: {
  pending_reviews: ReviewRow[]
  all_reviews: ReviewRow[]
  pagy: PagyProps
  start_reviewing_path: string
}) {
  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Pending Build Reviews
            {pending_reviews.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {pending_reviews.length}
              </Badge>
            )}
          </h2>
          {pending_reviews.length > 0 && (
            <Button asChild size="sm">
              <Link href={start_reviewing_path}>Start Reviewing</Link>
            </Button>
          )}
        </div>
        <DataTable columns={pendingColumns} data={pending_reviews} noun="pending reviews" />
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-3">All Build Reviews</h2>
        <DataTable columns={allColumns} data={all_reviews} pagy={pagy} noun="reviews" />
      </div>
    </div>
  )
}

BuildReviewsIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
