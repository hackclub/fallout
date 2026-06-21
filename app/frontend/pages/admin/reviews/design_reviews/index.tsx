import type { ReactNode } from 'react'
import { Link, Deferred, router, usePage } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { DataTable } from '@/components/admin/DataTable'
import { DataTableSkeleton } from '@/components/admin/DataTableSkeleton'
import { buildPendingColumns, buildAllColumns } from '@/components/admin/reviewColumns'
import { ReviewStatsHeader, type ReviewStats, type ReviewStatKey } from '@/components/admin/ReviewStats'
import TicketFilterButton from '@/components/admin/TicketFilterButton'
import type { ReviewRow, PagyProps } from '@/types'

const BASE_PATH = '/admin/reviews/design_reviews'

const reqCheckColumn = {
  accessorKey: 'requirements_check_reviewer_display_name',
  header: 'Req. Check By',
  cell: ({ row }: { row: { original: ReviewRow } }) =>
    row.original.requirements_check_reviewer_display_name ?? <span className="text-muted-foreground">—</span>,
}

export default function DesignReviewsIndex({
  pending_reviews,
  all_reviews,
  pagy,
  start_reviewing_path,
  current_sort,
  ticket_eligible,
  stats_keys,
  stats,
  sla_days,
}: {
  pending_reviews?: ReviewRow[]
  all_reviews?: ReviewRow[]
  pagy?: PagyProps
  start_reviewing_path: string
  current_sort: 'hours' | 'waiting'
  ticket_eligible: boolean
  stats_keys: ReviewStatKey[]
  stats?: ReviewStats
  sla_days?: number
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

  const pendingColumns = buildPendingColumns(
    BASE_PATH,
    undefined,
    sortByHours ? [reqCheckColumn, hoursColumn] : [reqCheckColumn],
    sla_days,
  )
  const allColumns = buildAllColumns(isAdmin, BASE_PATH, [reqCheckColumn])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight mb-4">Design Reviews</h1>
        <ReviewStatsHeader stats_keys={stats_keys} stats={stats} sla_days={sla_days} />
      </div>
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Pending Design Reviews
            {pending_reviews && pending_reviews.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {pending_reviews.length}
              </Badge>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <TicketFilterButton basePath={BASE_PATH} active={ticket_eligible} />
            <Button
              variant={sortByHours ? 'default' : 'outline'}
              size="sm"
              onClick={() =>
                router.get(
                  BASE_PATH,
                  { sort: sortByHours ? 'waiting' : 'hours' },
                  { preserveScroll: true, replace: true },
                )
              }
            >
              {sortByHours ? 'Sort: Hours' : 'Sort: Time Waiting'}
            </Button>
            {pending_reviews && pending_reviews.length > 0 && (
              <Button asChild size="sm">
                <Link href={`${start_reviewing_path}?sort=${sortByHours ? 'hours' : 'waiting'}`}>Start Reviewing</Link>
              </Button>
            )}
          </div>
        </div>
        <Deferred data="pending_reviews" fallback={<DataTableSkeleton columns={pendingColumns.length} />}>
          <DataTable
            columns={pendingColumns}
            data={pending_reviews ?? []}
            noun="pending reviews"
            rowClassName={(row) =>
              row.priority
                ? 'bg-green-100 dark:bg-green-950/40'
                : row.previously_reviewed_by_me
                  ? 'bg-blue-50 dark:bg-blue-950/20'
                  : undefined
            }
          />
        </Deferred>
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-3">All Design Reviews</h2>
        <Deferred data={['all_reviews', 'pagy']} fallback={<DataTableSkeleton columns={allColumns.length} />}>
          <DataTable
            columns={allColumns}
            data={all_reviews ?? []}
            pagy={pagy}
            noun="reviews"
            rowClassName={(row) => (row.previously_reviewed_by_me ? 'bg-blue-50 dark:bg-blue-950/20' : undefined)}
          />
        </Deferred>
      </div>
    </div>
  )
}

DesignReviewsIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
