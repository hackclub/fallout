import { type ReactNode, useState } from 'react'
import { usePage, router } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Textarea } from '@/components/admin/ui/textarea'
import { Separator } from '@/components/admin/ui/separator'
import { Calendar } from '@/components/admin/ui/calendar'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/admin/ui/chart'
import { Bar, BarChart } from 'recharts'
import { AlertTriangle, Pencil, Trash2, X, Check } from 'lucide-react'
import { PageProps } from '@inertiajs/core'

interface ReviewWeek {
  week: string
  rc: number
  dr: number
  br: number
  ta: number
  ta_hours: number
  low: boolean
  resolved: boolean
  resolution_id: number | null
  resolution_reason: string | null
}

interface Reviewer {
  id: number
  display_name: string
  avatar: string | null
  roles: string[]
  total_reviews: number
  rc_reviews: number
  reviews_by_week: ReviewWeek[]
  low_week_count: number
}

interface AdminNote {
  id: number
  body: string
  author_name: string
  created_at: string
}

interface Unavailability {
  id: number
  starts_on: string
  ends_on: string
  reason: string | null
}

interface Props extends PageProps {
  reviewer: Reviewer
  notes: AdminNote[]
  unavailabilities: Unavailability[]
  can_manage: boolean
}

const chartConfig: ChartConfig = {
  rc: { label: 'RC', color: 'hsl(217, 91%, 60%)' },
  dr: { label: 'DR', color: 'hsl(142, 71%, 45%)' },
  br: { label: 'BR', color: 'hsl(271, 81%, 60%)' },
  ta: { label: 'Time Audit', color: 'hsl(38, 92%, 50%)' },
}

const ROLE_LABELS: Record<string, string> = {
  requirements_checker: 'RC Reviewer',
  pass2_reviewer: 'Pass 2',
  time_auditor: 'Time Auditor',
  admin: 'Admin',
}

function roleBadge(role: string) {
  return (
    <Badge key={role} variant="secondary" className="text-xs">
      {ROLE_LABELS[role] ?? role}
    </Badge>
  )
}

function LowWeeksPanel({
  weeks,
  reviewerId,
  canManage,
}: {
  weeks: ReviewWeek[]
  reviewerId: number
  canManage: boolean
}) {
  const [resolving, setResolving] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [bulkReason, setBulkReason] = useState('')
  const [showBulk, setShowBulk] = useState(false)

  const lowWeeks = weeks.filter((w) => w.low)
  const unresolvedLow = lowWeeks.filter((w) => !w.resolved)

  function submitBulkResolve() {
    router.post(
      `/admin/reviewers/${reviewerId}/week_resolutions/bulk`,
      { week_starts: unresolvedLow.map((w) => w.week), reason: bulkReason },
      {
        onSuccess: () => {
          setShowBulk(false)
          setBulkReason('')
        },
      },
    )
  }

  function formatWeek(iso: string) {
    const d = new Date(iso + 'T00:00:00')
    return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  function submitResolve(week: string) {
    router.post(
      `/admin/reviewers/${reviewerId}/week_resolutions`,
      { week_start: week, reason },
      {
        onSuccess: () => {
          setResolving(null)
          setReason('')
        },
      },
    )
  }

  function unresolve(resolutionId: number) {
    router.delete(`/admin/reviewers/${reviewerId}/week_resolutions/${resolutionId}`)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Low weeks</CardTitle>
          {canManage && unresolvedLow.length > 1 && (
            <button
              onClick={() => setShowBulk((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {showBulk ? 'Cancel' : `Resolve all ${unresolvedLow.length}`}
            </button>
          )}
        </div>
        {showBulk && (
          <div className="flex gap-2 items-center mt-2">
            <Input
              placeholder="Reason (optional)"
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              className="text-sm h-7"
              autoFocus
            />
            <Button size="sm" className="h-7 text-xs shrink-0" onClick={submitBulkResolve}>
              Resolve all
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {lowWeeks.map((w) => (
          <div key={w.week} className="rounded border px-3 py-2 text-sm space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={w.resolved ? 'text-muted-foreground line-through' : ''}>{formatWeek(w.week)}</span>
                <span className={`text-xs font-medium ${w.resolved ? 'text-amber-600' : 'text-red-600'}`}>
                  {(w.rc + w.dr + w.br + w.ta).toFixed(1)} units ({w.rc} RC · {w.dr} DR · {w.br} BR · {w.ta_hours}h TA)
                </span>
                {w.resolved && (
                  <Badge variant="secondary" className="text-xs">
                    resolved
                  </Badge>
                )}
              </div>
              {canManage &&
                (w.resolved ? (
                  <button
                    onClick={() => unresolve(w.resolution_id!)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Unresolve
                  </button>
                ) : resolving === w.week ? (
                  <button
                    onClick={() => {
                      setResolving(null)
                      setReason('')
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={() => setResolving(w.week)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Resolve
                  </button>
                ))}
            </div>
            {w.resolved && w.resolution_reason && (
              <p className="text-xs text-muted-foreground">{w.resolution_reason}</p>
            )}
            {resolving === w.week && (
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="Reason (optional)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="text-sm h-7"
                  autoFocus
                />
                <Button size="sm" className="h-7 text-xs shrink-0" onClick={() => submitResolve(w.week)}>
                  Mark resolved
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function NoteItem({
  note,
  reviewerId,
  canManage,
  onDelete,
}: {
  note: AdminNote
  reviewerId: number
  canManage: boolean
  onDelete: (id: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note.body)

  function saveEdit() {
    router.patch(
      `/admin/reviewers/${reviewerId}/notes/${note.id}`,
      { body: draft },
      {
        onSuccess: () => setEditing(false),
      },
    )
  }

  function cancelEdit() {
    setDraft(note.body)
    setEditing(false)
  }

  return (
    <div className="rounded border p-3 text-sm space-y-1">
      <div className="flex items-start justify-between gap-2">
        {editing ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="flex-1 text-sm"
            autoFocus
          />
        ) : (
          <p className="whitespace-pre-wrap flex-1">{note.body}</p>
        )}
        {canManage && (
          <div className="flex gap-1 shrink-0">
            {editing ? (
              <>
                <button
                  onClick={saveEdit}
                  disabled={!draft.trim()}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  <Check className="size-3.5" />
                </button>
                <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground">
                  <Pencil className="size-3.5" />
                </button>
                <button onClick={() => onDelete(note.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {note.author_name} · {note.created_at}
      </p>
    </div>
  )
}

export default function ReviewerShow() {
  const { reviewer, notes, unavailabilities, can_manage } = usePage<Props>().props

  const [noteBody, setNoteBody] = useState('')
  const [unavailStart, setUnavailStart] = useState('')
  const [unavailEnd, setUnavailEnd] = useState('')
  const [unavailReason, setUnavailReason] = useState('')

  // Expand all unavailability ranges into individual dates for the calendar modifier
  const unavailDates: Date[] = unavailabilities.flatMap((u) => {
    const dates: Date[] = []
    const cur = new Date(u.starts_on + 'T00:00:00')
    const end = new Date(u.ends_on + 'T00:00:00')
    while (cur <= end) {
      dates.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    return dates
  })

  function submitNote(e: React.FormEvent) {
    e.preventDefault()
    router.post(
      `/admin/reviewers/${reviewer.id}/notes`,
      { body: noteBody },
      {
        onSuccess: () => setNoteBody(''),
      },
    )
  }

  function deleteNote(noteId: number) {
    router.delete(`/admin/reviewers/${reviewer.id}/notes/${noteId}`)
  }

  function submitUnavailability(e: React.FormEvent) {
    e.preventDefault()
    router.post(
      `/admin/reviewers/${reviewer.id}/unavailabilities`,
      {
        starts_on: unavailStart,
        ends_on: unavailEnd,
        reason: unavailReason,
      },
      {
        onSuccess: () => {
          setUnavailStart('')
          setUnavailEnd('')
          setUnavailReason('')
        },
      },
    )
  }

  function deleteUnavailability(id: number) {
    router.delete(`/admin/reviewers/${reviewer.id}/unavailabilities/${id}`)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        {reviewer.avatar ? (
          <img src={reviewer.avatar} className="size-14 rounded-full shrink-0" alt="" />
        ) : (
          <div className="size-14 rounded-full bg-muted shrink-0" />
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{reviewer.display_name}</h1>
          <div className="flex gap-1.5 mt-1 flex-wrap">
            {reviewer.roles.filter((r) => ROLE_LABELS[r]).map(roleBadge)}
          </div>
        </div>
      </div>

      {/* 15/week warning */}
      {reviewer.low_week_count > 0 &&
        (() => {
          const unresolvedLow = reviewer.reviews_by_week.filter((w) => w.low && !w.resolved)
          return (
            <div className="flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium">
                  {reviewer.low_week_count} week{reviewer.low_week_count > 1 ? 's' : ''} below 15 units:
                </span>{' '}
                {unresolvedLow
                  .map((w) => {
                    const d = new Date(w.week + 'T00:00:00')
                    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  })
                  .join(', ')}
              </div>
            </div>
          )
        })()}

      {/* Weekly chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Reviews per week
            <span className="ml-2 font-normal text-muted-foreground">({reviewer.rc_reviews} RC · {reviewer.total_reviews} all-time)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-40 w-full">
            <BarChart data={reviewer.reviews_by_week} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
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
                      if (name === 'rc') return [value, 'RC']
                      if (name === 'dr') return [value, 'DR']
                      if (name === 'br') return [value, 'BR']
                      return [value, name.toUpperCase()]
                    }}
                  />
                }
              />
              <Bar dataKey="rc" stackId="a" fill="var(--color-rc)" label={false} />
              <Bar dataKey="dr" stackId="a" fill="var(--color-dr)" label={false} />
              <Bar dataKey="br" stackId="a" fill="var(--color-br)" label={false} />
              <Bar dataKey="ta" stackId="a" radius={[2, 2, 0, 0]} fill="var(--color-ta)" label={false} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Low weeks */}
      {reviewer.reviews_by_week.some((w) => w.low) && (
        <LowWeeksPanel weeks={reviewer.reviews_by_week} reviewerId={reviewer.id} canManage={can_manage} />
      )}

      {/* Unavailability */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Unavailability</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Calendar
            mode="multiple"
            numberOfMonths={2}
            selected={unavailDates}
            onSelect={() => {}}
            modifiersClassNames={{ selected: 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-200' }}
            disabled
          />

          {unavailabilities.length > 0 && (
            <div className="space-y-2">
              {unavailabilities.map((u) => (
                <div key={u.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <span>
                    {new Date(u.starts_on + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    {' – '}
                    {new Date(u.ends_on + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    {u.reason && <span className="ml-2 text-muted-foreground">· {u.reason}</span>}
                  </span>
                  {can_manage && (
                    <button
                      onClick={() => deleteUnavailability(u.id)}
                      className="text-muted-foreground hover:text-destructive ml-3"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {can_manage && (
            <>
              <Separator />
              <form onSubmit={submitUnavailability} className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Start date</label>
                  <Input type="date" value={unavailStart} onChange={(e) => setUnavailStart(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">End date</label>
                  <Input type="date" value={unavailEnd} onChange={(e) => setUnavailEnd(e.target.value)} required />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-xs text-muted-foreground">Reason (optional)</label>
                  <Input
                    placeholder="e.g. vacation, finals week"
                    value={unavailReason}
                    onChange={(e) => setUnavailReason(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <Button type="submit" size="sm">
                    Add period
                  </Button>
                </div>
              </form>
            </>
          )}
        </CardContent>
      </Card>

      {/* Admin notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <NoteItem
                  key={note.id}
                  note={note}
                  reviewerId={reviewer.id}
                  canManage={can_manage}
                  onDelete={deleteNote}
                />
              ))}
            </div>
          )}

          {can_manage && (
            <>
              <Separator />
              <form onSubmit={submitNote} className="space-y-2">
                <Textarea
                  placeholder="Add a note…"
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  rows={3}
                />
                <Button type="submit" size="sm" disabled={!noteBody.trim()}>
                  Save note
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

ReviewerShow.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
