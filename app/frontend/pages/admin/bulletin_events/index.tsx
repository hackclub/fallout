import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { router, usePage } from '@inertiajs/react'
import type { SharedProps } from '@/types'
import { Pencil, Trash2, Play, Square, Calendar, Hand, ImageOff, FastForward } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import { Button } from '@/components/admin/ui/button'
import { Badge } from '@/components/admin/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/admin/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/admin/ui/alert-dialog'
import EventFormSheet from './EventFormSheet'
import {
  computeBulletinEventStatus,
  formatEventDateTime,
  type BulletinEventStatus,
  type SerializedBulletinEvent,
} from '@/lib/bulletinEventStatus'
import { useLiveReload } from '@/lib/useLiveReload'
import { useNowTick } from '@/lib/useNowTick'

type TabKey = 'upcoming' | 'all' | 'expired'

type PageProps = {
  events: SerializedBulletinEvent[]
  current_tab: TabKey
}

type EventWithStatus = {
  event: SerializedBulletinEvent
  status: BulletinEventStatus
}

const STATUS_LABEL: Record<BulletinEventStatus, string> = {
  draft: 'Draft',
  upcoming: 'Upcoming',
  happening: 'Happening',
  expired: 'Expired',
}

const STATUS_CLASS: Record<BulletinEventStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  upcoming: 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200',
  happening: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200',
  expired: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300',
}

export default function AdminBulletinEventsIndex({ events, current_tab }: PageProps) {
  const { admin_permissions } = usePage<SharedProps & { admin_permissions?: { is_admin: boolean } }>().props
  const canModify = admin_permissions?.is_admin ?? false

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState<'selected' | 'all' | null>(null)
  const [selectedExpiredIds, setSelectedExpiredIds] = useState<Set<number>>(() => new Set())

  const liveProps = useLiveReload<Pick<PageProps, 'events'>>({ stream: 'bulletin_events', only: ['events'] })
  const now = useNowTick(1000)
  const liveEvents = liveProps?.events ?? events

  const eventsWithStatus = useMemo<EventWithStatus[]>(
    () => liveEvents.map((event) => ({ event, status: computeBulletinEventStatus(event, now) })),
    [liveEvents, now],
  )
  const liveCounts = useMemo(
    () =>
      eventsWithStatus.reduce(
        (counts, { status }) => {
          counts.all += 1
          if (status === 'expired') {
            counts.expired += 1
          } else {
            counts.upcoming += 1
          }
          return counts
        },
        { upcoming: 0, all: 0, expired: 0 },
      ),
    [eventsWithStatus],
  )
  const visibleEvents = useMemo(() => {
    if (current_tab === 'all') return eventsWithStatus
    if (current_tab === 'expired') return eventsWithStatus.filter(({ status }) => status === 'expired')
    return eventsWithStatus.filter(({ status }) => status !== 'expired')
  }, [current_tab, eventsWithStatus])
  const expiredEvents = useMemo(() => eventsWithStatus.filter(({ status }) => status === 'expired'), [eventsWithStatus])
  const selectedExpiredEvents = useMemo(
    () => expiredEvents.filter(({ event }) => selectedExpiredIds.has(event.id)),
    [expiredEvents, selectedExpiredIds],
  )
  const selectedExpiredCount = selectedExpiredEvents.length
  const visibleExpiredIds = useMemo(
    () => visibleEvents.filter(({ status }) => status === 'expired').map(({ event }) => event.id),
    [visibleEvents],
  )
  const allVisibleExpiredSelected =
    visibleExpiredIds.length > 0 && visibleExpiredIds.every((id) => selectedExpiredIds.has(id))
  const showExpiredSelection = canModify && current_tab === 'expired'
  const tableColSpan = showExpiredSelection ? 8 : 7
  const editing = editingId == null ? null : liveEvents.find((event) => event.id === editingId) || null
  const confirmDelete =
    confirmDeleteId == null ? null : liveEvents.find((event) => event.id === confirmDeleteId) || null

  useEffect(() => {
    setSelectedExpiredIds((previous) => {
      const expiredIds = new Set(expiredEvents.map(({ event }) => event.id))
      const next = new Set([...previous].filter((id) => expiredIds.has(id)))
      return next.size === previous.size ? previous : next
    })
  }, [expiredEvents])

  useEffect(() => {
    if (sheetOpen && editingId != null && !editing) {
      setSheetOpen(false)
      setEditingId(null)
    }
  }, [editing, editingId, sheetOpen])

  useEffect(() => {
    if (confirmDeleteId != null && !confirmDelete) {
      setConfirmDeleteId(null)
    }
  }, [confirmDelete, confirmDeleteId])

  function openNew() {
    setEditingId(null)
    setSheetOpen(true)
  }

  function openEdit(event: SerializedBulletinEvent) {
    setEditingId(event.id)
    setSheetOpen(true)
  }

  function setSheet(open: boolean) {
    setSheetOpen(open)
    if (!open) setEditingId(null)
  }

  function switchTab(tab: string) {
    router.get('/admin/bulletin_events', { tab }, { preserveScroll: true, preserveState: false })
  }

  function patchAction(event: SerializedBulletinEvent, path: 'start_now' | 'force_start_now' | 'end_now') {
    router.patch(`/admin/bulletin_events/${event.id}/${path}`, { tab: current_tab }, { preserveScroll: true })
  }

  function toggleExpiredSelection(eventId: number, checked: boolean) {
    setSelectedExpiredIds((previous) => {
      const next = new Set(previous)
      if (checked) {
        next.add(eventId)
      } else {
        next.delete(eventId)
      }
      return next
    })
  }

  function toggleVisibleExpiredSelection(checked: boolean) {
    setSelectedExpiredIds((previous) => {
      const next = new Set(previous)
      visibleExpiredIds.forEach((id) => {
        if (checked) {
          next.add(id)
        } else {
          next.delete(id)
        }
      })
      return next
    })
  }

  function doDelete(event: SerializedBulletinEvent) {
    router.delete(`/admin/bulletin_events/${event.id}`, {
      data: { tab: current_tab },
      preserveScroll: true,
      onFinish: () => setConfirmDeleteId(null),
    })
  }

  function doBulkDelete(mode: 'selected' | 'all') {
    const data =
      mode === 'selected'
        ? { ids: selectedExpiredEvents.map(({ event }) => event.id), tab: current_tab }
        : { tab: current_tab }
    const url = mode === 'selected' ? '/admin/bulletin_events/bulk_destroy' : '/admin/bulletin_events/destroy_expired'

    router.delete(url, {
      data,
      preserveScroll: true,
      onFinish: () => {
        setConfirmBulkDelete(null)
        setSelectedExpiredIds(new Set())
      },
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bulletin Events</h1>
          <p className="text-sm text-muted-foreground">
            Manage events shown on the public bulletin board. Times are stored in UTC and rendered in each viewer's
            local timezone.
          </p>
        </div>
        {canModify && (
          <div className="flex items-center gap-2">
            {liveCounts.expired > 0 && (
              <Button variant="destructive" onClick={() => setConfirmBulkDelete('all')}>
                <Trash2 className="size-3.5" /> Clear all expired
              </Button>
            )}
            <Button onClick={openNew}>+ New event</Button>
          </div>
        )}
      </div>

      <Tabs value={current_tab} onValueChange={switchTab}>
        <TabsList>
          <TabsTrigger value="upcoming">
            Upcoming <span className="ml-1 text-muted-foreground">({liveCounts.upcoming})</span>
          </TabsTrigger>
          <TabsTrigger value="all">
            All <span className="ml-1 text-muted-foreground">({liveCounts.all})</span>
          </TabsTrigger>
          <TabsTrigger value="expired">
            Expired <span className="ml-1 text-muted-foreground">({liveCounts.expired})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={current_tab}>
          {showExpiredSelection && liveCounts.expired > 0 && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-3 py-2">
              <span className="text-sm text-muted-foreground">
                {selectedExpiredCount > 0
                  ? `${selectedExpiredCount} expired ${selectedExpiredCount === 1 ? 'event' : 'events'} selected`
                  : 'Select expired events to delete them in bulk.'}
              </span>
              <Button
                variant="destructive"
                disabled={selectedExpiredCount === 0}
                onClick={() => setConfirmBulkDelete('selected')}
              >
                <Trash2 className="size-3.5" /> Delete selected
              </Button>
            </div>
          )}

          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  {showExpiredSelection && (
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={allVisibleExpiredSelected}
                        disabled={visibleExpiredIds.length === 0}
                        onChange={(e) => toggleVisibleExpiredSelection(e.currentTarget.checked)}
                        aria-label="Select all expired events"
                        className="size-4 accent-primary"
                      />
                    </TableHead>
                  )}
                  <TableHead className="w-14">Image</TableHead>
                  <TableHead className="min-w-48">Title</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Starts</TableHead>
                  <TableHead>Ends</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleEvents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={tableColSpan} className="h-24 text-center text-muted-foreground">
                      {current_tab === 'upcoming' && 'No upcoming events. Click "+ New event" to add one.'}
                      {current_tab === 'all' && 'No events yet.'}
                      {current_tab === 'expired' && 'No expired events.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleEvents.map(({ event, status: liveStatus }) => {
                    const isManualDraft = !event.schedulable && liveStatus === 'draft'
                    const isScheduledUpcoming = event.schedulable && liveStatus === 'upcoming'
                    const isActive = liveStatus === 'happening'
                    return (
                      <TableRow key={event.id}>
                        {showExpiredSelection && (
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedExpiredIds.has(event.id)}
                              onChange={(e) => toggleExpiredSelection(event.id, e.currentTarget.checked)}
                              aria-label={`Select ${event.title}`}
                              className="size-4 accent-primary"
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          {event.image_url ? (
                            // eslint-disable-next-line jsx-a11y/img-redundant-alt
                            <img
                              src={event.image_url}
                              alt=""
                              className="size-10 rounded-md object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="size-10 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                              <ImageOff className="size-4" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium whitespace-normal">
                          <div className="max-w-xs truncate" title={event.title}>
                            {event.title}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1">
                            {event.schedulable ? (
                              <>
                                <Calendar className="size-3" /> Scheduled
                              </>
                            ) : (
                              <>
                                <Hand className="size-3" /> Manual
                              </>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {event.starts_at ? formatEventDateTime(event.starts_at) : '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {event.ends_at ? formatEventDateTime(event.ends_at) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_CLASS[liveStatus]}>{STATUS_LABEL[liveStatus]}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {canModify ? (
                            <div className="inline-flex gap-1">
                              {isManualDraft && (
                                <Button size="sm" variant="outline" onClick={() => patchAction(event, 'start_now')}>
                                  <Play className="size-3.5" /> Start now
                                </Button>
                              )}
                              {isScheduledUpcoming && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => patchAction(event, 'force_start_now')}
                                  title="Override scheduled start and begin this event now"
                                >
                                  <FastForward className="size-3.5" /> Force start
                                </Button>
                              )}
                              {isActive && (
                                <Button size="sm" variant="outline" onClick={() => patchAction(event, 'end_now')}>
                                  <Square className="size-3.5" /> End now
                                </Button>
                              )}
                              <Button size="icon-sm" variant="ghost" onClick={() => openEdit(event)} title="Edit">
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                onClick={() => setConfirmDeleteId(event.id)}
                                title="Delete"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Read-only</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <EventFormSheet
        open={sheetOpen && (editingId == null || !!editing)}
        onOpenChange={setSheet}
        event={editing}
        currentTab={current_tab}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete event?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{confirmDelete?.title}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => confirmDelete && doDelete(confirmDelete)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmBulkDelete} onOpenChange={(o) => !o && setConfirmBulkDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmBulkDelete === 'all' ? 'Clear all expired events?' : 'Delete selected expired events?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBulkDelete === 'all'
                ? `This will permanently delete ${liveCounts.expired} expired ${
                    liveCounts.expired === 1 ? 'event' : 'events'
                  }. This action cannot be undone.`
                : `This will permanently delete ${selectedExpiredCount} selected expired ${
                    selectedExpiredCount === 1 ? 'event' : 'events'
                  }. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => confirmBulkDelete && doBulkDelete(confirmBulkDelete)}
              disabled={confirmBulkDelete === 'selected' && selectedExpiredCount === 0}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

AdminBulletinEventsIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
