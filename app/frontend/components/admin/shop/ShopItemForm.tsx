import { useState, type ReactNode } from 'react'
import { ImageOff } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/admin/ui/card'
import { Input } from '@/components/admin/ui/input'
import { Button } from '@/components/admin/ui/button'
import { Badge } from '@/components/admin/ui/badge'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { Separator } from '@/components/admin/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import {
  type ShopItemFormData,
  type Currency,
  type Status,
  CURRENCY_LABELS,
  FLAGS,
  STAR_ICON,
  unitFor,
  hasUsdEquivalent,
  priceToUsd,
  usdToPrice,
} from './shopItem'

type FormShape = {
  data: ShopItemFormData
  setData: (key: keyof ShopItemFormData, value: ShopItemFormData[keyof ShopItemFormData]) => void
  errors: Partial<Record<keyof ShopItemFormData, string>>
  processing: boolean
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  error?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export default function ShopItemForm({
  form,
  onSubmit,
  submitLabel,
  footer,
}: {
  form: FormShape
  onSubmit: (e: React.FormEvent) => void
  submitLabel: string
  footer?: ReactNode
}) {
  const { data, setData, errors, processing } = form
  const price = typeof data.price === 'number' ? data.price : parseInt(data.price || '0', 10) || 0

  // USD field is derived from price unless the admin is actively typing in it.
  const [usdDraft, setUsdDraft] = useState<string | null>(null)
  const usdValue = usdDraft ?? priceToUsd(price)

  function handlePrice(val: string) {
    setUsdDraft(null)
    setData('price', val === '' ? '' : Math.max(0, parseInt(val, 10) || 0))
  }

  function handleUsd(val: string) {
    setUsdDraft(val)
    const p = usdToPrice(val)
    if (p !== null) setData('price', p)
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>What buyers see in the shop.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Name" htmlFor="name" error={errors.name}>
              <Input
                id="name"
                value={data.name}
                onChange={(e) => setData('name', e.target.value)}
                placeholder="e.g. Hack Club sticker pack"
                aria-invalid={!!errors.name}
              />
            </Field>
            <Field label="Description" htmlFor="description" error={errors.description}>
              <textarea
                id="description"
                value={data.description}
                onChange={(e) => setData('description', e.target.value)}
                rows={3}
                placeholder="A short line shown under the item."
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </Field>
            <Field label="Image URL" htmlFor="image_url" error={errors.image_url} hint="Square images look best.">
              <Input
                id="image_url"
                value={data.image_url}
                onChange={(e) => setData('image_url', e.target.value)}
                placeholder="https://…"
                aria-invalid={!!errors.image_url}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
            <CardDescription>What the item costs and in which currency.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="Currency">
              <Select value={data.currency} onValueChange={(v) => setData('currency', v as Currency)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CURRENCY_LABELS) as Currency[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CURRENCY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Price" htmlFor="price" error={errors.price}>
              <div className="relative">
                <Input
                  id="price"
                  type="number"
                  min={1}
                  value={data.price}
                  onChange={(e) => handlePrice(e.target.value)}
                  className="pr-10"
                  aria-invalid={!!errors.price}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                  {unitFor(data.currency)}
                </span>
              </div>
            </Field>
            {hasUsdEquivalent(data.currency) ? (
              <Field label="USD value" htmlFor="usd" hint="Auto-converts to price.">
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="usd"
                    type="number"
                    min={0}
                    step={0.01}
                    value={usdValue}
                    onChange={(e) => handleUsd(e.target.value)}
                    className="pl-6"
                  />
                </div>
              </Field>
            ) : (
              <div className="hidden sm:block" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Availability & options</CardTitle>
            <CardDescription>Control visibility and checkout behaviour.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Status">
                <Select value={data.status} onValueChange={(v) => setData('status', v as Status)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="unavailable">Unavailable</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <label
                htmlFor="featured"
                className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-input px-3 py-2 sm:self-end"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <STAR_ICON className="size-4 text-muted-foreground" />
                  Featured
                </span>
                <Checkbox
                  id="featured"
                  checked={data.featured}
                  onCheckedChange={(c) => setData('featured', c === true)}
                />
              </label>
            </div>

            <Separator />

            <div className="divide-y divide-border rounded-md border border-border">
              {FLAGS.map(({ key, label, description, icon: Icon }) => (
                <label key={key} htmlFor={key} className="flex cursor-pointer items-start gap-3 px-3 py-3">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{description}</span>
                  </span>
                  <Checkbox
                    id={key}
                    checked={data[key] as boolean}
                    onCheckedChange={(c) => setData(key, c === true)}
                    className="mt-0.5"
                  />
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={processing}>
            {processing ? 'Saving…' : submitLabel}
          </Button>
          {footer}
        </div>
      </div>

      <Card className="lg:sticky lg:top-6">
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>How this item appears in the shop.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="flex aspect-square items-center justify-center bg-muted">
              {data.image_url ? (
                <img
                  src={data.image_url}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <ImageOff className="size-8 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium leading-tight">{data.name || 'Untitled item'}</p>
                {data.featured && (
                  <Badge variant="secondary" className="gap-1">
                    <STAR_ICON className="size-3" />
                    Featured
                  </Badge>
                )}
              </div>
              {data.description && <p className="text-sm text-muted-foreground">{data.description}</p>}
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm font-semibold">
                  {price || 0} {unitFor(data.currency)}
                </span>
                <Badge variant={data.status === 'available' ? 'default' : 'outline'}>
                  {data.status === 'available' ? 'Available' : 'Unavailable'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
