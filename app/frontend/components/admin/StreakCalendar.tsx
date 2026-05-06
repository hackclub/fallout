import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/admin/ui/card'
import { Button } from '@/components/admin/ui/button'
import { Skeleton } from '@/components/admin/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/admin/ui/tooltip'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import type { AdminStreakData, AdminStreakDay } from '@/types'

const STATUS_COLORS: Record<AdminStreakDay['status'], string> = {
  active: 'bg-green-500',
  frozen: 'bg-blue-400',
  missed: 'bg-red-400',
  pending: 'bg-zinc-300 dark:bg-zinc-600',
}

const STATUS_LABELS: Record<AdminStreakDay['status'], string> = {
  active: 'Active',
  frozen: 'Frozen',
  missed: 'Missed',
  pending: 'Pending',
}

const ALL_STATUSES: AdminStreakDay['status'][] = ['active', 'frozen', 'missed', 'pending']

const STATUS_DOTS: Record<AdminStreakDay['status'], string> = {
  active: 'bg-green-500',
  frozen: 'bg-blue-400',
  missed: 'bg-red-400',
  pending: 'bg-zinc-400',
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function getMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1)
  const startPad = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (string | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push(iso)
  }
  return cells
}

function formatMonthYear(year: number, month: number) {
  return new Date(year, month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function StreakCalendarLoading() {
  return (
    <Card className="max-w-sm">
      <CardContent className="p-3">
        <Skeleton className="h-4 w-24 mb-2" />
        <div className="flex gap-2 mb-2">
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-5 w-14" />
        </div>
        <Skeleton className="h-36 w-full rounded-md" />
      </CardContent>
    </Card>
  )
}

function StatusMenu({
  iso,
  currentStatus,
  onSelect,
  onClose,
}: {
  iso: string
  currentStatus: AdminStreakDay['status'] | undefined
  onSelect: (date: string, status: AdminStreakDay['status']) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-1 z-50 min-w-28 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 animate-in fade-in-0 zoom-in-95"
    >
      {ALL_STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSelect(iso, s)}
          className={`w-full flex items-center gap-2 rounded-md px-1.5 py-1 text-xs select-none hover:bg-accent hover:text-accent-foreground ${currentStatus === s ? 'font-semibold' : ''}`}
        >
          <span className={`inline-block size-2 rounded-full ${STATUS_DOTS[s]}`} />
          {STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  )
}

export default function StreakCalendar({ data, userId }: { data: AdminStreakData; userId: number }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [contextDay, setContextDay] = useState<string | null>(null)
  const [localOverrides, setLocalOverrides] = useState<Map<string, AdminStreakDay['status']>>(new Map())
  const [stats, setStats] = useState({
    current_streak: data.current_streak,
    longest_streak: data.longest_streak,
    total_active_days: data.total_active_days,
    freezes_remaining: data.freezes_remaining,
  })

  const dayMap = useMemo(() => {
    const m = new Map<string, AdminStreakDay['status']>()
    for (const d of data.days) m.set(d.date, d.status)
    for (const [date, status] of localOverrides) m.set(date, status)
    return m
  }, [data.days, localOverrides])

  const cells = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth])

  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const setStatus = useCallback(
    (date: string, status: AdminStreakDay['status']) => {
      setLocalOverrides((prev) => new Map(prev).set(date, status))
      setContextDay(null)

      fetch(`/admin/users/${userId}/update_streak_day`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '',
        },
        body: JSON.stringify({ date, status }),
      }).then((res) => {
        if (res.ok) {
          res.json().then((json) => {
            setStats({
              current_streak: json.current_streak,
              longest_streak: json.longest_streak,
              total_active_days: json.total_active_days,
              freezes_remaining: json.freezes_remaining,
            })
          })
        } else {
          setLocalOverrides((prev) => {
            const next = new Map(prev)
            next.delete(date)
            return next
          })
        }
      })
    },
    [userId],
  )

  return (
    <Card className="max-w-sm">
      <CardContent className="p-3">
        <h3 className="text-xs font-medium mb-2">Streak</h3>

        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Stat label="Current" value={stats.current_streak} />
          <Stat label="Longest" value={stats.longest_streak} />
          <Stat label="Days" value={stats.total_active_days} />
          <Stat label="Freezes" value={stats.freezes_remaining} />
        </div>

        <div className="flex items-center justify-between mb-1.5">
          <Button variant="ghost" size="sm" onClick={prevMonth} className="h-5 w-5 p-0">
            <ChevronLeftIcon className="size-3" />
          </Button>
          <span className="text-[11px] font-medium">{formatMonthYear(viewYear, viewMonth)}</span>
          <Button variant="ghost" size="sm" onClick={nextMonth} className="h-5 w-5 p-0">
            <ChevronRightIcon className="size-3" />
          </Button>
        </div>

        <TooltipProvider>
          <div className="grid grid-cols-7 gap-px">
            {WEEKDAY_LABELS.map((d, i) => (
              <div key={i} className="text-[9px] text-muted-foreground text-center font-medium leading-4">
                {d}
              </div>
            ))}
            {cells.map((iso, i) => {
              if (!iso) return <div key={`pad-${i}`} className="h-5" />

              const status = dayMap.get(iso)
              const isToday = iso === todayIso
              const dayNum = parseInt(iso.split('-')[2], 10)

              return (
                <div key={iso} className="relative">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setContextDay(contextDay === iso ? null : iso)
                        }}
                        onClick={() => setContextDay(contextDay === iso ? null : iso)}
                        className={`h-5 rounded-[3px] flex items-center justify-center text-[9px] leading-none cursor-pointer select-none ${
                          status
                            ? STATUS_COLORS[status] + ' text-white font-medium'
                            : 'bg-muted/40 text-muted-foreground'
                        } ${isToday ? 'ring-1 ring-foreground ring-offset-1' : ''}`}
                      >
                        {dayNum}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="pointer-events-none">
                      {new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                      {status ? ` — ${STATUS_LABELS[status]}` : ''}
                    </TooltipContent>
                  </Tooltip>
                  {contextDay === iso && (
                    <StatusMenu
                      iso={iso}
                      currentStatus={status}
                      onSelect={setStatus}
                      onClose={() => setContextDay(null)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </TooltipProvider>

        <div className="flex items-center gap-2 mt-1.5 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <span className="inline-block size-1.5 rounded-full bg-green-500" /> Active
          </span>
          <span className="flex items-center gap-0.5">
            <span className="inline-block size-1.5 rounded-full bg-blue-400" /> Frozen
          </span>
          <span className="flex items-center gap-0.5">
            <span className="inline-block size-1.5 rounded-full bg-red-400" /> Missed
          </span>
          <span className="flex items-center gap-0.5">
            <span className="inline-block size-1.5 rounded-full bg-zinc-300" /> Pending
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-[10px] text-muted-foreground">
      {label} <span className="font-semibold text-foreground">{value}</span>
    </span>
  )
}
