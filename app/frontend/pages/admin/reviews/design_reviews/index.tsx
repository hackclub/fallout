import type { ReactNode } from 'react'
import { Link, usePage } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { DataTable } from '@/components/admin/DataTable'
import { buildPendingColumns, buildAllColumns } from '@/components/admin/reviewColumns'
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
}: {
  pending_reviews: ReviewRow[]
  all_reviews: ReviewRow[]
  pagy: PagyProps
  start_reviewing_path: string
}) {
  const { admin_permissions } = usePage<{ admin_permissions?: { is_admin: boolean } }>().props
  const isAdmin = admin_permissions?.is_admin ?? false

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Pending Design Reviews
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
        <DataTable
          columns={buildPendingColumns(BASE_PATH, undefined, [reqCheckColumn])}
          data={pending_reviews}
          noun="pending reviews"
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-3">All Design Reviews</h2>
        <DataTable
          columns={buildAllColumns(isAdmin, BASE_PATH, [reqCheckColumn])}
          data={all_reviews}
          pagy={pagy}
          noun="reviews"
        />
      </div>
    </div>
  )
}

DesignReviewsIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
