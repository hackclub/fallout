import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { router } from '@inertiajs/react'
import { AtSignIcon, FolderGit2Icon, LinkIcon, TriangleAlertIcon } from 'lucide-react'
import { Button } from '@/components/admin/ui/button'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { Textarea } from '@/components/admin/ui/textarea'
import { cn } from '@/lib/utils'
import { OWNER_ALIAS, PROJECT_TOKEN, tokenizeFeedback } from '@/lib/reviewFeedbackTokens'
import type { MentionTarget, ReviewProjectContext, ReviewerSlackProps } from '@/types'

const CHANNEL = '#fallout-checkpoint'

interface Trigger {
  char: '@' | '/'
  query: string
  start: number
  end: number
}

interface Suggestion {
  key: string
  label: string
  sub?: string
  avatar?: string | null
  insert: string
  target?: MentionTarget
}

interface Props {
  value: string
  onChange: (value: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  project: ReviewProjectContext
  mentions: MentionTarget[]
  onMentionsChange: (mentions: MentionTarget[]) => void
  reviewerSlack?: ReviewerSlackProps
  postToSlack: boolean
  onPostToSlackChange: (value: boolean) => void
  draftKey: string
  placeholder?: string
}

function findTrigger(value: string, caret: number): Trigger | null {
  const match = value.slice(0, caret).match(/(?:^|[\s(])([@/])([^\s@/]*(?: [^\s@/]*)?)$/u)
  if (!match) return null
  const char = match[1] as '@' | '/'
  const query = match[2]
  if (query.endsWith(' ')) return null // A finished token — don't reopen right after inserting "@Name "
  if (char === '/' && !'proj'.startsWith(query.toLowerCase())) return null
  return { char, query, start: caret - query.length - 1, end: caret }
}

export default function SlackFeedbackComposer({
  value,
  onChange,
  textareaRef,
  project,
  mentions,
  onMentionsChange,
  reviewerSlack,
  postToSlack,
  onPostToSlackChange,
  draftKey,
  placeholder,
}: Props) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const [trigger, setTrigger] = useState<Trigger | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [remote, setRemote] = useState<MentionTarget[]>([])

  const owner: MentionTarget = useMemo(
    () => ({ id: project.user_id, display_name: project.user_display_name, avatar: project.user_avatar }),
    [project.user_id, project.user_display_name, project.user_avatar],
  )
  const local = useMemo(() => [owner, ...project.collaborators], [owner, project.collaborators])

  const names = useMemo(() => {
    const map = new Map<string, string>([[OWNER_ALIAS, owner.display_name]])
    for (const u of [...local, ...mentions]) {
      const key = u.display_name.toLowerCase()
      if (key && !map.has(key)) map.set(key, u.display_name)
    }
    return map
  }, [owner, local, mentions])

  const segments = useMemo(() => tokenizeFeedback(value, names), [value, names])

  // Restore a draft saved before the Slack OAuth round-trip.
  useEffect(() => {
    const raw = sessionStorage.getItem(draftKey)
    if (!raw) return
    sessionStorage.removeItem(draftKey)
    try {
      const draft = JSON.parse(raw) as { value: string; mentions: MentionTarget[] }
      if (!value) onChange(draft.value)
      onMentionsChange(draft.mentions ?? [])
    } catch {
      // Ignore a corrupt draft
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])

  const mentionQuery = trigger?.char === '@' ? trigger.query.trim() : ''
  useEffect(() => {
    if (!reviewerSlack || !mentionQuery) {
      setRemote([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`${reviewerSlack.mentions_path}?q=${encodeURIComponent(mentionQuery)}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : { users: [] }))
        .then((data: { users: MentionTarget[] }) => setRemote(data.users))
        .catch(() => {})
    }, 150)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [mentionQuery, reviewerSlack])

  const suggestions: Suggestion[] = useMemo(() => {
    if (!trigger) return []
    if (trigger.char === '/') {
      return [
        {
          key: 'proj',
          label: PROJECT_TOKEN,
          sub: project.repo_link ? `${project.name} → GitHub link` : project.name,
          insert: PROJECT_TOKEN,
        },
      ]
    }
    const q = trigger.query.toLowerCase()
    const seen = new Set<number>()
    const out: Suggestion[] = []
    const add = (u: MentionTarget, sub?: string, fromRemote = false) => {
      if (seen.has(u.id)) return
      seen.add(u.id)
      out.push({
        key: String(u.id),
        label: `@${u.display_name}`,
        sub,
        avatar: u.avatar,
        insert: `@${u.display_name}`,
        target: fromRemote ? u : undefined,
      })
    }
    if (!q || OWNER_ALIAS.startsWith(q) || owner.display_name.toLowerCase().includes(q))
      add(owner, 'Project owner · @user')
    for (const c of project.collaborators) if (c.display_name.toLowerCase().includes(q)) add(c, 'Collaborator')
    for (const u of remote) add(u, undefined, true)
    return out.slice(0, 8)
  }, [trigger, project, owner, remote])

  const open = !!trigger && suggestions.length > 0

  useEffect(() => setActiveIndex(0), [trigger?.query, trigger?.char])

  const syncTrigger = useCallback((el: HTMLTextAreaElement) => {
    setTrigger(el.selectionStart === el.selectionEnd ? findTrigger(el.value, el.selectionStart) : null)
  }, [])

  const choose = useCallback(
    (s: Suggestion) => {
      if (!trigger) return
      const insert = `${s.insert} `
      const next = value.slice(0, trigger.start) + insert + value.slice(trigger.end)
      onChange(next)
      if (s.target && !mentions.some((m) => m.id === s.target!.id)) onMentionsChange([...mentions, s.target])
      setTrigger(null)
      const caret = trigger.start + insert.length
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(caret, caret)
      })
    },
    [trigger, value, onChange, mentions, onMentionsChange, textareaRef],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const delta = e.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((i) => (i + delta + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      choose(suggestions[activeIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setTrigger(null)
    }
  }

  const pinged = useMemo(() => {
    const seen = new Set<string>()
    return segments.flatMap((s) => (s.kind === 'mention' && !seen.has(s.name) && seen.add(s.name) ? [s.name] : []))
  }, [segments])
  const unresolved = segments.filter((s) => s.kind === 'unresolved').map((s) => s.text)
  const linksProject = segments.some((s) => s.kind === 'project')
  const posting = !!reviewerSlack?.linked && postToSlack
  const ownerMissing = posting && value.trim() !== '' && !pinged.includes(owner.display_name)

  const saveDraft = () => sessionStorage.setItem(draftKey, JSON.stringify({ value, mentions }))

  return (
    <div className="rounded-xl border bg-background shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            syncTrigger(e.target)
          }}
          onSelect={(e) => syncTrigger(e.currentTarget)}
          onKeyDown={handleKeyDown}
          onBlur={() => setTrigger(null)}
          onScroll={(e) => {
            if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop
          }}
          placeholder={placeholder ?? 'Feedback for the project author… type @ to ping, /proj/ to link the project'}
          spellCheck
          className="h-20 resize-y rounded-b-none border-0 bg-transparent text-sm text-transparent caret-foreground shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        {/* Highlight layer — mirrors the textarea's box model exactly so tokens line up with the caret. */}
        <div
          ref={backdropRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap wrap-break-word px-2.5 py-2 text-sm text-foreground"
        >
          {segments.map((s, i) => (
            <SegmentSpan key={i} kind={s.kind}>
              {s.text}
            </SegmentSpan>
          ))}
          {'​'}
        </div>

        {open && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
            {suggestions.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
                onMouseEnter={() => setActiveIndex(i)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                  i === activeIndex && 'bg-accent text-accent-foreground',
                )}
              >
                {s.key === 'proj' ? (
                  <FolderGit2Icon className="size-5 shrink-0 text-muted-foreground" />
                ) : s.avatar ? (
                  <img src={s.avatar} alt="" className="size-5 shrink-0 rounded-full object-cover" />
                ) : (
                  <AtSignIcon className="size-5 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate font-medium">{s.label}</span>
                {s.sub && <span className="ml-auto truncate text-xs text-muted-foreground">{s.sub}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {(pinged.length > 0 || linksProject || unresolved.length > 0 || ownerMissing) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 pb-2 text-xs text-muted-foreground">
          {pinged.length > 0 && (
            <span className="flex items-center gap-1">
              <AtSignIcon className="size-3 text-emerald-600 dark:text-emerald-400" />
              Pings {pinged.join(', ')}
            </span>
          )}
          {linksProject && (
            <span className="flex items-center gap-1">
              <LinkIcon className="size-3 text-blue-600 dark:text-blue-400" />
              Links {project.name}
            </span>
          )}
          {ownerMissing && <span>@{owner.display_name} will be tagged automatically</span>}
          {unresolved.length > 0 && (
            <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
              <TriangleAlertIcon className="size-3" />
              {[...new Set(unresolved)].join(', ')} won't ping anyone — pick from the list
            </span>
          )}
        </div>
      )}

      {reviewerSlack?.configured && (
        <div className="flex items-center justify-between gap-2 rounded-b-xl border-t bg-muted px-2.5 py-1.5 text-xs">
          {reviewerSlack.linked ? (
            <>
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox checked={postToSlack} onCheckedChange={(v) => onPostToSlackChange(v === true)} />
                <span>
                  Post to <span className="font-medium text-foreground">{CHANNEL}</span> as you
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Linked
                </span>
              </label>
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground"
                onClick={() =>
                  router.delete(reviewerSlack.disconnect_path, { preserveScroll: true, preserveState: true })
                }
              >
                Unlink
              </Button>
            </>
          ) : (
            <>
              <span className="text-muted-foreground">Link Slack to post this feedback to {CHANNEL} as you</span>
              <Button variant="raised" size="xs" asChild>
                <a href={reviewerSlack.connect_path} onClick={saveDraft}>
                  Link Slack
                </a>
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function SegmentSpan({ kind, children }: { kind: string; children: ReactNode }) {
  if (kind === 'mention')
    return (
      <span className="rounded-sm bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        {children}
      </span>
    )
  if (kind === 'project')
    return <span className="rounded-sm bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">{children}</span>
  if (kind === 'unresolved')
    return (
      <span className="text-amber-700 underline decoration-amber-500 decoration-dotted dark:text-amber-400">
        {children}
      </span>
    )
  return <>{children}</>
}
