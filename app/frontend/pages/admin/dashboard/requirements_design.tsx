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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/admin/ui/sheet'
import { MessageCircleIcon, X } from 'lucide-react'
import { PageProps } from '@inertiajs/core'
import {
  LeaderboardCard,
  toContributedRows,
  formatTrackerDate,
  type PeriodStats,
} from '@/components/admin/LeaderboardCard'

interface ReturnedProject {
  id: number
  name: string
}

interface LeaderboardRow {
  id: number
  display_name: string
  avatar: string | null
  approved_projects: number
  design_returned_projects: number
  return_rate: number
  returned_dr_projects: ReturnedProject[]
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
  br: number
  ta: number
  ta_hours: number
  low: boolean
  resolved: boolean
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
  contribution_stats: {
    all_time: PeriodStats
    this_week: PeriodStats
    hidden: {
      all_time: PeriodStats
      this_week: PeriodStats
    }
  }
}

function formatRate(value: number): string {
  return `${Math.round(value * 1000) / 10}%`
}

const profileChartConfig: ChartConfig = {
  rc: { label: 'RC', color: 'hsl(217, 91%, 60%)' },
  dr: { label: 'DR', color: 'hsl(142, 71%, 45%)' },
  br: { label: 'BR', color: 'hsl(271, 81%, 60%)' },
  ta: { label: 'Time Audit', color: 'hsl(38, 92%, 50%)' },
}

const DM_PREFIX = 'reviewer_dm:'
const TRACKER_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

function loadTrackerDate(prefix: string, id: number): Date | null {
  try {
    const raw = localStorage.getItem(`${prefix}${id}`)
    if (!raw) return null
    const date = new Date(raw)
    if (Date.now() - date.getTime() > TRACKER_EXPIRY_MS) {
      localStorage.removeItem(`${prefix}${id}`)
      return null
    }
    return date
  } catch {
    return null
  }
}

function saveTrackerDate(prefix: string, id: number): Date {
  const now = new Date()
  try {
    localStorage.setItem(`${prefix}${id}`, now.toISOString())
  } catch {}
  return now
}

function removeTrackerDate(prefix: string, id: number): void {
  try {
    localStorage.removeItem(`${prefix}${id}`)
  } catch {}
}

function unresolvedLowWeeks(profile: ReviewerProfile): ReviewWeek[] {
  return profile.reviews_by_week.filter((w) => w.low && !w.resolved)
}

function ReviewerProfileCard({
  profile,
  dmDate,
  onToggle,
  resolving,
  onResolve,
}: {
  profile: ReviewerProfile
  dmDate: Date | null
  onToggle: () => void
  resolving: boolean
  onResolve: () => void
}) {
  const hasLowWeek = profile.reviews_by_week.some((w) => w.low)
  const unresolved = unresolvedLowWeeks(profile)
  const isResolved = hasLowWeek && unresolved.length === 0
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
                <p className="text-xs text-muted-foreground">
                  {profile.rc_reviews} RC · {profile.total_reviews} all-time
                </p>
                {hasLowWeek &&
                  (isResolved ? (
                    <span title="All low weeks resolved" className="text-muted-foreground">
                      ✓
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={resolving}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onResolve()
                      }}
                      title={`Resolve ${unresolved.length} low week${unresolved.length > 1 ? 's' : ''} (visible on their reviewer page)`}
                      className="text-yellow-500 hover:text-yellow-600 disabled:opacity-50"
                    >
                      ⚠
                    </button>
                  ))}
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
              {dmDate ? formatTrackerDate(dmDate) : 'DM'}
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
                    labelFormatter={(v: unknown) => {
                      const d = new Date(String(v) + 'T00:00:00')
                      return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    }}
                    formatter={(value, name, item) => {
                      if (name === 'ta') return [`${item.payload.ta_hours} hrs`, 'Time Audit']
                      if (name === 'rc') return [value, 'RC']
                      if (name === 'dr') return [value, 'DR']
                      if (name === 'br') return [value, 'BR']
                      return [value, (name as string).toUpperCase()]
                    }}
                  />
                }
              />
              <Bar dataKey="rc" stackId="a" fill="var(--color-rc)" />
              <Bar dataKey="dr" stackId="a" fill="var(--color-dr)" />
              <Bar dataKey="br" stackId="a" fill="var(--color-br)" />
              <Bar dataKey="ta" stackId="a" radius={[2, 2, 0, 0]} fill="var(--color-ta)" />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </Link>
  )
}

export default function RequirementsDesignDashboard() {
  const { leaderboard, totals, reviewer_profiles, non_reviewer_channel_members, contribution_stats } =
    usePage<Props>().props
  const { admin_permissions } = usePage<{ admin_permissions?: { is_admin: boolean } }>().props
  const isAdmin = admin_permissions?.is_admin ?? false

  // Toggles excluded_from_dashboard; an optional reason is saved as a note on
  // the user's /admin/reviewers/:id page (visible there under "Notes"). An
  // optional excluded_until date returns the user to the visible list (flagged
  // for review) once it passes, instead of staying hidden indefinitely.
  function excuseFromContributions(id: number, reason: string, excludedUntil?: string) {
    router.patch(
      `/admin/users/${id}/toggle_dashboard_exclusion`,
      { reason, excluded_until: excludedUntil },
      { preserveScroll: true },
    )
  }

  function unhideFromContributions(id: number) {
    router.patch(`/admin/users/${id}/toggle_dashboard_exclusion`, {}, { preserveScroll: true })
  }

  function reduceExpectations(id: number, reason: string, target: number, until?: string) {
    router.patch(
      `/admin/users/${id}/toggle_reduced_expectations`,
      { reason, target, reduced_until: until },
      { preserveScroll: true },
    )
  }

  function unreduceExpectations(id: number) {
    router.patch(`/admin/users/${id}/toggle_reduced_expectations`, {}, { preserveScroll: true })
  }

  const [returnedSheet, setReturnedSheet] = useState<LeaderboardRow | null>(null)

  const [dmStates, setDmStates] = useState<Record<number, Date | null>>(() => {
    const result: Record<number, Date | null> = {}
    for (const p of reviewer_profiles) {
      result[p.id] = loadTrackerDate(DM_PREFIX, p.id)
    }
    return result
  })

  const handleToggle = (id: number) => {
    setDmStates((prev) => {
      if (prev[id]) {
        removeTrackerDate(DM_PREFIX, id)
        return { ...prev, [id]: null }
      } else {
        const date = saveTrackerDate(DM_PREFIX, id)
        return { ...prev, [id]: date }
      }
    })
  }

  const handleClearAll = () => {
    reviewer_profiles.forEach((p) => removeTrackerDate(DM_PREFIX, p.id))
    setDmStates((prev) => {
      const cleared: Record<number, Date | null> = { ...prev }
      for (const k of Object.keys(cleared)) {
        cleared[Number(k)] = null
      }
      return cleared
    })
  }

  const anyDmActive = reviewer_profiles.some((p) => dmStates[p.id] != null)

  const lowWeekProfiles = reviewer_profiles.filter((p) => p.reviews_by_week.some((w) => w.low))
  const anyUnresolvedLowWeek = lowWeekProfiles.some((p) => unresolvedLowWeeks(p).length > 0)

  const [resolvingId, setResolvingId] = useState<number | null>(null)

  // Posts to the same week_resolutions/bulk endpoint the reviewer page uses — redirect_back
  // returns here with refreshed reviewer_profiles so the ✓ reflects immediately, and the
  // resolution shows up on /admin/reviewers/:id too since they read the same records.
  function resolveProfile(profile: ReviewerProfile, onFinish?: () => void) {
    const unresolved = unresolvedLowWeeks(profile)
    if (unresolved.length === 0) {
      onFinish?.()
      return
    }
    setResolvingId(profile.id)
    router.post(
      `/admin/reviewers/${profile.id}/week_resolutions/bulk`,
      { week_starts: unresolved.map((w) => w.week) },
      {
        preserveScroll: true,
        onFinish: () => {
          setResolvingId(null)
          onFinish?.()
        },
      },
    )
  }

  const handleResolveAll = () => {
    const queue = lowWeekProfiles.filter((p) => unresolvedLowWeeks(p).length > 0)
    const next = () => {
      const profile = queue.shift()
      if (profile) resolveProfile(profile, next)
    }
    next()
  }

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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Rank</TableHead>
                  <TableHead>Reviewer</TableHead>
                  <TableHead className="text-right">Approved:Returned</TableHead>
                  <TableHead className="text-right">Return Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
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
                      <TableCell className="text-right tabular-nums">
                        {row.approved_projects}:{row.design_returned_projects}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.design_returned_projects > 0 ? (
                          <button type="button" onClick={() => setReturnedSheet(row)}>
                            <Badge variant="destructive" className="cursor-pointer hover:opacity-80">
                              {formatRate(row.return_rate)}
                            </Badge>
                          </button>
                        ) : (
                          <Badge variant="secondary">{formatRate(row.return_rate)}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <LeaderboardCard
          title="Total Contributed"
          this_week={toContributedRows(contribution_stats.this_week)}
          all_time={toContributedRows(contribution_stats.all_time)}
          hidden_this_week={toContributedRows(contribution_stats.hidden.this_week)}
          hidden_all_time={toContributedRows(contribution_stats.hidden.all_time)}
          dmStates={dmStates}
          onToggleDm={handleToggle}
          onExcuse={excuseFromContributions}
          onUnhide={unhideFromContributions}
          onReduceExpectations={reduceExpectations}
          onUnreduce={unreduceExpectations}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold tracking-tight">Reviewer Profiles</h2>
          <div className="flex items-center gap-2">
            {anyUnresolvedLowWeek && (
              <Button variant="outline" size="sm" onClick={handleResolveAll} disabled={resolvingId != null}>
                {resolvingId != null ? 'Resolving…' : 'Resolve all low-week warnings'}
              </Button>
            )}
            {anyDmActive && (
              <Button variant="outline" size="sm" onClick={handleClearAll}>
                Clear all DMs
              </Button>
            )}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {reviewer_profiles.map((profile) => (
            <ReviewerProfileCard
              key={profile.id}
              profile={profile}
              dmDate={dmStates[profile.id] ?? null}
              onToggle={() => handleToggle(profile.id)}
              resolving={resolvingId === profile.id}
              onResolve={() => resolveProfile(profile)}
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
              <div key={member.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <Link href={`/admin/users/${member.id}`} className="flex items-center gap-2 flex-1 hover:underline">
                  {member.avatar ? (
                    <img src={member.avatar} className="size-6 rounded-full shrink-0" alt="" />
                  ) : (
                    <div className="size-6 rounded-full bg-muted shrink-0" />
                  )}
                  <span>{member.display_name}</span>
                </Link>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() =>
                      router.patch(`/admin/users/${member.id}/toggle_reviewer_suggestion`, {}, { preserveScroll: true })
                    }
                    title="Exclude from suggestions"
                    aria-label="Exclude from suggestions"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <Sheet
        open={returnedSheet !== null}
        onOpenChange={(open) => {
          if (!open) setReturnedSheet(null)
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Returned DR — {returnedSheet?.display_name}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {returnedSheet?.returned_dr_projects.map((project) => (
              <Link
                key={project.id}
                href={`/admin/projects/${project.id}`}
                className="block rounded border px-3 py-2 text-sm hover:bg-muted"
              >
                {project.name}
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

RequirementsDesignDashboard.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
