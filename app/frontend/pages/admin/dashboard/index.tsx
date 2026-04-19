import { useState, useRef, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/admin/ui/chart'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'

interface ReviewerStat {
  id: number
  display_name: string
  avatar: string | null
  review_count: number
  total_approved_seconds: number
}

interface PeriodStats {
  reviewers: ReviewerStat[]
  top_reviewer: ReviewerStat | null
  total_reviews: number
  total_approved_seconds: number
}

interface BacklogPoint {
  date: string
  backlog: number
}

interface Props {
  stats: {
    all_time: PeriodStats
    this_week: PeriodStats
  }
  backlog_chart: BacklogPoint[]
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

type SortKey = 'review_count' | 'total_approved_seconds'

function RankRow({ reviewer, rank, metric }: { reviewer: ReviewerStat; rank: number; metric: SortKey }) {
  const value = metric === 'review_count' ? `${reviewer.review_count}` : formatDuration(reviewer.total_approved_seconds)

  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0">
      <div className="w-6 text-center text-sm font-bold text-muted-foreground shrink-0">{rank}</div>
      {reviewer.avatar ? (
        <img src={reviewer.avatar} className="size-7 rounded-full shrink-0" alt="" />
      ) : (
        <div className="size-7 rounded-full bg-muted shrink-0" />
      )}
      <p className="flex-1 text-sm font-medium truncate">{reviewer.display_name}</p>
      <p className="text-sm font-semibold tabular-nums shrink-0">{value}</p>
    </div>
  )
}

function LeaderboardCard({
  title,
  metric,
  this_week,
  all_time,
}: {
  title: string
  metric: SortKey
  this_week: PeriodStats
  all_time: PeriodStats
}) {
  const [tab, setTab] = useState<'this_week' | 'all_time'>('this_week')
  const thisWeekRef = useRef<HTMLButtonElement>(null)
  const allTimeRef = useRef<HTMLButtonElement>(null)
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 })

  useLayoutEffect(() => {
    const btn = tab === 'this_week' ? thisWeekRef.current : allTimeRef.current
    const container = btn?.parentElement
    if (!btn || !container) return
    const containerRect = container.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    setPillStyle({ left: btnRect.left - containerRect.left, width: btnRect.width })
  }, [tab])
  const sorted = (data: PeriodStats) => [...data.reviewers].sort((a, b) => b[metric] - a[metric])
  const rows = sorted(tab === 'this_week' ? this_week : all_time)
  const direction = tab === 'this_week' ? 'slide-in-from-left-2' : 'slide-in-from-right-2'

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative inline-flex items-center bg-muted rounded-lg p-[3px] mb-3 text-sm font-medium">
          <div
            className="absolute top-[3px] bottom-[3px] bg-background rounded-md shadow-sm"
            style={{
              left: pillStyle.left,
              width: pillStyle.width,
              transition: 'left 400ms cubic-bezier(0.19, 1, 0.22, 1), width 400ms cubic-bezier(0.19, 1, 0.22, 1)',
            }}
          />
          <button
            ref={thisWeekRef}
            onClick={() => setTab('this_week')}
            className={`relative z-10 px-3 py-0.5 rounded-md transition-colors duration-200 ${tab === 'this_week' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            This Week
          </button>
          <button
            ref={allTimeRef}
            onClick={() => setTab('all_time')}
            className={`relative z-10 px-3 py-0.5 rounded-md transition-colors duration-200 ${tab === 'all_time' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            All Time
          </button>
        </div>
        <div key={tab} className={`animate-in fade-in-0 ${direction} duration-200`}>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tab === 'this_week' ? 'No data this week.' : 'No data.'}</p>
          ) : (
            rows.map((r, i) => <RankRow key={r.id} reviewer={r} rank={i + 1} metric={metric} />)
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const backlogChartConfig: ChartConfig = {
  backlog: { label: 'Unreviewed ships', color: 'var(--chart-1)' },
}

export default function AdminDashboardIndex() {
  const { stats, backlog_chart } = usePage<Props>().props

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Welcome to the Fallout admin panel.</p>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Unreviewed Ships</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={backlogChartConfig} className="h-[250px] w-full">
            <AreaChart data={backlog_chart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="backlogFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-backlog)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--color-backlog)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(v: string) => {
                  const d = new Date(v + 'T00:00:00')
                  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                }}
                interval="preserveStartEnd"
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(v: string) => {
                      const d = new Date(v + 'T00:00:00')
                      return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                    }}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="backlog"
                stroke="var(--color-backlog)"
                strokeWidth={2}
                fill="url(#backlogFill)"
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <div className="grid md:grid-cols-2 gap-4">
        <LeaderboardCard
          title="Reviews Completed"
          metric="review_count"
          this_week={stats.this_week}
          all_time={stats.all_time}
        />
        <LeaderboardCard
          title="Time Audited"
          metric="total_approved_seconds"
          this_week={stats.this_week}
          all_time={stats.all_time}
        />
      </div>
    </div>
  )
}

AdminDashboardIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
