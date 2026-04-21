import { useEffect, useRef, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { Link, router } from '@inertiajs/react'
import * as Y from 'yjs'
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness'
import { createConsumer } from '@rails/actioncable'
import { EditorView, minimalSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { placeholder as cmPlaceholder } from '@codemirror/view'
import { yCollab, yRemoteSelectionsTheme } from 'y-codemirror.next'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
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
import { ArrowLeftIcon, TrashIcon, SendIcon, WifiIcon, WifiOffIcon } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface Campaign {
  id: number
  name: string
  body: string
  footer: string
  unsubscribe_label: string
  image_url: string
  notification_preview: string
  status: string
}

interface PresenceUser {
  id: number
  display_name: string
  avatar: string | null
  tab_id: string
  color: string
}

interface CurrentUserPresence {
  id: number
  display_name: string
  avatar: string | null
}

interface Props {
  campaign: Campaign
  current_user_presence: CurrentUserPresence
  yjs_state: string | null
}

// ── Constants ────────────────────────────────────────────────────────────────

const SOUP_AVATAR = 'https://avatars.slack-edge.com/2026-03-03/10620134255189_994e10cd91f0fc88ad9c_512.jpg'
const DEFAULT_UNSUBSCRIBE_LABEL = 'Important program related announcement | Unsubscribe'
const PREVIEW_NAME = 'Alex'
const AUTOSAVE_DEBOUNCE_MS = 800
const FIELDS = ['name', 'body', 'footer', 'unsubscribe_label', 'image_url', 'notification_preview'] as const
type Field = (typeof FIELDS)[number]

// ── Slack preview renderer ────────────────────────────────────────────────────

function renderSlackMarkdown(text: string): string {
  // Escape HTML first
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Process line by line to handle block elements (lists, blockquotes)
  const lines = escaped.split('\n')
  const output: string[] = []
  let inList = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const bulletMatch = line.match(/^([•\-\*])\s+(.*)$/)
    const numberMatch = line.match(/^(\d+)\.\s+(.*)$/)
    const quoteMatch = line.match(/^&gt;\s?(.*)$/)

    if (bulletMatch || numberMatch) {
      if (!inList) {
        output.push('<ul style="margin:0.25em 0;padding-left:1.4em;list-style:disc;">')
        inList = true
      }
      const content = bulletMatch ? bulletMatch[2] : numberMatch![2]
      output.push(`<li>${inlineSlack(content)}</li>`)
    } else {
      if (inList) {
        output.push('</ul>')
        inList = false
      }
      if (quoteMatch) {
        output.push(
          `<div style="border-left:3px solid #4d5359;padding-left:0.6em;color:#ababad;">${inlineSlack(quoteMatch[1])}</div>`,
        )
      } else if (line === '') {
        output.push('<br />')
      } else {
        output.push(`<span>${inlineSlack(line)}</span><br />`)
      }
    }
  }

  if (inList) output.push('</ul>')

  return output.join('')
}

function inlineSlack(text: string): string {
  return text
    .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/~([^~]+)~/g, '<del>$1</del>')
    .replace(
      /`([^`]+)`/g,
      '<code style="background:#2c2d30;padding:0 3px;border-radius:3px;font-family:monospace;font-size:0.8em;">$1</code>',
    )
    .replace(/&lt;(https?:\/\/[^|&]+)\|([^&]+)&gt;/g, '<a href="$1" style="color:#1264a3;">$2</a>')
    .replace(/&lt;(https?:\/\/[^&]+)&gt;/g, '<a href="$1" style="color:#1264a3;">$1</a>')
}

// ── Presence avatars ──────────────────────────────────────────────────────────

function PresenceAvatars({ users }: { users: PresenceUser[] }) {
  // Deduplicate: one avatar per user id (multiple tabs → show once, with tab count)
  const byUser = users.reduce<Record<number, PresenceUser[]>>((acc, u) => {
    acc[u.id] = acc[u.id] ?? []
    acc[u.id].push(u)
    return acc
  }, {})

  const unique = Object.values(byUser)

  if (unique.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Editing now</span>
      <div className="flex -space-x-2">
        {unique.slice(0, 5).map((tabs) => {
          const u = tabs[0]
          const tabCount = tabs.length
          return (
            <div
              key={u.id}
              className="relative group"
              title={`${u.display_name}${tabCount > 1 ? ` (${tabCount} tabs)` : ''}`}
            >
              {u.avatar ? (
                <img
                  src={u.avatar}
                  className="size-7 rounded-full ring-2 ring-background"
                  style={{ boxShadow: `0 0 0 2px ${u.color}` }}
                  alt={u.display_name}
                />
              ) : (
                <div
                  className="size-7 rounded-full ring-2 ring-background flex items-center justify-center text-[10px] font-semibold text-white"
                  style={{ background: u.color, boxShadow: `0 0 0 2px ${u.color}` }}
                >
                  {u.display_name[0]}
                </div>
              )}
              {tabCount > 1 && (
                <span className="absolute -top-1 -right-1 bg-background border text-[9px] font-bold size-3.5 rounded-full flex items-center justify-center text-muted-foreground">
                  {tabCount}
                </span>
              )}
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover border rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-md">
                {u.display_name}
                {tabCount > 1 && <span className="text-muted-foreground ml-1">({tabCount} tabs)</span>}
              </div>
            </div>
          )
        })}
        {unique.length > 5 && (
          <div className="size-7 rounded-full ring-2 ring-background bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground">
            +{unique.length - 5}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Save status indicator ─────────────────────────────────────────────────────

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'offline'

function SaveIndicator({ status }: { status: SaveStatus }) {
  const configs = {
    saved: { dot: 'bg-green-500', label: 'Saved', pulse: false },
    saving: { dot: 'bg-amber-400', label: 'Saving…', pulse: true },
    unsaved: { dot: 'bg-amber-400', label: 'Unsaved changes', pulse: false },
    offline: { dot: 'bg-red-500', label: 'Disconnected', pulse: false },
  }
  const { dot, label, pulse } = configs[status]

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`size-1.5 rounded-full ${dot} ${pulse ? 'animate-pulse' : ''}`} />
      {label}
    </div>
  )
}

// ── Collaborative CodeMirror editor ──────────────────────────────────────────

function CollabEditor({
  yText,
  awareness,
  placeholderText,
  minHeight,
  mono = false,
  singleLine = false,
  onFocus,
  onBlur,
}: {
  yText: Y.Text
  awareness: Awareness
  placeholderText?: string
  minHeight?: string
  mono?: boolean
  singleLine?: boolean
  onFocus?: () => void
  onBlur?: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const view = new EditorView({
      state: EditorState.create({
        doc: yText.toString(),
        extensions: [
          minimalSetup,
          yCollab(yText, awareness),
          yRemoteSelectionsTheme,
          placeholderText ? cmPlaceholder(placeholderText) : [],
          singleLine
            ? EditorState.transactionFilter.of((tr) => (tr.newDoc.lines > 1 ? [] : tr))
            : EditorView.lineWrapping,
          EditorView.theme({
            '&': {
              fontFamily: mono
                ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
                : 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
              fontSize: '0.875rem',
              background: 'transparent',
              border: '1px solid var(--input)',
              borderRadius: '0.5rem',
              color: 'var(--foreground)',
            },
            '.cm-editor': {
              fontFamily: mono
                ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
                : 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
              overflow: 'visible !important',
            },
            '&.cm-focused': {
              outline: 'none',
              borderColor: 'var(--ring)',
              boxShadow: '0 0 0 3px color-mix(in oklch, var(--ring) 50%, transparent)',
            },
            '.cm-scroller': {
              overflowX: singleLine ? 'clip' : 'hidden',
              overflowY: singleLine ? 'hidden' : 'auto',
              lineHeight: '1.5',
              minHeight: singleLine ? 'auto' : (minHeight ?? '8rem'),
              fontFamily: 'inherit',
            },
            '.cm-content': {
              padding: singleLine ? '0.5rem 0.75rem' : '1.5rem 0.625rem 0.5rem',
              minHeight: singleLine ? 'auto' : (minHeight ?? '8rem'),
              fontFamily: 'inherit',
            },
            '.cm-line': { padding: '0', fontFamily: 'inherit' },
            '.cm-gutters': { display: 'none' },
            '.cm-activeLine': { background: 'transparent' },
            '.cm-selectionBackground': { background: 'var(--input) !important' },
            '&.cm-focused .cm-selectionBackground': {
              background: 'color-mix(in oklch, var(--ring) 30%, transparent) !important',
            },
            '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
            '.cm-placeholder': { color: 'var(--muted-foreground)', fontStyle: 'normal' },
            /* Google Docs style cursors */
            '.cm-ySelectionInfo': {
              fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif) !important',
              fontSize: '0.7rem !important',
              fontWeight: '600 !important',
              padding: '2px 6px !important',
              borderRadius: '4px 4px 4px 0 !important',
              lineHeight: '1.2 !important',
              color: '#fff !important',
              opacity: '1 !important',
              border: 'none !important',
              top: '-1.5em !important',
              left: '-1px !important',
              whiteSpace: 'nowrap !important',
              zIndex: '101 !important',
              animation: 'yjs-cursor-fade 2.5s ease-in-out forwards !important',
            },
            '.cm-ySelectionCaret': {
              position: 'relative !important',
            },
            '.cm-ySelectionCaret:hover > .cm-ySelectionInfo': {
              animation: 'none !important',
              opacity: '1 !important',
            },
            '@keyframes yjs-cursor-fade': {
              '0%': { opacity: 1 },
              '70%': { opacity: 1 },
              '100%': { opacity: 0 },
            },
          }),
          EditorView.domEventHandlers({
            focus: () => {
              if (onFocus) onFocus()
            },
            blur: () => {
              if (onBlur) onBlur()
            },
          }),
        ],
      }),
      parent: containerRef.current,
    })

    return () => view.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yText, awareness])

  return <div ref={containerRef} />
}

// ── Collaborative input ───────────────────────────────────────────────────────

// ── Slack preview ─────────────────────────────────────────────────────────────

function SlackPreview({ fields }: { fields: Record<Field, string> }) {
  const { body, footer, unsubscribe_label, image_url } = fields
  const label = unsubscribe_label.trim() || DEFAULT_UNSUBSCRIBE_LABEL
  const now = new Date()
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

  return (
    <div className="rounded-lg border bg-[#1a1d21] text-[#d1d2d3] font-sans text-sm p-4 shadow-inner">
      <div className="flex gap-2.5 items-start">
        <img src={SOUP_AVATAR} className="size-9 rounded-lg shrink-0 mt-0.5" alt="Soup" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-bold text-white">Soup</span>
            <span className="text-xs text-[#ababad]">{timeStr}</span>
            <Badge variant="outline" className="text-[10px] h-4 px-1 border-[#4d5359] text-[#ababad] ml-0.5">
              APP
            </Badge>
          </div>
          {body.trim() ? (
            <div
              className="text-[#d1d2d3] leading-relaxed [&_strong]:text-white [&_em]:italic [&_code]:bg-[#2c2d30] [&_code]:px-1 [&_code]:rounded [&_code]:font-mono [&_code]:text-xs [&_a]:text-[#1264a3] [&_a:hover]:underline mb-2"
              dangerouslySetInnerHTML={{ __html: renderSlackMarkdown(body.replace(/\{name\}/g, PREVIEW_NAME)) }}
            />
          ) : (
            <p className="text-[#ababad] italic mb-2">Your message will appear here…</p>
          )}
          {footer.trim() && (
            <div
              className="text-[#d1d2d3] leading-relaxed [&_a]:text-[#1264a3] mb-2"
              dangerouslySetInnerHTML={{ __html: renderSlackMarkdown(footer.replace(/\{name\}/g, PREVIEW_NAME)) }}
            />
          )}
          {image_url.trim() && (
            <img
              src={image_url}
              alt=""
              className="rounded-lg max-w-full mt-1 mb-2"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          )}
          <div className="border-t border-[#3d3d3d] my-2" />
          <div className="text-[#ababad] text-xs">
            {label} ·{' '}
            <a href="#" className="text-[#1264a3] hover:underline" onClick={(e) => e.preventDefault()}>
              Unsubscribe
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main collaborative editor ─────────────────────────────────────────────────

export default function SoupCampaignCollaborativeEditor({ campaign, current_user_presence, yjs_state }: Props) {
  const ydocRef = useRef<Y.Doc | null>(null)
  const awarenessRef = useRef<Awareness | null>(null)
  const channelRef = useRef<ReturnType<ReturnType<typeof createConsumer>['subscriptions']['create']> | null>(null)
  const tabId = useRef(`${current_user_presence.id}-${Math.random().toString(36).slice(2)}`)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSyncedRef = useRef(false)
  const connectedRef = useRef<boolean | null>(null)

  const [connected, setConnected] = useState<boolean | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [peers, setPeers] = useState<PresenceUser[]>([])
  const [activeField, setActiveField] = useState<Field | null>(null)

  // Live preview state driven by Yjs
  const [previewFields, setPreviewFields] = useState<Record<Field, string>>({
    name: campaign.name,
    body: campaign.body,
    footer: campaign.footer ?? '',
    unsubscribe_label: campaign.unsubscribe_label,
    image_url: campaign.image_url ?? '',
    notification_preview: campaign.notification_preview ?? '',
  })

  // ── Init Yjs doc + Awareness ─────────────────────────────────────────────────

  if (!ydocRef.current) {
    const doc = new Y.Doc()
    if (yjs_state) {
      try {
        // Apply persisted Yjs state synchronously — no ActionCable race conditions
        const binary = atob(yjs_state)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        Y.applyUpdate(doc, bytes)

        // Recover from older corrupted states (missing initial seed dependencies)
        if (!doc.getText('name').length && !doc.getText('body').length) {
          console.warn('Document empty after applying yjs_state, seeding from DB fields')
          doc.getText('name').insert(0, campaign.name)
          doc.getText('body').insert(0, campaign.body)
          doc.getText('footer').insert(0, campaign.footer ?? '')
          doc.getText('unsubscribe_label').insert(0, campaign.unsubscribe_label)
          doc.getText('image_url').insert(0, campaign.image_url ?? '')
          doc.getText('notification_preview').insert(0, campaign.notification_preview ?? '')
        }
      } catch (e) {
        console.error('Failed to parse yjs_state, falling back to DB fields:', e)
        doc.getText('name').insert(0, campaign.name)
        doc.getText('body').insert(0, campaign.body)
        doc.getText('footer').insert(0, campaign.footer ?? '')
        doc.getText('unsubscribe_label').insert(0, campaign.unsubscribe_label)
        doc.getText('image_url').insert(0, campaign.image_url ?? '')
        doc.getText('notification_preview').insert(0, campaign.notification_preview ?? '')
      }
      isSyncedRef.current = true
    } else {
      // Brand new campaign with no saved Yjs state — seed from DB field values
      doc.getText('name').insert(0, campaign.name)
      doc.getText('body').insert(0, campaign.body)
      doc.getText('footer').insert(0, campaign.footer ?? '')
      doc.getText('unsubscribe_label').insert(0, campaign.unsubscribe_label)
      doc.getText('image_url').insert(0, campaign.image_url ?? '')
      doc.getText('notification_preview').insert(0, campaign.notification_preview ?? '')
      isSyncedRef.current = true
    }
    ydocRef.current = doc
  }

  if (!awarenessRef.current) {
    const awareness = new Awareness(ydocRef.current)
    // Set this user's info so y-codemirror.next can render their cursor label
    const hue = (current_user_presence.id * 47) % 360
    awareness.setLocalStateField('user', {
      name: current_user_presence.display_name,
      color: `hsl(${hue}, 70%, 55%)`,
      colorLight: `hsl(${hue}, 70%, 80%)`,
    })
    awarenessRef.current = awareness
  }

  const ydoc = ydocRef.current
  const awareness = awarenessRef.current

  // Update live preview whenever any Yjs text changes
  useEffect(() => {
    const handlers: Array<[Y.Text, () => void]> = FIELDS.map((f) => {
      const yText = ydoc.getText(f)
      const handler = () => setPreviewFields((prev) => ({ ...prev, [f]: yText.toString() }))
      yText.observe(handler)
      return [yText, handler]
    })
    return () => handlers.forEach(([yText, handler]) => yText.unobserve(handler))
  }, [ydoc])

  // ── Autosave ────────────────────────────────────────────────────────────────

  // ── Real-time sync + autosave ────────────────────────────────────────────────

  const scheduleAutosave = useCallback(() => {
    setSaveStatus('unsaved')
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      if (!channelRef.current || !connectedRef.current) return
      setSaveStatus('saving')
      const fields: Record<string, string> = {}
      FIELDS.forEach((f) => {
        fields[f] = ydoc.getText(f).toString()
      })
      const update = Y.encodeStateAsUpdate(ydoc)
      let binary = ''
      for (let i = 0; i < update.byteLength; i += 1024) {
        binary += String.fromCharCode.apply(null, update.subarray(i, i + 1024) as any)
      }
      channelRef.current.perform('autosave', {
        update: btoa(binary),
        fields,
      })
      setSaveStatus('saved')
    }, AUTOSAVE_DEBOUNCE_MS)
  }, [ydoc])

  useEffect(() => {
    const handler = (update: Uint8Array, origin: any) => {
      // Don't echo updates received from the websocket back to the websocket
      if (origin === 'websocket') {
        // Still schedule an autosave so we persist remote edits if we're the last tab open
        scheduleAutosave()
        return
      }

      // Broadcast incremental update immediately for real-time collaboration
      if (channelRef.current && connectedRef.current) {
        let binary = ''
        for (let i = 0; i < update.byteLength; i += 1024) {
          binary += String.fromCharCode.apply(null, update.subarray(i, i + 1024) as any)
        }
        channelRef.current.perform('sync', {
          update: btoa(binary),
        })
      }
      // Debounced save with full field values for persistence
      scheduleAutosave()
    }
    ydoc.on('update', handler)
    return () => ydoc.off('update', handler)
  }, [ydoc, scheduleAutosave])

  // ── ActionCable subscription ────────────────────────────────────────────────

  useEffect(() => {
    const consumer = createConsumer()

    const channel = consumer.subscriptions.create(
      { channel: 'SoupCampaignChannel', campaign_id: campaign.id, tab_id: tabId.current },
      {
        connected() {
          connectedRef.current = true
          setConnected(true)
          setSaveStatus('saved')
        },

        disconnected() {
          connectedRef.current = false
          setConnected(false)
          setSaveStatus('offline')
        },

        received(data: Record<string, unknown>) {
          switch (data.type) {
            case 'sync_step1_reply': {
              // Already applied synchronously from the yjs_state prop — skip
              break
            }

            case 'sync': {
              if ((data.tab_id as string) === tabId.current) break
              const binary = atob(data.update as string)
              const bytes = new Uint8Array(binary.length)
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
              Y.applyUpdate(ydoc, bytes, 'websocket')
              break
            }

            case 'awareness': {
              if ((data.tab_id as string) === tabId.current) break
              const binary = atob(data.update as string)
              const bytes = new Uint8Array(binary.length)
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
              applyAwarenessUpdate(awareness, bytes, null)
              break
            }

            case 'presence_join':
            case 'presence': {
              const user = data.user as PresenceUser
              if (user.tab_id === tabId.current) break
              setPeers((prev) => {
                const filtered = prev.filter((p) => p.tab_id !== user.tab_id)
                return [...filtered, user]
              })
              break
            }

            case 'presence_leave': {
              const tid = data.tab_id as string
              setPeers((prev) => prev.filter((p) => p.tab_id !== tid))
              break
            }
          }
        },
      },
    )

    channelRef.current = channel

    // Broadcast local awareness changes (cursor, selection) to peers
    const awarenessHandler = ({
      added,
      updated,
      removed,
    }: {
      added: number[]
      updated: number[]
      removed: number[]
    }) => {
      const changedClients = [...added, ...updated, ...removed]
      const update = encodeAwarenessUpdate(awareness, changedClients)
      let binary = ''
      for (let i = 0; i < update.byteLength; i += 1024) {
        binary += String.fromCharCode.apply(null, update.subarray(i, i + 1024) as any)
      }
      channel.perform('awareness', { update: btoa(binary) })
    }
    awareness.on('update', awarenessHandler)

    return () => {
      awareness.off('update', awarenessHandler)
      channel.unsubscribe()
      consumer.disconnect()
    }
  }, [campaign.id, ydoc, awareness])

  // ── Field focus → presence broadcast ───────────────────────────────────────

  function handleFieldFocus(field: Field) {
    setActiveField(field)
    channelRef.current?.perform('presence', { field })
  }

  function handleFieldBlur() {
    setActiveField(null)
    channelRef.current?.perform('presence', { field: null })
  }

  // ── Delete campaign ─────────────────────────────────────────────────────────

  function handleDelete() {
    router.delete(`/admin/soup_campaigns/${campaign.id}`, {
      onSuccess: () => router.visit('/admin/soup_campaigns'),
    })
  }

  const isDraft = campaign.status === 'draft'

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 h-14 gap-4">
          {/* Left: back + campaign name */}
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/admin/soup_campaigns"
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <ArrowLeftIcon className="size-4" />
            </Link>
            <div className="w-px h-4 bg-border shrink-0" />
            {/* Editable name inline */}
            <CollabEditor
              yText={ydoc.getText('name')}
              awareness={awareness}
              placeholderText="Campaign name…"
              singleLine
              onFocus={() => handleFieldFocus('name')}
              onBlur={handleFieldBlur}
            />
          </div>

          {/* Center: presence */}
          <div className="flex items-center gap-4 shrink-0">
            <PresenceAvatars users={peers} />
          </div>

          {/* Right: status + actions */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5">
              {connected === false ? (
                <WifiOffIcon className="size-3.5 text-red-500" />
              ) : (
                <WifiIcon className="size-3.5 text-muted-foreground" />
              )}
              <SaveIndicator status={saveStatus} />
            </div>

            {isDraft && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded hover:bg-destructive/10">
                    <TrashIcon className="size-3.5" />
                    Delete
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete this draft. It cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={handleDelete}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            <Link
              href={`/admin/soup_campaigns/${campaign.id}`}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors px-3 py-1.5 rounded-md font-medium"
            >
              <SendIcon className="size-3.5" />
              Review & send
            </Link>
          </div>
        </div>
      </div>

      {/* Editor + preview split */}
      <div className="grid lg:grid-cols-[1fr_420px] min-h-[calc(100vh-3.5rem)]">
        {/* Left: editor */}
        <div className="border-r p-8 space-y-8 overflow-y-auto">
          {/* Sync status banner */}
          {connected === false && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-600 dark:text-red-400">
              <WifiOffIcon className="size-4 shrink-0" />
              Connection lost — changes will sync when reconnected
            </div>
          )}

          {/* Body */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <label className="text-sm font-semibold tracking-tight">Message body</label>
              <div className="flex gap-3 text-xs text-muted-foreground">
                {[
                  ['*text*', 'bold'],
                  ['_text_', 'italic'],
                  ['`code`', 'code'],
                  ['{name}', 'first name'],
                ].map(([sym, desc]) => (
                  <span key={sym}>
                    <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px]">{sym}</code>{' '}
                    <span className="text-muted-foreground/70">{desc}</span>
                  </span>
                ))}
              </div>
            </div>
            <CollabEditor
              yText={ydoc.getText('body')}
              awareness={awareness}
              placeholderText="Write your message using Slack mrkdwn…"
              minHeight="14rem"
              mono
              onFocus={() => handleFieldFocus('body')}
              onBlur={handleFieldBlur}
            />
          </section>

          {/* Footer */}
          <section>
            <label className="text-sm font-semibold tracking-tight mb-3 flex items-center gap-2">
              Footer
              <span className="text-xs font-normal text-muted-foreground">optional</span>
            </label>
            <CollabEditor
              yText={ydoc.getText('footer')}
              awareness={awareness}
              placeholderText="e.g. — the fallout team"
              minHeight="5rem"
              mono
              onFocus={() => handleFieldFocus('footer')}
              onBlur={handleFieldBlur}
            />
          </section>

          {/* Image */}
          <section>
            <label className="text-sm font-semibold tracking-tight mb-3 flex items-center gap-2">
              Image
              <span className="text-xs font-normal text-muted-foreground">optional · CDN URL</span>
            </label>
            <CollabEditor
              yText={ydoc.getText('image_url')}
              awareness={awareness}
              placeholderText="https://cdn.hackclub.com/…"
              mono
              singleLine
              onFocus={() => handleFieldFocus('image_url')}
              onBlur={handleFieldBlur}
            />
          </section>

          {/* Unsubscribe label */}
          <section>
            <label className="text-sm font-semibold tracking-tight mb-1 block">Unsubscribe label</label>
            <p className="text-xs text-muted-foreground mb-3">
              Appears in the footer of every message next to the unsubscribe link.
            </p>
            <CollabEditor
              yText={ydoc.getText('unsubscribe_label')}
              awareness={awareness}
              placeholderText={DEFAULT_UNSUBSCRIBE_LABEL}
              singleLine
              onFocus={() => handleFieldFocus('unsubscribe_label')}
              onBlur={handleFieldBlur}
            />
          </section>

          {/* Notification preview */}
          <section>
            <label className="text-sm font-semibold tracking-tight mb-1 block">Notification preview</label>
            <p className="text-xs text-muted-foreground mb-3">
              Shown as the push notification / preview text instead of the message body. Leave blank to use the body.
            </p>
            <CollabEditor
              yText={ydoc.getText('notification_preview')}
              awareness={awareness}
              placeholderText="e.g. :siren1: IMPORTANT > READ NOW :siren1:"
              singleLine
              onFocus={() => handleFieldFocus('notification_preview')}
              onBlur={handleFieldBlur}
            />
          </section>
        </div>

        {/* Right: sticky live preview */}
        <div className="p-6 bg-muted/30 overflow-y-auto">
          <div className="sticky top-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Live preview</p>
              <p className="text-xs text-muted-foreground">
                <code className="bg-muted px-1 py-0.5 rounded font-mono">{'{name}'}</code> → {PREVIEW_NAME}
              </p>
            </div>
            <SlackPreview fields={previewFields} />
            {activeField && (
              <p className="text-xs text-muted-foreground text-center">
                Editing <span className="font-medium">{activeField.replace('_', ' ')}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

SoupCampaignCollaborativeEditor.layout = (page: ReactNode) => <AdminLayout flush>{page}</AdminLayout>
