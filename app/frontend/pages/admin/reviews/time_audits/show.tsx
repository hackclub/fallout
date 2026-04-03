import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Link, router } from '@inertiajs/react'
import { useReviewHeartbeat } from '@/hooks/useReviewHeartbeat'
import ReviewLayout from '@/layouts/ReviewLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Separator } from '@/components/admin/ui/separator'
import { Textarea } from '@/components/admin/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/admin/ui/dropdown-menu'
import {
  UserIcon,
  GitBranchIcon,
  ClockIcon,
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SaveIcon,
  LoaderIcon,
  Trash2Icon,
  PlusIcon,
  MinusCircleIcon,
  GaugeIcon,
  CrosshairIcon,
  SparklesIcon,
  MessageSquareTextIcon,
} from 'lucide-react'
import ProjectNotesWindow from '@/components/admin/ProjectNotesWindow'
import type {
  TimeAuditReviewDetail,
  TimeAuditAnnotations,
  TimeAuditSegment,
  ReviewJournalEntry,
  ReviewRecording,
  ReviewProjectContext,
  ReviewerNote,
  SiblingStatuses,
} from '@/types'

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function isSafeUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || ''
}

const REMOVED_REASONS = [
  'AFK / idle screen',
  'Non-project activity',
  'Duplicate session',
  'Unrelated browsing',
  'Other',
]
const DEFLATED_REASONS = [
  'Tutorial watching',
  'Slow progress / distracted',
  'Partially off-topic',
  'Debugging unrelated issue',
  'Other',
]

// --- Top Bar ---

function ReviewTopBar({
  project,
  totalEntries,
  approvedSeconds,
  totalDuration,
  submitting,
  allReviewed,
  notesCount,
  onSkip,
  onSubmit,
  onToggleNotes,
}: {
  project: ReviewProjectContext
  totalEntries: number
  approvedSeconds: number
  totalDuration: number
  submitting: boolean
  allReviewed: boolean
  notesCount: number
  onSkip: () => void
  onSubmit: () => void
  onToggleNotes: () => void
}) {
  return (
    <div className="z-50 bg-background border-b border-border px-4 py-2 flex items-center gap-3 shrink-0">
      <Button variant="outline" size="sm" asChild>
        <Link href="/admin/reviews/time_audits">End Session</Link>
      </Button>
      <Button variant="ghost" size="sm" onClick={onSkip}>
        Skip
      </Button>

      <Separator orientation="vertical" className="h-6" />

      <a
        href={`/admin/projects/${project.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold truncate hover:underline"
      >
        {project.name}
      </a>
      <a
        href={`/admin/projects/${project.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground text-sm hover:underline"
      >
        (#{project.id})
      </a>
      <span className="text-sm text-muted-foreground">
        {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'} to review ({formatDuration(approvedSeconds)} /{' '}
        {formatDuration(totalDuration)})
      </span>

      <div className="flex items-center gap-2 ml-auto">
        <Button variant="outline" size="sm" asChild>
          <a href={`/admin/users/${project.user_id}`} target="_blank" rel="noopener noreferrer">
            <UserIcon data-icon="inline-start" />
            See User
          </a>
        </Button>
        {isSafeUrl(project.repo_link) && (
          <Button variant="outline" size="sm" asChild>
            <a href={project.repo_link!} target="_blank" rel="noopener noreferrer">
              <GitBranchIcon data-icon="inline-start" />
              Repo
            </a>
          </Button>
        )}

        <Button variant="outline" size="sm" onClick={onToggleNotes}>
          <MessageSquareTextIcon data-icon="inline-start" />
          Project Notes{notesCount > 0 && ` (${notesCount})`}
        </Button>

        <Separator orientation="vertical" className="h-6" />

        <Button
          size="sm"
          disabled={submitting || !allReviewed}
          onClick={onSubmit}
          title={!allReviewed ? 'Review all entries before submitting' : undefined}
        >
          <CheckIcon data-icon="inline-start" />
          Submit
        </Button>
      </div>
    </div>
  )
}

// --- Timeline Utilities ---

// Activity checker extracts at 1fps: each frame index = 1 second of the compiled timelapse
function inactiveFrameToSeconds(frameIndex: number): number {
  return frameIndex
}

function computeSnapPoints(recording: ReviewRecording, segments: TimeAuditSegment[], totalDuration?: number): number[] {
  const points = new Set<number>([0, totalDuration ?? recording.duration])
  for (const seg of segments) {
    points.add(seg.start_seconds)
    points.add(seg.end_seconds)
  }
  if (recording.activity_checked && recording.inactive_segments) {
    for (const seg of recording.inactive_segments) {
      points.add(inactiveFrameToSeconds(seg.start_min))
      points.add(inactiveFrameToSeconds(seg.start_min + seg.duration_min))
    }
  }
  return [...points].sort((a, b) => a - b)
}

// Snap to a key point if within threshold, otherwise quantize to frame grid
function snapTime(time: number, snapPoints: number[], threshold: number, granularity: number): number {
  let closest = time
  let minDist = threshold
  for (const p of snapPoints) {
    const dist = Math.abs(time - p)
    if (dist < minDist) {
      minDist = dist
      closest = p
    }
  }
  if (closest !== time) return closest
  return Math.round(time / granularity) * granularity
}

function nextSnapPointAfter(time: number, snapPoints: number[]): number | undefined {
  return snapPoints.find((p) => p > time + 1)
}

function AnnotationTimeline({
  recording,
  segments,
  currentTime,
  onSeek,
  snapPoints,
  snapThreshold,
  granularity,
  onInteractionEnd,
  preview,
}: {
  recording: ReviewRecording
  segments: TimeAuditSegment[]
  currentTime: number
  onSeek: (seconds: number) => void
  snapPoints: number[]
  snapThreshold: number
  granularity: number
  onInteractionEnd?: () => void
  preview?: { start: number; end: number; type: 'removed' | 'deflated' } | null
}) {
  const totalDuration = recording.duration
  if (!totalDuration) return null

  const checked = recording.activity_checked
  const hasInactiveData = checked && (recording.inactive_segments?.length ?? 0) > 0
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const timeFromPointer = useCallback(
    (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return 0
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const raw = ratio * totalDuration
      return snapTime(raw, snapPoints, snapThreshold, granularity)
    },
    [totalDuration, snapPoints, snapThreshold, granularity],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      draggingRef.current = true
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      onSeek(timeFromPointer(e.clientX))
    },
    [onSeek, timeFromPointer],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return
      onSeek(timeFromPointer(e.clientX))
    },
    [onSeek, timeFromPointer],
  )

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false
    onInteractionEnd?.()
  }, [onInteractionEnd])

  const cursorPct = (currentTime / totalDuration) * 100

  return (
    <div className="space-y-1">
      <div ref={containerRef} className="relative select-none">
        {/* Main bar — reviewer annotations (starts blank) */}
        <div className="relative h-5 bg-muted overflow-hidden">
          {segments.map((seg, i) => {
            const startPct = (seg.start_seconds / totalDuration) * 100
            const widthPct = ((seg.end_seconds - seg.start_seconds) / totalDuration) * 100
            const isRemoved = seg.type === 'removed'
            return (
              <div
                key={`seg-${i}`}
                className={`absolute top-0 h-full ${isRemoved ? 'bg-red-500/70' : 'bg-amber-500/70'}`}
                style={{ left: `${startPct}%`, width: `${Math.max(widthPct, 0.5)}%` }}
                title={`${seg.type}: ${formatTimestamp(seg.start_seconds)} – ${formatTimestamp(seg.end_seconds)} (${seg.reason})`}
              />
            )
          })}

          {/* Preview highlight for in-progress segment */}
          {preview && preview.start < preview.end && (
            <div
              className={`absolute top-0 h-full border-2 border-dashed ${
                preview.type === 'removed' ? 'bg-red-500/20 border-red-500/60' : 'bg-amber-500/20 border-amber-500/60'
              }`}
              style={{
                left: `${(preview.start / totalDuration) * 100}%`,
                width: `${Math.max(((preview.end - preview.start) / totalDuration) * 100, 0.5)}%`,
              }}
            />
          )}
        </div>

        {/* Secondary bar — activity checker guidance */}
        <div className={`relative h-1.5 overflow-hidden mt-px ${checked ? 'bg-emerald-500/30' : 'bg-muted'}`}>
          {hasInactiveData &&
            recording.inactive_segments?.map((seg, i) => {
              const startSec = inactiveFrameToSeconds(seg.start_min)
              const durSec = inactiveFrameToSeconds(seg.duration_min)
              const startPct = (startSec / totalDuration) * 100
              const widthPct = (durSec / totalDuration) * 100
              return (
                <div
                  key={`inactive-${i}`}
                  className="absolute top-0 h-full bg-purple-500/60"
                  style={{ left: `${startPct}%`, width: `${Math.max(widthPct, 0.3)}%` }}
                  title={`Inactive: ${formatTimestamp(startSec)} – ${formatTimestamp(startSec + durSec)}`}
                />
              )
            })}
        </div>

        {/* Playback cursor — spans both bars */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-foreground z-10 pointer-events-none"
          style={{ left: `${cursorPct}%` }}
        />

        {/* Interaction layer */}
        <div
          className="absolute inset-0 cursor-pointer"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>

      {/* Legend */}
      <div className="flex gap-3 text-[10px] text-muted-foreground">
        {segments.some((s) => s.type === 'removed') && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500/70" /> Removed
          </span>
        )}
        {segments.some((s) => s.type === 'deflated') && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500/70" /> Deflated
          </span>
        )}
        {hasInactiveData ? (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-purple-500/60" /> Inactive
          </span>
        ) : !checked ? (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-muted" /> Not analyzed
          </span>
        ) : null}
      </div>
    </div>
  )
}

// --- Deflation Inputs ---
// Minutes is the source of truth. Percentage is derived.
// Typing minutes → percentage updates live. Typing percentage → minutes updates live.
// The field you're typing in is never modified by the other.

function DeflationInputs({
  rangeSec,
  deflatedPercent,
  onChange,
}: {
  rangeSec: number
  deflatedPercent: number
  onChange: (pct: number) => void
}) {
  const rangeMin = rangeSec // video seconds ≈ real minutes
  const initRemaining = Math.round(((rangeMin * (100 - deflatedPercent)) / 100) * 100) / 100

  const [minText, setMinText] = useState(String(initRemaining))
  const [pctText, setPctText] = useState(String(Math.round((100 - deflatedPercent) * 100) / 100))

  function handleMinChange(val: string) {
    setMinText(val)
    const mins = Number(val)
    if (!isNaN(mins) && rangeMin > 0) {
      const remainPct = Math.round(Math.min(100, Math.max(0, (mins / rangeMin) * 100)) * 100) / 100
      setPctText(String(remainPct))
      onChange(Math.round((100 - remainPct) * 100) / 100)
    }
  }

  function handlePctChange(val: string) {
    setPctText(val)
    const pct = Number(val)
    if (!isNaN(pct)) {
      const remainPct = Math.min(100, Math.max(0, pct))
      const mins = Math.round(((rangeMin * remainPct) / 100) * 100) / 100
      setMinText(String(mins))
      onChange(Math.round((100 - remainPct) * 100) / 100)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <label className="text-[10px] text-muted-foreground">Deflate to</label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            step={0.5}
            value={minText}
            onChange={(e) => handleMinChange(e.target.value)}
            className="w-full h-8 rounded border border-input bg-background px-2 text-sm"
          />
          <span className="text-xs text-muted-foreground shrink-0">min</span>
        </div>
      </div>
      <span className="text-muted-foreground mt-4">≈</span>
      <div className="flex-1">
        <label className="text-[10px] text-muted-foreground">Percentage</label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            value={pctText}
            onChange={(e) => handlePctChange(e.target.value)}
            className="w-full h-8 rounded border border-input bg-background px-2 text-sm"
          />
          <span className="text-xs text-muted-foreground shrink-0">%</span>
        </div>
      </div>
    </div>
  )
}

// --- Segment List + Add Controls ---

function SegmentEditor({
  recording,
  segments,
  onAdd,
  onRemove,
  currentTime,
  snapPoints,
  onPreviewChange,
}: {
  recording: ReviewRecording
  segments: TimeAuditSegment[]
  onAdd: (seg: TimeAuditSegment) => void
  onRemove: (index: number) => void
  currentTime: number
  snapPoints: number[]
  onPreviewChange: (preview: { start: number; end: number; type: 'removed' | 'deflated' } | null) => void
}) {
  const [adding, setAdding] = useState<'removed' | 'deflated' | null>(null)
  const [startSec, setStartSec] = useState(0)
  const [endSec, setEndSec] = useState(recording.duration)
  const [reason, setReason] = useState('')
  const [deflatedPercent, setDeflatedPercent] = useState(50)
  const [overlapError, setOverlapError] = useState(false)

  const reasons = adding === 'removed' ? REMOVED_REASONS : DEFLATED_REASONS

  // Push preview to parent whenever the in-progress range changes
  useEffect(() => {
    if (adding && startSec < endSec) {
      onPreviewChange({ start: startSec, end: endSec, type: adding })
    } else {
      onPreviewChange(null)
    }
  }, [adding, startSec, endSec, onPreviewChange])

  function rangesOverlap(a0: number, a1: number, b0: number, b1: number) {
    return a0 < b1 && b0 < a1
  }

  function hasOverlap(start: number, end: number) {
    return segments.some((s) => rangesOverlap(start, end, s.start_seconds, s.end_seconds))
  }

  function openAddForm(type: 'removed' | 'deflated') {
    setAdding(type)
    setOverlapError(false)
    const start = Math.round(currentTime)
    setStartSec(start)
    const next = nextSnapPointAfter(currentTime, snapPoints)
    setEndSec(next !== undefined ? Math.round(next) : recording.duration)
    setReason('')
    setDeflatedPercent(50)
  }

  function handleAdd() {
    if (!adding || !reason || startSec >= endSec) return
    if (hasOverlap(startSec, endSec)) {
      setOverlapError(true)
      return
    }
    onAdd({
      recording_id: recording.id,
      start_seconds: startSec,
      end_seconds: endSec,
      type: adding,
      reason,
      ...(adding === 'deflated' ? { deflated_percent: deflatedPercent } : {}),
    })
    setAdding(null)
    setOverlapError(false)
    onPreviewChange(null)
    setStartSec(0)
    setEndSec(recording.duration)
    setReason('')
    setDeflatedPercent(50)
  }

  // Segments are in video seconds; multiply by 60 to get real-time equivalents for display
  const removedRealSec = segments
    .filter((s) => s.type === 'removed')
    .reduce((sum, s) => sum + (s.end_seconds - s.start_seconds) * 60, 0)
  const deflatedRealSec = segments
    .filter((s) => s.type === 'deflated')
    .reduce((sum, s) => sum + ((s.end_seconds - s.start_seconds) * 60 * (s.deflated_percent ?? 0)) / 100, 0)
  const approvedSec = Math.max(0, recording.duration * 60 - removedRealSec - deflatedRealSec)

  return (
    <div className="space-y-2">
      {/* Summary bar */}
      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted-foreground">
          Approved: <span className="font-medium text-foreground">{formatDuration(Math.round(approvedSec))}</span>
        </span>
        {removedRealSec > 0 && (
          <span className="text-red-600">−{formatDuration(Math.round(removedRealSec))} removed</span>
        )}
        {deflatedRealSec > 0 && (
          <span className="text-amber-600">−{formatDuration(Math.round(deflatedRealSec))} deflated</span>
        )}
      </div>

      {/* Existing segments */}
      {segments.length > 0 && (
        <div className="space-y-1">
          {segments.map((seg, i) => {
            const videoRange = seg.end_seconds - seg.start_seconds
            const rangeMin = Math.round(videoRange * 10) / 10 // 1 video sec ≈ 1 real min
            const deflatedToMin =
              seg.type === 'deflated' && seg.deflated_percent
                ? Math.round(((rangeMin * (100 - seg.deflated_percent)) / 100) * 10) / 10
                : null
            return (
              <div
                key={i}
                className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${
                  seg.type === 'removed' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'
                }`}
              >
                <span className="font-medium capitalize">{seg.type}</span>
                <span className="text-muted-foreground">
                  {formatTimestamp(seg.start_seconds)} – {formatTimestamp(seg.end_seconds)}
                </span>
                <span className="flex-1 truncate">{seg.reason}</span>
                {deflatedToMin !== null && (
                  <span className="font-medium shrink-0">
                    {rangeMin}m → {deflatedToMin}m
                  </span>
                )}
                <button onClick={() => onRemove(i)} className="text-muted-foreground hover:text-foreground">
                  <Trash2Icon className="size-3" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Add buttons */}
      {!adding && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs" onClick={() => openAddForm('removed')}>
            <MinusCircleIcon className="size-3 mr-1" />
            Remove Time
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => openAddForm('deflated')}>
            <GaugeIcon className="size-3 mr-1" />
            Deflate Time
          </Button>
        </div>
      )}

      {/* Add form */}
      {adding && (
        <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="flex items-center gap-2 text-xs font-medium">
            <PlusIcon className="size-3" />
            {adding === 'removed' ? 'Remove' : 'Deflate'} time range
          </div>

          {/* Time range inputs (video seconds ≈ real minutes) */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground">Start (min)</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={Math.round(recording.duration * 10) / 10}
                  step={0.5}
                  value={Math.round(startSec * 10) / 10}
                  onChange={(e) => {
                    setStartSec(Number(e.target.value))
                    setOverlapError(false)
                  }}
                  className="w-full h-8 rounded border border-input bg-background px-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    setStartSec(Math.round(currentTime * 10) / 10)
                    setOverlapError(false)
                  }}
                  className="shrink-0 size-8 flex items-center justify-center rounded border border-input hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Set to current playback time"
                >
                  <CrosshairIcon className="size-3.5" />
                </button>
              </div>
            </div>
            <span className="text-muted-foreground mt-4">–</span>
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground">End (min)</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={Math.round(recording.duration * 10) / 10}
                  step={0.5}
                  value={Math.round(endSec * 10) / 10}
                  onChange={(e) => {
                    setEndSec(Number(e.target.value))
                    setOverlapError(false)
                  }}
                  className="w-full h-8 rounded border border-input bg-background px-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    setEndSec(Math.round(currentTime * 10) / 10)
                    setOverlapError(false)
                  }}
                  className="shrink-0 size-8 flex items-center justify-center rounded border border-input hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Set to current playback time"
                >
                  <CrosshairIcon className="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Reason — free text input with preset dropdown */}
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason..."
              className="flex-1 h-8 rounded border border-input bg-background px-2 text-sm"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 size-8 flex items-center justify-center rounded border border-input hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <SparklesIcon className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {reasons.map((r) => (
                  <DropdownMenuItem key={r} onSelect={() => setReason(r)}>
                    {r}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Deflation — linked "deflate to" minutes & percentage (what remains) */}
          {adding === 'deflated' && (
            <DeflationInputs
              rangeSec={Math.max(endSec - startSec, 1)}
              deflatedPercent={deflatedPercent}
              onChange={setDeflatedPercent}
            />
          )}

          {/* Overlap error */}
          {overlapError && <p className="text-xs text-red-600">This range overlaps with an existing segment.</p>}

          {/* Actions */}
          <div className="flex gap-2">
            <Button size="sm" className="text-xs" disabled={!reason || startSec >= endSec} onClick={handleAdd}>
              Add
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                setAdding(null)
                setOverlapError(false)
                onPreviewChange(null)
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Single Recording Block ---

function RecordingBlock({
  recording,
  description,
  segments,
  saved,
  onDescriptionChange,
  onSegmentAdd,
  onSegmentRemove,
  onSave,
  saving,
}: {
  recording: ReviewRecording
  description: string
  segments: TimeAuditSegment[]
  saved: boolean
  onDescriptionChange: (description: string) => void
  onSegmentAdd: (seg: TimeAuditSegment) => void
  onSegmentRemove: (index: number) => void
  onSave: () => void
  saving: boolean
}) {
  const hasInactiveData = recording.activity_checked
  const inactivePct = recording.inactive_percentage ?? 0

  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentTime, setCurrentTime] = useState(0) // video seconds
  const [videoDuration, setVideoDuration] = useState<number | null>(null)
  const [preview, setPreview] = useState<{ start: number; end: number; type: 'removed' | 'deflated' } | null>(null)

  // API time = recording.duration (real tracked seconds, source of truth for billing)
  // Video time = videoDuration (playback seconds, what the timeline follows)
  // timeMultiplier = apiTime / videoTime (for converting video ranges to real deductions)
  const apiTime = recording.duration
  const timeMultiplier = videoDuration && videoDuration > 0 ? apiTime / videoDuration : 60
  const videoRealTime = videoDuration ? videoDuration * 60 : apiTime // expected real time from video at 60x
  const hasTimeMismatch = videoDuration !== null && Math.abs(apiTime - videoRealTime) / apiTime > 0.1

  // Timeline operates in video seconds
  const timelineDuration = videoDuration ?? apiTime / 60 // fallback before video loads
  const granularity = useMemo(() => 1, []) // 1 video second
  const snapPoints = useMemo(
    () => computeSnapPoints(recording, segments, timelineDuration),
    [recording, segments, timelineDuration],
  )
  const snapThreshold = useMemo(() => Math.max(timelineDuration * 0.015, 3), [timelineDuration])

  const handleLoadedMetadata = useCallback(() => {
    const vid = videoRef.current
    if (vid && vid.duration > 0) {
      setVideoDuration(vid.duration)
    }
  }, [])

  // Poll video.currentTime via rAF for smooth cursor tracking
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const tick = () => {
      if (videoRef.current) {
        setCurrentTime(videoRef.current.currentTime)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const seekTo = useCallback((videoSeconds: number) => {
    setCurrentTime(videoSeconds)
    if (videoRef.current) {
      videoRef.current.currentTime = videoSeconds
    }
  }, [])

  return (
    <div className="space-y-3">
      {/* Video */}
      <div className="border border-border rounded-lg overflow-hidden">
        {recording.playback_url && recording.type !== 'YouTubeVideo' ? (
          <video
            ref={videoRef}
            src={recording.playback_url}
            controls
            muted
            preload="metadata"
            className="w-full aspect-video bg-black"
            poster={recording.thumbnail_url}
            onLoadedMetadata={handleLoadedMetadata}
          />
        ) : recording.type === 'YouTubeVideo' && recording.video_id ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${recording.video_id}?mute=1`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full aspect-video"
          />
        ) : null}
      </div>

      {/* Info bar */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium truncate">{recording.name}</span>
        <Badge
          className={`text-xs ${
            recording.type === 'LookoutTimelapse'
              ? 'bg-blue-100 text-blue-700 border-blue-200'
              : recording.type === 'LapseTimelapse'
                ? 'bg-purple-100 text-purple-700 border-purple-200'
                : 'bg-red-100 text-red-700 border-red-200'
          }`}
          variant="outline"
        >
          {recording.type === 'LookoutTimelapse'
            ? 'Lookout'
            : recording.type === 'LapseTimelapse'
              ? 'Lapse'
              : 'YouTube'}
        </Badge>
        {hasInactiveData && inactivePct > 0 && (
          <Badge variant={inactivePct > 30 ? 'destructive' : 'outline'} className="text-xs">
            <AlertTriangleIcon className="size-3 mr-1" />
            {inactivePct.toFixed(0)}% inactive
          </Badge>
        )}
        <span className="flex-1" />
        <span className="text-muted-foreground">
          {formatDuration(apiTime)}
          {hasTimeMismatch && (
            <span className="text-muted-foreground/60"> ({formatDuration(Math.round(videoRealTime))} video)</span>
          )}
        </span>
      </div>

      {/* Timeline — follows video time */}
      <AnnotationTimeline
        recording={{ ...recording, duration: timelineDuration }}
        segments={segments}
        currentTime={currentTime}
        onSeek={seekTo}
        snapPoints={snapPoints}
        snapThreshold={snapThreshold}
        granularity={granularity}
        onInteractionEnd={() => videoRef.current?.focus({ preventScroll: true })}
        preview={preview}
      />

      {/* Segment editor — operates in video time, multiplier converts to API time */}
      <SegmentEditor
        recording={{ ...recording, duration: timelineDuration }}
        segments={segments}
        onAdd={onSegmentAdd}
        onRemove={onSegmentRemove}
        currentTime={currentTime}
        snapPoints={snapPoints}
        onPreviewChange={setPreview}
      />

      {/* Description + save */}
      <div className="space-y-2">
        <Textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="1-2 line summary for downstream reviewers"
          className="h-14 text-sm resize-none"
        />
        <Button variant={saved ? 'outline' : 'default'} className="w-full" disabled={saving} onClick={onSave}>
          {saving ? (
            <>
              <LoaderIcon className="size-4 animate-spin mr-1" />
              Saving...
            </>
          ) : saved ? (
            <>
              <CheckIcon className="size-4 mr-1" />
              Saved
            </>
          ) : (
            <>
              <SaveIcon className="size-4 mr-1" />
              Save
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

// --- Collapsible Entry ---

function EntrySection({
  entry,
  index,
  isNew,
  isLast,
  annotations,
  savedRecordings,
  onDescriptionChange,
  onSegmentAdd,
  onSegmentRemove,
  onSave,
  savingRecording,
}: {
  entry: ReviewJournalEntry
  index: number
  isNew: boolean
  isLast: boolean
  annotations: TimeAuditAnnotations
  savedRecordings: Set<string>
  onDescriptionChange: (recordingId: number, description: string) => void
  onSegmentAdd: (recordingId: number, seg: TimeAuditSegment) => void
  onSegmentRemove: (recordingId: number, index: number) => void
  onSave: (recordingId: number) => void
  savingRecording: number | null
}) {
  const allSaved =
    isNew &&
    entry.recordings.length > 0 &&
    entry.recordings.every((r) => {
      const recId = String(r.id)
      return savedRecordings.has(recId) && (annotations.recordings?.[recId]?.description?.trim() ?? '').length > 0
    })

  const entryApprovedSeconds = useMemo(() => {
    let total = entry.total_duration
    for (const rec of entry.recordings) {
      const recData = annotations.recordings?.[String(rec.id)]
      if (!recData?.segments) continue
      const multiplier = 60
      for (const seg of recData.segments) {
        const videoRange = seg.end_seconds - seg.start_seconds
        const realRange = videoRange * multiplier
        if (seg.type === 'removed') {
          total -= realRange
        } else if (seg.type === 'deflated') {
          total -= (realRange * (seg.deflated_percent ?? 0)) / 100
        }
      }
    }
    return Math.max(0, Math.round(total))
  }, [entry, annotations])

  const hasDeductions = entryApprovedSeconds !== entry.total_duration

  const [expanded, setExpanded] = useState(isNew)

  const prevAllSaved = useRef(false)
  useEffect(() => {
    if (allSaved && !prevAllSaved.current && !isLast) {
      setExpanded(false)
    }
    prevAllSaved.current = allSaved
  }, [allSaved, isLast])

  return (
    <div className="flex flex-col snap-start" style={expanded ? { height: 'calc(100vh - 45px)' } : undefined}>
      {/* Entry header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="bg-muted/50 border-b border-border px-4 py-2 flex items-center gap-2 shrink-0 cursor-pointer hover:bg-muted/80 transition-colors text-left w-full"
      >
        {expanded ? (
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <img src={entry.author_avatar} alt="" className="size-5 rounded-full" />
        <span className="font-semibold text-sm">Entry {index + 1}</span>
        <span className="text-xs text-muted-foreground">{entry.created_at}</span>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <ClockIcon className="size-3" />
          {hasDeductions ? (
            <>
              {formatDuration(entryApprovedSeconds)} / {formatDuration(entry.total_duration)}
            </>
          ) : (
            formatDuration(entry.total_duration)
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          · {entry.recordings.length} recording{entry.recordings.length !== 1 ? 's' : ''}
        </span>
        {!isNew && (
          <Badge variant="outline" className="text-xs">
            <CheckIcon className="size-3 mr-0.5" />
            Older Ship
          </Badge>
        )}
        {allSaved && (
          <Badge variant="default" className="text-xs">
            <CheckIcon className="size-3 mr-0.5" />
            Done
          </Badge>
        )}
      </button>

      {/* Body */}
      {expanded && (
        <div className="flex flex-1 min-h-0">
          {/* Left — videos */}
          <div className="w-1/2 overflow-y-auto p-4 space-y-6">
            {entry.recordings.map((rec) => {
              const recId = String(rec.id)
              const recAnnotation = annotations.recordings?.[recId]
              return (
                <RecordingBlock
                  key={rec.id}
                  recording={rec}
                  description={recAnnotation?.description ?? ''}
                  segments={recAnnotation?.segments ?? []}
                  saved={savedRecordings.has(recId)}
                  onDescriptionChange={(d) => onDescriptionChange(rec.id, d)}
                  onSegmentAdd={(seg) => onSegmentAdd(rec.id, seg)}
                  onSegmentRemove={(i) => onSegmentRemove(rec.id, i)}
                  onSave={() => onSave(rec.id)}
                  saving={savingRecording === rec.id}
                />
              )
            })}
            {entry.recordings.length === 0 && <div className="text-sm text-muted-foreground">No recordings</div>}
          </div>

          {/* Center divider — 5px scrollable gutter */}
          <div className="w-1.5 shrink-0 bg-border" />

          {/* Right — journal */}
          <div className="w-1/2 overflow-y-auto p-4 text-xs">
            <div
              className="markdown-content prose prose-xs max-w-none"
              dangerouslySetInnerHTML={{ __html: entry.content_html }}
            />
            {entry.images.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-4">
                {entry.images.map((img, j) => (
                  <a key={j} href={img} target="_blank" rel="noopener noreferrer">
                    <img src={img} alt="" className="rounded border border-border object-cover w-full max-h-32" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// --- Main Page ---

interface PageProps {
  review: TimeAuditReviewDetail
  project: ReviewProjectContext
  new_entries: ReviewJournalEntry[]
  previous_entries: ReviewJournalEntry[]
  sibling_statuses: SiblingStatuses
  reviewer_notes?: ReviewerNote[]
  reviewer_notes_path: string
  can: { update: boolean }
  skip: string | null
  heartbeat_path: string
  next_path: string
  index_path: string
}

export default function TimeAuditsShow({
  review,
  project,
  new_entries,
  previous_entries,
  reviewer_notes,
  reviewer_notes_path,
  skip,
  heartbeat_path,
  next_path,
}: PageProps) {
  const allEntries = useMemo(
    () => [
      ...new_entries.map((e) => ({ ...e, isNew: true })),
      ...previous_entries.map((e) => ({ ...e, isNew: false })),
    ],
    [new_entries, previous_entries],
  )

  useReviewHeartbeat(heartbeat_path)

  const handleSkip = useCallback(() => {
    const skipIds = skip ? skip.split(',') : []
    skipIds.push(String(review.id))
    router.visit(`${next_path}?skip=${skipIds.join(',')}`)
  }, [skip, review.id, next_path])

  const [annotations, setAnnotations] = useState<TimeAuditAnnotations>(review.annotations ?? { recordings: {} })
  const [savedRecordings, setSavedRecordings] = useState<Set<string>>(() => {
    const saved = new Set<string>()
    const recs = review.annotations?.recordings
    if (recs) {
      for (const [id, data] of Object.entries(recs)) {
        if (data.description?.trim()) saved.add(id)
      }
    }
    return saved
  })
  const [savingRecording, setSavingRecording] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)

  // totalDuration = sum of API times (real tracked seconds, source of truth)
  const totalDuration = useMemo(() => new_entries.reduce((sum, e) => sum + e.total_duration, 0), [new_entries])

  // Build lookup: recording ID → API duration (for converting video-time segments to real deductions)
  const recordingDurations = useMemo(() => {
    const map: Record<string, number> = {}
    for (const entry of new_entries) {
      for (const rec of entry.recordings) {
        map[String(rec.id)] = rec.duration
      }
    }
    return map
  }, [new_entries])

  // Segments are in video seconds. Deductions are proportional: (videoRange / videoDuration) * apiTime.
  // Since we don't have videoDuration here, we use the fact that the segment's recording_id
  // gives us apiTime, and the proportional deduction = videoRange * (apiTime / videoDuration).
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations

  const handleDescriptionChange = useCallback((recordingId: number, description: string) => {
    setAnnotations((prev) => ({
      ...prev,
      recordings: {
        ...prev.recordings,
        [String(recordingId)]: {
          ...prev.recordings?.[String(recordingId)],
          description,
        },
      },
    }))
    setSavedRecordings((prev) => {
      const next = new Set(prev)
      next.delete(String(recordingId))
      return next
    })
  }, [])

  const handleSegmentAdd = useCallback((recordingId: number, seg: TimeAuditSegment) => {
    setAnnotations((prev) => {
      const recId = String(recordingId)
      const existing = prev.recordings?.[recId]
      return {
        ...prev,
        recordings: {
          ...prev.recordings,
          [recId]: {
            ...existing,
            segments: [...(existing?.segments ?? []), seg],
          },
        },
      }
    })
    setSavedRecordings((prev) => {
      const next = new Set(prev)
      next.delete(String(recordingId))
      return next
    })
  }, [])

  const handleSegmentRemove = useCallback((recordingId: number, index: number) => {
    setAnnotations((prev) => {
      const recId = String(recordingId)
      const existing = prev.recordings?.[recId]
      return {
        ...prev,
        recordings: {
          ...prev.recordings,
          [recId]: {
            ...existing,
            segments: (existing?.segments ?? []).filter((_, i) => i !== index),
          },
        },
      }
    })
    setSavedRecordings((prev) => {
      const next = new Set(prev)
      next.delete(String(recordingId))
      return next
    })
  }, [])

  const handleSaveRecording = useCallback(
    async (recordingId: number) => {
      setSavingRecording(recordingId)
      try {
        const res = await fetch(`/admin/reviews/time_audits/${review.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken(),
            Accept: 'application/json',
          },
          body: JSON.stringify({
            time_audit_review: { annotations: annotationsRef.current },
          }),
        })
        if (res.ok) {
          setSavedRecordings((prev) => new Set(prev).add(String(recordingId)))
        }
      } finally {
        setSavingRecording(null)
      }
    },
    [review.id],
  )

  const entryReviewedCheck = useCallback(
    (entry: ReviewJournalEntry) =>
      entry.recordings.length === 0 ||
      entry.recordings.every((r) => {
        const recId = String(r.id)
        return savedRecordings.has(recId) && (annotations.recordings?.[recId]?.description?.trim() ?? '').length > 0
      }),
    [savedRecordings, annotations],
  )

  const reviewedEntries = useMemo(
    () => new_entries.filter(entryReviewedCheck).length,
    [new_entries, entryReviewedCheck],
  )
  const allReviewed = reviewedEntries === new_entries.length

  const approvedSeconds = useMemo(() => {
    let total = 0
    for (const entry of new_entries) {
      if (!entryReviewedCheck(entry)) continue
      let entryTime = entry.total_duration
      const recs = annotations.recordings
      if (recs) {
        const multiplier = 60
        for (const rec of entry.recordings) {
          const data = recs[String(rec.id)]
          if (!data?.segments) continue
          for (const seg of data.segments) {
            const videoRange = seg.end_seconds - seg.start_seconds
            const realRange = videoRange * multiplier
            if (seg.type === 'removed') {
              entryTime -= realRange
            } else if (seg.type === 'deflated') {
              entryTime -= (realRange * (seg.deflated_percent ?? 0)) / 100
            }
          }
        }
      }
      total += Math.max(0, entryTime)
    }
    return Math.round(total)
  }, [new_entries, annotations, entryReviewedCheck])

  const handleSubmit = useCallback(() => {
    setSubmitting(true)
    const url = skip
      ? `/admin/reviews/time_audits/${review.id}?skip=${skip}`
      : `/admin/reviews/time_audits/${review.id}`
    router.patch(
      url,
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        time_audit_review: {
          status: 'approved',
          annotations: annotationsRef.current,
          approved_seconds: approvedSeconds,
        } as any,
      },
      {
        onFinish: () => setSubmitting(false),
      },
    )
  }, [review.id, approvedSeconds, skip])

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <ReviewTopBar
        project={project}
        totalEntries={new_entries.length}
        approvedSeconds={approvedSeconds}
        totalDuration={totalDuration}
        submitting={submitting}
        allReviewed={allReviewed}
        notesCount={reviewer_notes?.length ?? 0}
        onSkip={handleSkip}
        onSubmit={handleSubmit}
        onToggleNotes={() => setNotesOpen((v) => !v)}
      />

      {notesOpen && reviewer_notes && (
        <ProjectNotesWindow
          notes={reviewer_notes}
          notesPath={reviewer_notes_path}
          shipId={review.ship_id}
          reviewStage="time_audit"
          onClose={() => setNotesOpen(false)}
        />
      )}

      <div className="flex-1 min-h-0 overflow-y-auto snap-y snap-mandatory">
        {allEntries.map((entry, i) => (
          <EntrySection
            key={entry.id}
            entry={entry}
            index={i}
            isNew={entry.isNew}
            isLast={i === allEntries.length - 1}
            annotations={annotations}
            savedRecordings={savedRecordings}
            onDescriptionChange={handleDescriptionChange}
            onSegmentAdd={handleSegmentAdd}
            onSegmentRemove={handleSegmentRemove}
            onSave={handleSaveRecording}
            savingRecording={savingRecording}
          />
        ))}
      </div>
    </div>
  )
}

TimeAuditsShow.layout = (page: ReactNode) => <ReviewLayout>{page}</ReviewLayout>
