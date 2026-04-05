import { useForm, usePage } from '@inertiajs/react'
import type { SharedProps } from '@/types'

export default function AdminKoiTransactionsNew({ prefill_user_id }: { prefill_user_id: string }) {
  const { errors } = usePage<SharedProps>().props
  const form = useForm({
    user_id: prefill_user_id,
    amount: '',
    description: '',
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    form.post('/admin/koi_transactions')
  }

  return (
    <div className="max-w-lg mx-auto p-8 text-dark-brown">
      <div className="mb-2">
        <a href="/admin/koi_transactions" className="text-sm font-bold underline hover:opacity-80">
          ← Transactions
        </a>
      </div>
      <h1 className="font-bold text-4xl text-dark-brown mb-6">Adjust Koi</h1>

      {Object.keys(errors).length > 0 && (
        <div className="border-2 border-dark-brown p-4 mb-4 rounded-xs">
          {Object.values(errors)
            .flat()
            .map((msg, i) => (
              <p key={i}>{msg}</p>
            ))}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block font-bold mb-1">User ID</label>
          <input
            type="number"
            value={form.data.user_id}
            onChange={(e) => form.setData('user_id', e.target.value)}
            required
            className="w-full border-2 border-dark-brown bg-light-brown p-2 rounded-xs"
            placeholder="User ID (find on /admin/users)"
          />
        </div>

        <div>
          <label className="block font-bold mb-1">Amount</label>
          <input
            type="number"
            value={form.data.amount}
            onChange={(e) => form.setData('amount', e.target.value)}
            required
            className="w-full border-2 border-dark-brown bg-light-brown p-2 rounded-xs"
            placeholder="Positive to add, negative to deduct (e.g. -10)"
          />
        </div>

        <div>
          <label className="block font-bold mb-1">Description</label>
          <textarea
            value={form.data.description}
            onChange={(e) => form.setData('description', e.target.value)}
            required
            rows={3}
            className="w-full border-2 border-dark-brown bg-light-brown p-2 rounded-xs"
            placeholder="Reason for adjustment (e.g. 'bonus for summit help')"
          />
        </div>

        <button
          type="submit"
          disabled={form.processing}
          className="bg-brown border-2 border-dark-brown text-light-brown font-bold px-6 py-2 rounded-xs hover:opacity-80 disabled:opacity-50"
        >
          {form.processing ? 'Saving...' : 'Save Adjustment'}
        </button>
      </form>
    </div>
  )
}
