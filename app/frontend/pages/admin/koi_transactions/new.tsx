import type { ReactNode } from 'react'
import { useForm, usePage, Link, router } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent } from '@/components/admin/ui/card'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import type { SharedProps } from '@/types'

export default function AdminKoiTransactionsNew({
  prefill_user_id,
  currency,
}: {
  prefill_user_id: string
  currency: 'koi' | 'gold'
}) {
  const { errors } = usePage<SharedProps>().props
  const form = useForm({
    user_id: prefill_user_id,
    amount: '',
    description: '',
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const key = currency === 'gold' ? 'gold_transaction' : 'koi_transaction'
    form.transform((data) => ({ [key]: data }))
    form.post(`/admin/koi_transactions?currency=${currency}`)
  }

  function switchCurrency(c: 'koi' | 'gold') {
    const params: Record<string, string> = { currency: c }
    if (prefill_user_id) params.user_id = prefill_user_id
    router.get('/admin/koi_transactions/new', params)
  }

  const backPath = `/admin/koi_transactions?currency=${currency}${prefill_user_id ? `&user_id=${prefill_user_id}` : ''}`

  return (
    <div className="max-w-lg">
      <div className="mb-4">
        <Link href={backPath} className="text-sm text-primary hover:underline">
          ← Transactions
        </Link>
      </div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Adjust {currency === 'koi' ? 'Koi' : 'Gold'}</h1>
        <div className="flex rounded-md border border-input overflow-hidden">
          <button
            type="button"
            onClick={() => switchCurrency('koi')}
            className={`px-3 py-1 text-sm ${currency === 'koi' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
          >
            Koi
          </button>
          <button
            type="button"
            onClick={() => switchCurrency('gold')}
            className={`px-3 py-1 text-sm ${currency === 'gold' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
          >
            Gold
          </button>
        </div>
      </div>

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

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="block text-sm font-medium mb-1.5">User ID</span>
              <input
                type="number"
                value={form.data.user_id}
                onChange={(e) => form.setData('user_id', e.target.value)}
                required
                className="w-full border border-input rounded-md px-3 py-2 text-sm"
                placeholder="User ID (find on /admin/users)"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-medium mb-1.5">Amount</span>
              <input
                type="number"
                value={form.data.amount}
                onChange={(e) => form.setData('amount', e.target.value)}
                required
                className="w-full border border-input rounded-md px-3 py-2 text-sm"
                placeholder="Positive to add, negative to deduct (e.g. -10)"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-medium mb-1.5">Description</span>
              <textarea
                value={form.data.description}
                onChange={(e) => form.setData('description', e.target.value)}
                required
                rows={3}
                className="w-full border border-input rounded-md px-3 py-2 text-sm"
                placeholder="Reason for adjustment"
              />
            </label>

            <Button type="submit" disabled={form.processing}>
              {form.processing ? 'Saving...' : 'Save Adjustment'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

AdminKoiTransactionsNew.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
