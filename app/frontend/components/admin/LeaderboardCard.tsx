import { useState, useRef, useLayoutEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Input } from '@/components/admin/ui/input'
import { ChevronDown, ChevronUp, Eye, EyeOff, Check, X, MessageCircleIcon, TrendingDown } from 'lucide-react'

export function formatTrackerDate(date: Date): string {
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

export interface ReviewCountStat {
  id: number
  display_name: string
  avatar: string | null
  review_count: number
  is_reviewer?: boolean
  reason?: string | null
  needs_review?: boolean
  excluded_until?: string | null
  reduced_expectations_reason?: string | null
  reduced_expectations_until?: string | null
  reduced_expectations_target?: number | null
}

export interface TimeAuditedStat {
  id: number
  display_name: string
  avatar: string | null
  total_approved_seconds: number
  reason?: string | null
  needs_review?: boolean
  excluded_until?: string | null
  reduced_expectations_reason?: string | null
  reduced_expectations_until?: string | null
  reduced_expectations_target?: number | null
}

export interface PeriodStats {
  reviewers: ReviewCountStat[]
  time_audited: TimeAuditedStat[]
}

export interface RowItem {
  id: number
  display_name: string
  avatar: string | null
  value: number
  label: string
  is_reviewer?: boolean
  reason?: string | null
  needs_review?: boolean
  excluded_until?: string | null
  reduced_expectations_reason?: string | null
  reduced_expectations_until?: string | null
  reduced_expectations_target?: number | null
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function toCountRows(data: PeriodStats): RowItem[] {
  return data.reviewers.map((r) => ({ ...r, value: r.review_count, label: `${r.review_count}` }))
}

export function toTimeRows(data: PeriodStats): RowItem[] {
  return data.time_audited.map((r) => ({
    ...r,
    value: r.total_approved_seconds,
    label: formatDuration(r.total_approved_seconds),
  }))
}

export function toContributedRows(data: PeriodStats): RowItem[] {
  const reviewMap = new Map(data.reviewers.map((r) => [r.id, r]))
  const timeMap = new Map(data.time_audited.map((r) => [r.id, r]))
  const allIds = new Set([...reviewMap.keys(), ...timeMap.keys()])
  return Array.from(allIds)
    .map((id) => {
      const base = reviewMap.get(id) ?? timeMap.get(id)!
      const reviews = reviewMap.get(id)?.review_count ?? 0
      const hours = (timeMap.get(id)?.total_approved_seconds ?? 0) / 3600
      const contributed = hours / 10 + reviews
      const rv = reviewMap.get(id)
      const tv = timeMap.get(id)
      return {
        id: base.id,
        display_name: base.display_name,
        avatar: base.avatar,
        value: contributed,
        label: contributed.toFixed(1),
        is_reviewer: rv?.is_reviewer,
        reason: rv?.reason ?? tv?.reason,
        needs_review: rv?.needs_review ?? tv?.needs_review,
        excluded_until: rv?.excluded_until ?? tv?.excluded_until,
        reduced_expectations_reason: rv?.reduced_expectations_reason ?? tv?.reduced_expectations_reason,
        reduced_expectations_until: rv?.reduced_expectations_until ?? tv?.reduced_expectations_until,
        reduced_expectations_target: rv?.reduced_expectations_target ?? tv?.reduced_expectations_target,
      }
    })
    .sort((a, b) => b.value - a.value)
}

function RankRow({
  item,
  rank,
  dmDate,
  onToggleDm,
  onExcuse,
  onUnhide,
  onReduceExpectations,
  onUnreduce,
}: {
  item: RowItem
  rank: number
  dmDate?: Date | null
  onToggleDm?: () => void
  onExcuse?: (id: number, reason: string, excludedUntil?: string) => void
  onUnhide?: (id: number) => void
  onReduceExpectations?: (id: number, reason: string, target: number, until?: string) => void
  onUnreduce?: (id: number) => void
}) {
  const [excusing, setExcusing] = useState(false)
  const [reason, setReason] = useState('')
  const [excludedUntil, setExcludedUntil] = useState('')

  const [reducing, setReducing] = useState(false)
  const [reduceReason, setReduceReason] = useState('')
  const [reduceTarget, setReduceTarget] = useState('')
  const [reducedUntil, setReducedUntil] = useState('')

  function submitExcuse() {
    onExcuse?.(item.id, reason, excludedUntil || undefined)
    setExcusing(false)
    setReason('')
    setExcludedUntil('')
  }

  function submitReduce() {
    onReduceExpectations?.(item.id, reduceReason, parseFloat(reduceTarget) || 0, reducedUntil || undefined)
    setReducing(false)
    setReduceReason('')
    setReduceTarget('')
    setReducedUntil('')
  }

  const hasReducedExpectations = item.reduced_expectations_reason != null

  const rowBg = item.needs_review
    ? 'border-l-2 border-l-destructive bg-destructive/10 pl-2'
    : hasReducedExpectations
      ? 'bg-blue-50 dark:bg-blue-950/20'
      : ''

  function formatDate(iso: string) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div
      className={`t-row-enter group flex items-center gap-3 py-2 border-b last:border-0 ${rowBg}`}
      style={{ animationDelay: `${Math.min(rank - 1, 8) * 30}ms` }}
    >
      <div className="w-6 text-center text-sm font-bold text-muted-foreground shrink-0">{rank}</div>
      {item.avatar ? (
        <img src={item.avatar} className="size-7 rounded-full shrink-0" alt="" />
      ) : (
        <div className="size-7 rounded-full bg-muted shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${item.is_reviewer === false ? 'italic' : ''}`}>
          {item.display_name}
        </p>
        {item.reason && <p className="text-xs text-muted-foreground truncate">{item.reason}</p>}
        {item.excluded_until && (
          <p className="text-xs text-muted-foreground truncate">until {formatDate(item.excluded_until)}</p>
        )}
        {hasReducedExpectations && (
          <p className="text-xs text-yellow-700 truncate">
            {[
              item.reduced_expectations_reason,
              item.reduced_expectations_target != null ? `target: ${item.reduced_expectations_target}` : null,
              item.reduced_expectations_until ? `until ${formatDate(item.reduced_expectations_until)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </div>
      {excusing ? (
        <div className="flex items-center gap-1 shrink-0">
          <Input
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-7 text-xs w-36"
            autoFocus
          />
          <Input
            type="date"
            value={excludedUntil}
            onChange={(e) => setExcludedUntil(e.target.value)}
            title="Excused until (optional)"
            className="h-7 text-xs w-32"
          />
          <button
            type="button"
            onClick={submitExcuse}
            title="Confirm"
            className="text-muted-foreground hover:text-foreground"
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setExcusing(false)
              setReason('')
              setExcludedUntil('')
            }}
            title="Cancel"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : reducing ? (
        <div className="flex items-center gap-1 shrink-0">
          <Input
            placeholder="Reason (optional)"
            value={reduceReason}
            onChange={(e) => setReduceReason(e.target.value)}
            className="h-7 text-xs w-32"
            autoFocus
          />
          <Input
            type="number"
            placeholder="Target"
            step="0.1"
            min="0"
            value={reduceTarget}
            onChange={(e) => setReduceTarget(e.target.value)}
            title="Expected contribution target"
            className="h-7 text-xs w-16"
          />
          <Input
            type="date"
            value={reducedUntil}
            onChange={(e) => setReducedUntil(e.target.value)}
            title="Reduced until (optional)"
            className="h-7 text-xs w-32"
          />
          <button
            type="button"
            onClick={submitReduce}
            title="Confirm"
            className="text-muted-foreground hover:text-foreground"
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setReducing(false)
              setReduceReason('')
              setReduceTarget('')
              setReducedUntil('')
            }}
            title="Cancel"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <>
          {onToggleDm && (
            <button
              type="button"
              onClick={onToggleDm}
              title={dmDate ? `DMed ${dmDate.toLocaleString()} — click to unmark` : 'Mark as DMed'}
              className={`shrink-0 flex items-center gap-0.5 text-muted-foreground hover:text-foreground ${dmDate ? '' : 'opacity-0 group-hover:opacity-100'}`}
            >
              <MessageCircleIcon className="size-3.5" />
              {dmDate && <span className="text-xs tabular-nums">{formatTrackerDate(dmDate)}</span>}
            </button>
          )}
          <p className="text-sm font-semibold tabular-nums shrink-0">{item.label}</p>
          {onReduceExpectations && !hasReducedExpectations && (
            <button
              type="button"
              onClick={() => setReducing(true)}
              title="Set reduced expectations"
              className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100"
            >
              <TrendingDown className="size-3.5" />
            </button>
          )}
          {onUnreduce && hasReducedExpectations && (
            <button
              type="button"
              onClick={() => onUnreduce(item.id)}
              title="Clear reduced expectations"
              className="text-yellow-600 hover:text-foreground shrink-0"
            >
              <TrendingDown className="size-3.5" />
            </button>
          )}
          {onExcuse && (
            <button
              type="button"
              onClick={() => setExcusing(true)}
              title="Excuse from leaderboard"
              className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100"
            >
              <EyeOff className="size-3.5" />
            </button>
          )}
          {onUnhide && (item.needs_review || !onExcuse) && (
            <button
              type="button"
              onClick={() => onUnhide(item.id)}
              title={item.needs_review ? 'Resolve' : 'Restore to leaderboard'}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <Eye className="size-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  )
}

export function LeaderboardCard({
  title,
  this_week,
  all_time,
  hidden_this_week,
  hidden_all_time,
  dmStates,
  onToggleDm,
  onExcuse,
  onUnhide,
  onReduceExpectations,
  onUnreduce,
}: {
  title: string
  this_week: RowItem[]
  all_time: RowItem[]
  hidden_this_week?: RowItem[]
  hidden_all_time?: RowItem[]
  dmStates?: Record<number, Date | null>
  onToggleDm?: (id: number) => void
  onExcuse?: (id: number, reason: string, excludedUntil?: string) => void
  onUnhide?: (id: number) => void
  onReduceExpectations?: (id: number, reason: string, target: number, until?: string) => void
  onUnreduce?: (id: number) => void
}) {
  const [tab, setTab] = useState<'this_week' | 'all_time'>('this_week')
  const [showHidden, setShowHidden] = useState(false)
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

  const rows = tab === 'this_week' ? this_week : all_time
  const hiddenRows = (tab === 'this_week' ? hidden_this_week : hidden_all_time) ?? []
  const direction = tab === 'this_week' ? 'slide-in-from-left-2' : 'slide-in-from-right-2'

  return (
    <Card className="t-card-lift max-w-full">
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
            rows.map((r, i) => (
              <RankRow
                key={r.id}
                item={r}
                rank={i + 1}
                dmDate={dmStates?.[r.id]}
                onToggleDm={onToggleDm ? () => onToggleDm(r.id) : undefined}
                onExcuse={onExcuse}
                onUnhide={onUnhide}
                onReduceExpectations={onReduceExpectations}
                onUnreduce={onUnreduce}
              />
            ))
          )}
        </div>
        {hiddenRows.length > 0 && (
          <div className="mt-2 pt-2 border-t">
            <button
              type="button"
              onClick={() => setShowHidden((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {showHidden ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              {showHidden ? 'Hide' : 'Show'} {hiddenRows.length} hidden
            </button>
            {showHidden && (
              <div className="mt-1">
                {hiddenRows.map((r, i) => (
                  <RankRow
                    key={r.id}
                    item={r}
                    rank={i + 1}
                    dmDate={dmStates?.[r.id]}
                    onToggleDm={onToggleDm ? () => onToggleDm(r.id) : undefined}
                    onUnhide={onUnhide}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
