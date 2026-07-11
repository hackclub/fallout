import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Deferred, Link, router, usePage } from '@inertiajs/react'
import { motion, useReducedMotion } from 'motion/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Textarea } from '@/components/admin/ui/textarea'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/admin/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/admin/ui/tooltip'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/admin/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/admin/ui/alert-dialog'
import {
  ArrowRight,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FolderOpen,
  MessageSquarePlus,
  PartyPopper,
  Scale,
  Search,
  Send,
  Ticket,
  Trash2,
} from 'lucide-react'
import '@/styles/debt.css'

type DebtProject = { id: number; name: string; approved_hours: number }
type CheckIn = {
  id: number
  note: string
  author_name: string | null
  author_avatar: string | null
  created_at: string
}
type Debtor = {
  id: number
  display_name: string
  email: string
  avatar: string
  threshold: number
  approved_hours: number
  snapshot_hours: number
  shipped_hours: number
  logged_hours: number
  remaining_hours: number
  progress_pct: number
  in_debt: boolean
  hidden: boolean
  hidden_by: string | null
  ticket_approved_at: string | null
  projects: DebtProject[]
  check_ins: CheckIn[]
}
type Overview = {
  in_debt_count: number
  cleared_count: number
  hours_owed: number
  needs_checkin_count: number
  close_count: number
  just_started_count: number
}
type PageProps = {
  threshold_default: number
  snapshot_cutoff: string
  snapshot_built: boolean
  debtors?: Debtor[]
  overview?: Overview
}

type FilterKey = 'active' | 'needs_checkin' | 'close' | 'cleared' | 'all' | 'hidden'
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'active', label: 'Active debt' },
  { key: 'needs_checkin', label: 'Needs check-in' },
  { key: 'close', label: 'Close to clearing' },
  { key: 'cleared', label: 'Cleared' },
  { key: 'all', label: 'All' },
  { key: 'hidden', label: 'Hidden' },
]

type SortKey = 'default' | 'logged_desc' | 'logged_asc'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'default', label: 'Priority (default)' },
  { key: 'logged_desc', label: 'Logged hours · high → low' },
  { key: 'logged_asc', label: 'Logged hours · low → high' },
]

function toCsv(rows: Debtor[]): string {
  const headers = [
    'Name',
    'Email',
    'Approved hours',
    'Approved at cutoff',
    'Submitted hours',
    'Logged hours',
    'Threshold',
    'Remaining hours',
    'Progress %',
    'Status',
    'Ticket approved',
    'Check-ins',
    'Latest check-in',
  ]
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = rows.map((r) =>
    [
      r.display_name,
      r.email,
      r.approved_hours,
      r.snapshot_hours,
      r.shipped_hours,
      r.logged_hours,
      r.threshold,
      r.remaining_hours,
      r.progress_pct,
      r.in_debt ? 'In debt' : 'Cleared',
      r.ticket_approved_at ?? '',
      r.check_ins.length,
      r.check_ins[0]?.note ?? '',
    ]
      .map(esc)
      .join(','),
  )
  return [headers.join(','), ...lines].join('\n')
}

function downloadCsv(rows: Debtor[]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'debt-roster.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// Shared column template so the roster header and every row line up to the same grid.
const ROW_GRID =
  'grid grid-cols-1 gap-y-3 md:grid-cols-[minmax(170px,1.1fr)_minmax(240px,1.9fr)_150px_120px] md:items-center md:gap-x-5 md:gap-y-0'
const HEAD_GRID = 'hidden md:grid grid-cols-[minmax(170px,1.1fr)_minmax(240px,1.9fr)_150px_120px] items-center gap-x-5'

// Real spring physics for the "Check in" reveal: trailing arrow at rest, leading arrow springs
// in on hover as the core springs right; press adds just a slight extra nudge.
const REVEAL_SPRING = { type: 'spring', stiffness: 700, damping: 26, mass: 0.7 } as const
const REVEAL_LEAD = { rest: { x: -22 }, hover: { x: 0 }, press: { x: 3 } }
const REVEAL_CORE = { rest: { x: 0 }, hover: { x: 12 }, press: { x: 15 } }
const REVEAL_TRAIL = { rest: { x: 0 }, hover: { x: 22 }, press: { x: 25 } }

function pct(hours: number, threshold: number) {
  return threshold > 0 ? Math.min((hours / threshold) * 100, 100) : 100
}

/* Three stacked fills toward the threshold: logged ⊇ submitted ⊇ approved. */
function HoursMeter({ d, large = false }: { d: Debtor; large?: boolean }) {
  return (
    <div
      className={`gel-meter ${large ? '!h-4' : ''}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={d.threshold}
      aria-valuenow={d.approved_hours}
      aria-label={`${d.approved_hours} of ${d.threshold} approved hours`}
    >
      <div className="gel-fill gel-fill-logged" style={{ width: `${pct(d.logged_hours, d.threshold)}%` }} />
      <div className="gel-fill gel-fill-submitted" style={{ width: `${pct(d.shipped_hours, d.threshold)}%` }} />
      <div className="gel-fill gel-fill-approved" style={{ width: `${pct(d.approved_hours, d.threshold)}%` }} />
    </div>
  )
}

function MeterLegend({ d, compact = false }: { d: Debtor; compact?: boolean }) {
  const items = [
    { cls: 'bg-[#1f4ee8]', label: 'Approved', val: d.approved_hours },
    { cls: 'bg-[#9db8f7]', label: 'Submitted', val: d.shipped_hours },
    { cls: 'bg-foreground/15', label: 'Logged', val: d.logged_hours },
  ]
  return (
    <div className={compact ? 'flex flex-wrap gap-x-3 gap-y-0.5' : 'flex flex-wrap gap-x-4 gap-y-1'}>
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={`size-1.5 rounded-full ${i.cls}`} />
          {i.label}
          <span className="font-medium text-foreground tabular-nums">{i.val}h</span>
        </span>
      ))}
    </div>
  )
}

function StatTile({
  label,
  value,
  hint,
  hero = false,
  icon: Icon,
}: {
  label: string
  value: ReactNode
  hint?: string
  hero?: boolean
  icon?: typeof Scale
}) {
  return (
    <div className={`gel ${hero ? 'gel-blue' : 'gel-white'} px-4 py-3.5`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-medium ${hero ? 'text-white/85' : 'text-muted-foreground'}`}>{label}</span>
        {Icon && <Icon className={`size-4 ${hero ? 'text-white/80' : 'text-muted-foreground/70'}`} />}
      </div>
      <div className={`mt-1.5 text-3xl font-semibold tracking-tight tabular-nums ${hero ? 'text-white' : ''}`}>
        {value}
      </div>
      {hint && <div className={`mt-0.5 text-xs ${hero ? 'text-white/75' : 'text-muted-foreground'}`}>{hint}</div>}
    </div>
  )
}

function CheckInForm({ debtor }: { debtor: Debtor }) {
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function submit() {
    const trimmed = note.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    router.post(
      '/admin/debt/check_ins',
      { user_id: debtor.id, note: trimmed },
      {
        preserveScroll: true,
        preserveState: true,
        onSuccess: () => setNote(''),
        onFinish: () => setSubmitting(false),
      },
    )
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={`Log a check-in on ${debtor.display_name.split(' ')[0]}.`}
        rows={3}
        className="resize-none"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
        }}
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">⌘↵ to save</span>
        <button
          type="button"
          onClick={submit}
          disabled={!note.trim() || submitting}
          className="gel gel-blue gel-btn inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium disabled:opacity-50 disabled:pointer-events-none"
        >
          <Send className="size-3.5" />
          Log check-in
        </button>
      </div>
    </div>
  )
}

function DebtorSheetBody({ debtor, cutoff }: { debtor: Debtor; cutoff: string }) {
  return (
    <div className="flex flex-col gap-6 px-5 pb-8 pt-5">
      {/* Hours breakdown */}
      <section className="gel gel-white px-4 py-4">
        <div className="flex items-baseline justify-between mb-2.5">
          <span className="text-sm font-medium">Hours toward the bar</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {debtor.approved_hours} / {debtor.threshold}h approved
          </span>
        </div>
        <HoursMeter d={debtor} large />
        <div className="mt-3">
          <MeterLegend d={debtor} />
        </div>
        {debtor.in_debt ? (
          <div className="mt-3 text-sm">
            <span className="font-semibold text-[#1f4ee8] tabular-nums">{debtor.remaining_hours}h</span>
            <span className="text-muted-foreground"> of approved hours left to work off their debt.</span>
            <div className="mt-1 text-xs text-muted-foreground">
              Entered debt with{' '}
              <span className="font-medium text-foreground tabular-nums">{debtor.snapshot_hours}h</span> approved on{' '}
              {cutoff}.
            </div>
          </div>
        ) : (
          <div className="mt-3 text-sm">
            <div className="flex items-center gap-1.5 font-medium text-emerald-600">
              <PartyPopper className="size-4" /> Cleared the bar.
            </div>
            {debtor.snapshot_hours < debtor.threshold && (
              <div className="mt-1 text-xs text-muted-foreground">
                Entered debt with{' '}
                <span className="font-medium text-foreground tabular-nums">{debtor.snapshot_hours}h</span> approved on{' '}
                {cutoff} — worked it off since.
              </div>
            )}
          </div>
        )}
      </section>

      {/* Projects */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Projects · {debtor.projects.length}
        </h3>
        {debtor.projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border overflow-hidden">
            {debtor.projects.map((p) => (
              <Link
                key={p.id}
                href={`/admin/projects/${p.id}`}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{p.name}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {p.approved_hours}h approved
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/admin/users/${debtor.id}`}
          className="gel gel-white gel-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium"
        >
          <ExternalLink className="size-3.5" /> View user
        </Link>
        <Link
          href="/admin/ticket_claims"
          className="gel gel-white gel-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium"
        >
          <Ticket className="size-3.5" /> Ticket claims
        </Link>
        {debtor.hidden ? (
          <button
            type="button"
            onClick={() =>
              router.delete(`/admin/debt/hidden/${debtor.id}`, { preserveScroll: true, preserveState: true })
            }
            className="gel gel-white gel-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium"
          >
            <Eye className="size-3.5" /> Unhide from debt
          </button>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="gel gel-white gel-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium"
              >
                <EyeOff className="size-3.5" /> Hide from debt
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Hide {debtor.display_name} from debt?</AlertDialogTitle>
                <AlertDialogDescription>
                  They'll be removed from the console and every CSV export until an admin unhides them from the Hidden
                  tab. Nothing else about their account changes.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    router.post(`/admin/debt/hidden/${debtor.id}`, {}, { preserveScroll: true, preserveState: true })
                  }
                >
                  Hide
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      {debtor.hidden && (
        <p className="-mt-3 text-xs text-muted-foreground">
          Hidden from the debt console{debtor.hidden_by ? ` by ${debtor.hidden_by}` : ''}.
        </p>
      )}

      {/* Check-in log */}
      <section>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Check-in log · {debtor.check_ins.length}
        </h3>
        <CheckInForm debtor={debtor} />
        <div className="mt-4 space-y-3">
          {debtor.check_ins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No check-ins yet. Log the first one above.</p>
          ) : (
            debtor.check_ins.map((c) => (
              <div key={c.id} className="group flex gap-2.5">
                {c.author_avatar ? (
                  <img src={c.author_avatar} alt="" className="size-6 rounded-full shrink-0 mt-0.5" />
                ) : (
                  <span className="size-6 rounded-full shrink-0 mt-0.5 bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.author_name ?? 'Unknown'}</span>
                    <span>{c.created_at}</span>
                    <AlertDialog>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertDialogTrigger asChild>
                            <button
                              type="button"
                              aria-label="Delete check-in"
                              className="ml-auto opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </AlertDialogTrigger>
                        </TooltipTrigger>
                        <TooltipContent>Delete check-in</TooltipContent>
                      </Tooltip>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this check-in?</AlertDialogTitle>
                          <AlertDialogDescription>
                            It will be removed from the log. This can be undone by an engineer if needed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() =>
                              router.delete(`/admin/debt/check_ins/${c.id}`, {
                                preserveScroll: true,
                                preserveState: true,
                              })
                            }
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <p className="mt-0.5 text-sm whitespace-pre-wrap break-words">{c.note}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function DebtorRow({ d, onOpen }: { d: Debtor; onOpen: () => void }) {
  const latest = d.check_ins[0]
  const reduce = useReducedMotion()
  const spring = reduce ? { duration: 0 } : REVEAL_SPRING
  return (
    <div className={`${ROW_GRID} px-4 py-3.5 hover:bg-muted/40 transition-colors`}>
      {/* Member */}
      <div className="flex items-center gap-3 min-w-0">
        <img src={d.avatar} alt="" className="size-9 rounded-full shrink-0" />
        <div className="min-w-0">
          <button onClick={onOpen} className="font-medium hover:underline truncate block text-left leading-tight">
            {d.display_name}
          </button>
          <div className="text-xs text-muted-foreground truncate">{d.email}</div>
        </div>
      </div>

      {/* Progress */}
      <div className="min-w-0">
        <div className="flex items-baseline justify-between mb-1.5 text-xs">
          <span className="tabular-nums">
            <span className="font-semibold text-foreground">{d.approved_hours}</span>
            <span className="text-muted-foreground">/{d.threshold}h approved</span>
          </span>
          {d.in_debt ? (
            <span className="text-[#1f4ee8] font-medium tabular-nums">{d.remaining_hours}h to go</span>
          ) : (
            <span className="text-emerald-600 font-medium">Cleared</span>
          )}
        </div>
        <HoursMeter d={d} />
        <div className="mt-1.5">
          <MeterLegend d={d} compact />
        </div>
      </div>

      {/* Last check-in */}
      <div className="hidden md:block min-w-0 text-xs">
        {latest ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground truncate block cursor-default">{latest.created_at}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{latest.note}</TooltipContent>
          </Tooltip>
        ) : d.in_debt ? (
          <Badge variant="outline" className="text-[10px] border-[#1f4ee8]/40 text-[#1f4ee8]">
            no check-in
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      {/* Action */}
      <div className="flex md:justify-end">
        <motion.button
          onClick={onOpen}
          aria-label={`Check in on ${d.display_name}`}
          initial={false}
          animate="rest"
          whileHover="hover"
          whileTap="press"
          className="gel gel-blue gel-btn gel-reveal inline-flex items-center justify-center pl-3 pr-6 py-1.5 text-sm font-medium whitespace-nowrap"
        >
          <motion.span className="gel-reveal__arrow gel-reveal__arrow--lead" variants={REVEAL_LEAD} transition={spring}>
            <ArrowRight className="size-3.5 opacity-80" />
          </motion.span>
          <motion.span className="inline-flex items-center gap-1.5" variants={REVEAL_CORE} transition={spring}>
            <MessageSquarePlus className="size-3.5" aria-hidden />
            Check in
          </motion.span>
          <motion.span
            className="gel-reveal__arrow gel-reveal__arrow--trail"
            variants={REVEAL_TRAIL}
            transition={spring}
          >
            <ArrowRight className="size-3.5 opacity-80" />
          </motion.span>
        </motion.button>
      </div>
    </div>
  )
}

function RosterSkeleton() {
  return (
    <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-4">
          <span className="size-9 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <span className="block h-3 w-32 rounded bg-muted animate-pulse" />
            <span className="block h-3.5 w-full max-w-md rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AdminDebtIndex({
  threshold_default,
  snapshot_cutoff,
  snapshot_built,
  debtors,
  overview,
}: PageProps) {
  const { errors } = usePage<{ errors?: { base?: string[] } }>().props

  // Keep a local mirror of the deferred data so check-in mutations (which re-defer the roster)
  // don't flash the whole list back to a skeleton — we hold the last-good rows until fresh data lands.
  const [rows, setRows] = useState<Debtor[]>(debtors ?? [])
  const [ov, setOv] = useState<Overview | undefined>(overview)
  useEffect(() => {
    if (debtors) setRows(debtors)
  }, [debtors])
  useEffect(() => {
    if (overview) setOv(overview)
  }, [overview])

  const [filter, setFilter] = useState<FilterKey>('active')
  const [sort, setSort] = useState<SortKey>('default')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)

  const counts = useMemo(() => {
    const shown = rows.filter((r) => !r.hidden) // hidden users are excluded from every non-hidden tally
    const active = shown.filter((r) => r.in_debt)
    return {
      active: active.length,
      needs_checkin: active.filter((r) => r.check_ins.length === 0).length,
      close: active.filter((r) => r.progress_pct >= 75).length,
      cleared: shown.length - active.length,
      all: shown.length,
      hidden: rows.length - shown.length,
    }
  }, [rows])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = rows.filter((r) => {
      if (filter === 'hidden') return r.hidden
      if (r.hidden) return false // hidden users never surface outside the Hidden tab
      if (filter === 'active' && !r.in_debt) return false
      if (filter === 'needs_checkin' && !(r.in_debt && r.check_ins.length === 0)) return false
      if (filter === 'close' && !(r.in_debt && r.progress_pct >= 75)) return false
      if (filter === 'cleared' && r.in_debt) return false
      if (!q) return true
      return (
        r.display_name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.projects.some((p) => p.name.toLowerCase().includes(q))
      )
    })
    if (sort === 'default') return filtered // preserve server ordering (active debt first, closest-to-clearing last)
    return [...filtered].sort((a, b) =>
      sort === 'logged_desc' ? b.logged_hours - a.logged_hours : a.logged_hours - b.logged_hours,
    )
  }, [rows, filter, search, sort])

  const selected = openId != null ? (rows.find((r) => r.id === openId) ?? null) : null
  const initialLoading = !ov && rows.length === 0

  return (
    <TooltipProvider delayDuration={200}>
      <div className="debt-console pb-16">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <span className="gel gel-blue grid place-items-center size-9 shrink-0">
              <Scale className="size-5 text-white" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight leading-none">Debt</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Holders of an approved ticket still under {threshold_default}h of approved hours as of {snapshot_cutoff}
                . Help them clear it.
              </p>
            </div>
          </div>
        </header>

        {errors?.base && (
          <div className="mb-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {Array.isArray(errors.base) ? errors.base.join(' ') : errors.base}
          </div>
        )}

        {!snapshot_built && (
          <div className="mb-4 rounded-md border border-amber-500 bg-amber-500/10 p-3 text-sm text-amber-700">
            The {snapshot_cutoff} approved-hours snapshot hasn't been built yet, so no debt can be computed. Run{' '}
            <code className="rounded bg-amber-500/20 px-1 py-0.5 font-mono text-xs">bin/rails debt:snapshot</code> to
            build it.
          </div>
        )}

        {/* Trigger the deferred roster fetch; everything visible renders from local state below so
            a check-in mutation (which re-defers the group) never flashes the page back to skeletons. */}
        <Deferred data={['debtors', 'overview']} fallback={null}>
          <span className="hidden" aria-hidden />
        </Deferred>

        {/* Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
          {ov ? (
            <>
              <StatTile
                hero
                label="In debt"
                value={ov.in_debt_count}
                hint="approved ticket, under the bar"
                icon={Scale}
              />
              <StatTile label="Hours owed" value={`${ov.hours_owed}h`} hint="total approved hours to clear" />
              <StatTile
                label="Needs check-in"
                value={ov.needs_checkin_count}
                hint="no outreach logged yet"
                icon={MessageSquarePlus}
              />
              <StatTile label="Close to clearing" value={ov.close_count} hint="past 75% of their bar" />
            </>
          ) : (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="gel gel-white h-[88px] animate-pulse" />)
          )}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const active = filter === f.key
              const n = counts[f.key]
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={
                    active
                      ? 'gel gel-blue gel-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium'
                      : 'gel gel-white gel-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium'
                  }
                >
                  {f.label}
                  <span className={`text-xs tabular-nums ${active ? 'text-white/75' : 'text-muted-foreground'}`}>
                    {n}
                  </span>
                </button>
              )
            })}
          </div>
          <InputGroup className="ml-auto w-full sm:w-64">
            <InputGroupAddon align="inline-start">
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              placeholder="Search name, email, project…"
            />
          </InputGroup>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => downloadCsv(visible.filter((r) => !r.hidden))}
            disabled={visible.every((r) => r.hidden)}
            className="gel gel-white gel-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:pointer-events-none"
          >
            <Download className="size-3.5" />
            Export CSV
          </button>
        </div>

        {/* Roster */}
        {initialLoading ? (
          <RosterSkeleton />
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border py-16 text-center">
            <PartyPopper className="size-7 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {search.trim()
                ? 'No one matches your search.'
                : filter === 'active'
                  ? 'Nobody is in debt right now. Everyone with a ticket has cleared the bar.'
                  : 'Nothing here.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div
              className={`${HEAD_GRID} px-4 py-2.5 border-b border-border bg-muted/40 text-[11px] font-medium uppercase tracking-wide text-muted-foreground`}
            >
              <span>Member</span>
              <span>Progress · bar at {threshold_default}h</span>
              <span>Last check-in</span>
              <span className="text-right">Action</span>
            </div>
            <div className="divide-y divide-border">
              {visible.map((d) => (
                <DebtorRow key={d.id} d={d} onOpen={() => setOpenId(d.id)} />
              ))}
            </div>
          </div>
        )}

        {/* Detail / check-in sheet */}
        <Sheet open={selected != null} onOpenChange={(o) => !o && setOpenId(null)}>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto p-0 gap-0 debt-console">
            {selected && (
              <>
                <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <img src={selected.avatar} alt="" className="size-11 rounded-full shrink-0" />
                    <div className="min-w-0">
                      <SheetTitle className="truncate">{selected.display_name}</SheetTitle>
                      <SheetDescription className="truncate">{selected.email}</SheetDescription>
                    </div>
                    <Badge variant={selected.in_debt ? 'default' : 'secondary'} className="ml-auto shrink-0 capitalize">
                      {selected.in_debt ? 'In debt' : 'Cleared'}
                    </Badge>
                  </div>
                  {selected.ticket_approved_at && (
                    <p className="mt-1 text-xs text-muted-foreground">Ticket approved {selected.ticket_approved_at}</p>
                  )}
                </SheetHeader>
                <DebtorSheetBody debtor={selected} cutoff={snapshot_cutoff} />
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  )
}

AdminDebtIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
