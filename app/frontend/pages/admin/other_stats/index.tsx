import type { ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'

interface ReviewerInterval {
  reviewer_id: number
  display_name: string
  avatar: string | null
  avg_interval_seconds: number
  sample_count: number
}

interface Props {
  review_intervals: ReviewerInterval[]
}

function formatInterval(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function OtherStatsIndex() {
  const { review_intervals } = usePage<Props>().props

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Other Stats</h1>
        <p className="text-sm text-muted-foreground mt-1">Internal statistics not shown on the main dashboard.</p>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Avg Design/Build Review Interval</CardTitle>
          <p className="text-xs text-muted-foreground">
            Average time between consecutive reviews per reviewer. Excludes gaps &gt;30 min and first review of the day.
          </p>
        </CardHeader>
        <CardContent>
          {review_intervals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data yet.</p>
          ) : (
            <div className="space-y-0">
              {review_intervals.map((r, i) => (
                <div key={r.reviewer_id} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <div className="w-6 text-center text-sm font-bold text-muted-foreground shrink-0">{i + 1}</div>
                  {r.avatar ? (
                    <img src={r.avatar} className="size-7 rounded-full shrink-0" alt="" />
                  ) : (
                    <div className="size-7 rounded-full bg-muted shrink-0" />
                  )}
                  <p className="flex-1 text-sm font-medium truncate">{r.display_name}</p>
                  <p className="text-sm tabular-nums text-muted-foreground shrink-0">{r.sample_count} intervals</p>
                  <p className="text-sm font-semibold tabular-nums shrink-0">
                    {formatInterval(r.avg_interval_seconds)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

OtherStatsIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
