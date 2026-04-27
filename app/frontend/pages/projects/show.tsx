import { useEffect, useState, useMemo, useRef } from 'react'
import { router } from '@inertiajs/react'
import { Modal, ModalLink, useModal } from '@inertiaui/modal-react'
import { BookOpenIcon, ClockIcon } from '@heroicons/react/16/solid'
import { EllipsisHorizontalIcon } from '@heroicons/react/20/solid'
import { ArrowLeft, Pencil, Trash2, Feather, Loader2 } from 'lucide-react'
import { DateTime } from 'luxon'
import BookLayout from '@/components/shared/BookLayout'
import Button from '@/components/shared/Button'
import InlineUser from '@/components/shared/InlineUser'
import Input from '@/components/shared/Input'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/shared/Tooltip'
import { performModalMutation } from '@/lib/modalMutation'
import { notify } from '@/lib/notifications'
import { relativeAgeParts } from '@/lib/relativeAge'
import { useNowTick } from '@/lib/useNowTick'
import TimeAgo from '@/components/shared/TimeAgo'
import Timeline from '@/components/shared/Timeline'
import { SlidingNumber } from '@/components/shared/SlidingNumber'
import TextMorph from '@/components/shared/TextMorph'
import type { ProjectDetail, JournalEntryCard, CollaboratorInfo, ShipEvent, JournalSwitchableProject } from '@/types'

function formatTime(seconds: number): string {
  if (seconds === 0) return '0min'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hrs === 0) return `${mins}min`
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

function formatByLine(project: ProjectDetail, collaborators: CollaboratorInfo[]) {
  const people = [
    { avatar: project.user_avatar, display_name: project.user_display_name },
    ...collaborators.map((c) => ({ avatar: c.avatar, display_name: c.display_name })),
  ]

  return (
    <p className="text-sm text-dark-brown">
      By{' '}
      {people.map((p, i) => (
        <span key={i}>
          {i > 0 && i === people.length - 1 && ' and '}
          {i > 0 && i < people.length - 1 && ', '}
          <InlineUser avatar={p.avatar} display_name={p.display_name} />
        </span>
      ))}
    </p>
  )
}

type TimelineEvent =
  | { type: 'journal'; entry: JournalEntryCard; date: number; iso: string }
  | { type: 'ship'; ship: ShipEvent; date: number; iso: string }
  | { type: 'created'; date: number; iso: string }

type JournalDateGroup = {
  dateKey: string
  date: DateTime | null
  entries: JournalEntryCard[]
}

function shipStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'submitted for review'
    case 'approved':
      return 'was approved'
    case 'returned':
      return 'was returned for changes'
    case 'rejected':
      return 'was rejected'
    default:
      return status
  }
}

function ordinal(day: number): string {
  const mod100 = day % 100
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`
  const mod10 = day % 10
  if (mod10 === 1) return `${day}st`
  if (mod10 === 2) return `${day}nd`
  if (mod10 === 3) return `${day}rd`
  return `${day}th`
}

function journalDateTime(iso: string): DateTime | null {
  const dt = DateTime.fromISO(iso).toLocal()
  return dt.isValid ? dt : null
}

function formatJournalDate(date: DateTime | null, fallback: string): string {
  if (!date) return fallback
  return `${date.toFormat('LLLL')} ${ordinal(date.day)}, ${date.toFormat('yyyy')}`
}

function formatJournalExactTime(iso: string): string {
  const dt = journalDateTime(iso)
  return dt ? `${formatJournalDate(dt, iso)} at ${dt.toFormat('t')}` : iso
}

function JournalRelativeTime({ iso, title }: { iso: string; title: string }) {
  const now = useNowTick(60_000)
  const age = relativeAgeParts(iso, now)

  if (!age) {
    return (
      <time dateTime={iso} title={title}>
        {title}
      </time>
    )
  }

  if (age.kind === 'now') {
    return (
      <span title={title}>
        <time className="sr-only" dateTime={iso}>
          {age.label}
        </time>
        <span aria-hidden="true">
          <TextMorph as="span">{age.label}</TextMorph>
        </span>
      </span>
    )
  }

  const text = `${age.value} ${age.unit} ago`

  return (
    <div className="inline-flex items-baseline" title={title}>
      <time className="sr-only" dateTime={iso}>
        {text}
      </time>
      <div className="inline-flex" aria-hidden="true">
        <SlidingNumber value={age.value} />
        <TextMorph as="span" className="ml-2">{`${age.unit} ago`}</TextMorph>
      </div>
    </div>
  )
}

function JournalMetaDot() {
  return <span className="h-1 w-1 shrink-0 rounded-full bg-brown" aria-hidden="true" />
}

function JournalMetaItems({ items }: { items: string[] }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-brown">
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className="inline-flex items-center gap-2">
          {index > 0 && <JournalMetaDot />}
          <span>{item}</span>
        </span>
      ))}
    </p>
  )
}

export default function ProjectsShow({
  project,
  journal_entries,
  switchable_projects_for_journal,
  collaborators,
  ships,
  can,
  initial_tab,
  highlight_journal_entry_id,
  is_modal,
  onModalEvent,
}: {
  project: ProjectDetail
  journal_entries: JournalEntryCard[]
  switchable_projects_for_journal: JournalSwitchableProject[]
  collaborators: CollaboratorInfo[]
  ships: ShipEvent[]
  can: {
    update: boolean
    destroy: boolean
    ship: boolean
    manage_collaborators: boolean
    create_journal_entry: boolean
    create_journal_entry_locked_for_trial: boolean
  }
  initial_tab?: 'timeline' | 'journal'
  highlight_journal_entry_id?: number | null
  is_modal?: boolean
  onModalEvent?: (event: string, ...args: any[]) => void
}) {
  const modalRef = useRef<{ close: () => void }>(null)
  const highlightedJournalRef = useRef<HTMLDivElement | null>(null)
  const modal = useModal()
  const [rightTab, setRightTab] = useState<'timeline' | 'journal'>(initial_tab ?? 'timeline')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [journalMenuEntryId, setJournalMenuEntryId] = useState<number | null>(null)

  const [switchEntry, setSwitchEntry] = useState<JournalEntryCard | null>(null)
  const [switchProjectId, setSwitchProjectId] = useState<number | ''>('')
  const [switchingProject, setSwitchingProject] = useState(false)
  const [deleteEntry, setDeleteEntry] = useState<JournalEntryCard | null>(null)
  const [deletingEntry, setDeletingEntry] = useState(false)
  const detailProps = ['project', 'journal_entries', 'switchable_projects_for_journal', 'collaborators', 'ships', 'can']

  const switchTargets = useMemo(
    () => switchable_projects_for_journal.filter((switchableProject) => switchableProject.id !== project.id),
    [switchable_projects_for_journal, project.id],
  )

  useEffect(() => {
    setRightTab(highlight_journal_entry_id ? 'journal' : (initial_tab ?? 'timeline'))
  }, [project.id, highlight_journal_entry_id, initial_tab])

  useEffect(() => {
    if (rightTab !== 'journal' || !highlight_journal_entry_id) return

    const frame = window.requestAnimationFrame(() => {
      highlightedJournalRef.current?.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'smooth' })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [rightTab, highlight_journal_entry_id, journal_entries])

  function handleBack() {
    if (modal?.canGoBack) {
      modal.goBack()
      return
    }

    if (modal) {
      modal.close()
      return
    }

    modalRef.current?.close()
  }

  function reloadProjectDetails() {
    if (modal) {
      modal.reload({ only: detailProps })
      return
    }

    router.reload({ only: detailProps })
  }

  function handleProjectSaved() {
    reloadProjectDetails()
    onModalEvent?.('projectSaved')
  }

  function deleteProject() {
    if (deleting || !confirm('Delete this project? This will remove it and its journal entries from normal views.'))
      return

    if (!is_modal) {
      router.delete(`/projects/${project.id}`, {
        onStart: () => setDeleting(true),
        onFinish: () => setDeleting(false),
        onError: () => notify('alert', 'Failed to delete project.'),
      })
      return
    }

    setDeleting(true)
    void performModalMutation({
      url: `/projects/${project.id}`,
      method: 'delete',
      modal,
      modalRef,
      successMessage: 'Project deleted.',
      errorMessage: 'Failed to delete project.',
      successEvent: 'projectDeleted',
      onModalEvent,
      onFinish: () => setDeleting(false),
    })
  }

  function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    const email = inviteEmail.trim()
    if (!email || inviting) return
    setInviting(true)
    setInviteError(null)

    router.post(
      `/projects/${project.id}/collaboration_invites`,
      { email },
      {
        preserveState: true,
        onSuccess: () => {
          setInviteEmail('')
          notify('notice', `Invite sent to ${email}!`)
        },
        onError: (errors) => {
          setInviteError(errors.email?.[0] || 'Failed to send invite.')
        },
        onFinish: () => setInviting(false),
      },
    )
  }

  function openDeleteDialog(entry: JournalEntryCard) {
    setJournalMenuEntryId(null)
    setDeleteEntry(entry)
  }

  function closeDeleteDialog() {
    setDeleteEntry(null)
  }

  function deleteJournalEntry() {
    if (!deleteEntry) return
    setDeletingEntry(true)

    if (is_modal) {
      void performModalMutation({
        url: `/journal_entries/${deleteEntry.id}`,
        method: 'delete',
        modal,
        modalRef,
        successMessage: 'Journal entry deleted.',
        errorMessage: 'Failed to delete journal entry.',
        onFinish: () => {
          setDeletingEntry(false)
          closeDeleteDialog()
        },
      })
      return
    }

    router.delete(`/journal_entries/${deleteEntry.id}`, {
      preserveScroll: true,
      onSuccess: () => {
        notify('notice', 'Journal entry deleted.')
        closeDeleteDialog()
      },
      onError: () => notify('alert', 'Failed to delete journal entry.'),
      onFinish: () => setDeletingEntry(false),
    })
  }

  function openSwitchProjectDialog(entry: JournalEntryCard) {
    if (!entry.can_switch_project || switchTargets.length === 0) return
    setJournalMenuEntryId(null)
    setSwitchEntry(entry)
    setSwitchProjectId(switchTargets[0]?.id ?? '')
  }

  function closeSwitchProjectDialog() {
    setSwitchEntry(null)
    setSwitchProjectId('')
  }

  function switchJournalProject() {
    if (!switchEntry || switchProjectId === '') return

    const destination = switchTargets.find((switchableProject) => switchableProject.id === switchProjectId)
    if (!destination) {
      notify('alert', 'Pick a project to move this journal entry.')
      return
    }

    setSwitchingProject(true)

    if (is_modal) {
      void performModalMutation({
        url: `/journal_entries/${switchEntry.id}/switch_project`,
        method: 'patch',
        data: { project_id: destination.id },
        modal,
        modalRef,
        successMessage: 'Journal moved.',
        errorMessage: 'Failed to move journal.',
        onFinish: () => setSwitchingProject(false),
      })
      closeSwitchProjectDialog()
      return
    }

    router.patch(
      `/journal_entries/${switchEntry.id}/switch_project`,
      { project_id: destination.id },
      {
        preserveScroll: true,
        onSuccess: () => {
          notify('notice', 'Journal moved.')
          closeSwitchProjectDialog()
        },
        onError: () => notify('alert', 'Failed to move journal.'),
        onFinish: () => setSwitchingProject(false),
      },
    )
  }

  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = [
      ...journal_entries.map((entry) => ({
        type: 'journal' as const,
        entry,
        date: new Date(entry.created_at_iso).getTime(),
        iso: entry.created_at_iso,
      })),
      ...ships.map((ship) => {
        const eventIso = ship.status === 'pending' ? ship.created_at_iso : ship.updated_at_iso
        return {
          type: 'ship' as const,
          ship,
          date: new Date(eventIso).getTime(),
          iso: eventIso,
        }
      }),
      {
        type: 'created' as const,
        date: new Date(project.created_at_iso).getTime(),
        iso: project.created_at_iso,
      },
    ]
    events.sort((a, b) => b.date - a.date)
    return events
  }, [journal_entries, ships, project.created_at_iso])

  const journalByDate = useMemo<JournalDateGroup[]>(() => {
    const groups: JournalDateGroup[] = []
    const map = new Map<string, JournalDateGroup>()

    for (const entry of journal_entries) {
      const date = journalDateTime(entry.created_at_iso)
      const dateKey = date?.toISODate() ?? entry.created_at_iso
      if (!map.has(dateKey)) {
        const group: JournalDateGroup = { dateKey, date: date?.startOf('day') ?? null, entries: [] }
        map.set(dateKey, group)
        groups.push(group)
      }
      map.get(dateKey)!.entries.push(entry)
    }

    return groups
  }, [journal_entries])

  const ribbonTabs: { label: string; tab: 'timeline' | 'journal' }[] = [
    { label: 'Timeline', tab: 'timeline' },
    { label: 'Journal', tab: 'journal' },
  ]

  function renderNewJournalEntryButton() {
    const iconButtonClasses =
      'bg-brown text-light-brown border-2 border-dark-brown rounded w-10 h-10 flex items-center justify-center hover:opacity-80 cursor-pointer'

    if (can.create_journal_entry) {
      return (
        <Tooltip side="top" gap={8}>
          <TooltipTrigger asChild>
            <ModalLink
              href={`/projects/${project.id}/journal_entries/new`}
              aria-label="New journal entry"
              className={iconButtonClasses}
            >
              <Feather className="w-5 h-5" />
            </ModalLink>
          </TooltipTrigger>
          <TooltipContent>New journal entry</TooltipContent>
        </Tooltip>
      )
    }

    if (can.create_journal_entry_locked_for_trial) {
      return (
        <Tooltip side="top" gap={8}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => notify('alert', 'This is locked. Verify your account to continue!')}
              aria-label="New journal entry"
              className={iconButtonClasses}
            >
              <Feather className="w-5 h-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>New journal entry</TooltipContent>
        </Tooltip>
      )
    }

    return null
  }

  function renderJournalRecordings(entry: JournalEntryCard) {
    if (entry.recordings.length === 0) return null

    return (
      <div className="mt-3 space-y-3">
        {entry.recordings.map((recording) => (
          <div key={recording.id} className="overflow-hidden rounded border-2 border-dark-brown bg-light-brown">
            <iframe
              src={recording.embed_url}
              title={recording.title}
              className="aspect-video w-full"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        ))}
      </div>
    )
  }

  const content = (
    <div className="relative h-full">
      <div className="flex flex-col xl:flex-row h-full overflow-y-auto xl:overflow-visible bg-light-brown xl:bg-transparent">
        {ribbonTabs.map(({ label, tab }, i) => (
          <div
            key={tab}
            className={`hidden xl:block absolute right-0 translate-x-full z-10 origin-left cursor-pointer motion-safe:hover:scale-105 motion-safe:transition-transform ${rightTab === tab ? 'scale-105' : ''}`}
            style={{ top: `${3 + i * 5}rem` }}
            onClick={() => setRightTab(tab)}
          >
            <div
              className={`w-42 h-16 flex ${rightTab === tab ? 'bg-brown' : 'bg-dark-brown'}`}
              style={{
                clipPath: 'polygon(0 0, 100% 0, calc(100% - 1rem) 50%, 100% 100%, 0 100%)',
              }}
            >
              <p className="uppercase text-light-brown text-2xl font-medium border-y-2 my-auto border-light-brown text-center w-full pr-3 py-1">
                {label}
              </p>
            </div>
          </div>
        ))}

        {/* Left page */}
        <div className="xl:flex-1 max-xl:w-full min-w-0 max-xl:shrink-0 flex flex-col p-4 xl:p-6 overflow-y-auto">
          <h1 className="font-bold text-4xl text-dark-brown mb-2">{project.name}</h1>

          {project.description && <p className="text-dark-brown mb-4">{project.description}</p>}

          {formatByLine(project, collaborators)}

          <div className="flex items-center gap-4 text-sm text-dark-brown mt-2">
            <span className="flex items-center gap-1">
              <BookOpenIcon className="w-4 h-4" />
              {project.journal_entries_count} {project.journal_entries_count === 1 ? 'entry' : 'entries'}
            </span>
            <span className="flex items-center gap-1">
              <ClockIcon className="w-4 h-4" />
              {formatTime(project.time_logged)}
            </span>
          </div>

          {can.manage_collaborators && (
            <div className="mt-6">
              <form onSubmit={sendInvite} className="flex gap-2 items-start">
                <div className="flex-1">
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Add collaborator by email..."
                    disabled={inviting}
                    className="py-2 text-sm"
                  />
                  {inviteError && <p className="text-red-500 text-xs mt-1">{inviteError}</p>}
                </div>
                <Button type="submit" disabled={inviting || !inviteEmail.trim()} className="text-sm py-2">
                  {inviting ? 'Sending...' : 'Invite'}
                </Button>
              </form>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 mt-auto pt-6">
            <div className="flex items-center gap-2">
              {is_modal && (
                <Tooltip side="top" gap={8}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handleBack}
                      aria-label="Back"
                      className="bg-transparent text-dark-brown border-2 border-dark-brown rounded w-10 h-10 flex items-center justify-center cursor-pointer hover:bg-light-brown"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Back</TooltipContent>
                </Tooltip>
              )}
              {can.update && (
                <Tooltip side="top" gap={8}>
                  <TooltipTrigger asChild>
                    <ModalLink
                      href={`/projects/${project.id}/edit`}
                      onProjectSaved={handleProjectSaved}
                      aria-label="Edit project"
                      className="bg-brown text-light-brown border-2 border-dark-brown rounded w-10 h-10 flex items-center justify-center hover:opacity-80 cursor-pointer"
                    >
                      <Pencil className="w-5 h-5" />
                    </ModalLink>
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
              )}
              {can.destroy && (
                <Tooltip side="top" gap={8}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={deleteProject}
                      disabled={deleting}
                      aria-label="Delete project"
                      className="bg-coral text-light-brown border-2 border-dark-brown rounded w-10 h-10 flex items-center justify-center hover:opacity-80 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Delete project</TooltipContent>
                </Tooltip>
              )}
            </div>
            {can.ship && (
              <Button onClick={() => router.visit(`/projects/${project.id}/ship`)} className="px-6 py-2 text-sm">
                Submit
              </Button>
            )}
          </div>
        </div>

        <div className="h-px max-xl:w-full xl:w-px xl:h-full bg-dark-brown max-xl:shrink-0" />

        {/* Right page */}
        <div className="xl:flex-1 max-xl:w-full min-w-0 max-xl:shrink-0 flex flex-col p-4 xl:p-6 overflow-hidden max-xl:mt-8">
          {/* Mobile Tabs */}
          <div className="flex xl:hidden gap-2 mb-6 shrink-0">
            {ribbonTabs.map(({ label, tab }) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`flex-1 py-1.5 px-2 text-center uppercase text-sm font-bold border-2 border-dark-brown truncate ${
                  rightTab === tab ? 'bg-brown text-light-brown' : 'bg-transparent text-dark-brown'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={rightTab === 'timeline' ? 'flex flex-col min-h-[300px] xl:min-h-0 flex-1' : 'hidden'}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-2xl text-dark-brown">Timeline</h2>
              {renderNewJournalEntryButton()}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {timelineEvents.length > 0 ? (
                <Timeline>
                  {timelineEvents.map((event, i) => {
                    const isLast = i === timelineEvents.length - 1
                    if (event.type === 'journal') {
                      const entry = event.entry
                      return (
                        <Timeline.DetailItem
                          key={`journal-${entry.id}`}
                          isLast={isLast}
                          header={
                            <>
                              <InlineUser avatar={entry.author_avatar} display_name={entry.author_display_name} />{' '}
                              journaled <TimeAgo datetime={event.iso} />.
                            </>
                          }
                        >
                          <div
                            className="prose prose-sm max-w-none text-dark-brown wrap-break-word [&_img]:max-h-48 [&_img]:w-auto markdown-content timeline-markdown"
                            dangerouslySetInnerHTML={{ __html: entry.content_html }}
                          />
                          {renderJournalRecordings(entry)}
                        </Timeline.DetailItem>
                      )
                    }
                    if (event.type === 'ship') {
                      const ship = event.ship
                      const isReturned = ship.status === 'returned'

                      if (isReturned && ship.feedback) {
                        return (
                          <Timeline.DetailItem
                            key={`ship-${ship.id}`}
                            isLast={isLast}
                            header={
                              <>
                                <InlineUser avatar={project.user_avatar} display_name={project.user_display_name} />{' '}
                                {shipStatusLabel(ship.status)} <TimeAgo datetime={event.iso} />.
                              </>
                            }
                          >
                            <div className="space-y-3">
                              <p className="text-sm text-dark-brown whitespace-pre-wrap">{ship.feedback}</p>
                              {can.ship && (
                                <Button
                                  onClick={() => router.visit(`/projects/${project.id}/ship`)}
                                  className="px-4 py-1.5 text-sm"
                                >
                                  Resubmit
                                </Button>
                              )}
                            </div>
                          </Timeline.DetailItem>
                        )
                      }

                      return (
                        <Timeline.SimpleItem
                          key={`ship-${ship.id}`}
                          isLast={isLast}
                          header={
                            <>
                              <InlineUser avatar={project.user_avatar} display_name={project.user_display_name} />{' '}
                              {shipStatusLabel(ship.status)} <TimeAgo datetime={event.iso} />.
                            </>
                          }
                        />
                      )
                    }
                    return (
                      <Timeline.SimpleItem
                        key="created"
                        isLast={isLast}
                        header={
                          <>
                            <InlineUser avatar={project.user_avatar} display_name={project.user_display_name} /> created{' '}
                            {project.name} <TimeAgo datetime={event.iso} />.
                          </>
                        }
                      />
                    )
                  })}
                </Timeline>
              ) : (
                <p className="text-dark-brown text-sm">No activity yet.</p>
              )}
            </div>
          </div>

          <div className={rightTab === 'journal' ? 'flex flex-col min-h-[300px] xl:min-h-0 flex-1' : 'hidden'}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-2xl text-dark-brown">Journal</h2>
              {renderNewJournalEntryButton()}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {journalByDate.length > 0 ? (
                <div className="space-y-8">
                  {journalByDate.map(({ dateKey, date, entries }) => (
                    <section key={dateKey} className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 border-2 border-dark-brown bg-brown px-3 py-1 text-xs font-bold text-light-brown">
                          {formatJournalDate(date, dateKey)} - {entries.length}{' '}
                          {entries.length === 1 ? 'entry' : 'entries'}
                        </div>
                        <div className="h-px flex-1 bg-dark-brown" />
                      </div>

                      <div className="space-y-5">
                        {entries.map((entry) => {
                          const isHighlighted = entry.id === highlight_journal_entry_id
                          const exactTime = formatJournalExactTime(entry.created_at_iso)
                          const metadata = [
                            exactTime,
                            `By ${entry.author_display_name}`,
                            entry.recordings_count > 0
                              ? `${formatTime(entry.time_logged)} tracked`
                              : 'No recording attached',
                          ]

                          if (entry.recordings_count > 0) {
                            metadata.push(
                              `${entry.recordings_count} ${entry.recordings_count === 1 ? 'recording' : 'recordings'}`,
                            )
                          }

                          return (
                            <div
                              key={entry.id}
                              ref={isHighlighted ? highlightedJournalRef : undefined}
                              id={`journal-entry-${entry.id}`}
                              className={`relative scroll-mt-16 py-1 pl-4 ${
                                isHighlighted ? 'rounded outline outline-2 outline-brown' : ''
                              }`}
                            >
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-brown" />
                              <div className="pl-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="font-bold text-lg text-dark-brown">
                                      <JournalRelativeTime iso={entry.created_at_iso} title={exactTime} />
                                    </div>
                                    <JournalMetaItems items={metadata} />
                                  </div>
                                  {(entry.can_delete || (entry.can_switch_project && switchTargets.length > 0)) && (
                                    <div className="relative">
                                      {journalMenuEntryId === entry.id && (
                                        <div
                                          className="fixed inset-0 z-10"
                                          onClick={() => setJournalMenuEntryId(null)}
                                        />
                                      )}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setJournalMenuEntryId((currentEntryId) =>
                                            currentEntryId === entry.id ? null : entry.id,
                                          )
                                        }
                                        className="inline-flex h-8 w-8 items-center justify-center border-2 border-dark-brown text-dark-brown"
                                        aria-label="Journal actions"
                                      >
                                        <EllipsisHorizontalIcon className="h-5 w-5" />
                                      </button>
                                      {journalMenuEntryId === entry.id && (
                                        <div className="absolute right-0 mt-1 min-w-40 border-2 border-dark-brown bg-light-brown z-20">
                                          {entry.can_switch_project && switchTargets.length > 0 && (
                                            <button
                                              type="button"
                                              onClick={() => openSwitchProjectDialog(entry)}
                                              className="w-full text-left px-3 py-2 text-xs font-bold uppercase text-dark-brown"
                                            >
                                              Switch Project
                                            </button>
                                          )}
                                          {entry.can_delete && (
                                            <button
                                              type="button"
                                              onClick={() => openDeleteDialog(entry)}
                                              className="w-full text-left px-3 py-2 text-xs font-bold uppercase text-red-700"
                                            >
                                              Delete
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div
                                  className="prose prose-sm max-w-none text-dark-brown wrap-break-word [&_img]:max-h-48 [&_img]:w-auto markdown-content timeline-markdown mt-3"
                                  dangerouslySetInnerHTML={{ __html: entry.content_html }}
                                />
                                {renderJournalRecordings(entry)}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <p className="text-dark-brown text-sm">No journal entries yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {deleteEntry && <div className="fixed inset-0 z-20 backdrop-brightness-75" />}

      {deleteEntry && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
          <div className="w-full max-w-sm border-2 border-dark-brown bg-light-brown p-4">
            <h3 className="text-lg font-bold text-dark-brown">Delete Journal Entry</h3>
            <p className="mt-2 text-sm text-dark-brown">
              Are you sure you want to delete this journal entry? This cannot be undone.
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={closeDeleteDialog}
                disabled={deletingEntry}
                className="border-2 border-dark-brown px-3 py-1.5 text-xs font-bold uppercase text-dark-brown"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteJournalEntry}
                disabled={deletingEntry}
                className="border-2 border-red-700 bg-red-700 px-3 py-1.5 text-xs font-bold uppercase text-white"
              >
                {deletingEntry ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {switchEntry && <div className="fixed inset-0 z-20 backdrop-brightness-75" />}

      {switchEntry && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
          <div className="w-full max-w-sm border-2 border-dark-brown bg-light-brown p-4">
            <h3 className="text-lg font-bold text-dark-brown">Switch Journal Project</h3>
            <p className="mt-2 text-sm text-dark-brown">Move this journal entry from {project.name} to:</p>
            <select
              value={switchProjectId}
              onChange={(event) => setSwitchProjectId(Number(event.target.value))}
              disabled={switchingProject}
              className="mt-3 w-full border-2 border-dark-brown bg-light-brown px-3 py-2 text-sm text-dark-brown"
            >
              {switchTargets.map((switchableProject) => (
                <option key={switchableProject.id} value={switchableProject.id}>
                  {switchableProject.name}
                </option>
              ))}
            </select>

            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={closeSwitchProjectDialog}
                disabled={switchingProject}
                className="border-2 border-dark-brown px-3 py-1.5 text-xs font-bold uppercase text-dark-brown"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={switchJournalProject}
                disabled={switchingProject || switchProjectId === ''}
                className="border-2 border-dark-brown bg-brown px-3 py-1.5 text-xs font-bold uppercase text-light-brown"
              >
                {switchingProject ? 'Switching...' : 'Switch Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  if (is_modal) {
    return (
      <Modal
        ref={modalRef}
        panelClasses="h-full xl:pointer-events-none max-xl:w-full max-xl:max-w-none max-xl:max-h-full max-xl:overflow-hidden"
        paddingClasses="p-0 xl:max-w-5xl xl:mx-auto"
        closeButton={false}
        maxWidth="7xl"
      >
        <BookLayout className="max-h-none xl:max-h-[40em] xl:pointer-events-auto" showJoint={false} showBorderOnMobile>
          {content}
        </BookLayout>
      </Modal>
    )
  }

  return content
}
