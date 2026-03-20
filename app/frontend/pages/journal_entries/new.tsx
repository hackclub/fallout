import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react'
import { Deferred as InertiaDeferred, router, usePage } from '@inertiajs/react'
import { Deferred as ModalDeferred, Modal } from '@inertiaui/modal-react'
import BookLayout from '@/components/shared/BookLayout'
import Button from '@/components/shared/Button'
import Input from '@/components/shared/Input'
import MarkdownEditor from '@/components/shared/MarkdownEditor'
import type { SharedProps } from '@/types'

const MIN_IMAGES = 1
const MIN_CHARS = 100

type Project = { id: number; name: string }

type Timelapse = {
  id: string
  name: string
  thumbnailUrl: string
  playbackUrl: string
  duration: number
  createdAt: number
}

type YouTubeVideo = {
  id: number
  video_id: string
  title: string
  thumbnail_url: string
  duration_seconds: number
  was_live: boolean
  claimed: boolean
}

type CollapseRecording = {
  id: number
  name: string | null
  status: string
  tracked_seconds: number | null
  thumbnail_url: string | null
  created_at: string
}

function countMarkdownChars(md: string): number {
  let text = md
  // Remove images ![...](...)
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  // Remove links [...](...) — entire syntax including text
  text = text.replace(/\[[^\]]*\]\([^)]*\)/g, '')
  // Remove HTML comments <!-- ... -->
  text = text.replace(/<!--[\s\S]*?-->/g, '')
  // Normalize zero-width spaces, tabs, non-breaking spaces to regular spaces
  text = text.replace(/[\u200B\u200C\u200D\uFEFF\t\u00A0]/g, ' ')

  const lines = text.split('\n').map((line) => {
    // Strip spaces at start and end of lines
    line = line.trim()
    // Two or more consecutive spaces count as two
    line = line.replace(/ {2,}/g, '  ')
    return line
  })

  // Collapse consecutive empty lines to one
  const collapsed: string[] = []
  let prevEmpty = false
  for (const line of lines) {
    const isEmpty = line === ''
    if (isEmpty) {
      if (!prevEmpty) collapsed.push('')
      prevEmpty = true
    } else {
      collapsed.push(line)
      prevEmpty = false
    }
  }

  // Trim leading/trailing empty lines
  while (collapsed.length > 0 && collapsed[0] === '') collapsed.shift()
  while (collapsed.length > 0 && collapsed[collapsed.length - 1] === '') collapsed.pop()

  let count = 0
  for (let i = 0; i < collapsed.length; i++) {
    // Empty lines count as one
    count += collapsed[i] === '' ? 1 : collapsed[i].length
    if (i < collapsed.length - 1) count += 1
  }
  return count
}

function NewJournal({
  projects,
  selected_project_id,
  lapse_connected,
  is_modal,
  direct_upload_url,
  collapse_timelapses,
  timelapses,
}: {
  projects: Project[]
  selected_project_id: number | null
  lapse_connected: boolean
  is_modal: boolean
  direct_upload_url: string
  collapse_timelapses: CollapseRecording[] | null
  timelapses: Timelapse[] | null
}) {
  const { features } = usePage<SharedProps>().props
  const collapseEnabled = !!(features as Record<string, boolean> | undefined)?.collapse
  const initialProject = selected_project_id
    ? (projects.find((p) => p.id === selected_project_id) ?? null)
    : projects.length === 1
      ? projects[0]
      : null

  const [selectedProject, setSelectedProject] = useState<Project | null>(initialProject)
  const [rightTab, setRightTab] = useState<'lapse' | 'youtube' | 'collapse'>('lapse')
  const [selectedTimelapses, setSelectedTimelapses] = useState<Set<string>>(new Set())
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([])
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [youtubeLoading, setYoutubeLoading] = useState(false)
  const [youtubeError, setYoutubeError] = useState<string | null>(null)
  const [blobSignedIds, setBlobSignedIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [draftStatus, setDraftStatus] = useState<string | null>(null)
  const modalRef = useRef<{ close: () => void }>(null)
  const [selectedCollapseIds, setSelectedCollapseIds] = useState<Set<number>>(new Set())

  const draftKey = selectedProject ? `journal-draft-${selectedProject.id}` : null
  const [markdown, setMarkdown] = useState(() => {
    if (!draftKey) return ''
    try {
      return localStorage.getItem(draftKey) ?? ''
    } catch {
      return ''
    }
  })

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevDraftKey = useRef(draftKey)

  useEffect(() => {
    if (draftKey && draftKey !== prevDraftKey.current) {
      try {
        setMarkdown(localStorage.getItem(draftKey) ?? '')
      } catch {}
      setDraftStatus(null)
    }
    prevDraftKey.current = draftKey
  }, [draftKey])

  useEffect(() => {
    if (!draftKey || !markdown) {
      setDraftStatus(null)
      return
    }
    setDraftStatus('Saving draft...')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, markdown)
      } catch {}
      setDraftStatus('Draft saved locally.')
    }, 500)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [markdown, draftKey])

  const Deferred = is_modal ? ModalDeferred : InertiaDeferred

  const charCount = useMemo(() => countMarkdownChars(markdown), [markdown])
  const markdownImageCount = (markdown.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length
  const hasEnoughImages = markdownImageCount >= MIN_IMAGES
  const hasEnoughChars = charCount >= MIN_CHARS
  const recordingCount = selectedTimelapses.size + youtubeVideos.length + selectedCollapseIds.size
  const hasRecording = recordingCount > 0
  const canSubmit = selectedProject && hasRecording && hasEnoughImages && hasEnoughChars

  function toggleTimelapse(id: string) {
    setSelectedTimelapses((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function isYoutubeUrl(url: string): boolean {
    try {
      const u = new URL(url.trim())
      return (
        (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com' || u.hostname === 'youtu.be') &&
        (u.pathname === '/watch' || u.pathname.startsWith('/live/') || u.hostname === 'youtu.be')
      )
    } catch {
      return false
    }
  }

  async function handleYoutubeLookup(url?: string) {
    const lookupUrl = url ?? youtubeUrl
    if (!lookupUrl.trim() || youtubeLoading) return
    setYoutubeLoading(true)
    setYoutubeError(null)

    try {
      const csrfToken = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content
      const res = await fetch('/you_tube_videos/lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify({ url: lookupUrl.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setYoutubeError(data.error || 'Failed to look up video')
        return
      }

      if (data.claimed) {
        setYoutubeError('This video is already used in another journal.')
        return
      }

      if (youtubeVideos.some((v) => v.id === data.id)) {
        setYoutubeError('This video has already been added.')
        return
      }

      setYoutubeVideos((prev) => [...prev, data])
      setYoutubeUrl('')
    } catch {
      setYoutubeError('Network error. Please try again.')
    } finally {
      setYoutubeLoading(false)
    }
  }

  function removeYoutubeVideo(id: number) {
    setYoutubeVideos((prev) => prev.filter((v) => v.id !== id))
  }

  function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    const data: Record<string, unknown> = {
      timelapse_ids: Array.from(selectedTimelapses),
      youtube_video_ids: youtubeVideos.map((v) => v.id),
      collapse_timelapse_ids: Array.from(selectedCollapseIds),
      content: markdown,
      images: blobSignedIds,
    }
    if (is_modal) data.return_to = 'path'
    router.post(`/projects/${selectedProject.id}/journal_entries`, data, {
      onSuccess: () => {
        if (draftKey)
          try {
            localStorage.removeItem(draftKey)
          } catch {}
        modalRef.current?.close()
      },
      onFinish: () => setSubmitting(false),
    })
  }

  const ribbonTabs: { label: string; tab: 'lapse' | 'youtube' | 'collapse' }[] = [
    { label: 'Lapse', tab: 'lapse' },
    { label: 'YouTube', tab: 'youtube' },
    ...(collapseEnabled ? [{ label: 'Collapse', tab: 'collapse' as const }] : []),
  ]

  const content = (
    <div className="relative flex h-full">
      {ribbonTabs.map(({ label, tab }, i) => (
        <button
          key={tab}
          type="button"
          onClick={() => setRightTab(tab)}
          className={`absolute right-0 translate-x-full w-42 h-16 z-10 flex cursor-pointer motion-safe:hover:scale-105 origin-left motion-safe:transition-transform ${rightTab === tab ? 'bg-brown scale-105' : 'bg-dark-brown'}`}
          style={{
            top: `${3 + i * 5}rem`,
            clipPath: 'polygon(0 0, 100% 0, calc(100% - 1rem) 50%, 100% 100%, 0 100%)',
          }}
        >
          <p className="uppercase text-light-brown text-2xl font-medium border-y-2 my-auto border-light-brown text-center w-full pr-3 py-1">
            {label}
          </p>
        </button>
      ))}
      {/* Left page */}
      <div className="flex-1 min-w-0 flex flex-col p-6 overflow-hidden">
        <p className="italic text-lg mb-2">Journaling for</p>
        <div className="relative">
          {projects.length > 1 ? (
            <>
              <select
                value={selectedProject?.id ?? ''}
                onChange={(e) => setSelectedProject(projects.find((p) => p.id === Number(e.target.value)) ?? null)}
                className="w-full border-2 border-dark-brown rounded px-4 py-2 pr-10 font-bold cursor-pointer outline-none appearance-none"
              >
                <option value="" disabled>
                  Select a project
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <svg
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-brown pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </>
          ) : (
            <div className="w-full border-2 border-dark-brown rounded px-4 py-3 bg-white font-bold">
              {selectedProject?.name}
            </div>
          )}
        </div>

        <p className="font-bold italic text-lg mt-6 mb-2">Write about what you did</p>
        <div className={`relative flex-1 min-h-0 flex flex-col ${!selectedProject ? 'pointer-events-none' : ''}`}>
          {!selectedProject && <DisabledOverlay />}
          <MarkdownEditor
            value={markdown}
            onChange={setMarkdown}
            onBlobsChange={setBlobSignedIds}
            directUploadUrl={direct_upload_url}
            previewUrl="/journal_entries/preview"
          />
        </div>
        {selectedProject && (
          <div className="flex items-center justify-between mt-1.5 text-xs">
            <span className="text-dark-brown">{draftStatus ?? '\u00A0'}</span>
            <div className="flex gap-4">
              <span className={hasEnoughChars ? 'text-dark-brown' : 'text-red-500'}>
                Min characters {charCount}/{MIN_CHARS}
              </span>
              <span className={hasEnoughImages ? 'text-dark-brown' : 'text-red-500'}>
                Min images {markdownImageCount}/{MIN_IMAGES}
              </span>
            </div>
          </div>
        )}
        <div className="mt-auto pt-4 flex justify-start">
          <Button onClick={handleSubmit} disabled={submitting || !canSubmit} className="py-2 px-6 text-lg">
            {submitting
              ? 'Loading...'
              : `Log Journal${recordingCount > 0 ? ` (${recordingCount} recording${recordingCount !== 1 ? 's' : ''})` : ''}`}
          </Button>
        </div>
      </div>

      <div className="w-px bg-dark-brown" />

      {/* Right page */}
      <div className="flex-1 min-w-0 flex flex-col p-6 overflow-x-hidden">
        <div className={rightTab === 'lapse' ? 'flex flex-col min-h-0 flex-1' : 'hidden'}>
          <h2 className="text-center font-bold text-2xl uppercase tracking-wide">Lapse</h2>
          <p className="text-center text-sm text-dark-brown mt-1 mb-4">
            Remember to publish the timelapse! Unlisted is okay!
            <br />
            You can switch to YouTube in the tab to the right
          </p>

          {!lapse_connected && (
            <div
              className={`p-4 border border-amber-300 bg-amber-50 rounded-lg relative mb-4 ${!selectedProject ? 'pointer-events-none' : ''}`}
            >
              {!selectedProject && <DisabledOverlay />}
              <p className="font-bold mb-2">Connect Lapse</p>
              <p className="mb-3 text-sm">You need to connect Lapse to record timelapses for your journal.</p>
              {selectedProject && (
                <a
                  href={`/auth/lapse/start?return_to=journal&project_id=${selectedProject.id}`}
                  className="inline-block py-1.5 px-4 border-2 font-bold uppercase bg-brown text-light-brown border-dark-brown cursor-pointer text-sm"
                >
                  Connect Lapse
                </a>
              )}
            </div>
          )}
          {lapse_connected && (
            <div className="flex-1 min-h-0 overflow-y-auto p-1 -m-1">
              <Deferred data="timelapses" fallback={<TimelapseSkeleton />}>
                <TimelapseBrowser
                  timelapses={timelapses ?? []}
                  selectedTimelapses={selectedTimelapses}
                  onToggle={toggleTimelapse}
                />
              </Deferred>
            </div>
          )}
        </div>

        <div className={rightTab === 'youtube' ? '' : 'hidden'}>
          <h2 className="text-center font-bold text-2xl uppercase tracking-wide">YouTube</h2>
          <p className="text-center text-sm text-dark-brown mt-1 mb-4">
            Screen recordings need to be real time and show the system clock.
            <br />
            Live streams need to have DVR enabled.
          </p>

          <div className="relative">
            <Input
              type="url"
              value={youtubeUrl}
              onChange={(e) => {
                const val = e.target.value
                setYoutubeUrl(val)
                if (!val.trim()) {
                  setYoutubeError(null)
                } else if (isYoutubeUrl(val)) {
                  setYoutubeError(null)
                  handleYoutubeLookup(val)
                } else {
                  setYoutubeError('Enter a valid YouTube URL!')
                }
              }}
              placeholder="Paste a YouTube URL..."
              disabled={youtubeLoading}
            />
            {youtubeError && <p className="text-red-500 text-xs mt-1">{youtubeError}</p>}
          </div>

          {youtubeVideos.length > 0 && (
            <div className="grid grid-cols-2 gap-4 mt-3">
              {youtubeVideos.map((video) => (
                <div key={video.id} className="relative text-left rounded p-2 bg-brown min-w-0">
                  <button
                    type="button"
                    onClick={() => removeYoutubeVideo(video.id)}
                    className="absolute top-3 right-3 w-6 h-6 bg-dark-brown rounded-full flex items-center justify-center z-10 cursor-pointer hover:bg-red-600 transition-colors"
                  >
                    <svg
                      className="w-3 h-3 text-light-brown"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <div
                    className="aspect-video rounded overflow-hidden bg-light-brown bg-center bg-cover bg-no-repeat"
                    style={{ backgroundImage: `url(${video.thumbnail_url})` }}
                  />
                  <div className="mt-1.5">
                    <p className="font-bold text-sm truncate text-white">{video.title}</p>
                    <div className="flex justify-between text-xs text-light-brown">
                      <span>{video.duration_seconds ? formatDuration(video.duration_seconds) : ''}</span>
                      <span>{video.was_live ? 'Live stream' : ''}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {collapseEnabled && (
          <div className={rightTab === 'collapse' ? 'flex flex-col min-h-0 flex-1' : 'hidden'}>
            <h2 className="text-center font-bold text-2xl uppercase tracking-wide">Collapse</h2>
            <p className="text-center text-sm text-dark-brown mt-1 mb-4">
              Record your screen directly from the browser or desktop app.
              <br />
              Select completed recordings below to attach to your journal.
            </p>

            <div className="flex-1 min-h-0 overflow-y-auto p-1 -m-1">
              <Deferred data="collapse_timelapses" fallback={<CollapseTimelapseSkeleton />}>
                <CollapseTimelapseBrowser
                  recordings={collapse_timelapses ?? []}
                  selectedIds={selectedCollapseIds}
                  onToggle={(id) => {
                    setSelectedCollapseIds((prev) => {
                      const next = new Set(prev)
                      if (next.has(id)) next.delete(id)
                      else next.add(id)
                      return next
                    })
                  }}
                  selectedProject={selectedProject}
                />
              </Deferred>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  if (is_modal) {
    return (
      <Modal ref={modalRef} panelClasses="h-full" paddingClasses="max-w-5xl mx-auto" closeButton={false} maxWidth="7xl">
        <BookLayout className="max-h-[40em]">{content}</BookLayout>
      </Modal>
    )
  }

  return <div className="h-screen">{content}</div>
}

function DisabledOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-brown/30 rounded cursor-default">
      <p className="text-lg font-bold text-dark-brown">Select a project at the top left first!</p>
    </div>
  )
}

const SKELETON_TIMELAPSES: Timelapse[] = Array.from({ length: 4 }, (_, i) => ({
  id: `skeleton-${i}`,
  name: '\u00A0',
  duration: 0,
  thumbnailUrl: '',
  playbackUrl: '',
  createdAt: 0,
}))

function TimelapseSkeleton() {
  return (
    <div className="animate-pulse">
      <TimelapseBrowser timelapses={SKELETON_TIMELAPSES} selectedTimelapses={new Set()} onToggle={() => {}} />
    </div>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60)
    const remainMins = mins % 60
    return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`
  }
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
}

function TimelapseBrowser({
  timelapses,
  selectedTimelapses,
  onToggle,
}: {
  timelapses: Timelapse[]
  selectedTimelapses: Set<string>
  onToggle: (id: string) => void
}) {
  if (timelapses.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center gap-3">
        <p className="text-dark-brown">No timelapses found</p>
        <a
          href="https://lapse.hackclub.com/timelapse/create"
          target="_blank"
          rel="noopener noreferrer"
          className="py-1.5 px-4 border-2 font-bold uppercase cursor-pointer bg-brown text-light-brown border-dark-brown"
        >
          Record New Timelapse
        </a>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {timelapses.map((timelapse) => {
        const selected = selectedTimelapses.has(timelapse.id)
        const date = new Date(timelapse.createdAt).toLocaleDateString('en-CA').replace(/-/g, '/')
        return (
          <button
            key={timelapse.id}
            type="button"
            onClick={() => onToggle(timelapse.id)}
            className={`relative text-left rounded p-2 bg-brown transition-all cursor-pointer min-w-0 ${selected ? 'ring-2 ring-dark-brown shadow-lg' : 'opacity-60 hover:opacity-80 hover:ring-1 hover:ring-dark-brown'}`}
          >
            {selected && (
              <div className="absolute top-3 right-3 w-6 h-6 bg-dark-brown rounded-full flex items-center justify-center z-10">
                <svg
                  className="w-4 h-4 text-light-brown"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            <div
              className="aspect-video rounded overflow-hidden bg-light-brown bg-center bg-contain bg-no-repeat"
              style={{ backgroundImage: `url(${timelapse.thumbnailUrl})` }}
            />
            <div className="mt-1.5">
              <p className="font-bold text-sm truncate text-white">{timelapse.name}</p>
              <div className="flex justify-between text-xs text-light-brown">
                <span>{formatDuration(timelapse.duration)}</span>
                <span>{date}</span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function CollapseTimelapseBrowser({
  recordings,
  selectedIds,
  onToggle,
  selectedProject,
}: {
  recordings: CollapseRecording[]
  selectedIds: Set<number>
  onToggle: (id: number) => void
  selectedProject: Project | null
}) {
  if (recordings.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center gap-3">
        <p className="text-dark-brown">No recordings found</p>
        {selectedProject && (
          <a
            href="/collapse_sessions/new"
            className="py-1.5 px-4 border-2 font-bold uppercase cursor-pointer bg-brown text-light-brown border-dark-brown"
          >
            Record New Timelapse
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {selectedProject && (
        <div className="flex justify-center">
          <a
            href="/collapse_sessions/new"
            className="py-1.5 px-4 border-2 font-bold uppercase cursor-pointer bg-brown text-light-brown border-dark-brown text-sm"
          >
            Record New Timelapse
          </a>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {recordings.map((recording) => {
          const selected = selectedIds.has(recording.id)
          const date = new Date(recording.created_at).toLocaleDateString('en-CA').replace(/-/g, '/')
          return (
            <button
              key={recording.id}
              type="button"
              onClick={() => onToggle(recording.id)}
              className={`relative text-left rounded p-2 bg-brown transition-all cursor-pointer min-w-0 ${selected ? 'ring-2 ring-dark-brown shadow-lg' : 'opacity-60 hover:opacity-80 hover:ring-1 hover:ring-dark-brown'}`}
            >
              {selected && (
                <div className="absolute top-3 right-3 w-6 h-6 bg-dark-brown rounded-full flex items-center justify-center z-10">
                  <svg
                    className="w-4 h-4 text-light-brown"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              <div
                className="aspect-video rounded overflow-hidden bg-light-brown bg-center bg-contain bg-no-repeat"
                style={recording.thumbnail_url ? { backgroundImage: `url(${recording.thumbnail_url})` } : undefined}
              />
              <div className="mt-1.5">
                <p className="font-bold text-sm truncate text-white">{recording.name || 'Collapse Recording'}</p>
                <div className="flex justify-between text-xs text-light-brown">
                  <span>{formatDuration(recording.tracked_seconds ?? 0)}</span>
                  <span>{date}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const SKELETON_COLLAPSE: CollapseRecording[] = Array.from({ length: 4 }, (_, i) => ({
  id: -(i + 1),
  name: '\u00A0',
  status: 'complete',
  tracked_seconds: 0,
  thumbnail_url: null,
  created_at: new Date().toISOString(),
}))

function CollapseTimelapseSkeleton() {
  return (
    <div className="animate-pulse">
      <CollapseTimelapseBrowser
        recordings={SKELETON_COLLAPSE}
        selectedIds={new Set()}
        onToggle={() => {}}
        selectedProject={null}
      />
    </div>
  )
}

NewJournal.layout = (page: ReactNode) => page

export default NewJournal
