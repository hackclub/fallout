import { useState, useRef, useCallback } from 'react'
import { usePage } from '@inertiajs/react'
import { Button } from '@/components/admin/ui/button'
import { Badge } from '@/components/admin/ui/badge'
import { Textarea } from '@/components/admin/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/admin/ui/dropdown-menu'
import { GripHorizontal, X, MoreVertical, Pencil, Trash2, Send } from 'lucide-react'
import TimeAgo from '@/components/shared/TimeAgo'
import type { ReviewerNote, SharedProps } from '@/types'

const STAGE_LABELS: Record<string, string> = {
  time_audit: 'Time Audit',
  requirements_check: 'Requirements',
  design_review: 'Design Review',
  build_review: 'Build Review',
}

function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || ''
}

interface ProjectNotesWindowProps {
  notes: ReviewerNote[]
  notesPath: string
  shipId: number
  reviewStage: string
  onClose: () => void
}

export default function ProjectNotesWindow({
  notes: initialNotes,
  notesPath,
  shipId,
  reviewStage,
  onClose,
}: ProjectNotesWindowProps) {
  const { auth } = usePage<SharedProps>().props
  const currentUserId = auth.user?.id
  const [notes, setNotes] = useState<ReviewerNote[]>(initialNotes)
  const [newBody, setNewBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editBody, setEditBody] = useState('')

  // Dragging state
  const windowRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const offsetRef = useRef({ x: 0, y: 0 })
  const posRef = useRef({ x: 0, y: 0 })
  const initialized = useRef(false)

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const el = windowRef.current
    if (!el) return

    if (!initialized.current) {
      const rect = el.getBoundingClientRect()
      posRef.current = { x: rect.left, y: rect.top }
      initialized.current = true
    }

    offsetRef.current = {
      x: e.clientX - posRef.current.x,
      y: e.clientY - posRef.current.y,
    }
  }, [])

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || !windowRef.current) return
    const newX = e.clientX - offsetRef.current.x
    const newY = e.clientY - offsetRef.current.y
    posRef.current = { x: newX, y: newY }
    windowRef.current.style.left = `${newX}px`
    windowRef.current.style.top = `${newY}px`
    windowRef.current.style.right = 'auto'
    windowRef.current.style.transform = 'none'
  }, [])

  const handleDragEnd = useCallback(() => {
    draggingRef.current = false
  }, [])

  async function handleCreate() {
    if (!newBody.trim() || posting) return
    setPosting(true)
    try {
      const res = await fetch(notesPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRF-Token': csrfToken(),
        },
        body: JSON.stringify({
          reviewer_note: { body: newBody.trim(), ship_id: shipId, review_stage: reviewStage },
        }),
      })
      if (res.ok) {
        const note: ReviewerNote = await res.json()
        setNotes((prev) => [note, ...prev])
        setNewBody('')
      } else {
        alert('Failed to create note. Please try again.')
      }
    } finally {
      setPosting(false)
    }
  }

  async function handleUpdate(id: number) {
    if (!editBody.trim()) return
    try {
      const res = await fetch(`${notesPath}/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRF-Token': csrfToken(),
        },
        body: JSON.stringify({ reviewer_note: { body: editBody.trim() } }),
      })
      if (res.ok) {
        const updated: ReviewerNote = await res.json()
        setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)))
        setEditingId(null)
        setEditBody('')
      } else {
        alert('Failed to update note. Please try again.')
      }
    } catch {
      alert('Failed to update note. Please try again.')
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`${notesPath}/${id}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': csrfToken() },
      })
      if (res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== id))
      } else {
        alert('Failed to delete note. Please try again.')
      }
    } catch {
      alert('Failed to delete note. Please try again.')
    }
  }

  return (
    <div
      ref={windowRef}
      className="fixed z-[100] w-96 max-h-[500px] flex flex-col rounded-lg border border-border bg-background shadow-xl"
      style={{ top: '80px', right: '24px' }}
    >
      {/* Drag bar */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50 rounded-t-lg select-none"
        style={{ cursor: draggingRef.current ? 'grabbing' : 'grab' }}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <GripHorizontal className="size-4 text-muted-foreground" />
          Project Notes{notes.length > 0 && ` (${notes.length})`}
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground cursor-pointer"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Create form */}
      <div className="p-3 border-b border-border space-y-2">
        <Textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="Write a note..."
          className="min-h-10 text-sm resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCreate()
          }}
        />
        <Button size="sm" onClick={handleCreate} disabled={posting || !newBody.trim()} className="w-full">
          <Send className="size-4" />
          Post Note
        </Button>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {notes.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No notes yet</p>}
        {notes.map((note) => (
          <div key={note.id} className="group space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                <img src={note.author_avatar} alt="" className="size-4 rounded-full shrink-0" />
                <span className="font-medium text-foreground truncate">{note.author_display_name}</span>
                {note.review_stage && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    {STAGE_LABELS[note.review_stage] || note.review_stage}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-muted-foreground">
                  <TimeAgo datetime={note.created_at} />
                </span>
                {currentUserId === note.author_id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground cursor-pointer p-0.5">
                        <MoreVertical className="size-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-101">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingId(note.id)
                          setEditBody(note.body)
                        }}
                      >
                        <Pencil className="size-3" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => handleDelete(note.id)}>
                        <Trash2 className="size-3" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
            {editingId === note.id ? (
              <div className="flex gap-2">
                <Textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="min-h-10 text-sm resize-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleUpdate(note.id)
                    if (e.key === 'Escape') {
                      setEditingId(null)
                      setEditBody('')
                    }
                  }}
                />
                <div className="flex flex-col gap-1 shrink-0">
                  <Button size="sm" onClick={() => handleUpdate(note.id)} disabled={!editBody.trim()}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(null)
                      setEditBody('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap">{note.body}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
