import type { ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { Badge } from '@/components/admin/ui/badge'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/admin/ui/chart'
import { Bar, BarChart } from 'recharts'
import { PageProps } from '@inertiajs/core'

interface LeaderboardRow {
  id: number
  display_name: string
  avatar: string | null
  approved_projects: number
  design_returned_projects: number
  return_rate: number
}

interface Totals {
  approved_projects: number
  design_returned_projects: number
  return_rate: number
}

interface ReviewWeek {
  week: string
  count: number
}

interface ReviewerProfile {
  id: number
  display_name: string
  avatar: string | null
  total_reviews: number
  reviews_by_week: ReviewWeek[]
}

interface Props extends PageProps {
  leaderboard: LeaderboardRow[]
  totals: Totals
  reviewer_profiles: ReviewerProfile[]
}

function formatRate(value: number): string {
  return `${Math.round(value * 1000) / 10}%`
}

const profileChartConfig: ChartConfig = {
  count: { label: 'Reviews', color: 'hsl(217, 91%, 60%)' },
}

function ReviewerProfileCard({ profile }: { profile: ReviewerProfile }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          {profile.avatar ? (
            <img src={profile.avatar} className="size-9 rounded-full shrink-0" alt="" />
          ) : (
            <div className="size-9 rounded-full bg-muted shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{profile.display_name}</p>
            <p className="text-xs text-muted-foreground">{profile.total_reviews} reviews total</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ChartContainer config={profileChartConfig} className="h-16 w-full">
          <BarChart data={profile.reviews_by_week} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideLabel={false}
                  labelFormatter={(v: string) => {
                    const d = new Date(v + 'T00:00:00')
                    return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  }}
                />
              }
            />
            <Bar dataKey="count" fill="var(--color-count)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export default function RequirementsDesignDashboard() {
  const { leaderboard, totals, reviewer_profiles } = usePage<Props>().props

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Return %</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">RC-Approved Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{totals.approved_projects}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Returned In Design</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{totals.design_returned_projects}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Overall Return Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{formatRate(totals.return_rate)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Rank</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead className="text-right">Approved RC</TableHead>
                <TableHead className="text-right">Returned DR</TableHead>
                <TableHead className="text-right">Approved:Returned</TableHead>
                <TableHead className="text-right">Return Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No data :(
                  </TableCell>
                </TableRow>
              ) : (
                leaderboard.map((row, index) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {row.avatar ? (
                          <img src={row.avatar} className="size-8 rounded-full shrink-0" alt="" />
                        ) : (
                          <div className="size-8 rounded-full bg-muted shrink-0" />
                        )}
                        <span className="font-medium">{row.display_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.approved_projects}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.design_returned_projects}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.approved_projects}:{row.design_returned_projects}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={row.design_returned_projects > 0 ? 'destructive' : 'secondary'}>
                        {formatRate(row.return_rate)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-4">Reviewer Profiles</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {reviewer_profiles.map((profile) => (
            <ReviewerProfileCard key={profile.id} profile={profile} />
          ))}
        </div>
      </div>
    </div>
  )
}

RequirementsDesignDashboard.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
