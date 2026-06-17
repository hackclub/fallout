import { Fragment, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as Y from 'yjs'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { PlusIcon, XIcon, UsersIcon, PencilIcon } from 'lucide-react'

// ── Model ──────────────────────────────────────────────────────────────────────
// Each row maps to one backend audience filter line (see SoupCampaign#apply_target_filter).
// Time filters are stored as seconds on the backend but edited as hours here — the whole
// point of the builder is that staff think in hours, not in 216000-second thresholds.

type Op = '>=' | '>' | '=' | '<' | '<='
type Kind = 'logged' | 'submitted' | 'qualified' | 'has_ships' | 'ids' | 'raw'
type Mode = 'all' | 'any'

interface Row {
  id: string
  kind: Kind
  op?: Op // logged / submitted
  hours?: string // logged / submitted (string so the field can be empty mid-edit)
  bool?: boolean // qualified / has_ships
  ids?: string // ids (comma-separated)
  raw?: string // unrecognized line, preserved verbatim
}

interface Query {
  mode: Mode
  rows: Row[]
}

const TIME_OPS: { value: Op; label: string }[] = [
  { value: '>', label: 'more than' },
  { value: '>=', label: 'at least' },
  { value: '=', label: 'exactly' },
  { value: '<=', label: 'at most' },
  { value: '<', label: 'less than' },
]

const FIELD_META: Record<Exclude<Kind, 'raw'>, { label: string; type: 'time' | 'bool' | 'ids' }> = {
  logged: { label: 'Logged hours', type: 'time' },
  submitted: { label: 'Submitted hours', type: 'time' },
  qualified: { label: 'Qualified for ticket', type: 'bool' },
  has_ships: { label: 'Has shipped a project', type: 'bool' },
  ids: { label: 'Specific user IDs', type: 'ids' },
}

let _uid = 0
const newId = () => `aud-${_uid++}`

function secondsToHours(secs: number): string {
  const h = secs / 3600
  return Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/\.?0+$/, '')
}

function parseQuery(text: string): Query {
  let mode: Mode = 'all'
  const rows: Row[] = []
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      let m: RegExpMatchArray | null
      if ((m = line.match(/^match:\s*(all|any)$/i))) {
        mode = m[1].toLowerCase() as Mode
        return
      }
      if ((m = line.match(/^ids:\s*(.+)$/i))) rows.push({ id: `p${i}`, kind: 'ids', ids: m[1].trim() })
      else if ((m = line.match(/^has_ships:\s*(true|false)$/i)))
        rows.push({ id: `p${i}`, kind: 'has_ships', bool: m[1].toLowerCase() === 'true' })
      else if ((m = line.match(/^qualified:\s*(true|false)$/i)))
        rows.push({ id: `p${i}`, kind: 'qualified', bool: m[1].toLowerCase() === 'true' })
      else if ((m = line.match(/^total_time_(logged|submitted)_seconds\s*(>=|<=|=|>|<)\s*(\d+)$/i)))
        rows.push({
          id: `p${i}`,
          kind: m[1].toLowerCase() === 'submitted' ? 'submitted' : 'logged',
          op: m[2] as Op,
          hours: secondsToHours(Number(m[3])),
        })
      else rows.push({ id: `p${i}`, kind: 'raw', raw: line })
    })
  return { mode, rows }
}

function serializeRow(r: Row): string {
  switch (r.kind) {
    case 'ids':
      return r.ids?.trim() ? `ids: ${r.ids.trim()}` : ''
    case 'has_ships':
      return `has_ships: ${r.bool ? 'true' : 'false'}`
    case 'qualified':
      return `qualified: ${r.bool ? 'true' : 'false'}`
    case 'logged':
    case 'submitted': {
      const h = parseFloat(r.hours ?? '')
      if (!isFinite(h) || (r.hours ?? '').trim() === '') return ''
      const field = r.kind === 'submitted' ? 'total_time_submitted_seconds' : 'total_time_logged_seconds'
      return `${field} ${r.op ?? '>='} ${Math.round(h * 3600)}`
    }
    case 'raw':
      return r.raw ?? ''
  }
}

function serialize({ mode, rows }: Query): string {
  const body = rows.map(serializeRow).filter(Boolean)
  // Only emit the directive for `any` — `all` is the backend default, so omitting it keeps
  // single-filter queries clean and round-trips identically.
  if (mode === 'any' && body.length > 0) body.unshift('match: any')
  return body.join('\n')
}

function defaultRow(kind: Kind, id: string): Row {
  switch (kind) {
    case 'logged':
    case 'submitted':
      return { id, kind, op: '>', hours: '' }
    case 'qualified':
    case 'has_ships':
      return { id, kind, bool: true }
    case 'ids':
      return { id, kind, ids: '' }
    default:
      return { id, kind: 'raw', raw: '' }
  }
}

// ── Component ────────────────────────────────────────────────────────────────────

export default function AudienceBuilder({
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
  const [{ mode, rows }, setQuery] = useState<Query>(() => parseQuery(yText.toString()))
  const [advanced, setAdvanced] = useState(false)
  const queryRef = useRef<Query>({ mode, rows })

  // Re-parse only on genuine external changes (peer edits / raw-mode edits). Self-edits
  // leave yText === serialize(query), so this is a no-op and never clobbers in-progress typing.
  useEffect(() => {
    const handler = () => {
      const text = yText.toString()
      if (text !== serialize(queryRef.current)) setQuery(parseQuery(text))
    }
    yText.observe(handler)
    return () => yText.unobserve(handler)
  }, [yText])

  function commit(next: Query) {
    // Update the ref BEFORE writing to Yjs: the transaction fires `observe` synchronously,
    // and the handler must compare against the new query — otherwise it re-parses stale text
    // and wipes the row being edited.
    queryRef.current = next
    setQuery(next)
    const text = serialize(next)
    if (text !== yText.toString()) {
      ydoc.transact(() => {
        yText.delete(0, yText.length)
        if (text) yText.insert(0, text)
      })
    }
  }

  const update = (id: string, patch: Partial<Row>) =>
    commit({ mode, rows: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) })
  const changeKind = (id: string, kind: Kind) =>
    commit({ mode, rows: rows.map((r) => (r.id === id ? defaultRow(kind, id) : r)) })
  const remove = (id: string) => commit({ mode, rows: rows.filter((r) => r.id !== id) })
  const add = () => commit({ mode, rows: [...rows, defaultRow('logged', newId())] })
  const changeMode = (next: Mode) => commit({ mode: next, rows })

  return (
    <section onFocusCapture={onFocus} onBlurCapture={onBlur}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <label className="text-sm font-semibold tracking-tight">Audience targeting</label>
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
        Leave empty to send to everyone in Soup. Add filters to narrow the audience.
      </p>

      {advanced ? (
        <div className="space-y-2">
          {rawEditor}
          <p className="text-xs text-muted-foreground">
            One filter per line. Switch back to the builder to edit visually.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-8 text-center">
          <div className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UsersIcon className="size-4" />
          </div>
          <div>
            <p className="text-sm font-medium">Sending to the full Soup audience</p>
            <p className="text-xs text-muted-foreground">Add a filter to target a specific group.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <PlusIcon />
            Add a filter
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.length > 1 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Match</span>
              <ModeToggle mode={mode} onChange={changeMode} />
              <span>of these filters</span>
            </div>
          )}
          {rows.map((row, i) => (
            <Fragment key={row.id}>
              {i > 0 && (
                <div className="pl-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {mode === 'any' ? 'or' : 'and'}
                </div>
              )}
              <RowEditor row={row} onKind={changeKind} onUpdate={update} onRemove={remove} />
            </Fragment>
          ))}
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={add}>
            <PlusIcon />
            Add filter
          </Button>
        </div>
      )}
    </section>
  )
}

// ── Match mode toggle ─────────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const options: { value: Mode; label: string }[] = [
    { value: 'all', label: 'all' },
    { value: 'any', label: 'any' },
  ]
  return (
    <div className="inline-flex items-center rounded-md border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={mode === o.value}
          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
            mode === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Row ──────────────────────────────────────────────────────────────────────────

function FieldSelect({ value, onChange }: { value: Exclude<Kind, 'raw'>; onChange: (k: Kind) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Kind)}>
      <SelectTrigger className="h-8 w-[11rem] shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(FIELD_META) as Exclude<Kind, 'raw'>[]).map((k) => (
          <SelectItem key={k} value={k}>
            {FIELD_META[k].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function RowEditor({
  row,
  onKind,
  onUpdate,
  onRemove,
}: {
  row: Row
  onKind: (id: string, kind: Kind) => void
  onUpdate: (id: string, patch: Partial<Row>) => void
  onRemove: (id: string) => void
}) {
  if (row.kind === 'raw') {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        <span className="shrink-0 text-xs font-medium text-muted-foreground">Custom</span>
        <code className="min-w-0 flex-1 truncate font-mono text-xs">{row.raw}</code>
        <span className="shrink-0 text-[10px] text-muted-foreground">edit in text mode</span>
        <RemoveButton onClick={() => onRemove(row.id)} />
      </div>
    )
  }

  const meta = FIELD_META[row.kind]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FieldSelect value={row.kind} onChange={(k) => onKind(row.id, k)} />

      {meta.type === 'time' && (
        <>
          <Select value={row.op ?? '>'} onValueChange={(v) => onUpdate(row.id, { op: v as Op })}>
            <SelectTrigger className="h-8 w-[8.5rem] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_OPS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={row.hours ?? ''}
              onChange={(e) => onUpdate(row.id, { hours: e.target.value })}
              placeholder="60"
              className="h-8 w-20"
              aria-label={`${meta.label} threshold`}
            />
            <span className="text-sm text-muted-foreground">hours</span>
          </div>
        </>
      )}

      {meta.type === 'bool' && (
        <Select value={row.bool ? 'true' : 'false'} onValueChange={(v) => onUpdate(row.id, { bool: v === 'true' })}>
          <SelectTrigger className="h-8 w-[6rem] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      )}

      {meta.type === 'ids' && (
        <Input
          value={row.ids ?? ''}
          onChange={(e) => onUpdate(row.id, { ids: e.target.value })}
          placeholder="e.g. 12, 48, 153"
          className="h-8 min-w-[12rem] flex-1 font-mono text-sm"
          aria-label="User IDs"
        />
      )}

      <RemoveButton onClick={() => onRemove(row.id)} />
    </div>
  )
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="shrink-0 text-muted-foreground hover:text-destructive"
      onClick={onClick}
      aria-label="Remove filter"
    >
      <XIcon />
    </Button>
  )
}
