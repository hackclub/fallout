import { useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { Link, router } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Button } from '@/components/admin/ui/button'
import { Badge } from '@/components/admin/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Input } from '@/components/admin/ui/input'
import { DataTable } from '@/components/admin/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
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
  SendIcon,
  FlaskConicalIcon,
  PencilIcon,
  TrashIcon,
  XCircleIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ClockIcon,
  SkipForwardIcon,
  UsersIcon,
} from 'lucide-react'
import type { PagyProps } from '@/types'

interface Campaign {
  id: number
  name: string
  body: string
  footer: string
  unsubscribe_label: string
  image_url: string | null
  status: 'draft' | 'sending' | 'sent' | 'cancelled'
  sent_at: string | null
  created_at: string
  created_by: { display_name: string; avatar: string | null }
  stats: { total: number; sent: number; failed: number; pending: number; unsubscribed: number; skipped: number }
  progress: number
}

interface Recipient {
  id: number
  slack_id: string
  display_name: string | null
  status: 'pending' | 'sent' | 'failed' | 'unsubscribed' | 'skipped' | 'projected'
  sent_at: string | null
  error_message: string | null
}

interface Props {
  campaign: Campaign
  recipients: Recipient[]
  recipients_pagy: PagyProps
  stats: Campaign['stats']
  progress: number
}

const STATUS_BADGE: Record<
  Campaign['status'],
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  draft: { label: 'Draft', variant: 'secondary' },
  sending: { label: 'Sending…', variant: 'default' },
  sent: { label: 'Sent', variant: 'outline' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
}

const RECIPIENT_STATUS_ICON: Record<Recipient['status'], ReactNode> = {
  pending: <ClockIcon className="size-3.5 text-muted-foreground" />,
  sent: <CheckCircleIcon className="size-3.5 text-green-500" />,
  failed: <AlertCircleIcon className="size-3.5 text-destructive" />,
  unsubscribed: <XCircleIcon className="size-3.5 text-orange-400" />,
  skipped: <SkipForwardIcon className="size-3.5 text-muted-foreground" />,
  projected: <UsersIcon className="size-3.5 text-muted-foreground" />,
}

const SOUP_AVATAR = 'https://avatars.slack-edge.com/2026-03-03/10620134255189_994e10cd91f0fc88ad9c_512.jpg'

function renderSlackMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/~([^~\n]+)~/g, '<del>$1</del>')
    .replace(/`([^`\n]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/&lt;(https?:\/\/[^|&]+)\|([^&]+)&gt;/g, '<a href="$1" class="text-blue-500 underline">$2</a>')
    .replace(/&lt;(https?:\/\/[^&]+)&gt;/g, '<a href="$1" class="text-blue-500 underline">$1</a>')
    .replace(/&lt;#[A-Z0-9]+\|([^&]+)&gt;/g, '<span class="text-blue-500 font-medium">#$1</span>')
    .replace(
      /&lt;@([A-Z0-9]+)&gt;/g,
      '<span class="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-0.5 rounded">@$1</span>',
    )
    .replace(/\n/g, '<br />')
}

function MessagePreview({
  body,
  footer,
  unsubscribeLabel,
  imageUrl,
}: {
  body: string
  footer: string
  unsubscribeLabel: string
  imageUrl: string | null
}) {
  const now = new Date()
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

  return (
    <div className="rounded-lg border bg-[#1a1d21] text-[#d1d2d3] font-sans text-sm p-4">
      <div className="flex gap-2.5 items-start">
        <img src={SOUP_AVATAR} className="size-9 rounded-lg shrink-0 mt-0.5" alt="Soup" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-bold text-white">Soup</span>
            <span className="text-xs text-[#ababad]">{timeStr}</span>
            <Badge variant="outline" className="text-[10px] h-4 px-1 border-[#4d5359] text-[#ababad]">
              APP
            </Badge>
          </div>

          {/* Body */}
          <div
            className="text-[#d1d2d3] leading-relaxed [&_strong]:text-white [&_a]:text-[#1264a3] [&_a:hover]:underline mb-2"
            dangerouslySetInnerHTML={{ __html: renderSlackMarkdown(body.replace(/\{name\}/g, 'Alex')) }}
          />

          {/* Footer section block */}
          {footer.trim() && (
            <div
              className="text-[#d1d2d3] leading-relaxed [&_strong]:text-white [&_a]:text-[#1264a3] [&_a:hover]:underline mb-2"
              dangerouslySetInnerHTML={{ __html: renderSlackMarkdown(footer.replace(/\{name\}/g, 'Alex')) }}
            />
          )}

          {/* Image block */}
          {imageUrl && <img src={imageUrl} alt="" className="rounded-lg max-w-full mt-1 mb-2" />}

          {/* Divider */}
          <div className="border-t border-[#3d3d3d] my-2" />

          {/* Context block — small gray footer */}
          <div className="text-[#ababad] text-xs leading-relaxed">
            {unsubscribeLabel} ·{' '}
            <a href="#" className="text-[#1264a3] hover:underline" onClick={(e) => e.preventDefault()}>
              Unsubscribe
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center p-3 rounded-lg border bg-card">
      <p className={`text-2xl font-bold tabular-nums ${color ?? ''}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}

function recipientColumns(
  isDraft: boolean,
  togglingId: number | null,
  onToggle: (r: Recipient) => void,
): ColumnDef<Recipient>[] {
  const cols: ColumnDef<Recipient>[] = [
    {
      accessorKey: 'display_name',
      header: 'Recipient',
      cell: ({ row }) => <span className="text-sm">{row.original.display_name ?? '—'}</span>,
    },
    {
      accessorKey: 'slack_id',
      header: 'Slack ID',
      cell: ({ row }) => <span className="text-xs font-mono text-muted-foreground">{row.original.slack_id}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const r = row.original
        return (
          <div>
            <div className="flex items-center gap-1.5 capitalize">
              {RECIPIENT_STATUS_ICON[r.status]}
              <span className="text-sm">{r.status}</span>
            </div>
            {r.error_message && (
              <p className="text-xs text-destructive mt-0.5 truncate max-w-48" title={r.error_message}>
                {r.error_message}
              </p>
            )}
          </div>
        )
      },
    },
  ]

  if (!isDraft) {
    cols.push({
      accessorKey: 'sent_at',
      header: 'Sent at',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.sent_at
            ? new Date(row.original.sent_at).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })
            : '—'}
        </span>
      ),
    })
    cols.push({
      id: 'actions',
      cell: ({ row }) => {
        const r = row.original
        return (
          <div className="text-right">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              disabled={togglingId === r.id}
              onClick={() => onToggle(r)}
            >
              {r.status === 'unsubscribed' ? 'Re-subscribe' : 'Unsubscribe'}
            </Button>
          </div>
        )
      },
    })
  }

  return cols
}

export default function SoupCampaignsShow({
  campaign,
  recipients: initialRecipients,
  recipients_pagy,
  stats,
  progress,
}: Props) {
  const [testSlackId, setTestSlackId] = useState('')
  const [testState, setTestState] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [testError, setTestError] = useState('')
  const [isPolling, setIsPolling] = useState(campaign.status === 'sending')
  const [recipients, setRecipients] = useState<Recipient[]>(initialRecipients)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const isDraft = campaign.status === 'draft'
  // Poll for progress updates when campaign is sending
  const poll = useCallback(() => {
    router.reload({ only: ['campaign', 'stats', 'progress', 'recipients'] })
  }, [])

  useEffect(() => {
    if (!isPolling) return
    const interval = setInterval(poll, 4000)
    return () => clearInterval(interval)
  }, [isPolling, poll])

  useEffect(() => {
    setIsPolling(campaign.status === 'sending')
  }, [campaign.status])

  // Sync recipients from server when polled
  useEffect(() => {
    setRecipients(initialRecipients)
  }, [initialRecipients])

  function handleToggleUnsubscribe(recipient: Recipient) {
    setTogglingId(recipient.id)
    fetch(`/admin/soup_campaigns/${campaign.id}/recipients/${recipient.id}/toggle_unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content ?? '',
      },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setRecipients((prev) => prev.map((r) => (r.id === recipient.id ? { ...r, status: data.status } : r)))
        }
      })
      .finally(() => setTogglingId(null))
  }

  function handleTestSend() {
    if (!testSlackId.trim()) return
    setTestState('sending')
    setTestError('')

    fetch(`/admin/soup_campaigns/${campaign.id}/test_send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content ?? '',
      },
      body: JSON.stringify({ slack_id: testSlackId.trim() }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setTestState('ok')
          setTimeout(() => setTestState('idle'), 3000)
        } else {
          setTestState('error')
          setTestError(data.error ?? 'Unknown error')
        }
      })
      .catch(() => {
        setTestState('error')
        setTestError('Network error')
      })
  }

  const { label, variant } = STATUS_BADGE[campaign.status]
  const isSending = campaign.status === 'sending'
  const isSent = campaign.status === 'sent'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/admin/soup_campaigns" className="text-sm text-muted-foreground hover:text-foreground">
              Campaigns
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm font-medium">{campaign.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
            <Badge variant={variant}>{label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Created by {campaign.created_by.display_name} ·{' '}
            {new Date(campaign.created_at).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
            {campaign.sent_at && (
              <>
                {' '}
                · Sent{' '}
                {new Date(campaign.sent_at).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </>
            )}
          </p>
        </div>

        <div className="flex gap-2 shrink-0">
          {isDraft && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/admin/soup_campaigns/${campaign.id}/edit`}>
                  <PencilIcon className="size-3.5 mr-1.5" />
                  Edit
                </Link>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  >
                    <TrashIcon className="size-3.5 mr-1.5" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete &ldquo;{campaign.name}&rdquo; and cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => router.delete(`/admin/soup_campaigns/${campaign.id}`)}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm">
                    <SendIcon className="size-3.5 mr-1.5" />
                    Send campaign
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Send to all recipients?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will DM all Fallout users and members of #fallout as Soup. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => router.post(`/admin/soup_campaigns/${campaign.id}/send_campaign`)}
                    >
                      Send campaign
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}

          {isSending && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-destructive border-destructive/30">
                  <XCircleIcon className="size-3.5 mr-1.5" />
                  Cancel
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel campaign?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Pending messages will not be sent. Messages already delivered cannot be recalled.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep sending</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => router.post(`/admin/soup_campaigns/${campaign.id}/cancel`)}
                  >
                    Cancel campaign
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column: message + test send */}
        <div className="lg:col-span-2 space-y-5">
          {/* Progress bar (only when sending or sent with recipients) */}
          {(isSending || (isSent && stats.total > 0)) && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{isSending ? 'Sending in progress…' : 'Delivery complete'}</CardTitle>
                  <span className="text-sm tabular-nums font-semibold">{progress}%</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${isSent ? 'bg-green-500' : 'bg-primary'}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <StatCard label="Total" value={stats.total} />
                  <StatCard label="Sent" value={stats.sent} color="text-green-500" />
                  <StatCard label="Pending" value={stats.pending} color="text-blue-400" />
                  <StatCard label="Failed" value={stats.failed} color="text-destructive" />
                  <StatCard label="Unsub'd" value={stats.unsubscribed} color="text-orange-400" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Message preview */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Message preview</CardTitle>
            </CardHeader>
            <CardContent>
              <MessagePreview
                body={campaign.body}
                footer={campaign.footer ?? ''}
                unsubscribeLabel={campaign.unsubscribe_label}
                imageUrl={campaign.image_url}
              />
            </CardContent>
          </Card>

          {/* Recipients table — always visible, paginated */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                Recipients
                {isDraft && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal">
                    projected
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={recipientColumns(isDraft, togglingId, handleToggleUnsubscribe)}
                data={recipients}
                pagy={recipients_pagy}
                noun="recipients"
                pageParam="rp"
              />
            </CardContent>
          </Card>
        </div>

        {/* Right column: test send */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <FlaskConicalIcon className="size-4 text-muted-foreground" />
                Test send
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Send a test DM to a specific Slack user ID. The message will be prefixed with [TEST].
              </p>
              <Input
                value={testSlackId}
                onChange={(e) => setTestSlackId(e.target.value)}
                placeholder="U0123456789"
                className="font-mono text-sm"
              />
              {testState === 'error' && <p className="text-xs text-destructive">{testError}</p>}
              {testState === 'ok' && (
                <p className="text-xs text-green-500 flex items-center gap-1">
                  <CheckCircleIcon className="size-3.5" /> Test message sent!
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={handleTestSend}
                disabled={!testSlackId.trim() || testState === 'sending'}
              >
                {testState === 'sending' ? 'Sending…' : 'Send test'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Campaign info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={variant}>{label}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created by</span>
                <div className="flex items-center gap-1.5">
                  {campaign.created_by.avatar && (
                    <img src={campaign.created_by.avatar} className="size-5 rounded-full" alt="" />
                  )}
                  <span>{campaign.created_by.display_name}</span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(campaign.created_at).toLocaleDateString()}</span>
              </div>
              {campaign.sent_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sent</span>
                  <span>{new Date(campaign.sent_at).toLocaleDateString()}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

SoupCampaignsShow.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
