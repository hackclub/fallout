import type { ReactNode } from 'react'
import { Link, usePage } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { DataTable } from '@/components/admin/DataTable'
import { buildPendingColumns, buildAllColumns } from '@/components/admin/reviewColumns'
import { ReviewStatsHeader, type ReviewStats, type ReviewStatKey } from '@/components/admin/ReviewStats'
import type { ReviewRow, PagyProps } from '@/types'

const BASE_PATH = '/admin/reviews/build_reviews'

export default function BuildReviewsIndex({
  pending_reviews,
  all_reviews,
  pagy,
  start_reviewing_path,
  stats_keys,
  stats,
}: {
  pending_reviews: ReviewRow[]
  all_reviews: ReviewRow[]
  pagy: PagyProps
  start_reviewing_path: string
  stats_keys: ReviewStatKey[]
  stats?: ReviewStats
}) {
  const { admin_permissions } = usePage<{ admin_permissions?: { is_admin: boolean } }>().props
  const isAdmin = admin_permissions?.is_admin ?? false

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight mb-4">Build Reviews</h1>
        <ReviewStatsHeader stats_keys={stats_keys} stats={stats} />
      </div>
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
        <DataTable columns={buildPendingColumns(BASE_PATH)} data={pending_reviews} noun="pending reviews" />
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-3">All Build Reviews</h2>
        <DataTable columns={buildAllColumns(isAdmin, BASE_PATH)} data={all_reviews} pagy={pagy} noun="reviews" />
      </div>
    </div>
  )
}

BuildReviewsIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
