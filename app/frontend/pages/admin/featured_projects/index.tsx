import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { router, usePage } from '@inertiajs/react'
import type { SharedProps } from '@/types'
import { Pencil, Trash2, ImageOff, GripVertical, RotateCcw, ExternalLink, Star } from 'lucide-react'
import { DateTime } from 'luxon'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import AdminLayout from '@/layouts/AdminLayout'
import { Button } from '@/components/admin/ui/button'
import { Badge } from '@/components/admin/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/admin/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { Textarea } from '@/components/admin/ui/textarea'
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
import FeaturedProjectFormSheet from './FeaturedProjectFormSheet'
import { useLiveReload } from '@/lib/useLiveReload'

type TabKey = 'active' | 'archived'

export type FeaturedByPayload = {
  id: number
  display_name: string
  avatar: string
}

export type FeaturedProjectProjectPayload = {
  id: number
  name: string
  repo_link: string | null
  is_discarded: boolean
  is_unlisted: boolean
  thumbnail_url: string | null
  owner_display_name: string
  owner_avatar: string
  owner_id: number
}

export type SerializedFeaturedProject = {
  id: number
  position: number
  note: string | null
  featured_at: string | null
  discarded_at: string | null
  featured_by: FeaturedByPayload
  project: FeaturedProjectProjectPayload
}

type PageProps = {
  featured: SerializedFeaturedProject[]
  current_tab: TabKey
  counts: { active: number; archived: number }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const dt = DateTime.fromISO(iso)
  return dt.isValid ? dt.toLocaleString(DateTime.DATETIME_MED) : '—'
}

function Thumbnail({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return (
      <div className="size-12 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
        <ImageOff className="size-4" />
      </div>
    )
  }
  // eslint-disable-next-line jsx-a11y/img-redundant-alt
  return <img src={url} alt={alt} className="size-12 rounded-md object-cover shrink-0" loading="lazy" />
}

type SortableCardProps = {
  fp: SerializedFeaturedProject
  canModify: boolean
  onEditNote: (fp: SerializedFeaturedProject) => void
  onUnfeature: (fp: SerializedFeaturedProject) => void
}

function SortableFeaturedCard({ fp, canModify, onEditNote, onUnfeature }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: fp.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    // Plain div, not <Card> — the shadcn Card baseline includes `flex flex-col`, which forces
    // children to stack vertically even when we override with `flex items-center`. We want a
    // horizontal row (drag-handle · thumb · text · actions), so we recreate the card chrome here.
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 ring-1 ring-foreground/10"
    >
      {canModify ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none p-1"
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </button>
      ) : (
        <div className="w-6" />
      )}

      <Thumbnail url={fp.project.thumbnail_url} alt={fp.project.name} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={`/admin/projects/${fp.project.id}`}
            className="font-medium hover:underline truncate"
            title={fp.project.name}
          >
            {fp.project.name}
          </a>
          {fp.project.is_discarded && <Badge variant="destructive">Deleted</Badge>}
          {fp.project.is_unlisted && <Badge variant="outline">Unlisted</Badge>}
          {fp.project.repo_link && (
            <a
              href={fp.project.repo_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              title="Open repo"
            >
              <ExternalLink className="size-3" /> repo
            </a>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span>by</span>
          <a
            href={`/admin/users/${fp.project.owner_id}`}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <img src={fp.project.owner_avatar} alt="" className="size-3.5 rounded-full" />
            {fp.project.owner_display_name}
          </a>
          <span>·</span>
          <span>featured {formatDate(fp.featured_at)}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <img src={fp.featured_by.avatar} alt="" className="size-3.5 rounded-full" />
            {fp.featured_by.display_name}
          </span>
        </div>
        {fp.note && <div className="text-xs italic text-muted-foreground mt-1 line-clamp-2">"{fp.note}"</div>}
      </div>

      {canModify && (
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon-sm" variant="ghost" onClick={() => onEditNote(fp)} title="Edit note">
            <Pencil className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => onUnfeature(fp)}
            title="Unfeature"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}

type NoteDialogState = { fp: SerializedFeaturedProject; value: string } | null

export default function AdminFeaturedProjectsIndex({ featured, current_tab, counts }: PageProps) {
  const { admin_permissions } = usePage<SharedProps & { admin_permissions?: { is_admin: boolean } }>().props
  const canModify = admin_permissions?.is_admin ?? false

  const liveProps = useLiveReload<Pick<PageProps, 'featured' | 'counts'>>({
    stream: 'featured_projects',
    only: ['featured', 'counts'],
  })
  const liveFeatured = liveProps?.featured ?? featured
  const liveCounts = liveProps?.counts ?? counts

  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirmUnfeature, setConfirmUnfeature] = useState<SerializedFeaturedProject | null>(null)
  const [noteDialog, setNoteDialog] = useState<NoteDialogState>(null)
  const [noteSaving, setNoteSaving] = useState(false)

  // Local optimistic copy of the active list so drag-reorder feels instant.
  // Reset whenever the server-provided list changes (after the PATCH response or a live broadcast).
  const [localOrder, setLocalOrder] = useState<SerializedFeaturedProject[]>(liveFeatured)
  useEffect(() => {
    setLocalOrder(liveFeatured)
  }, [liveFeatured])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const orderedIds = useMemo(() => localOrder.map((fp) => fp.id), [localOrder])

  function switchTab(tab: string) {
    router.get('/admin/featured_projects', { tab }, { preserveScroll: true, preserveState: false })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = localOrder.findIndex((fp) => fp.id === active.id)
    const newIndex = localOrder.findIndex((fp) => fp.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const next = arrayMove(localOrder, oldIndex, newIndex)
    setLocalOrder(next)

    router.patch(
      '/admin/featured_projects/reorder',
      { ids: next.map((fp) => fp.id) },
      {
        preserveScroll: true,
        preserveState: true,
        // Limit the redirect's response to just the props we care about — keeps the roundtrip
        // small per drag and avoids re-rendering unrelated sections.
        only: ['featured', 'counts'],
        onError: () => setLocalOrder(liveFeatured), // Revert on failure
      },
    )
  }

  function doUnfeature(fp: SerializedFeaturedProject) {
    router.delete(`/admin/featured_projects/${fp.id}`, {
      data: { tab: current_tab },
      preserveScroll: true,
      onFinish: () => setConfirmUnfeature(null),
    })
  }

  function doRestore(fp: SerializedFeaturedProject) {
    router.patch(`/admin/featured_projects/${fp.id}/restore`, {}, { preserveScroll: true })
  }

  function saveNote() {
    if (!noteDialog) return
    setNoteSaving(true)
    router.patch(
      `/admin/featured_projects/${noteDialog.fp.id}/update_note`,
      { featured_project: { note: noteDialog.value } },
      {
        preserveScroll: true,
        onFinish: () => {
          setNoteSaving(false)
          setNoteDialog(null)
        },
      },
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Featured Projects</h1>
          <p className="text-sm text-muted-foreground">Drag to reorder.</p>
        </div>
        {canModify && (
          <Button onClick={() => setSheetOpen(true)}>
            <Star className="size-3.5" /> Feature project
          </Button>
        )}
      </div>

      <Tabs value={current_tab} onValueChange={switchTab}>
        <TabsList>
          <TabsTrigger value="active">
            Active <span className="ml-1 text-muted-foreground">({liveCounts.active})</span>
          </TabsTrigger>
          <TabsTrigger value="archived">
            Archive <span className="ml-1 text-muted-foreground">({liveCounts.archived})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {localOrder.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-12 text-center text-muted-foreground">
              No featured projects. Click <strong className="text-foreground">Feature project</strong> to add one.
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {localOrder.map((fp) => (
                    <SortableFeaturedCard
                      key={fp.id}
                      fp={fp}
                      canModify={canModify}
                      onEditNote={(target) => setNoteDialog({ fp: target, value: target.note ?? '' })}
                      onUnfeature={(target) => setConfirmUnfeature(target)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </TabsContent>

        <TabsContent value="archived">
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Image</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Featured by</TableHead>
                  <TableHead>Featured at</TableHead>
                  <TableHead>Removed at</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liveFeatured.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No archived projects.
                    </TableCell>
                  </TableRow>
                ) : (
                  liveFeatured.map((fp) => (
                    <TableRow key={fp.id}>
                      <TableCell>
                        <Thumbnail url={fp.project.thumbnail_url} alt={fp.project.name} />
                      </TableCell>
                      <TableCell>
                        <a href={`/admin/projects/${fp.project.id}`} className="font-medium hover:underline">
                          {fp.project.name}
                        </a>
                        <div className="text-xs text-muted-foreground">by {fp.project.owner_display_name}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{fp.featured_by.display_name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(fp.featured_at)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(fp.discarded_at)}</TableCell>
                      <TableCell className="text-right">
                        {canModify ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => doRestore(fp)}
                            disabled={fp.project.is_discarded || fp.project.is_unlisted}
                            title={
                              fp.project.is_discarded
                                ? 'Project is deleted'
                                : fp.project.is_unlisted
                                  ? 'Project is unlisted'
                                  : 'Restore to active list'
                            }
                          >
                            <RotateCcw className="size-3.5" /> Restore
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Read-only</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <FeaturedProjectFormSheet open={sheetOpen} onOpenChange={setSheetOpen} />

      <AlertDialog open={!!confirmUnfeature} onOpenChange={(o) => !o && setConfirmUnfeature(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unfeature this project?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{confirmUnfeature?.project.name}</strong> will be removed from the bulletin board and moved to
              Archive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => confirmUnfeature && doUnfeature(confirmUnfeature)}>
              Unfeature
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!noteDialog} onOpenChange={(o) => !o && setNoteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Note</AlertDialogTitle>
            <AlertDialogDescription>
              Internal note for <strong>{noteDialog?.fp.project.name}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={noteDialog?.value ?? ''}
            onChange={(e) => noteDialog && setNoteDialog({ ...noteDialog, value: e.target.value })}
            rows={4}
            placeholder="Why this project?"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={noteSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={saveNote} disabled={noteSaving}>
              {noteSaving ? 'Saving…' : 'Save note'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

AdminFeaturedProjectsIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
