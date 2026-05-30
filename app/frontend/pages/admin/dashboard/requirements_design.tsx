import { useState } from 'react'
import type { ReactNode } from 'react'
import { usePage, Link, router } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/admin/ui/chart'
import { Bar, BarChart } from 'recharts'
import { MessageCircleIcon, X } from 'lucide-react'
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
  rc: number
  dr: number
  ta: number
  ta_hours: number
  low: boolean
}

interface ReviewerProfile {
  id: number
  display_name: string
  avatar: string | null
  total_reviews: number
  rc_reviews: number
  reviews_by_week: ReviewWeek[]
}

interface NonReviewerMember {
  id: number
  display_name: string
  avatar: string | null
}

interface Props extends PageProps {
  leaderboard: LeaderboardRow[]
  totals: Totals
  reviewer_profiles: ReviewerProfile[]
  non_reviewer_channel_members: NonReviewerMember[]
}

function formatRate(value: number): string {
  return `${Math.round(value * 1000) / 10}%`
}

const profileChartConfig: ChartConfig = {
  rc: { label: 'RC', color: 'hsl(217, 91%, 60%)' },
  dr: { label: 'DR', color: 'hsl(142, 71%, 45%)' },
  ta: { label: 'Time Audit', color: 'hsl(38, 92%, 50%)' },
}

const DM_PREFIX = 'reviewer_dm:'
const DM_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

function loadDmDate(id: number): Date | null {
  try {
    const raw = localStorage.getItem(`${DM_PREFIX}${id}`)
    if (!raw) return null
    const date = new Date(raw)
    if (Date.now() - date.getTime() > DM_EXPIRY_MS) {
      localStorage.removeItem(`${DM_PREFIX}${id}`)
      return null
    }
    return date
  } catch {
    return null
  }
}

function saveDmDate(id: number): Date {
  const now = new Date()
  try {
    localStorage.setItem(`${DM_PREFIX}${id}`, now.toISOString())
  } catch {}
  return now
}

function removeDmDate(id: number): void {
  try {
    localStorage.removeItem(`${DM_PREFIX}${id}`)
  } catch {}
}

function formatDmDate(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000))
  const diffMins = Math.floor(diffMs / (60 * 1000))

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'yesterday'
  return `${diffDays}d ago`
}

function ReviewerProfileCard({
  profile,
  dmDate,
  onToggle,
}: {
  profile: ReviewerProfile
  dmDate: Date | null
  onToggle: () => void
}) {
  const hasLowWeek = profile.reviews_by_week.some((w) => w.low)
  return (
    <Link href={`/admin/reviewers/${profile.id}`} className="block hover:no-underline">
      <Card className="hover:bg-muted/50 transition-colors">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            {profile.avatar ? (
              <img src={profile.avatar} className="size-9 rounded-full shrink-0" alt="" />
            ) : (
              <div className="size-9 rounded-full bg-muted shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{profile.display_name}</p>
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-muted-foreground">{profile.rc_reviews} RC · {profile.total_reviews} all-time</p>
                {hasLowWeek && (
                  <span title="Has weeks below 15 reviews" className="text-yellow-500">
                    ⚠
                  </span>
                )}
              </div>
            </div>
            <Button
              variant={dmDate ? 'default' : 'outline'}
              size="sm"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onToggle()
              }}
              className="shrink-0"
              title={dmDate ? `DMed ${dmDate.toLocaleString()} — click to unmark` : 'Mark as DMed'}
            >
              <MessageCircleIcon className="size-3.5" />
              {dmDate ? formatDmDate(dmDate) : 'DM'}
            </Button>
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
                    formatter={(value, name, item) => {
                      if (name === 'ta') return [`${item.payload.ta_hours} hrs`, 'Time Audit']
                      return [value, (name as string).toUpperCase()]
                    }}
                  />
                }
              />
              <Bar dataKey="rc" stackId="a" fill="var(--color-rc)" />
              <Bar dataKey="dr" stackId="a" fill="var(--color-dr)" />
              <Bar dataKey="ta" stackId="a" radius={[2, 2, 0, 0]} fill="var(--color-ta)" />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </Link>
  )
}

export default function RequirementsDesignDashboard() {
  const { leaderboard, totals, reviewer_profiles, non_reviewer_channel_members } = usePage<Props>().props

  const [dmStates, setDmStates] = useState<Record<number, Date | null>>(() => {
    const result: Record<number, Date | null> = {}
    for (const p of reviewer_profiles) {
      result[p.id] = loadDmDate(p.id)
    }
    return result
  })

  const handleToggle = (id: number) => {
    setDmStates((prev) => {
      if (prev[id]) {
        removeDmDate(id)
        return { ...prev, [id]: null }
      } else {
        const date = saveDmDate(id)
        return { ...prev, [id]: date }
      }
    })
  }

  const handleClearAll = () => {
    reviewer_profiles.forEach((p) => removeDmDate(p.id))
    setDmStates((prev) => {
      const cleared: Record<number, Date | null> = { ...prev }
      for (const k of Object.keys(cleared)) {
        cleared[Number(k)] = null
      }
      return cleared
    })
  }

  const anyDmActive = reviewer_profiles.some((p) => dmStates[p.id] != null)

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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold tracking-tight">Reviewer Profiles</h2>
          {anyDmActive && (
            <Button variant="outline" size="sm" onClick={handleClearAll}>
              Clear all DMs
            </Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {reviewer_profiles.map((profile) => (
            <ReviewerProfileCard
              key={profile.id}
              profile={profile}
              dmDate={dmStates[profile.id] ?? null}
              onToggle={() => handleToggle(profile.id)}
            />
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-1">Not Yet a Reviewer</h2>
        <p className="text-sm text-muted-foreground mb-4">
          In the RC channel · has a Fallout account · no reviewer role assigned
        </p>
        {non_reviewer_channel_members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everyone in the channel is already a reviewer.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {non_reviewer_channel_members.map((member) => (
              <Link
                key={member.id}
                href={`/admin/users/${member.id}`}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
              >
                {member.avatar ? (
                  <img src={member.avatar} className="size-6 rounded-full shrink-0" alt="" />
                ) : (
                  <div className="size-6 rounded-full bg-muted shrink-0" />
                )}
                <span>{member.display_name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    router.patch(`/admin/users/${member.id}/toggle_reviewer_suggestion`, {}, { preserveScroll: true })
                  }}
                  title="Exclude from suggestions"
                  className="text-muted-foreground hover:text-destructive ml-1"
                >
                  <X className="size-3" />
                </button>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

RequirementsDesignDashboard.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
