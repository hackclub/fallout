import type { ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/admin/ui/chart'
import NumberPopIn from '@/components/admin/NumberPopIn'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  LeaderboardCard,
  formatDuration,
  toCountRows,
  toTimeRows,
  toContributedRows,
  type PeriodStats,
} from '@/components/admin/LeaderboardCard'

interface BacklogPoint {
  date: string
  backlog: number
}

interface BacklogHoursPoint {
  date: string
  hours: number
  total: number
}

interface RecentActivity {
  count: number
  avg_turnaround_seconds: number | null
}

interface Props {
  stats: {
    all_time: PeriodStats
    this_week: PeriodStats
  }
  backlog_chart: BacklogPoint[]
  backlog_hours_chart: BacklogHoursPoint[]
  recent_activity: RecentActivity
  [key: string]: unknown
}

const backlogChartConfig: ChartConfig = {
  backlog: { label: 'Unreviewed ships', color: 'hsl(217, 91%, 60%)' },
}

const backlogHoursChartConfig: ChartConfig = {
  hours: { label: 'Unreviewed hours', color: 'hsl(142, 71%, 45%)' },
}

const backlogTotalChartConfig: ChartConfig = {
  total: { label: 'Unreviewed total', color: 'hsl(38, 92%, 50%)' },
}

export default function AdminDashboardIndex() {
  const { stats, backlog_chart, backlog_hours_chart, recent_activity } = usePage<Props>().props

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Welcome to the Fallout admin panel.</p>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <LeaderboardCard
          title="Reviews Completed"
          this_week={toCountRows(stats.this_week)}
          all_time={toCountRows(stats.all_time)}
        />
        <LeaderboardCard
          title="Time Audited"
          this_week={toTimeRows(stats.this_week)}
          all_time={toTimeRows(stats.all_time)}
        />
        <LeaderboardCard
          title="Total Contributed"
          this_week={toContributedRows(stats.this_week)}
          all_time={toContributedRows(stats.all_time)}
        />
        <div className="flex flex-col gap-4 min-w-0">
          <Card className="t-card-lift max-w-full">
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
                        labelFormatter={(v: unknown) => {
                          const d = new Date(String(v) + 'T00:00:00')
                          return d.toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                          })
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
          <Card className="t-card-lift max-w-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Unreviewed Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={backlogHoursChartConfig} className="h-[250px] w-full">
                <AreaChart data={backlog_hours_chart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="hoursFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-hours)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--color-hours)" stopOpacity={0.02} />
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
                        labelFormatter={(v: unknown) => {
                          const d = new Date(String(v) + 'T00:00:00')
                          return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                        }}
                        formatter={(v) => [`${v}h`, 'Unreviewed hours']}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="hours"
                    stroke="var(--color-hours)"
                    strokeWidth={2}
                    fill="url(#hoursFill)"
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
          <Card className="t-card-lift max-w-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Unreviewed Total</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={backlogTotalChartConfig} className="h-[250px] w-full">
                <AreaChart data={backlog_hours_chart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="totalFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-total)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--color-total)" stopOpacity={0.02} />
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
                        labelFormatter={(v: unknown) => {
                          const d = new Date(String(v) + 'T00:00:00')
                          return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                        }}
                        formatter={(v) => [v, 'Review units (ships + hours÷10)']}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="var(--color-total)"
                    strokeWidth={2}
                    fill="url(#totalFill)"
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
          <Card className="t-card-lift max-w-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Requirements Checks (Last 24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums">
                <NumberPopIn value={recent_activity.count} />
              </p>
              <p className="text-sm text-muted-foreground mt-1">ships reviewed</p>
            </CardContent>
          </Card>
          <Card className="t-card-lift max-w-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Avg. Requirements Check Turnaround (24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums">
                {recent_activity.avg_turnaround_seconds != null ? (
                  <NumberPopIn value={formatDuration(recent_activity.avg_turnaround_seconds)} />
                ) : (
                  '—'
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

AdminDashboardIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
