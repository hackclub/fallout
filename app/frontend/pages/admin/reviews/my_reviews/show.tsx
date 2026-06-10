import type { ReactNode } from 'react'
import { usePage, Link } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Card } from '@/components/admin/ui/card'
import { ReviewStatusBadge } from '@/components/admin/ReviewStatusBadge'
import type { PageProps } from '@inertiajs/core'

interface ReviewRow {
  review_id: number
  review_type: string
  ship_id: number
  project_id: number
  project_name: string
  status: string
  feedback: string | null
  internal_reason: string | null
  reviewed_at: string
}

interface ReviewedUser {
  id: number
  display_name: string
  avatar: string | null
}

interface Props extends PageProps {
  reviewed_user: ReviewedUser
  reviews: ReviewRow[]
  is_own: boolean
}

function reviewTypeLabel(type: string): string {
  switch (type) {
    case 'requirements_check_review':
      return 'RC'
    case 'design_review':
      return 'Design'
    case 'build_review':
      return 'Build'
    case 'time_audit_review':
      return 'Time Audit'
    default:
      return type
  }
}

export default function MyReviewsShow() {
  const { reviewed_user, reviews, is_own } = usePage<Props>().props

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        {reviewed_user.avatar ? (
          <img src={reviewed_user.avatar} className="size-10 rounded-full shrink-0" alt="" />
        ) : (
          <div className="size-10 rounded-full bg-muted shrink-0" />
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {is_own ? 'My Reviews' : `${reviewed_user.display_name}'s Reviews`}
          </h1>
          <p className="text-sm text-muted-foreground">{reviews.length} total</p>
        </div>
      </div>

      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No completed reviews yet.</p>
      ) : (
        <Card className="py-0">
          <div className="divide-y divide-border">
            {reviews.map((r) => (
              <div key={`${r.review_type}-${r.review_id}`} className="p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ReviewStatusBadge status={r.status as 'approved' | 'returned' | 'rejected'} />
                    <Badge variant="outline" className="text-[10px]">
                      {reviewTypeLabel(r.review_type)}
                    </Badge>
                    <Link href={`/admin/projects/${r.project_id}`} className="text-sm font-medium hover:underline">
                      {r.project_name}
                    </Link>
                    <Link
                      href={`/admin/reviews/${r.ship_id}`}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      Ship {r.ship_id}
                    </Link>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{r.reviewed_at}</span>
                </div>
                {r.feedback && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                    <span className="font-medium text-foreground">Feedback:</span> {r.feedback}
                  </p>
                )}
                {r.internal_reason && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                    <span className="font-medium">Internal:</span> {r.internal_reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

MyReviewsShow.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
