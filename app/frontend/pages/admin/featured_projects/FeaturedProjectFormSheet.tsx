import { useEffect, useRef, useState } from 'react'
import { router } from '@inertiajs/react'
import { Command } from 'cmdk'
import { Search, X, ImageOff, ExternalLink } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/admin/ui/sheet'
import { Textarea } from '@/components/admin/ui/textarea'
import { Button } from '@/components/admin/ui/button'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'

type SearchProject = {
  id: number
  name: string
  owner_display_name: string
  owner_avatar: string
  thumbnail_url: string | null
  repo_link: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function FeaturedProjectFormSheet({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchProject[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<SearchProject | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  // Debounce + abort: every keystroke cancels the prior in-flight fetch so out-of-order
  // responses can't paint stale results into the dropdown.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setSelected(null)
      setNote('')
      setErrors({})
      setSubmitting(false)
    }
  }, [open])

  useEffect(() => {
    if (!open || selected) return
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    abortRef.current?.abort()

    const trimmed = query.trim()
    if (trimmed.length === 0) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    debounceTimer.current = setTimeout(() => {
      const ctrl = new AbortController()
      abortRef.current = ctrl
      fetch(`/admin/featured_projects/projects_search?q=${encodeURIComponent(trimmed)}`, {
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((data: { projects: SearchProject[] }) => {
          setResults(data.projects ?? [])
          setSearching(false)
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setSearching(false)
        })
    }, 250)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [query, open, selected])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSubmitting(true)
    setErrors({})

    router.post(
      '/admin/featured_projects',
      {
        featured_project: {
          project_id: selected.id,
          note: note.trim() || null,
        },
      },
      {
        preserveScroll: true,
        onError: (errs: Record<string, string>) => {
          setSubmitting(false)
          const shaped: Record<string, string[]> = {}
          Object.entries(errs).forEach(([k, v]) => {
            shaped[k] = Array.isArray(v) ? v : [v]
          })
          setErrors(shaped)
        },
        onSuccess: () => {
          setSubmitting(false)
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>Feature a project</SheetTitle>
          <SheetDescription>
            Search for a project to feature. Listed projects only. Already-featured projects are hidden.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          {Object.keys(errors).length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                {Object.entries(errors).map(([field, msgs]) => (
                  <p key={field}>
                    <strong className="capitalize">{field.replace(/_/g, ' ')}:</strong> {msgs.join(', ')}
                  </p>
                ))}
              </AlertDescription>
            </Alert>
          )}

          {!selected ? (
            <div className="rounded-md border border-border overflow-hidden">
              <Command shouldFilter={false}>
                <div className="flex items-center border-b border-border px-3">
                  <Search className="size-4 shrink-0 text-muted-foreground mr-2" />
                  <Command.Input
                    autoFocus
                    value={query}
                    onValueChange={setQuery}
                    placeholder="Search by project name, description, or owner…"
                    className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <Command.List className="max-h-72 overflow-y-auto p-1.5">
                  {query.trim() === '' && (
                    <div className="py-6 text-center text-sm text-muted-foreground">Type a project name to search.</div>
                  )}
                  {query.trim() !== '' && searching && (
                    <div className="py-6 text-center text-sm text-muted-foreground">Searching…</div>
                  )}
                  {query.trim() !== '' && !searching && results.length === 0 && (
                    <div className="py-6 text-center text-sm text-muted-foreground">No matches.</div>
                  )}
                  {results.map((project) => (
                    <Command.Item
                      key={project.id}
                      value={`${project.id}-${project.name}`}
                      onSelect={() => setSelected(project)}
                      className="flex items-center gap-3 rounded-md px-2 py-2 cursor-pointer text-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
                    >
                      {project.thumbnail_url ? (
                        // eslint-disable-next-line jsx-a11y/img-redundant-alt
                        <img
                          src={project.thumbnail_url}
                          alt=""
                          className="size-10 rounded-md object-cover shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="size-10 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                          <ImageOff className="size-4" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{project.name}</div>
                        <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <img src={project.owner_avatar} alt="" className="size-3.5 rounded-full" />
                          {project.owner_display_name}
                        </div>
                      </div>
                    </Command.Item>
                  ))}
                </Command.List>
              </Command>
            </div>
          ) : (
            <div className="rounded-md border border-border p-3 flex items-start gap-3">
              {selected.thumbnail_url ? (
                // eslint-disable-next-line jsx-a11y/img-redundant-alt
                <img
                  src={selected.thumbnail_url}
                  alt=""
                  className="size-16 rounded-md object-cover shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="size-16 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                  <ImageOff className="size-5" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{selected.name}</div>
                <div className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                  <img src={selected.owner_avatar} alt="" className="size-3.5 rounded-full" />
                  {selected.owner_display_name}
                </div>
                {selected.repo_link && (
                  <a
                    href={selected.repo_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1"
                  >
                    <ExternalLink className="size-3" /> {selected.repo_link}
                  </a>
                )}
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => setSelected(null)}
                title="Change selection"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="note" className="text-sm font-medium">
              Note <span className="text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id="note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this project?"
              disabled={!selected}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={!selected || submitting}>
              {submitting ? 'Featuring…' : 'Feature project'}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
