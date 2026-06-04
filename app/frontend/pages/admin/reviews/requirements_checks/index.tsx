import type { ReactNode } from 'react'
import { Link, router, usePage } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { DataTable } from '@/components/admin/DataTable'
import { buildPendingColumns, buildAllColumns } from '@/components/admin/reviewColumns'
import { ReviewStatsHeader, type ReviewStats, type ReviewStatKey } from '@/components/admin/ReviewStats'
import type { ReviewRow, PagyProps } from '@/types'

const BASE_PATH = '/admin/reviews/requirements_checks'

export default function RequirementsChecksIndex({
  pending_reviews,
  all_reviews,
  pagy,
  start_reviewing_path,
  current_sort,
  stats_keys,
  stats,
}: {
  pending_reviews: ReviewRow[]
  all_reviews: ReviewRow[]
  pagy: PagyProps
  start_reviewing_path: string
  current_sort: 'hours' | 'waiting'
  stats_keys: ReviewStatKey[]
  stats?: ReviewStats
}) {
  const { admin_permissions } = usePage<{ admin_permissions?: { is_admin: boolean } }>().props
  const isAdmin = admin_permissions?.is_admin ?? false
  const sortByHours = current_sort === 'hours'

  const hoursColumn = {
    accessorKey: 'approved_public_hours',
    header: 'Hours',
    cell: ({ row }: { row: { original: ReviewRow } }) =>
      row.original.approved_public_hours != null ? (
        `${row.original.approved_public_hours}h`
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight mb-4">Requirements Checks</h1>
        <ReviewStatsHeader stats_keys={stats_keys} stats={stats} />
      </div>
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Pending Requirements Checks
            {pending_reviews.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {pending_reviews.length}
              </Badge>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <Button
              variant={sortByHours ? 'default' : 'outline'}
              size="sm"
              onClick={() =>
                router.get(BASE_PATH, { sort: sortByHours ? 'waiting' : 'hours' }, { preserveScroll: true, replace: true })
              }
            >
              {sortByHours ? 'Sort: Hours' : 'Sort: Time Waiting'}
            </Button>
            {pending_reviews.length > 0 && (
              <Button asChild size="sm">
                <Link href={`${start_reviewing_path}?sort=${sortByHours ? 'hours' : 'waiting'}`}>Start Reviewing</Link>
              </Button>
            )}
          </div>
        </div>
        <DataTable
          columns={buildPendingColumns(BASE_PATH, 'Time Audit done', sortByHours ? [hoursColumn] : [])}
          data={pending_reviews}
          noun="pending reviews"
          rowClassName={(row) => {
            const parts: string[] = []
            if (row.previously_reviewed_by_me) parts.push('bg-blue-50 dark:bg-blue-950/20')
            if (row.sibling_approved) parts.push('bg-yellow-50 dark:bg-yellow-950/20')
            return parts.length > 0 ? parts.join(' ') : undefined
          }}
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-3">All Requirements Checks</h2>
        <DataTable
          columns={buildAllColumns(isAdmin, BASE_PATH)}
          data={all_reviews}
          pagy={pagy}
          noun="reviews"
          rowClassName={(row) => (row.previously_reviewed_by_me ? 'bg-blue-50 dark:bg-blue-950/20' : undefined)}
        />
      </div>
    </div>
  )
}

RequirementsChecksIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
