import type { ReactNode } from 'react'
import { Link } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { DataTable } from '@/components/admin/DataTable'
import { buildPendingColumns } from '@/components/admin/reviewColumns'
import type { ReviewRow } from '@/types'

const BASE_PATH = '/admin/reviews/build_review_backfills'

export default function BuildReviewBackfillsIndex({
  reviews,
  start_reviewing_path,
}: {
  reviews: ReviewRow[]
  start_reviewing_path: string
}) {
  const columns = buildPendingColumns(BASE_PATH)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Build Review Backfill</h1>
        <p className="text-sm text-muted-foreground">
          Approved build reviews still missing an internal justification, oldest submission first.
        </p>
      </div>
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Needs Backfill
            {reviews.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {reviews.length}
              </Badge>
            )}
          </h2>
          {reviews.length > 0 && (
            <Button asChild>
              <Link href={start_reviewing_path}>Start backfilling</Link>
            </Button>
          )}
        </div>
        <DataTable columns={columns} data={reviews} noun="reviews" />
      </div>
    </div>
  )
}

BuildReviewBackfillsIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
