import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@inertiajs/react'
import {
  AlertTriangleIcon,
  CheckIcon,
  ExternalLinkIcon,
  Loader2Icon,
  PlayIcon,
  RotateCcwIcon,
  FilmIcon,
} from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { Button } from '@/components/admin/ui/button'
import { Badge } from '@/components/admin/ui/badge'
import { Progress } from '@/components/admin/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/admin/ui/tooltip'

type ProcessingStatus = 'pending' | 'downloading' | 'transcoding' | 'uploading' | 'done' | 'failed' | 'unqueued'

type Video = {
  id: number
  title: string
  video_id: string
  thumbnail_url: string | null
  duration_seconds: number | null
  processing_status: ProcessingStatus
  processing_progress: number
  processing_error: string | null
  processed_at: string | null
  timelapse_ready: boolean
  project_name: string | null
  author_name: string | null
  time_audit_path: string | null
}

type StatusUpdate = Pick<
  Video,
  'id' | 'processing_status' | 'processing_progress' | 'processing_error' | 'processed_at' | 'timelapse_ready'
>

const ACTIVE: ProcessingStatus[] = ['pending', 'downloading', 'transcoding', 'uploading']
const PHASE_LABEL: Record<ProcessingStatus, string> = {
  unqueued: 'Not processed',
  pending: 'Queued',
  downloading: 'Downloading',
  transcoding: 'Transcoding',
  uploading: 'Uploading',
  done: 'Ready',
  failed: 'Failed',
}

function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || ''
}

function isActive(status: ProcessingStatus): boolean {
  return ACTIVE.includes(status)
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function YouTubeTimeauditIndex({ videos: initialVideos }: { videos: Video[] }) {
  const [videos, setVideos] = useState<Video[]>(initialVideos)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const videosRef = useRef(videos)
  videosRef.current = videos

  const counts = useMemo(() => {
    const ready = videos.filter((v) => v.timelapse_ready).length
    const failed = videos.filter((v) => v.processing_status === 'failed').length
    const active = videos.filter((v) => isActive(v.processing_status)).length
    const unprocessed = videos.filter((v) => !v.timelapse_ready && !isActive(v.processing_status)).length
    return { ready, failed, active, unprocessed, total: videos.length }
  }, [videos])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/admin/youtube-timeaudit/status', { headers: { Accept: 'application/json' } })
      if (!res.ok) return
      const data: { videos: StatusUpdate[] } = await res.json()
      const byId = new Map(data.videos.map((u) => [u.id, u]))
      setVideos((prev) => prev.map((v) => (byId.has(v.id) ? { ...v, ...byId.get(v.id)! } : v)))
      if (!data.videos.some((u) => isActive(u.processing_status))) stopPolling()
    } catch {
      // transient — retry next tick
    }
  }, [stopPolling])

  // Poll while anything is in flight: fast at first, backing off after 20s.
  const startPolling = useCallback(() => {
    if (intervalRef.current) return
    let elapsed = 0
    intervalRef.current = setInterval(() => {
      elapsed += 1500
      poll()
      if (elapsed >= 20_000 && intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = setInterval(poll, 5000)
      }
    }, 1500)
    poll()
  }, [poll])

  useEffect(() => {
    if (videosRef.current.some((v) => isActive(v.processing_status))) startPolling()
    return stopPolling
  }, [startPolling, stopPolling])

  const markQueued = useCallback((ids: number[]) => {
    const set = new Set(ids)
    setVideos((prev) =>
      prev.map((v) =>
        set.has(v.id) ? { ...v, processing_status: 'pending', processing_progress: 0, processing_error: null } : v,
      ),
    )
  }, [])

  const processOne = useCallback(
    async (id: number) => {
      markQueued([id])
      startPolling()
      await fetch(`/admin/youtube-timeaudit/${id}/process`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken(), Accept: 'application/json' },
      })
    },
    [markQueued, startPolling],
  )

  const processAll = useCallback(async () => {
    const ids = videosRef.current.filter((v) => v.processing_status === 'unqueued' || v.processing_status === 'failed').map((v) => v.id)
    if (ids.length === 0) return
    markQueued(ids)
    startPolling()
    await fetch('/admin/youtube-timeaudit/process_all', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken(), Accept: 'application/json' },
    })
  }, [markQueued, startPolling])

  const overallPct = counts.total > 0 ? Math.round((counts.ready / counts.total) * 100) : 0

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">YouTube time-audit processing</h1>
            <p className="max-w-prose text-sm text-muted-foreground">
              YouTube footage from ships currently awaiting time audit. Convert it into 60× timelapses so it audits like
              Lapse and Lookout — smooth scrubbing and inactivity markers. Unprocessed videos keep the YouTube embed;
              already-audited videos drop off the queue.
            </p>
          </div>
          {counts.total > 0 && (
            <div className="flex items-center gap-4">
              <div className="w-44">
                <div className="mb-1 flex items-baseline justify-between text-xs text-muted-foreground">
                  <span>Ready</span>
                  <span className="tabular-nums">
                    {counts.ready} / {counts.total}
                  </span>
                </div>
                <Progress value={overallPct} />
              </div>
              <Button onClick={processAll} disabled={counts.unprocessed === 0}>
                {counts.active > 0 && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
                Process all{counts.unprocessed > 0 ? ` (${counts.unprocessed})` : ''}
              </Button>
            </div>
          )}
        </div>

        {/* List */}
        {videos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
            <FilmIcon className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">No YouTube footage in the queue</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              When a ship awaiting time audit includes a YouTube video, it shows up here so you can process it.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Video</TableHead>
                  <TableHead className="w-[34%]">Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {videos.map((video) => (
                  <VideoRow key={video.id} video={video} onProcess={() => processOne(video.id)} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

function VideoRow({ video, onProcess }: { video: Video; onProcess: () => void }) {
  const status = video.processing_status
  const active = isActive(status)
  const duration = formatDuration(video.duration_seconds)

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="relative aspect-video w-20 shrink-0 overflow-hidden rounded bg-muted">
            {video.thumbnail_url ? (
              <img src={video.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <FilmIcon className="absolute inset-0 m-auto size-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <a
              href={`https://www.youtube.com/watch?v=${video.video_id}`}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-sm font-medium hover:underline"
              title={video.title}
            >
              {video.title}
            </a>
            <p className="truncate text-xs text-muted-foreground">
              {[video.project_name, video.author_name, duration].filter(Boolean).join(' · ') || 'Unlinked'}
            </p>
          </div>
        </div>
      </TableCell>

      <TableCell>
        <StatusCell video={video} />
      </TableCell>

      <TableCell className="text-right">
        {active ? (
          <Button variant="ghost" size="sm" disabled>
            <Loader2Icon data-icon="inline-start" className="animate-spin" />
            {PHASE_LABEL[status]}
          </Button>
        ) : video.timelapse_ready ? (
          <div className="flex items-center justify-end gap-1">
            {video.time_audit_path && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={video.time_audit_path}>
                  View audit
                  <ExternalLinkIcon data-icon="inline-end" />
                </Link>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onProcess} title="Re-process">
              <RotateCcwIcon data-icon="inline-start" />
              Re-run
            </Button>
          </div>
        ) : (
          <Button variant={status === 'failed' ? 'outline' : 'default'} size="sm" onClick={onProcess}>
            {status === 'failed' ? <RotateCcwIcon data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
            {status === 'failed' ? 'Retry' : 'Process'}
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}

function StatusCell({ video }: { video: Video }) {
  const status = video.processing_status

  if (isActive(status)) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">{PHASE_LABEL[status]}…</span>
          <span className="tabular-nums text-muted-foreground">{video.processing_progress}%</span>
        </div>
        <Progress value={video.processing_progress} />
      </div>
    )
  }

  if (video.timelapse_ready) {
    return (
      <Badge
        variant="outline"
        className="border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
      >
        <CheckIcon data-icon="inline-start" />
        Ready
      </Badge>
    )
  }

  if (status === 'failed') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="destructive" className="cursor-help">
            <AlertTriangleIcon data-icon="inline-start" />
            Failed
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {video.processing_error || 'Processing failed. Retry, or the video may be private/deleted.'}
        </TooltipContent>
      </Tooltip>
    )
  }

  return <span className="text-sm text-muted-foreground">Not processed</span>
}

YouTubeTimeauditIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
