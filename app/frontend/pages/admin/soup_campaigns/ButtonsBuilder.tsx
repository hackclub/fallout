import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { PlusIcon, XIcon, PencilIcon } from 'lucide-react'

// ── Model ──────────────────────────────────────────────────────────────────────
// Each row maps to one backend button line (see SoupCampaign.parse_buttons):
// `Label | url=https://… | webhook=https://… | value=… | style=primary`

export interface CampaignButton {
  label: string
  url: string
  webhook: string
  value: string
  style: string
}

interface Row extends CampaignButton {
  id: string
}

const MAX_BUTTONS = 5
const STYLES = [
  { value: 'default', label: 'Default' },
  { value: 'primary', label: 'Primary (green)' },
  { value: 'danger', label: 'Danger (red)' },
]

let _uid = 0
const newId = () => `btn-${_uid++}`

export function parseButtons(text: string): CampaignButton[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, ...parts] = line.split('|').map((p) => p.trim())
      const button: CampaignButton = { label: label ?? '', url: '', webhook: '', value: '', style: '' }
      parts.forEach((part) => {
        const eq = part.indexOf('=')
        if (eq < 0) return
        const key = part.slice(0, eq).trim().toLowerCase()
        const value = part.slice(eq + 1).trim()
        if (key === 'url') button.url = value
        else if (key === 'webhook') button.webhook = value
        else if (key === 'value') button.value = value
        else if (key === 'style') button.style = value.toLowerCase()
      })
      return button
    })
}

function serialize(rows: CampaignButton[]): string {
  return rows
    .map((r) =>
      [
        r.label.trim(),
        r.url.trim() && `url=${r.url.trim()}`,
        r.webhook.trim() && `webhook=${r.webhook.trim()}`,
        r.value.trim() && `value=${r.value.trim()}`,
        r.style && r.style !== 'default' && `style=${r.style}`,
      ]
        .filter(Boolean)
        .join(' | '),
    )
    .filter(Boolean)
    .join('\n')
}

const toRows = (text: string): Row[] => parseButtons(text).map((b, i) => ({ ...b, id: `p${i}` }))

// ── Component ────────────────────────────────────────────────────────────────────

export default function ButtonsBuilder({
  yText,
  ydoc,
  rawEditor,
  onFocus,
  onBlur,
}: {
  yText: Y.Text
  ydoc: Y.Doc
  rawEditor: ReactNode
  onFocus?: () => void
  onBlur?: () => void
}) {
  const [rows, setRows] = useState<Row[]>(() => toRows(yText.toString()))
  const [advanced, setAdvanced] = useState(false)
  const rowsRef = useRef<Row[]>(rows)

  // Same pattern as AudienceBuilder: only re-parse on external changes so in-progress typing survives.
  useEffect(() => {
    const handler = () => {
      const text = yText.toString()
      if (text !== serialize(rowsRef.current)) setRows(toRows(text))
    }
    yText.observe(handler)
    return () => yText.unobserve(handler)
  }, [yText])

  function commit(next: Row[]) {
    rowsRef.current = next
    setRows(next)
    const text = serialize(next)
    if (text !== yText.toString()) {
      ydoc.transact(() => {
        yText.delete(0, yText.length)
        if (text) yText.insert(0, text)
      })
    }
  }

  const update = (id: string, patch: Partial<Row>) => commit(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const remove = (id: string) => commit(rows.filter((r) => r.id !== id))
  const add = () =>
    commit([...rows, { id: newId(), label: 'Button', url: '', webhook: '', value: '', style: 'default' }])

  return (
    <section onFocusCapture={onFocus} onBlurCapture={onBlur}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <label className="text-sm font-semibold tracking-tight flex items-center gap-2">
          Buttons
          <span className="text-xs font-normal text-muted-foreground">optional · up to {MAX_BUTTONS}</span>
        </label>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          onClick={() => setAdvanced((v) => !v)}
        >
          <PencilIcon />
          {advanced ? 'Visual builder' : 'Edit as text'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        A link opens the URL. A webhook POSTs the clicker's Slack ID (as <code className="font-mono">user_id</code>) and
        the optional value to an https URL. A button can do both.
      </p>

      {advanced ? (
        <div className="space-y-2">
          {rawEditor}
          <p className="text-xs text-muted-foreground font-mono">
            Label | url=https://… | webhook=https://… | value=… | style=primary
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={row.label}
                  onChange={(e) => update(row.id, { label: e.target.value })}
                  placeholder="Label"
                  maxLength={75}
                  className="h-8 flex-1"
                  aria-label="Button label"
                />
                <Select value={row.style || 'default'} onValueChange={(v) => update(row.id, { style: v })}>
                  <SelectTrigger className="h-8 w-[10rem] shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STYLES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(row.id)}
                  aria-label="Remove button"
                >
                  <XIcon />
                </Button>
              </div>
              <Input
                value={row.url}
                onChange={(e) => update(row.id, { url: e.target.value })}
                placeholder="Link URL (optional) — https://…"
                className="h-8 font-mono text-xs"
                aria-label="Link URL"
              />
              <div className="flex gap-2">
                <Input
                  value={row.webhook}
                  onChange={(e) => update(row.id, { webhook: e.target.value })}
                  placeholder="Webhook URL (optional) — https://…"
                  className="h-8 flex-1 font-mono text-xs"
                  aria-label="Webhook URL"
                />
                <Input
                  value={row.value}
                  onChange={(e) => update(row.id, { value: e.target.value })}
                  placeholder="Webhook value"
                  maxLength={500}
                  className="h-8 w-40 font-mono text-xs"
                  aria-label="Webhook value"
                />
              </div>
              {!row.url.trim() && !row.webhook.trim() && (
                <p className="text-xs text-destructive">Add a link URL, a webhook URL, or both.</p>
              )}
            </div>
          ))}
          {rows.length < MAX_BUTTONS && (
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={add}>
              <PlusIcon />
              Add button
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
