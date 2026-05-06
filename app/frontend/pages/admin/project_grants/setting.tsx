import type { ReactNode } from 'react'
import { useState } from 'react'
import { useForm, usePage } from '@inertiajs/react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AdminLayout from '@/layouts/AdminLayout'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent } from '@/components/admin/ui/card'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import type { SharedProps } from '@/types'

type Setting = {
  purpose: string | null
  default_expiry_days: number | null
  merchant_lock: string[]
  category_lock: string[]
  keyword_lock: string | null
  one_time_use: boolean
  pre_authorization_required: boolean
  instructions: string | null
  invite_message: string | null
  koi_to_cents_numerator: number
  koi_to_cents_denominator: number
  koi_to_hours_numerator: number | null
  koi_to_hours_denominator: number | null
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function joinArray(arr: string[] | null | undefined): string {
  return (arr || []).join(', ')
}

function splitArray(val: string): string[] {
  return val
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function AdminProjectGrantsSetting({ setting, is_hcb }: { setting: Setting; is_hcb: boolean }) {
  const { errors } = usePage<SharedProps>().props

  const form = useForm({
    purpose: setting.purpose || '',
    default_expiry_days: setting.default_expiry_days?.toString() || '',
    merchant_lock: joinArray(setting.merchant_lock),
    category_lock: joinArray(setting.category_lock),
    keyword_lock: setting.keyword_lock || '',
    one_time_use: setting.one_time_use,
    pre_authorization_required: setting.pre_authorization_required,
    instructions: setting.instructions || '',
    invite_message: setting.invite_message || '',
    koi_to_cents_numerator: setting.koi_to_cents_numerator.toString(),
    koi_to_cents_denominator: setting.koi_to_cents_denominator.toString(),
    koi_to_hours_numerator: setting.koi_to_hours_numerator?.toString() || '',
    koi_to_hours_denominator: setting.koi_to_hours_denominator?.toString() || '',
  })

  const [showPreview, setShowPreview] = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    form.transform((data) => ({
      ...data,
      merchant_lock: splitArray(data.merchant_lock as string),
      category_lock: splitArray(data.category_lock as string),
    }))
    form.patch('/admin/project_grants/setting')
  }

  const centsNum = parseInt(form.data.koi_to_cents_numerator, 10)
  const centsDen = parseInt(form.data.koi_to_cents_denominator, 10)
  const centsRateValid = Number.isFinite(centsNum) && Number.isFinite(centsDen) && centsDen > 0 && centsNum > 0
  const hoursNum = parseInt(form.data.koi_to_hours_numerator, 10)
  const hoursDen = parseInt(form.data.koi_to_hours_denominator, 10)
  const hoursRateValid = Number.isFinite(hoursNum) && Number.isFinite(hoursDen) && hoursDen > 0 && hoursNum > 0

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-2">HCB Grant Settings</h1>
      <p className="text-sm text-muted-foreground mb-6">
        These settings apply when a new HCB card grant is <strong>issued</strong>. Topups to existing cards preserve the
        original settings. Exchange rates snapshot onto each order — changes don't affect existing orders.
      </p>

      {!is_hcb && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm mb-4">
          <p className="font-medium mb-1">View-only mode</p>
          <p className="text-xs text-muted-foreground">
            You can see the current settings, but the <code>hcb</code> role is required to change anything here
            (exchange rates, lock config, instructions, etc.).
          </p>
        </div>
      )}

      {Object.keys(errors).length > 0 && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            {Object.values(errors)
              .flat()
              .map((msg, i) => (
                <p key={i}>{msg}</p>
              ))}
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="font-medium text-sm">Exchange rates</div>

            <div>
              <div className="block text-sm font-medium mb-1.5">Koi → USD cents</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={form.data.koi_to_cents_numerator}
                  onChange={(e) => form.setData('koi_to_cents_numerator', e.target.value)}
                  required
                  min={1}
                  className="w-24 border border-input rounded-md px-2 py-1 text-sm"
                />
                <span className="text-sm text-muted-foreground">cents per</span>
                <input
                  type="number"
                  value={form.data.koi_to_cents_denominator}
                  onChange={(e) => form.setData('koi_to_cents_denominator', e.target.value)}
                  required
                  min={1}
                  className="w-24 border border-input rounded-md px-2 py-1 text-sm"
                />
                <span className="text-sm text-muted-foreground">koi</span>
              </div>
              {centsRateValid && (
                <div className="text-xs text-muted-foreground mt-1">
                  1 koi = {formatDollars(Math.round((centsNum / centsDen) * 100) / 100)}
                </div>
              )}
            </div>

            <div>
              <div className="block text-sm font-medium mb-1.5">Koi → hours (optional; leave both blank to hide)</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={form.data.koi_to_hours_numerator}
                  onChange={(e) => form.setData('koi_to_hours_numerator', e.target.value)}
                  min={1}
                  className="w-24 border border-input rounded-md px-2 py-1 text-sm"
                />
                <span className="text-sm text-muted-foreground">hours per</span>
                <input
                  type="number"
                  value={form.data.koi_to_hours_denominator}
                  onChange={(e) => form.setData('koi_to_hours_denominator', e.target.value)}
                  min={1}
                  className="w-24 border border-input rounded-md px-2 py-1 text-sm"
                />
                <span className="text-sm text-muted-foreground">koi</span>
              </div>
              {hoursRateValid && (
                <div className="text-xs text-muted-foreground mt-1">
                  1 koi = {Math.round((hoursNum / hoursDen) * 1000) / 1000} hours
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="font-medium text-sm">HCB card config (used on first-time issue)</div>

            <label className="block">
              <span className="block text-sm font-medium mb-1.5">Purpose (≤30 chars)</span>
              <input
                type="text"
                value={form.data.purpose}
                onChange={(e) => form.setData('purpose', e.target.value)}
                maxLength={30}
                className="w-full border border-input rounded-md px-3 py-2 text-sm"
                placeholder="Project funding"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-medium mb-1.5">
                Default expiry (days from issue; leave blank for no expiry)
              </span>
              <input
                type="number"
                value={form.data.default_expiry_days}
                onChange={(e) => form.setData('default_expiry_days', e.target.value)}
                min={1}
                className="w-40 border border-input rounded-md px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-medium mb-1.5">
                Merchant lock (comma-separated Stripe merchant IDs)
              </span>
              <input
                type="text"
                value={form.data.merchant_lock}
                onChange={(e) => form.setData('merchant_lock', e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm"
                placeholder="Leave empty for no lock"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-medium mb-1.5">
                Category lock (comma-separated Stripe categories)
              </span>
              <input
                type="text"
                value={form.data.category_lock}
                onChange={(e) => form.setData('category_lock', e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm"
                placeholder="Leave empty for no lock"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-medium mb-1.5">Keyword lock</span>
              <input
                type="text"
                value={form.data.keyword_lock}
                onChange={(e) => form.setData('keyword_lock', e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm"
              />
            </label>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.data.one_time_use}
                  onChange={(e) => form.setData('one_time_use', e.target.checked)}
                />
                One-time use
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.data.pre_authorization_required}
                  onChange={(e) => form.setData('pre_authorization_required', e.target.checked)}
                />
                Pre-authorization required
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm">Instructions (markdown; shown to student on card)</div>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowPreview((s) => !s)}>
                {showPreview ? 'Edit' : 'Preview'}
              </Button>
            </div>
            {showPreview ? (
              <div className="min-h-32 border border-input rounded-md px-3 py-2 prose prose-sm dark:prose-invert max-w-none">
                {form.data.instructions ? (
                  <Markdown remarkPlugins={[remarkGfm]}>{form.data.instructions}</Markdown>
                ) : (
                  <span className="italic text-muted-foreground">Nothing to preview</span>
                )}
              </div>
            ) : (
              <textarea
                value={form.data.instructions}
                onChange={(e) => form.setData('instructions', e.target.value)}
                rows={8}
                className="w-full border border-input rounded-md px-3 py-2 text-sm font-mono"
                placeholder="# Rules&#10;&#10;- Don't buy…"
              />
            )}

            <label className="block">
              <span className="block text-sm font-medium mb-1.5">Invite email message</span>
              <textarea
                value={form.data.invite_message}
                onChange={(e) => form.setData('invite_message', e.target.value)}
                rows={4}
                className="w-full border border-input rounded-md px-3 py-2 text-sm"
              />
            </label>
          </CardContent>
        </Card>

        {is_hcb && (
          <Button type="submit" disabled={form.processing}>
            {form.processing ? 'Saving…' : 'Save settings'}
          </Button>
        )}
      </form>
    </div>
  )
}

AdminProjectGrantsSetting.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
