import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react'
import type { ReactNode } from 'react'
import { Link, router, usePage } from '@inertiajs/react'
import { useReviewHeartbeat } from '@/hooks/useReviewHeartbeat'
import { useReviewShortcuts } from '@/hooks/useReviewShortcuts'
import ReviewLayout from '@/layouts/ReviewLayout'
import HoursDisplay from '@/components/admin/HoursDisplay'
import { WaitingLabel } from '@/components/admin/WaitingLabel'
import { ReviewStatusBadge } from '@/components/admin/ReviewStatusBadge'
import { ShortcutHelpDialog, type ShortcutEntry } from '@/components/admin/ShortcutHelpDialog'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Kbd } from '@/components/admin/ui/kbd'
import { Separator } from '@/components/admin/ui/separator'
import { Input } from '@/components/admin/ui/input'
import { Textarea } from '@/components/admin/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/admin/ui/tooltip'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/admin/ui/alert-dialog'
import {
  UserIcon,
  GitBranchIcon,
  CheckIcon,
  XCircleIcon,
  AlertTriangleIcon,
  MinusCircleIcon,
  ClockIcon,
  FlagIcon,
  MessageSquareTextIcon,
  LoaderIcon,
  GlobeIcon,
  ChevronDownIcon,
  ArrowUpRightIcon,
  CopyIcon,
  KeyboardIcon,
  CornerDownLeftIcon,
} from 'lucide-react'
import ProjectNotesWindow from '@/components/admin/ProjectNotesWindow'
import RepoTree from '@/components/admin/RepoTree'
import { notify } from '@/lib/notifications'
import type {
  DesignReviewDetail,
  RequirementsCheckJournalEntry,
  PreflightCheck,
  RepoTreeData,
  RequirementsCheckProjectContext,
  ReviewerNote,
  SiblingStatuses,
  PreviousReview,
} from '@/types'

function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || ''
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
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

function SiblingBadge({ label, status }: { label: string; status: string | null }) {
  if (!status) return null
  const color =
    status === 'approved'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
      : status === 'returned' || status === 'rejected'
        ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${color}`}>
      {label}: {status}
    </span>
  )
}

// --- Collapsible Card ---

const JournalEntriesList = memo(function JournalEntriesList({
  entries,
}: {
  entries: (RequirementsCheckJournalEntry & { isNew: boolean })[]
}) {
  return (
    <div className="divide-y divide-border">
      {entries.map((entry) => (
        <div key={entry.id} className="p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <img src={entry.author_avatar} alt="" className="size-4 rounded-full" />
            <span>{entry.author_display_name}</span>
            <span>|</span>
            <span>{entry.created_at}</span>
            <span className="flex items-center gap-1">
              <ClockIcon className="size-3" />
              {formatDuration(entry.total_duration)}
            </span>
            {!entry.isNew && (
              <Badge variant="outline" className="text-[10px]">
                Older Ship
              </Badge>
            )}
          </div>

          {entry.recordings.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {entry.recordings.map((rec) => (
                <div key={rec.id} className="text-xs rounded border border-border p-2 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Badge
                      className={`text-[10px] shrink-0 ${
                        rec.type === 'LookoutTimelapse'
                          ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800'
                          : rec.type === 'LapseTimelapse'
                            ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800'
                            : 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'
                      }`}
                      variant="outline"
                    >
                      {rec.type === 'LookoutTimelapse'
                        ? 'Lookout'
                        : rec.type === 'LapseTimelapse'
                          ? 'Lapse'
                          : 'YouTube'}
                    </Badge>
                    <span className="text-muted-foreground">{formatDuration(rec.duration)}</span>
                    {rec.removed_seconds > 0 && (
                      <span className="text-red-600 dark:text-red-400">
                        → {formatDuration(rec.duration - rec.removed_seconds)}
                      </span>
                    )}
                  </div>
                  {rec.description && <p className="text-muted-foreground leading-snug">{rec.description}</p>}
                </div>
              ))}
            </div>
          )}

          <div
            className="markdown-content max-w-none text-xs"
            style={{ zoom: 0.85 }}
            dangerouslySetInnerHTML={{ __html: entry.content_html }}
          />
          {entry.images.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {entry.images.map((img, j) => (
                <a key={j} href={img} target="_blank" rel="noopener noreferrer">
                  <img src={img} alt="" className="rounded border border-border object-cover w-full max-h-24" />
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
})

function CollapsibleCard({
  title,
  summary,
  defaultOpen = false,
  storageKey,
  borderClass,
  children,
  trailing,
}: {
  title: string
  summary?: React.ReactNode
  defaultOpen?: boolean
  storageKey?: string
  borderClass?: string
  children: React.ReactNode
  trailing?: React.ReactNode
}) {
  const [open, setOpen] = useState(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(`collapsible:${storageKey}`)
        if (saved !== null) return saved === '1'
      } catch {}
    }
    return defaultOpen
  })
  const bodyRef = useRef<HTMLDivElement>(null)
  const toggle = () =>
    setOpen((v) => {
      const next = !v
      if (storageKey) {
        try {
          localStorage.setItem(`collapsible:${storageKey}`, next ? '1' : '0')
        } catch {}
      }
      return next
    })

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    if (open) {
      el.style.maxHeight = el.scrollHeight + 'px'
    } else {
      // Snap to current rendered height first (avoids jump when collapsing mid-animation)
      el.style.maxHeight = el.scrollHeight + 'px'
      // Force reflow so the browser registers the explicit value before animating to 0
      el.getBoundingClientRect()
      el.style.maxHeight = '0px'
    }
  }, [open])

  return (
    <div className={`rounded-md border overflow-hidden ${borderClass || 'border-border'}`}>
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted/80 transition-colors cursor-pointer text-left"
        data-card-key={storageKey}
      >
        <span className="text-sm font-semibold shrink-0">{title}</span>
        {summary && <span className="text-xs text-muted-foreground flex-1 min-w-0 truncate">{summary}</span>}
        {!summary && <span className="flex-1" />}
        {trailing}
        <ChevronDownIcon
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform duration-500 ${open ? '' : '-rotate-90'}`}
          style={{ transitionTimingFunction: 'cubic-bezier(0.19, 1, 0.22, 1)' }}
        />
      </button>
      <div
        ref={bodyRef}
        style={{
          maxHeight: open ? (bodyRef.current?.scrollHeight ?? 'none') : '0px',
          overflow: 'hidden',
          transition: 'max-height 500ms cubic-bezier(0.19, 1, 0.22, 1)',
        }}
      >
        {children}
      </div>
    </div>
  )
}

// --- Preflight Results ---

function PreflightResults({ checks }: { checks: PreflightCheck[] }) {
  const [showPassed, setShowPassed] = useState(false)

  const failed = checks.filter((c) => c.status === 'failed')
  const warned = checks.filter((c) => c.status === 'warn')
  const skipped = checks.filter((c) => c.status === 'skipped')
  const passed = checks.filter((c) => c.status === 'passed')

  const issueCount = failed.length + warned.length + skipped.length
  const worstLevel = failed.length > 0 ? 'Fail' : warned.length > 0 ? 'Warn' : skipped.length > 0 ? 'Skip' : 'Pass'
  const levelColor =
    worstLevel === 'Fail'
      ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
      : worstLevel === 'Warn'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
        : worstLevel === 'Skip'
          ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'

  const summaryNode = (
    <span className="flex items-center gap-1.5">
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${levelColor}`}>{worstLevel}</span>
      <span>
        <span className="text-red-500 dark:text-red-400">{failed.length}</span>/
        <span className="text-amber-500 dark:text-amber-400">{warned.length}</span>/
        <span className="text-zinc-400 dark:text-zinc-500">{skipped.length}</span>/
        <span className="text-emerald-600 dark:text-emerald-400">{passed.length}</span>
      </span>
    </span>
  )

  return (
    <CollapsibleCard
      title="Preflight Checks"
      summary={summaryNode}
      defaultOpen={issueCount > 0}
      storageKey="design-preflight"
      borderClass={issueCount > 0 ? 'border-amber-300 dark:border-amber-800' : 'border-border'}
      trailing={<Kbd variant="muted">1</Kbd>}
    >
      <div className="p-3 space-y-2">
        {issueCount > 0 && (
          <div className="space-y-1">
            {failed.map((c) => (
              <div key={c.key} className="flex items-start gap-1.5 text-xs">
                <XCircleIcon className="size-3.5 shrink-0 text-red-500 dark:text-red-400 mt-0.5" />
                <span>
                  <strong className="text-foreground">{c.label}</strong>
                  {c.message && <span className="text-muted-foreground"> — {c.message}</span>}
                </span>
              </div>
            ))}
            {warned.map((c) => (
              <div key={c.key} className="flex items-start gap-1.5 text-xs">
                <AlertTriangleIcon className="size-3.5 shrink-0 text-amber-500 dark:text-amber-400 mt-0.5" />
                <span>
                  <strong className="text-foreground">{c.label}</strong>
                  {c.message && <span className="text-muted-foreground"> — {c.message}</span>}
                </span>
              </div>
            ))}
            {skipped.map((c) => (
              <div key={c.key} className="flex items-start gap-1.5 text-xs">
                <MinusCircleIcon className="size-3.5 shrink-0 text-zinc-400 dark:text-zinc-500 mt-0.5" />
                <span>
                  <strong className="text-muted-foreground">{c.label}</strong>
                  {c.message && <span className="text-muted-foreground"> — {c.message}</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {passed.length > 0 && (
          <div>
            <button
              onClick={() => setShowPassed((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {showPassed ? 'Hide' : 'Show'} passed ({passed.length})
            </button>
            {showPassed && (
              <div className="mt-1 space-y-0.5">
                {passed.map((c) => (
                  <div key={c.key} className="flex items-start gap-1.5 text-xs">
                    <CheckIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                    <span>
                      <strong className="text-muted-foreground">{c.label}</strong>
                      {c.message && <span className="text-muted-foreground"> — {c.message}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </CollapsibleCard>
  )
}

// --- Top Bar ---

function TopBar({
  project,
  notesCount,
  projectFlagged,
  flagging,
  onSkip,
  onToggleNotes,
  onFlag,
}: {
  project: RequirementsCheckProjectContext
  notesCount: number
  projectFlagged: boolean
  flagging: boolean
  onSkip: () => void
  onToggleNotes: () => void
  onFlag: (reason: string) => void
}) {
  const [flagReason, setFlagReason] = useState('')
  const hurtUrl = project.repo_link ? `https://hurt-xi.vercel.app/?repo=${encodeURIComponent(project.repo_link)}` : null

  return (
    <TooltipProvider delayDuration={150}>
      <div className="z-50 bg-muted/40 border-b border-border px-4 py-3 flex flex-wrap items-center gap-2 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="default" asChild>
              <Link href="/admin/reviews/design_reviews">
                End Session
                <Kbd variant="muted" className="ml-1">
                  E
                </Kbd>
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>End session</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="default" onClick={onSkip}>
              Skip
              <Kbd variant="muted" className="ml-1">
                S
              </Kbd>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Skip to next</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-6 hidden sm:block" />

        <a
          href={`/admin/projects/${project.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold truncate hover:underline"
        >
          {project.name}
        </a>
        <span className="text-sm text-muted-foreground hidden sm:inline">
          by{' '}
          <a
            href={`/admin/users/${project.user_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline text-foreground"
          >
            {project.user_display_name}
          </a>
          {project.collaborators.length > 0 && (
            <>
              {project.collaborators.map((c, i) => (
                <span key={c.id}>
                  {i === 0 ? ' with ' : ', '}
                  <a
                    href={`/admin/users/${c.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline text-foreground"
                  >
                    {c.display_name}
                  </a>
                </span>
              ))}
            </>
          )}
        </span>

        <div className="flex items-center flex-wrap gap-2 ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="default" asChild>
                <a href={`/admin/users/${project.user_id}`} target="_blank" rel="noopener noreferrer">
                  <UserIcon data-icon="inline-start" />
                  See User
                  <Kbd variant="muted" className="ml-1">
                    U
                  </Kbd>
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open user in new tab</TooltipContent>
          </Tooltip>
          {isSafeUrl(project.repo_link) && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="default" asChild>
                    <a href={project.repo_link!} target="_blank" rel="noopener noreferrer">
                      <GitBranchIcon data-icon="inline-start" />
                      Repo
                      <Kbd variant="muted" className="ml-1">
                        G
                      </Kbd>
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open repo on GitHub</TooltipContent>
              </Tooltip>
              {hurtUrl && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="default" asChild>
                      <a href={hurtUrl} target="_blank" rel="noopener noreferrer">
                        <ArrowUpRightIcon data-icon="inline-start" />
                        HURT
                        <Kbd variant="muted" className="ml-1">
                          H
                        </Kbd>
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open repo in HURT</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="default"
                    onClick={() => navigator.clipboard.writeText(project.repo_link!)}
                  >
                    <CopyIcon className="size-3.5" />
                    Copy
                    <Kbd variant="muted" className="ml-1">
                      C
                    </Kbd>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy repo URL</TooltipContent>
              </Tooltip>
            </>
          )}
          {isSafeUrl(project.demo_link) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="default" asChild>
                  <a href={project.demo_link!} target="_blank" rel="noopener noreferrer">
                    <GlobeIcon data-icon="inline-start" />
                    Demo
                    <Kbd variant="muted" className="ml-1">
                      D
                    </Kbd>
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open demo</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="default" onClick={onToggleNotes}>
                <MessageSquareTextIcon data-icon="inline-start" />
                Notes{notesCount > 0 && ` (${notesCount})`}
                <Kbd variant="muted" className="ml-1">
                  N
                </Kbd>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle notes</TooltipContent>
          </Tooltip>

          {projectFlagged ? (
            <Badge variant="destructive">Flagged</Badge>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="default">
                  <FlagIcon data-icon="inline-start" />
                  Flag Project
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Flag Project for Fraud</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the project from all review queues. The user will not be notified — the project
                    will still appear as pending to them.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Textarea
                  placeholder="Reason for flagging..."
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  className="min-h-20"
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={!flagReason.trim() || flagging}
                    onClick={() => onFlag(flagReason.trim())}
                  >
                    Flag Project
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

// --- Main Page ---

interface PageProps {
  review: DesignReviewDetail
  project: RequirementsCheckProjectContext
  new_entries: RequirementsCheckJournalEntry[]
  previous_entries: RequirementsCheckJournalEntry[]
  sibling_statuses: SiblingStatuses
  previous_reviews: PreviousReview[]
  repo_tree?: RepoTreeData | null
  reviewer_notes?: ReviewerNote[]
  reviewer_notes_path: string
  project_flagged: boolean
  can: { update: boolean; swap_type: boolean }
  skip: string | null
  heartbeat_path: string
  swap_type_path: string
  next_path: string
  index_path: string
}

export default function DesignReviewsShow({
  review,
  project,
  new_entries,
  previous_entries,
  sibling_statuses,
  previous_reviews,
  repo_tree,
  reviewer_notes,
  reviewer_notes_path,
  project_flagged,
  can,
  skip,
  heartbeat_path,
  swap_type_path,
  next_path,
}: PageProps) {
  const isTerminal = review.status !== 'pending'
  useReviewHeartbeat(heartbeat_path)

  const { errors } = usePage<{ errors?: Record<string, string[]> }>().props

  const [feedback, setFeedback] = useState(review.feedback || '')
  const [internalReason, setInternalReason] = useState(review.internal_reason || '')
  const [hoursAdjInput, setHoursAdjInput] = useState(
    review.hours_adjustment != null ? String(review.hours_adjustment / 3600) : '',
  )
  const [koiAdjInput, setKoiAdjInput] = useState(review.koi_adjustment != null ? String(review.koi_adjustment) : '')
  const [submitting, setSubmitting] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [flagging, setFlagging] = useState(false)
  const [isFlagged, setIsFlagged] = useState(project_flagged)
  const [notes, setNotes] = useState<ReviewerNote[]>(reviewer_notes ?? [])
  const [checkpointLinkInput, setCheckpointLinkInput] = useState('')
  const [pendingStatus, setPendingStatus] = useState<'approved' | 'returned' | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [buildDialogOpen, setBuildDialogOpen] = useState(false)
  const feedbackRef = useRef<HTMLTextAreaElement>(null)
  const internalReasonRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (reviewer_notes) setNotes(reviewer_notes)
  }, [reviewer_notes])

  const userFacingHours = project.approved_public_hours ?? project.logged_hours
  const hoursAdj = hoursAdjInput !== '' ? parseFloat(hoursAdjInput) || 0 : 0
  const internalHours = userFacingHours + hoursAdj
  const baseKoi = Math.floor(7 * userFacingHours) // Koi based on user-facing hours (TA-approved)
  const koiAdj = koiAdjInput !== '' ? parseInt(koiAdjInput, 10) || 0 : 0
  const finalKoi = baseKoi + koiAdj

  const preflight = useMemo(() => {
    const results = review.preflight_results || []
    return results
  }, [review.preflight_results])

  const allEntries = useMemo(
    () => [
      ...new_entries.map((e) => ({ ...e, isNew: true })),
      ...previous_entries.map((e) => ({ ...e, isNew: false })),
    ],
    [new_entries, previous_entries],
  )

  const handleSkip = useCallback(() => {
    const skipIds = skip ? skip.split(',') : []
    skipIds.push(String(review.id))
    router.visit(`${next_path}?skip=${skipIds.join(',')}`)
  }, [skip, review.id, next_path])

  const handleFlag = useCallback(
    async (reason: string) => {
      setFlagging(true)
      try {
        const res = await fetch('/admin/project_flags', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-CSRF-Token': csrfToken(),
          },
          body: JSON.stringify({
            project_flag: {
              project_id: project.id,
              ship_id: review.ship_id,
              review_stage: 'design_review',
              reason,
            },
          }),
        })
        if (res.ok) {
          setIsFlagged(true)
          const skipIds = skip ? skip.split(',') : []
          skipIds.push(String(review.id))
          router.visit(`${next_path}?skip=${skipIds.join(',')}`)
        }
      } finally {
        setFlagging(false)
      }
    },
    [project.id, review.ship_id, review.id, skip, next_path],
  )

  const handleSubmit = useCallback(
    (status: 'approved' | 'returned', checkpointMessageUrl?: string) => {
      setSubmitting(true)
      setPendingStatus(status)
      const url = skip
        ? `/admin/reviews/design_reviews/${review.id}?skip=${skip}`
        : `/admin/reviews/design_reviews/${review.id}`
      const hoursAdjSeconds = hoursAdjInput !== '' ? Math.round((parseFloat(hoursAdjInput) || 0) * 3600) : null
      const koiAdjValue = koiAdjInput !== '' ? parseInt(koiAdjInput, 10) || 0 : null
      router.patch(
        url,
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          design_review: {
            status,
            feedback: feedback.trim() || null,
            internal_reason: internalReason.trim() || null,
            hours_adjustment: hoursAdjSeconds,
            koi_adjustment: koiAdjValue,
            ...(checkpointMessageUrl ? { checkpoint_message_url: checkpointMessageUrl } : {}),
          } as any,
        },
        {
          onSuccess: () => {
            setFeedback('')
            setInternalReason('')
            setPendingStatus(null)
          },
          onError: (errs) => {
            // The checkpoint_message_url error is handled by the AlertDialog below — don't double-notify.
            const entries = Object.entries(errs as Record<string, string | string[]>).filter(
              ([k]) => k !== 'checkpoint_message_url',
            )
            if (entries.length === 0) return
            const message = entries
              .map(([field, val]) => {
                const msg = Array.isArray(val) ? val.join(', ') : val
                const label = field.replace(/_/g, ' ')
                return `${label}: ${msg}`
              })
              .join('; ')
            notify('alert', `Could not submit review — ${message}`)
          },
          onFinish: () => setSubmitting(false),
        },
      )
    },
    [review.id, feedback, internalReason, hoursAdjInput, koiAdjInput, skip],
  )

  // Open a URL in a new tab — shared between toolbar buttons and shortcut handlers.
  const openExternal = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [])

  // Cmd/Ctrl+Enter inside the feedback textarea: choose between Approve and Return.
  // Approve when an internal reason is present (it's required for approval anyway);
  // otherwise treat the draft as a Return if feedback exists. Falls back to focusing
  // the right textarea so the reviewer sees what's missing.
  const handleModifierEnter = useCallback(() => {
    if (isTerminal || submitting) return
    const hasReason = internalReason.trim().length > 0
    const hasFeedback = feedback.trim().length > 0
    if (hasReason) {
      handleSubmit('approved')
    } else if (hasFeedback) {
      handleSubmit('returned')
    }
  }, [isTerminal, submitting, feedback, internalReason, handleSubmit])

  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
  const modKey = isMac ? '⌘' : 'Ctrl'

  const shortcutEntries: ShortcutEntry[] = useMemo(
    () => [
      { combo: [modKey, 'P'], key: 'cmd+p', description: 'Approve' },
      { combo: [modKey, 'E'], key: 'cmd+e', description: 'Return (focus feedback if empty)' },
      { key: 'S', description: 'Skip to next review' },
      { key: 'E', description: 'End session' },
      { key: 'N', description: 'Toggle reviewer notes' },
      { key: 'U', description: 'Open user in new tab' },
      { key: 'G', description: 'Open repo on GitHub' },
      { key: 'H', description: 'Open repo in HURT' },
      { key: 'D', description: 'Open demo link' },
      { key: 'C', description: 'Copy repo URL' },
      { combo: [modKey, 'B'], key: 'cmd+b', description: 'Move to Build Review' },
      { combo: [modKey, 'J'], key: 'cmd+j', description: 'Focus Internal Reason' },
      { combo: [modKey, 'F'], key: 'cmd+f', description: 'Focus Feedback' },
      { combo: [modKey, '↵'], key: 'cmd+enter', description: 'Submit current draft' },
      { key: '?', description: 'Show this cheatsheet' },
      { key: '1', description: 'Toggle Preflight Checks' },
      { key: '2', description: 'Toggle Previous Reviews' },
      { key: '3', description: 'Toggle Repo Info' },
      { key: '4', description: 'Toggle Journal' },
    ],
    [modKey],
  )

  useReviewShortcuts({
    p: {
      handler: () => {
        if (isTerminal || submitting) return
        if (!internalReason.trim()) {
          notify('alert', 'Internal reason is required when approving.')
          return
        }
        handleSubmit('approved')
      },
      requireModifier: true,
    },
    e: {
      handler: (ev) => {
        if (ev.metaKey || ev.ctrlKey) {
          // ⌘E — Return
          if (isTerminal || submitting) return
          if (!feedback.trim()) {
            feedbackRef.current?.focus()
          } else {
            handleSubmit('returned')
          }
        } else {
          // E — End session
          router.visit('/admin/reviews/design_reviews')
        }
      },
      acceptsModifier: true,
    },
    s: { handler: () => !isTerminal && !submitting && handleSkip() },
    n: { handler: () => setNotesOpen((v) => !v) },
    u: { handler: () => openExternal(`/admin/users/${project.user_id}`) },
    g: {
      handler: () => {
        if (isSafeUrl(project.repo_link)) openExternal(project.repo_link!)
      },
    },
    h: {
      handler: () => {
        if (isSafeUrl(project.repo_link)) {
          openExternal(`https://hurt-xi.vercel.app/?repo=${encodeURIComponent(project.repo_link!)}`)
        }
      },
    },
    d: {
      handler: () => {
        if (isSafeUrl(project.demo_link)) openExternal(project.demo_link!)
      },
    },
    c: {
      handler: () => {
        if (project.repo_link) navigator.clipboard.writeText(project.repo_link)
      },
    },
    '?': { handler: () => setShortcutsOpen((v) => !v) },
    enter: { handler: handleModifierEnter, allowInTyping: true, requireModifier: true },
    j: {
      handler: () => {
        internalReasonRef.current?.focus()
        internalReasonRef.current?.select()
      },
      requireModifier: true,
    },
    f: {
      handler: () => {
        feedbackRef.current?.focus()
        feedbackRef.current?.select()
      },
      requireModifier: true,
    },
    b: {
      handler: () => {
        if (can.swap_type && !isTerminal && !submitting) setBuildDialogOpen(true)
      },
      requireModifier: true,
    },
    '1': { handler: () => (document.querySelector('[data-card-key="design-preflight"]') as HTMLElement)?.click() },
    '2': {
      handler: () => (document.querySelector('[data-card-key="design-previous-reviews"]') as HTMLElement)?.click(),
    },
    '3': { handler: () => (document.querySelector('[data-card-key="design-repo"]') as HTMLElement)?.click() },
    '4': { handler: () => (document.querySelector('[data-card-key="design-journal"]') as HTMLElement)?.click() },
  })

  return (
    <>
      <div className="h-screen flex flex-col overflow-hidden border-t-3 border-purple-500">
        <TopBar
          project={project}
          notesCount={notes.length}
          projectFlagged={isFlagged}
          flagging={flagging}
          onSkip={handleSkip}
          onToggleNotes={() => setNotesOpen((v) => !v)}
          onFlag={handleFlag}
        />

        {notesOpen && reviewer_notes && (
          <ProjectNotesWindow
            notes={notes}
            setNotes={setNotes}
            notesPath={reviewer_notes_path}
            shipId={review.ship_id}
            reviewStage="design_review"
            onClose={() => setNotesOpen(false)}
          />
        )}

        <div className="flex-1 min-h-0 flex">
          {/* Left: project info + preflight + journal */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Project overview */}
            <div className="rounded-md border border-border overflow-hidden">
              <div className="p-3 space-y-1">
                <h1 className="text-base font-semibold leading-snug">
                  <a
                    href={`/admin/projects/${project.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {project.name}
                  </a>
                </h1>
                {project.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{project.description}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <a
                    href={`/admin/users/${project.user_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-foreground hover:underline"
                  >
                    <img src={project.user_avatar} alt="" className="size-4 rounded-full" />
                    <span>{project.user_display_name}</span>
                  </a>
                  {project.collaborators.map((c) => (
                    <a
                      key={c.id}
                      href={`/admin/users/${c.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-foreground hover:underline"
                    >
                      <img src={c.avatar} alt="" className="size-4 rounded-full" />
                      <span>{c.display_name}</span>
                    </a>
                  ))}
                  <span>|</span>
                  <span>{project.created_at}</span>
                  {project.tags.length > 0 && (
                    <>
                      <span>|</span>
                      <span className="text-foreground">{project.tags.join(', ')}</span>
                    </>
                  )}
                  <span>|</span>
                  <WaitingLabel waitingSince={project.waiting_since} cycleStartedAt={project.cycle_started_at} />
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
                <div className="px-3 py-2">
                  <p className="text-xs text-muted-foreground mb-0.5">Type</p>
                  <p className="text-sm font-medium capitalize">{project.ship_type}</p>
                </div>
                <div className="px-3 py-2">
                  <p className="text-xs text-muted-foreground mb-0.5">Hours Approved</p>
                  <p className="text-sm">
                    <HoursDisplay
                      publicHours={project.approved_public_hours}
                      internalHours={project.approved_internal_hours}
                    />
                  </p>
                </div>
                <div className="px-3 py-2">
                  <p className="text-xs text-muted-foreground mb-0.5">Entries</p>
                  <p className="text-sm font-mono">{project.entry_count}</p>
                </div>
              </div>

              {/* Links row */}
              {(isSafeUrl(project.frozen_repo_link) || isSafeUrl(project.frozen_demo_link)) && (
                <div
                  className={`grid divide-x divide-border border-t border-border ${
                    isSafeUrl(project.frozen_repo_link) && isSafeUrl(project.frozen_demo_link)
                      ? 'grid-cols-2'
                      : 'grid-cols-1'
                  }`}
                >
                  {isSafeUrl(project.frozen_repo_link) && (
                    <div className="px-3 py-2">
                      <p className="text-xs text-muted-foreground mb-0.5">Repository</p>
                      <a
                        href={project.frozen_repo_link!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate block"
                      >
                        {project.frozen_repo_link}
                      </a>
                    </div>
                  )}
                  {isSafeUrl(project.frozen_demo_link) && (
                    <div className="px-3 py-2">
                      <p className="text-xs text-muted-foreground mb-0.5">Demo</p>
                      <a
                        href={project.frozen_demo_link!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate block"
                      >
                        {project.frozen_demo_link}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Sibling review statuses */}
              <div className="px-3 py-2 border-t border-border flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">Reviews:</span>
                <SiblingBadge label="Time Audit" status={sibling_statuses.time_audit} />
                <SiblingBadge label="Requirements" status={sibling_statuses.requirements_check} />
                <SiblingBadge label="Design" status={sibling_statuses.design_review} />
                <SiblingBadge label="Build" status={sibling_statuses.build_review} />
              </div>
            </div>

            {/* Previous reviews from prior ships */}
            {previous_reviews.length > 0 && (
              <CollapsibleCard
                title="Previous Reviews"
                storageKey="design-previous-reviews"
                summary={
                  <span className="flex items-center gap-1">
                    {[...previous_reviews].reverse().map((r) => (
                      <ReviewStatusBadge key={r.ship_id} status={r.status} className="shrink-0" />
                    ))}
                  </span>
                }
                trailing={<Kbd variant="muted">2</Kbd>}
              >
                <div className="divide-y divide-border">
                  {previous_reviews.map((r) => (
                    <div key={r.ship_id} className="p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <ReviewStatusBadge status={r.status} />
                        <span className="text-xs text-muted-foreground shrink-0">
                          {r.reviewer_display_name && `${r.reviewer_display_name} · `}
                          {r.reviewed_at}
                        </span>
                      </div>
                      {r.feedback && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Feedback</p>
                          <p className="text-sm whitespace-pre-wrap">{r.feedback}</p>
                        </div>
                      )}
                      {r.internal_reason && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Internal Reason</p>
                          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{r.internal_reason}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CollapsibleCard>
            )}

            {/* Preflight checks */}
            {preflight.length > 0 && <PreflightResults checks={preflight} />}

            {/* Repo tree — GitHub projects only */}
            {repo_tree && repo_tree.entries?.length > 0 && project.repo_link && (
              <CollapsibleCard
                title="Repository"
                storageKey="design-repo"
                summary={
                  repo_tree.entries.filter((e) => e.type === 'tree').length +
                  ' dirs | ' +
                  repo_tree.entries.filter((e) => e.type === 'blob').length +
                  ' files'
                }
                trailing={
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://hurt-xi.vercel.app/?repo=${encodeURIComponent(project.repo_link)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded border border-foreground bg-foreground px-2 py-0.5 text-xs font-semibold text-background hover:opacity-80 transition-opacity"
                    >
                      Open in HURT
                      <ArrowUpRightIcon className="size-3" />
                      <Kbd className="ml-0.5 border-white/30 bg-white/10 text-white/80">H</Kbd>
                    </a>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigator.clipboard.writeText(project.repo_link!)
                      }}
                      title="Copy repo URL"
                      className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      <CopyIcon className="size-3.5" />
                    </button>
                    <Kbd variant="muted">3</Kbd>
                  </div>
                }
              >
                <RepoTree data={repo_tree} repoLink={project.repo_link} bare />
              </CollapsibleCard>
            )}

            {/* Journal — all entries shown inline */}
            {allEntries.length > 0 && (
              <CollapsibleCard
                title="Journal"
                storageKey="design-journal"
                summary={
                  <>
                    Count: {allEntries.length}
                    {' | '}Total: {(allEntries.reduce((s, e) => s + e.total_duration, 0) / 3600).toFixed(1)}h{' | '}Avg:{' '}
                    {(allEntries.reduce((s, e) => s + e.total_duration, 0) / allEntries.length / 3600).toFixed(2)}h
                    {' | '}
                    Range: {(Math.min(...allEntries.map((e) => e.total_duration)) / 3600).toFixed(1)}h –{' '}
                    {(Math.max(...allEntries.map((e) => e.total_duration)) / 3600).toFixed(1)}h
                  </>
                }
                defaultOpen
                trailing={<Kbd variant="muted">4</Kbd>}
              >
                <JournalEntriesList entries={allEntries} />
              </CollapsibleCard>
            )}
          </div>

          {/* Divider */}
          <div className="w-px shrink-0 bg-border" />

          {/* Right: review form / read-only summary */}
          <div className="w-80 shrink-0 overflow-y-auto p-4 space-y-4">
            {isTerminal ? (
              <>
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Review Complete
                  </h3>
                  <Badge
                    className={
                      review.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                        : review.status === 'returned'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                          : review.status === 'rejected'
                            ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                    }
                  >
                    {review.status}
                  </Badge>
                  {review.reviewer_display_name && (
                    <p className="text-xs text-muted-foreground">by {review.reviewer_display_name}</p>
                  )}
                </div>
                {review.internal_reason && (
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Internal Reason</label>
                    <p className="text-sm whitespace-pre-wrap">{review.internal_reason}</p>
                  </div>
                )}
                {review.feedback && (
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Feedback</label>
                    <p className="text-sm whitespace-pre-wrap">{review.feedback}</p>
                  </div>
                )}
                {(review.hours_adjustment != null || review.koi_adjustment != null) && (
                  <div className="space-y-1.5 pt-1">
                    {review.hours_adjustment != null && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Hours adj:</span>
                        <span className="font-mono">
                          {review.hours_adjustment >= 0 ? '+' : ''}
                          {(review.hours_adjustment / 3600).toFixed(1)}h
                        </span>
                      </div>
                    )}
                    {review.koi_adjustment != null && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Koi adj:</span>
                        <span className="font-mono">
                          {review.koi_adjustment >= 0 ? '+' : ''}
                          {review.koi_adjustment}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Submit Review</h3>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    Internal Reason <span className="text-muted-foreground/60">(not shown to user)</span>
                    <Kbd variant="muted">{modKey}J</Kbd>
                  </label>
                  <Textarea
                    ref={internalReasonRef}
                    value={internalReason}
                    onChange={(e) => setInternalReason(e.target.value)}
                    placeholder="Justify your decision..."
                    className="h-20 text-sm resize-y"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    Feedback <span className="text-muted-foreground/60">(shown to user)</span>
                    <Kbd variant="muted">{modKey}F</Kbd>
                  </label>
                  <Textarea
                    ref={feedbackRef}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Feedback for the project author..."
                    className="h-20 text-sm resize-y"
                  />
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">
                      Modify Hours <span className="text-muted-foreground/60">(not shown to user)</span>
                    </label>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground font-mono whitespace-nowrap">
                        {userFacingHours.toFixed(1)}h
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <Input
                        type="number"
                        step="0.5"
                        value={hoursAdjInput}
                        onChange={(e) => setHoursAdjInput(e.target.value)}
                        placeholder="0"
                        className="h-8 text-sm font-mono w-20 text-center"
                      />
                      .<span className="text-muted-foreground">→</span>
                      <span
                        className={`font-mono whitespace-nowrap ${hoursAdj !== 0 ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
                      >
                        {internalHours.toFixed(1)}h
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">
                      Modify Koi <span className="text-muted-foreground/60">(shown to user)</span>
                    </label>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground font-mono whitespace-nowrap">
                        {baseKoi}
                        <span className="text-[10px] ml-0.5 opacity-60">{userFacingHours}h×7</span>
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <Input
                        type="number"
                        step="1"
                        value={koiAdjInput}
                        onChange={(e) => setKoiAdjInput(e.target.value)}
                        placeholder="0"
                        className="h-8 text-sm font-mono w-20 text-center"
                      />
                      <span className="text-muted-foreground">→</span>
                      <span
                        className={`font-mono whitespace-nowrap ${koiAdj !== 0 ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
                      >
                        {finalKoi}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      disabled={submitting || !internalReason.trim()}
                      onClick={() => handleSubmit('approved')}
                      title={!internalReason.trim() ? 'Internal reason is required when approving' : undefined}
                      className="border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-700 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
                    >
                      {submitting && pendingStatus === 'approved' ? (
                        <LoaderIcon data-icon="inline-start" className="animate-spin" />
                      ) : (
                        <CheckIcon data-icon="inline-start" />
                      )}
                      Approve
                      <Kbd className="ml-1 border-emerald-300 bg-emerald-100 text-emerald-600 dark:border-emerald-700 dark:bg-emerald-900 dark:text-emerald-400">
                        {modKey}P
                      </Kbd>
                    </Button>

                    <Button
                      variant="outline"
                      disabled={submitting || !feedback.trim()}
                      onClick={() => handleSubmit('returned')}
                      title={!feedback.trim() ? 'Feedback is required when returning' : undefined}
                      className="border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-700 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
                    >
                      {submitting && pendingStatus === 'returned' ? (
                        <LoaderIcon data-icon="inline-start" className="animate-spin" />
                      ) : (
                        <CornerDownLeftIcon data-icon="inline-start" />
                      )}
                      Return
                      <Kbd className="ml-1 border-amber-300 bg-amber-100 text-amber-600 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-400">
                        {modKey}E
                      </Kbd>
                    </Button>
                  </div>

                  {can.swap_type && (
                    <AlertDialog open={buildDialogOpen} onOpenChange={setBuildDialogOpen}>
                      <AlertDialogTrigger asChild>
                        <Button className="w-full justify-between" variant="ghost" size="sm" disabled={submitting}>
                          Move to Build Review
                          <Kbd variant="muted">{modKey}B</Kbd>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Move to Build Review?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This ship will be moved into the Build Review queue. Queued-at timestamp and current
                            in-progress fields (feedback, internal reason, hours/currency adjustments) are preserved.
                            This replaces the Design Review record.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => router.post(swap_type_path)}>
                            Move to Build Review
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Checkpoint message dialog — shown when backend finds no #fallout-checkpoint message */}
      <AlertDialog open={!!errors?.checkpoint_message_url && !!pendingStatus}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Checkpoint message required</AlertDialogTitle>
            <AlertDialogDescription>
              {errors?.checkpoint_message_url?.[0] ?? 'No checkpoint message found.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={checkpointLinkInput}
            onChange={(e) => setCheckpointLinkInput(e.target.value)}
            placeholder="https://hackclub.enterprise.slack.com/archives/..."
            className="mt-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingStatus(null)
                setCheckpointLinkInput('')
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!checkpointLinkInput.trim()}
              onClick={() => {
                if (pendingStatus) handleSubmit(pendingStatus, checkpointLinkInput.trim())
                setCheckpointLinkInput('')
              }}
            >
              Submit with link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ShortcutHelpDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} entries={shortcutEntries} />
    </>
  )
}

DesignReviewsShow.layout = (page: ReactNode) => <ReviewLayout>{page}</ReviewLayout>
