import { useState } from 'react'
import { router } from '@inertiajs/react'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Textarea } from '@/components/admin/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Badge } from '@/components/admin/ui/badge'

const DEFAULT_UNSUBSCRIBE_LABEL = 'Important program related announcement | Unsubscribe'
const PREVIEW_NAME = 'Alex'

interface Campaign {
  id?: number
  name: string
  body: string
  footer: string
  unsubscribe_label: string
  image_url: string
  status?: string
}

interface Props {
  campaign?: Campaign
  errors?: Record<string, string[]>
}

const SOUP_AVATAR = 'https://avatars.slack-edge.com/2026-03-03/10620134255189_994e10cd91f0fc88ad9c_512.jpg'

// Very lightweight Slack mrkdwn → HTML renderer for preview
function renderSlackMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/~([^~\n]+)~/g, '<del>$1</del>')
    .replace(/`([^`\n]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/&lt;(https?:\/\/[^|&]+)\|([^&]+)&gt;/g, '<a href="$1" class="text-[#1264a3] underline">$2</a>')
    .replace(/&lt;(https?:\/\/[^&]+)&gt;/g, '<a href="$1" class="text-[#1264a3] underline">$1</a>')
    .replace(/&lt;#[A-Z0-9]+\|([^&]+)&gt;/g, '<span class="text-[#1264a3] font-medium">#$1</span>')
    .replace(
      /&lt;@([A-Z0-9]+)&gt;/g,
      '<span class="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-0.5 rounded">@$1</span>',
    )
    .replace(/\n/g, '<br />')
}

function interpolate(text: string): string {
  return text.replace(/\{name\}/g, PREVIEW_NAME)
}

function SlackPreview({
  body,
  footer,
  unsubscribeLabel,
  imageUrl,
}: {
  body: string
  footer: string
  unsubscribeLabel: string
  imageUrl: string
}) {
  const label = unsubscribeLabel.trim() || DEFAULT_UNSUBSCRIBE_LABEL
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
            <Badge variant="outline" className="text-[10px] h-4 px-1 border-[#4d5359] text-[#ababad] ml-0.5">
              APP
            </Badge>
          </div>

          {/* Body */}
          {body.trim() ? (
            <div
              className="text-[#d1d2d3] leading-relaxed [&_strong]:text-white [&_em]:text-[#d1d2d3] [&_code]:bg-[#2c2d30] [&_code]:text-[#d1d2d3] [&_a]:text-[#1264a3] [&_a:hover]:underline mb-2"
              dangerouslySetInnerHTML={{ __html: renderSlackMarkdown(interpolate(body)) }}
            />
          ) : (
            <p className="text-[#ababad] italic mb-2">Your message will appear here…</p>
          )}

          {/* Footer section block */}
          {footer.trim() && (
            <div
              className="text-[#d1d2d3] leading-relaxed [&_strong]:text-white [&_a]:text-[#1264a3] [&_a:hover]:underline mb-2"
              dangerouslySetInnerHTML={{ __html: renderSlackMarkdown(interpolate(footer)) }}
            />
          )}

          {/* Image block */}
          {imageUrl.trim() && (
            <img
              src={imageUrl}
              alt=""
              className="rounded-lg max-w-full mt-1 mb-2"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          )}

          {/* Divider */}
          <div className="border-t border-[#3d3d3d] my-2" />

          {/* Context block — small gray footer */}
          <div className="text-[#ababad] text-xs leading-relaxed">
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

const FORMATTING_TIPS = [
  { symbol: '*text*', desc: 'bold' },
  { symbol: '_text_', desc: 'italic' },
  { symbol: '~text~', desc: 'strikethrough' },
  { symbol: '`code`', desc: 'inline code' },
  { symbol: '<url|label>', desc: 'link' },
  { symbol: '<#C037157AL30|fallout>', desc: 'channel' },
]

export default function SoupCampaignForm({ campaign, errors }: Props) {
  const isEdit = Boolean(campaign?.id)
  const [name, setName] = useState(campaign?.name ?? '')
  const [body, setBody] = useState(campaign?.body ?? '')
  const [footer, setFooter] = useState(campaign?.footer ?? '')
  const [unsubscribeLabel, setUnsubscribeLabel] = useState(campaign?.unsubscribe_label ?? DEFAULT_UNSUBSCRIBE_LABEL)
  const [imageUrl, setImageUrl] = useState(campaign?.image_url ?? '')
  const [submitting, setSubmitting] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    const data = { soup_campaign: { name, body, footer, unsubscribe_label: unsubscribeLabel, image_url: imageUrl } }
    const opts = { onFinish: () => setSubmitting(false) }

    if (isEdit) {
      router.patch(`/admin/soup_campaigns/${campaign!.id}`, data, opts)
    } else {
      router.post('/admin/soup_campaigns', data, opts)
    }
  }

  function fieldError(field: string) {
    return errors?.[field]?.[0]
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* Left: editor */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Campaign details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Campaign name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. April update, summit invite…"
                  required
                />
                {fieldError('name') && <p className="text-xs text-destructive">{fieldError('name')}</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Message body</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message here using Slack mrkdwn…"
                rows={8}
                required
                className="font-mono text-sm resize-y"
              />
              {fieldError('body') && <p className="text-xs text-destructive">{fieldError('body')}</p>}
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {FORMATTING_TIPS.map((t) => (
                  <span key={t.symbol} className="text-xs text-muted-foreground">
                    <code className="bg-muted px-1 py-0.5 rounded font-mono">{t.symbol}</code> {t.desc}
                  </span>
                ))}
                <span className="text-xs text-muted-foreground">
                  <code className="bg-muted px-1 py-0.5 rounded font-mono">{'{name}'}</code> first name
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                Footer <span className="font-normal text-muted-foreground">(optional)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
                placeholder="e.g. — hack club fallout team"
                rows={3}
                className="font-mono text-sm resize-y"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                Image <span className="font-normal text-muted-foreground">(optional)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://cdn.hackclub.com/…"
                type="url"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Paste a CDN URL. The image will appear as a full-width block below the message body.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Unsubscribe link label</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                value={unsubscribeLabel}
                onChange={(e) => setUnsubscribeLabel(e.target.value)}
                placeholder={DEFAULT_UNSUBSCRIBE_LABEL}
                required
              />
              <p className="text-xs text-muted-foreground">
                This is the clickable text of the unsubscribe link appended to every message.
              </p>
              {fieldError('unsubscribe_label') && (
                <p className="text-xs text-destructive">{fieldError('unsubscribe_label')}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: live preview */}
        <div className="space-y-3 sticky top-6">
          <p className="text-sm font-medium">Live preview</p>
          <SlackPreview body={body} footer={footer} unsubscribeLabel={unsubscribeLabel} imageUrl={imageUrl} />
          <p className="text-xs text-muted-foreground">
            Preview uses <code className="bg-muted px-1 py-0.5 rounded font-mono">{'{name}'}</code> →{' '}
            <span className="font-medium">{PREVIEW_NAME}</span>. Actual delivery uses each recipient's first name.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create campaign'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.visit(isEdit ? `/admin/soup_campaigns/${campaign!.id}` : '/admin/soup_campaigns')}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
