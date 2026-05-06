import { useEffect, useRef, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import ReviewLayout from '@/layouts/ReviewLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Card, CardContent } from '@/components/admin/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/admin/ui/tooltip'
import HoursDisplay from '@/components/admin/HoursDisplay'
import {
  CheckCircle2Icon,
  XCircleIcon,
  ClockIcon,
  RotateCcwIcon,
  BanIcon,
  CircleDashedIcon,
  InboxIcon,
} from 'lucide-react'
import type {
  UnifiedInspectData,
  UnifiedInspectStage,
  UnifiedInspectRecording,
  UnifiedInspectSegment,
  UnifiedInspectJournalEntry,
} from '@/types'

function isSafeUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function stageIcon(status: string) {
  const cls = 'size-5'
  switch (status) {
    case 'submitted':
      return <InboxIcon className={`${cls} text-blue-600 dark:text-blue-400`} />
    case 'approved':
      return <CheckCircle2Icon className={`${cls} text-emerald-600 dark:text-emerald-400`} />
    case 'returned':
      return <RotateCcwIcon className={`${cls} text-amber-600 dark:text-amber-400`} />
    case 'rejected':
      return <XCircleIcon className={`${cls} text-red-600 dark:text-red-400`} />
    case 'cancelled':
      return <BanIcon className={`${cls} text-muted-foreground/60`} />
    case 'pending':
      return <ClockIcon className={`${cls} text-amber-600 dark:text-amber-400`} />
    case 'not_started':
    default:
      return <CircleDashedIcon className={`${cls} text-muted-foreground/40`} />
  }
}

const statusBadgeVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  submitted: 'secondary',
  pending: 'secondary',
  approved: 'default',
  returned: 'outline',
  rejected: 'destructive',
  cancelled: 'outline',
  not_started: 'outline',
}

function TimelineRow({ stage, isLast, index }: { stage: UnifiedInspectStage; isLast: boolean; index: number }) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!isLast && <span className="absolute left-3.5 top-9 -bottom-1 w-px bg-border" aria-hidden />}
      <div className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border bg-background">
        {stageIcon(stage.status)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xs text-muted-foreground tabular-nums">{index + 1}.</span>
          <h3 className="text-sm font-medium">{stage.label}</h3>
          <Badge variant={statusBadgeVariant[stage.status] ?? 'outline'} className="capitalize">
            {stage.status.replace('_', ' ')}
          </Badge>
        </div>
        <dl className="mt-1.5 grid grid-cols-1 sm:grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-0.5 text-sm">
          {stage.actor && (
            <>
              <dt className="text-sm text-muted-foreground">By</dt>
              <dd className="text-sm">{stage.actor}</dd>
            </>
          )}
          <dt className="text-sm text-muted-foreground">At</dt>
          <dd className="text-sm tabular-nums">{formatTimestamp(stage.at)}</dd>
          {stage.feedback && (
            <>
              <dt className="text-sm text-muted-foreground">Feedback</dt>
              <dd className="text-sm whitespace-pre-wrap">{stage.feedback}</dd>
            </>
          )}
          {stage.internal_notes && (
            <>
              <dt className="text-sm text-muted-foreground">Notes</dt>
              <dd className="text-sm whitespace-pre-wrap">{stage.internal_notes}</dd>
            </>
          )}
        </dl>
      </div>
    </li>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm mt-0.5">{children}</dd>
    </div>
  )
}

function shortenGithub(url: string): string {
  return url.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)/)?.[1] ?? url
}

// --- Time Audit recording viewer ----------------------------------------------
//
// Read-only twin of admin/reviews/time_audits/show.tsx's RecordingBlock. The
// timeline below the player follows the underlying video's `currentTime`:
// HTML5 video via rAF polling, YouTube via the iframe postMessage protocol
// (enablejsapi=1, infoDelivery `currentTime`). Click-to-seek is allowed —
// auditors verify a segment by jumping to it.

function TimelineBar({
  segments,
  duration,
  currentTime,
  onSeek,
}: {
  segments: UnifiedInspectSegment[]
  duration: number
  currentTime: number
  onSeek: (sec: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || duration <= 0) return
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      onSeek(ratio * duration)
    },
    [duration, onSeek],
  )

  if (duration <= 0) {
    return <div className="h-5 bg-muted rounded-sm animate-pulse" aria-hidden />
  }

  const cursorPct = Math.max(0, Math.min(100, (currentTime / duration) * 100))

  return (
    <div className="space-y-1">
      <div ref={containerRef} className="relative select-none">
        <div className="relative h-5 bg-muted overflow-hidden rounded-sm">
          <TooltipProvider>
            {segments.map((seg, i) => {
              const startPct = (seg.start_seconds / duration) * 100
              const widthPct = ((seg.end_seconds - seg.start_seconds) / duration) * 100
              const isRemoved = seg.type === 'removed'
              return (
                <Tooltip key={`seg-${i}`}>
                  <TooltipTrigger asChild>
                    <div
                      className={`absolute top-0 h-full z-20 pointer-events-auto ${
                        isRemoved ? 'bg-red-500/70' : 'bg-amber-500/70'
                      }`}
                      style={{ left: `${startPct}%`, width: `${Math.max(widthPct, 0.5)}%` }}
                    />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    <div className="font-medium capitalize">
                      {isRemoved ? 'Removed' : `Deflated ${seg.deflated_percent ?? 0}%`}
                    </div>
                    <div className="text-muted-foreground tabular-nums">
                      {formatClock(seg.start_seconds)} – {formatClock(seg.end_seconds)}
                    </div>
                    {seg.reason && <div className="mt-1">{seg.reason}</div>}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </TooltipProvider>
        </div>

        {/* Playback cursor */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-foreground z-10 pointer-events-none"
          style={{ left: `${cursorPct}%` }}
        />

        {/* Click-to-seek background — segments above intercept their own hovers via z-20 */}
        <div
          className="absolute inset-0 cursor-pointer z-0"
          onPointerDown={(e) => {
            dragging.current = true
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
            seekFromPointer(e.clientX)
          }}
          onPointerMove={(e) => {
            if (dragging.current) seekFromPointer(e.clientX)
          }}
          onPointerUp={() => {
            dragging.current = false
          }}
        />
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-foreground" /> Cursor
        </span>
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
      </div>
    </div>
  )
}

function Html5RecordingViewer({ recording }: { recording: UnifiedInspectRecording }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const tick = () => {
      const v = videoRef.current
      if (v) {
        if (!Number.isNaN(v.currentTime)) setCurrentTime(v.currentTime)
        if (v.duration > 0 && Number.isFinite(v.duration) && v.duration !== videoDuration) {
          setVideoDuration(v.duration)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [videoDuration])

  const handleSeek = useCallback((sec: number) => {
    const v = videoRef.current
    if (!v || !Number.isFinite(v.duration)) return
    v.currentTime = Math.max(0, Math.min(sec, v.duration))
    setCurrentTime(v.currentTime)
  }, [])

  if (!isSafeUrl(recording.playback_url)) {
    return <p className="text-xs text-muted-foreground">No playback URL available.</p>
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md overflow-hidden border border-border bg-black">
        <video
          ref={videoRef}
          src={recording.playback_url!}
          controls
          muted
          playsInline
          poster={recording.thumbnail_url ?? undefined}
          className="w-full aspect-video"
        />
      </div>
      <TimelineBar
        segments={recording.segments}
        duration={videoDuration}
        currentTime={currentTime}
        onSeek={handleSeek}
      />
    </div>
  )
}

function YouTubeRecordingViewer({ recording }: { recording: UnifiedInspectRecording }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(recording.yt_duration_seconds ?? 0)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    function onMessage(e: MessageEvent) {
      if (e.source !== iframe?.contentWindow) return
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        if (data?.event === 'infoDelivery' && data?.info) {
          if (typeof data.info.currentTime === 'number') setCurrentTime(data.info.currentTime)
          if (typeof data.info.duration === 'number' && data.info.duration > 0) {
            setVideoDuration((prev) => (prev === data.info.duration ? prev : data.info.duration))
          }
        }
      } catch {}
    }

    window.addEventListener('message', onMessage)
    const interval = setInterval(
      () =>
        iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'getVideoData', args: [] }), '*'),
      250,
    )

    return () => {
      window.removeEventListener('message', onMessage)
      clearInterval(interval)
    }
  }, [])

  const handleSeek = useCallback((sec: number) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: 'seekTo', args: [sec, true] }),
      '*',
    )
    setCurrentTime(sec)
  }, [])

  if (!recording.video_id) {
    return <p className="text-xs text-muted-foreground">No YouTube video reference.</p>
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md overflow-hidden border border-border bg-black aspect-video">
        <iframe
          ref={iframeRef}
          src={`https://www.youtube.com/embed/${recording.video_id}?enablejsapi=1`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <TimelineBar
        segments={recording.segments}
        duration={videoDuration}
        currentTime={currentTime}
        onSeek={handleSeek}
      />
    </div>
  )
}

function RecordingTypeBadge({ type }: { type: UnifiedInspectRecording['type'] }) {
  const label = type === 'LookoutTimelapse' ? 'Lookout' : type === 'LapseTimelapse' ? 'Lapse' : 'YouTube'
  const cls =
    type === 'LookoutTimelapse'
      ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800'
      : type === 'LapseTimelapse'
        ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800'
        : 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'
  return (
    <Badge variant="outline" className={`text-xs ${cls}`}>
      {label}
    </Badge>
  )
}

function RecordingViewer({ recording }: { recording: UnifiedInspectRecording }) {
  const orig = recording.original_seconds
  const approved = recording.approved_seconds
  const deflated = orig > approved
  return (
    <div className="space-y-2 max-w-md w-full">
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <RecordingTypeBadge type={recording.type} />
        <span className="flex-1" />
        <span className="tabular-nums text-muted-foreground">{formatDuration(orig)}</span>
        <span className="text-muted-foreground">→</span>
        <span className={`tabular-nums font-medium ${deflated ? 'text-amber-600 dark:text-amber-400' : ''}`}>
          {formatDuration(approved)}
        </span>
      </div>
      {recording.type === 'YouTubeVideo' ? (
        <YouTubeRecordingViewer recording={recording} />
      ) : (
        <Html5RecordingViewer recording={recording} />
      )}
      {recording.description && (
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{recording.description}</p>
      )}
    </div>
  )
}

function JournalEntrySection({ entry }: { entry: UnifiedInspectJournalEntry }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3 text-sm border-b pb-2">
        <h3 className="font-medium">Entry #{entry.position}</h3>
        <span className="text-xs text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          Created at: {formatTimestamp(entry.created_at)}
        </span>
      </div>
      {entry.recordings.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {entry.recordings.map((rec) => (
            <RecordingViewer key={rec.id} recording={rec} />
          ))}
        </div>
      )}
      {entry.content_html && (
        <div
          className="prose prose-sm max-w-none dark:prose-invert text-sm"
          // Markdown is rendered server-side via render_user_markdown; safe to inject.
          dangerouslySetInnerHTML={{ __html: entry.content_html }}
        />
      )}
    </section>
  )
}

// --- Page ---------------------------------------------------------------------

export default function AdminUnifiedInspect({ inspection }: { inspection: UnifiedInspectData }) {
  const { ship, timeline, time_audit } = inspection
  return (
    <div className="p-6">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Unified DB inspector</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Ship #{ship.id} — {ship.project_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {ship.ship_type === 'build' ? 'Build' : 'Design'} ship by {ship.owner_display_name}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Status">
              <Badge variant={statusBadgeVariant[ship.status] ?? 'outline'} className="capitalize">
                {ship.status}
              </Badge>
            </Field>
            <Field label="Hours">
              <HoursDisplay publicHours={ship.public_hours} internalHours={ship.internal_hours} />
            </Field>
            <Field label="Koi awarded">
              {ship.koi_awarded > 0 ? (
                <span className="tabular-nums">{ship.koi_awarded}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Field>
            <Field label="Approved at">
              <span className="tabular-nums">{formatTimestamp(ship.approved_at)}</span>
            </Field>
          </dl>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4">
            <Field label="Submitter email">
              {ship.owner_email ? (
                <a href={`mailto:${ship.owner_email}`} className="text-primary underline">
                  {ship.owner_email}
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Field>
            <Field label="Submitter Slack ID">
              {ship.owner_slack_id ? (
                <span className="font-mono text-xs">{ship.owner_slack_id}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Field>
            <Field label="Repo (frozen at ship time)">
              {isSafeUrl(ship.frozen_repo_link) ? (
                <a
                  href={ship.frozen_repo_link!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline truncate block"
                >
                  {shortenGithub(ship.frozen_repo_link!)}
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Field>
            <Field label="Demo (frozen at ship time)">
              {isSafeUrl(ship.frozen_demo_link) ? (
                <a
                  href={ship.frozen_demo_link!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline truncate block"
                >
                  {shortenGithub(ship.frozen_demo_link!)}
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Field>
            {ship.project_description && (
              <div className="sm:col-span-2">
                <Field label="Project description">
                  <p className="whitespace-pre-wrap">{ship.project_description}</p>
                </Field>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">Review timeline</p>
          <ol className="relative">
            {timeline.map((stage, i) => (
              <TimelineRow key={stage.key} stage={stage} isLast={i === timeline.length - 1} index={i} />
            ))}
          </ol>
        </CardContent>
      </Card>

      {time_audit && time_audit.entries.some((e) => e.recordings.length > 0) && (
        <Card className="mt-4">
          <CardContent className="space-y-6">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Time audit evidence</p>
              <p className="text-sm">
                <span className="tabular-nums text-muted-foreground">
                  {formatDuration(time_audit.original_seconds)}
                </span>{' '}
                <span className="text-muted-foreground">→</span>{' '}
                <span
                  className={`tabular-nums font-medium ${
                    time_audit.original_seconds > time_audit.approved_seconds
                      ? 'text-amber-600 dark:text-amber-400'
                      : ''
                  }`}
                >
                  {formatDuration(time_audit.approved_seconds)} approved
                </span>
                {time_audit.reviewer && (
                  <>
                    {' '}
                    · audited by <span className="font-medium">{time_audit.reviewer}</span>
                  </>
                )}
              </p>
              {time_audit.feedback && (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-2">{time_audit.feedback}</p>
              )}
            </div>
            <div className="space-y-8">
              {time_audit.entries.map((entry, i) => (
                <div key={entry.id} className={i > 0 ? 'pt-8 border-t' : undefined}>
                  <JournalEntrySection entry={entry} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

AdminUnifiedInspect.layout = (page: ReactNode) => <ReviewLayout>{page}</ReviewLayout>
