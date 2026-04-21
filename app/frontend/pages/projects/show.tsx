import { useState, useMemo, useRef } from 'react'
import { router, usePage } from '@inertiajs/react'
// @ts-expect-error useModal lacks type declarations in this beta package
import { Modal, ModalLink, useModal } from '@inertiaui/modal-react'
import { BookOpenIcon, ClockIcon } from '@heroicons/react/16/solid'
import { EllipsisHorizontalIcon } from '@heroicons/react/20/solid'
import BookLayout from '@/components/shared/BookLayout'
import Button from '@/components/shared/Button'
import InlineUser from '@/components/shared/InlineUser'
import Input from '@/components/shared/Input'
import { performModalMutation } from '@/lib/modalMutation'
import { notify } from '@/lib/notifications'
import TimeAgo from '@/components/shared/TimeAgo'
import Timeline from '@/components/shared/Timeline'
import type {
  ProjectDetail,
  JournalEntryCard,
  CollaboratorInfo,
  ShipEvent,
  SharedProps,
  JournalSwitchableProject,
} from '@/types'

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

export default function ProjectsShow({
  project,
  journal_entries,
  switchable_projects_for_journal,
  collaborators,
  ships,
  can,
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
  }
  is_modal?: boolean
  onModalEvent?: (event: string, ...args: any[]) => void
}) {
  const modalRef = useRef<{ close: () => void }>(null)
  const modal = useModal()
  const {
    auth: { user: authUser },
  } = usePage<SharedProps>().props
  const isTrial = authUser?.is_trial ?? false
  const [rightTab, setRightTab] = useState<'timeline' | 'journal'>('timeline')
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
      ...ships.map((ship) => ({
        type: 'ship' as const,
        ship,
        date: new Date(ship.created_at_iso).getTime(),
        iso: ship.created_at_iso,
      })),
      {
        type: 'created' as const,
        date: new Date(project.created_at_iso).getTime(),
        iso: project.created_at_iso,
      },
    ]
    events.sort((a, b) => b.date - a.date)
    return events
  }, [journal_entries, ships, project.created_at_iso])

  const journalByDate = useMemo(() => {
    const groups: { dateKey: string; entries: JournalEntryCard[] }[] = []
    const map = new Map<string, JournalEntryCard[]>()

    for (const entry of journal_entries) {
      const d = new Date(entry.created_at_iso)
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!map.has(dateKey)) {
        const arr: JournalEntryCard[] = []
        map.set(dateKey, arr)
        groups.push({ dateKey, entries: arr })
      }
      map.get(dateKey)!.push(entry)
    }

    return groups
  }, [journal_entries])

  function journalDateHeader(dateKey: string, entries: JournalEntryCard[], index: number): string {
    const hasMultiple = entries.length > 1
    if (!hasMultiple) return dateKey
    const entry = entries[index]
    const d = new Date(entry.created_at_iso)
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return `${dateKey} ${time}`
  }

  const ribbonTabs: { label: string; tab: 'timeline' | 'journal' }[] = [
    { label: 'Timeline', tab: 'timeline' },
    { label: 'Journal', tab: 'journal' },
  ]

  function renderNewJournalEntryButton() {
    if (can.create_journal_entry) {
      return (
        <ModalLink
          href={`/projects/${project.id}/journal_entries/new`}
          className="bg-brown text-light-brown border-2 border-dark-brown px-4 py-2 font-bold uppercase text-sm hover:opacity-80"
        >
          New Journal Entry
        </ModalLink>
      )
    }

    if (isTrial) {
      return (
        <button
          type="button"
          onClick={() => notify('alert', 'This is locked. Verify your account to continue!')}
          className="bg-brown text-light-brown border-2 border-dark-brown px-4 py-2 font-bold uppercase text-sm hover:opacity-80 cursor-pointer"
        >
          New Journal Entry
        </button>
      )
    }

    return null
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

          <div className="flex gap-4 mt-auto pt-6 flex-wrap">
            {is_modal && (
              <button
                onClick={handleBack}
                className="py-2 px-6 text-sm border-2 font-bold uppercase cursor-pointer bg-transparent text-dark-brown border-dark-brown"
              >
                Back
              </button>
            )}
            {can.update && (
              <ModalLink
                href={`/projects/${project.id}/edit`}
                onProjectSaved={handleProjectSaved}
                className="bg-brown text-light-brown border-2 border-dark-brown px-6 py-2 font-bold uppercase hover:opacity-80 flex items-center justify-center text-sm"
              >
                Edit
              </ModalLink>
            )}
            {can.destroy && (
              <Button
                onClick={deleteProject}
                disabled={deleting}
                className="bg-coral px-6 py-2 text-sm flex-1 xl:flex-none"
              >
                {deleting ? 'Deleting...' : 'Delete Project'}
              </Button>
            )}
            {can.ship && (
              <Button
                onClick={() => router.visit(`/projects/${project.id}/ship`)}
                className="px-6 py-2 text-sm flex-1 xl:flex-none"
              >
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
                <div className="space-y-6">
                  {journalByDate.map(({ dateKey, entries }) =>
                    entries.map((entry, entryIdx) => (
                      <div key={entry.id}>
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-bold text-lg text-dark-brown">
                            {journalDateHeader(dateKey, entries, entryIdx)}
                          </h3>
                          {(entry.can_delete || (entry.can_switch_project && switchTargets.length > 0)) && (
                            <div className="relative">
                              {journalMenuEntryId === entry.id && (
                                <div className="fixed inset-0 z-10" onClick={() => setJournalMenuEntryId(null)} />
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
                        <p className="text-sm text-dark-brown mb-2">{formatTime(entry.time_logged)} tracked</p>
                        <div
                          className="prose prose-sm max-w-none text-dark-brown wrap-break-word [&_img]:max-h-48 [&_img]:w-auto markdown-content timeline-markdown"
                          dangerouslySetInnerHTML={{ __html: entry.content_html }}
                        />
                      </div>
                    )),
                  )}
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
        panelClasses="h-full max-xl:w-full max-xl:max-w-none max-xl:max-h-full max-xl:overflow-hidden"
        paddingClasses="p-0 xl:max-w-5xl xl:mx-auto"
        closeButton={false}
        maxWidth="7xl"
      >
        <BookLayout className="max-h-none xl:max-h-[40em]" showJoint={false} showBorderOnMobile>
          {content}
        </BookLayout>
      </Modal>
    )
  }

  return content
}
