import { useEffect, useState } from 'react'
import { router } from '@inertiajs/react'
import { DateTime } from 'luxon'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/admin/ui/sheet'
import { Input } from '@/components/admin/ui/input'
import { Textarea } from '@/components/admin/ui/textarea'
import { Button } from '@/components/admin/ui/button'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import DateTimePicker from '@/components/admin/DateTimePicker'
import { computeBulletinEventStatus, type SerializedBulletinEvent } from '@/lib/bulletinEventStatus'

const LOCAL_INPUT_FORMAT = "yyyy-LL-dd'T'HH:mm"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: SerializedBulletinEvent | null
  currentTab: string
}

type FormState = {
  title: string
  description: string
  image_url: string
  schedulable: boolean
  starts_at: string
  ends_at: string
}

type EventPayload = {
  title: string
  description: string
  image_url: string | null
  schedulable: boolean
  starts_at?: string | null
  ends_at?: string | null
}

const BLANK: FormState = {
  title: '',
  description: '',
  image_url: '',
  schedulable: true,
  starts_at: '',
  ends_at: '',
}

function toLocalInputValue(iso: string | null): string {
  if (!iso) return ''
  const dt = DateTime.fromISO(iso)
  return dt.isValid ? dt.toFormat(LOCAL_INPUT_FORMAT) : ''
}

function toUtcIso(localValue: string): string | null {
  if (!localValue) return null
  const dt = DateTime.fromFormat(localValue, LOCAL_INPUT_FORMAT)
  return dt.isValid ? dt.toUTC().toISO() : null
}

function parseLocal(localValue: string): DateTime | null {
  const dt = DateTime.fromFormat(localValue, LOCAL_INPUT_FORMAT)
  return dt.isValid ? dt : null
}

export default function EventFormSheet({ open, onOpenChange, event, currentTab }: Props) {
  const [form, setForm] = useState<FormState>(BLANK)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  useEffect(() => {
    if (!open) return
    setErrors({})
    if (event) {
      setForm({
        title: event.title,
        description: event.description,
        image_url: event.image_url ?? '',
        schedulable: event.schedulable,
        starts_at: toLocalInputValue(event.starts_at),
        ends_at: toLocalInputValue(event.ends_at),
      })
    } else {
      setForm({
        ...BLANK,
        starts_at: DateTime.now().plus({ minutes: 5 }).startOf('minute').toFormat(LOCAL_INPUT_FORMAT),
      })
    }
  }, [open, event])

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function timingAttrsForSubmit(): Pick<EventPayload, 'starts_at' | 'ends_at'> | Record<string, never> {
    if (form.schedulable) {
      return {
        starts_at: toUtcIso(form.starts_at),
        ends_at: toUtcIso(form.ends_at),
      }
    }

    if (!event) {
      return { starts_at: null, ends_at: null }
    }

    if (!event.schedulable) {
      return {}
    }

    const status = computeBulletinEventStatus(event)
    if (status === 'happening') {
      return { starts_at: event.starts_at, ends_at: null }
    }
    if (status === 'expired') {
      return { starts_at: event.starts_at, ends_at: event.ends_at }
    }
    return { starts_at: null, ends_at: null }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    if (form.schedulable) {
      const starts = parseLocal(form.starts_at)
      const ends = form.ends_at ? parseLocal(form.ends_at) : null
      const now = DateTime.now()
      const clientErrors: Record<string, string[]> = {}

      if (!event && starts && starts < now) {
        clientErrors.starts_at = ['must be in the future']
      }
      if (ends) {
        if (starts && ends <= starts) {
          clientErrors.ends_at = ['must be after start time']
        } else if (!event && ends <= now) {
          clientErrors.ends_at = ['must be in the future']
        }
      }
      if (Object.keys(clientErrors).length > 0) {
        setErrors(clientErrors)
        return
      }
    }

    setSubmitting(true)

    const bulletinEvent: EventPayload = {
      title: form.title,
      description: form.description,
      image_url: form.image_url || null,
      schedulable: form.schedulable,
      ...timingAttrsForSubmit(),
    }

    const payload = {
      bulletin_event: bulletinEvent,
      tab: currentTab,
    }

    const opts = {
      preserveScroll: true,
      onError: (errs: Record<string, string>) => {
        setSubmitting(false)
        // Rails returns `errors` as `{ field: [messages] }` via Inertia's error flash
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
    }

    if (event) {
      router.patch(`/admin/bulletin_events/${event.id}`, payload, opts)
    } else {
      router.post('/admin/bulletin_events', payload, opts)
    }
  }

  const isEdit = !!event
  const startMinDate = isEdit ? undefined : DateTime.now()
  const endMinDate = (() => {
    const candidates: DateTime[] = []
    if (!isEdit) candidates.push(DateTime.now())
    const sd = parseLocal(form.starts_at)
    if (sd) candidates.push(sd)
    if (candidates.length === 0) return undefined
    return candidates.reduce((a, b) => (a > b ? a : b))
  })()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit event' : 'New event'}</SheetTitle>
          <SheetDescription>
            {isEdit ? 'Update the event details below.' : 'Create a new bulletin board event.'}
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

          <div className="space-y-1.5">
            <label htmlFor="title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              required
              placeholder="Lock-in Huddle with..."
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="description" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="description"
              rows={5}
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              required
              placeholder="What's this event about?"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="image_url" className="text-sm font-medium">
              Image URL (optional)
            </label>
            <Input
              id="image_url"
              type="url"
              value={form.image_url}
              onChange={(e) => update('image_url', e.target.value)}
              placeholder="https://cdn.hackclub.com/..."
            />
            <p className="text-xs text-muted-foreground">
              Upload the image to the <code className="text-foreground">#cdn</code> channel on the Hack Club Slack, then
              paste the returned URL here.
            </p>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.schedulable}
                onChange={(e) => update('schedulable', e.target.checked)}
                className="size-4 accent-primary"
              />
              <span className="text-sm font-medium">Schedulable</span>
            </label>
            <p className="text-xs text-muted-foreground">
              {form.schedulable
                ? "Set start and optional end times below. The event will auto-appear/expire based on viewers' local time."
                : 'Manual mode. Start and end the event yourself with the Start now / End now buttons.'}
            </p>
          </div>

          {form.schedulable && (
            <>
              <div className="space-y-1.5">
                <label htmlFor="starts_at" className="text-sm font-medium">
                  Starts at <span className="text-muted-foreground">(your local time)</span>
                </label>
                <DateTimePicker
                  id="starts_at"
                  value={form.starts_at}
                  onChange={(v) => update('starts_at', v)}
                  required={form.schedulable}
                  minDate={startMinDate}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="ends_at" className="text-sm font-medium">
                    Ends at <span className="text-muted-foreground">(optional)</span>
                  </label>
                  {form.ends_at && (
                    <Button type="button" size="xs" variant="ghost" onClick={() => update('ends_at', '')}>
                      Clear
                    </Button>
                  )}
                </div>
                <DateTimePicker
                  id="ends_at"
                  value={form.ends_at}
                  onChange={(v) => update('ends_at', v)}
                  placeholder="Pick an end date"
                  minDate={endMinDate}
                />
                <p className="text-xs text-muted-foreground">Leave blank if you'll end the event manually.</p>
              </div>
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create event'}
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
