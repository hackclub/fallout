import { useForm } from '@inertiajs/react'

type Order = {
  id: number
  user: { id: number; display_name: string; email: string }
  shop_item: { id: number; name: string }
  frozen_price: number
  state: string
  address: string | null
  admin_note: string | null
  created_at: string
  user_koi_balance: number
}

const STATES = ['pending', 'fulfilled', 'rejected', 'on_hold']

export default function AdminShopOrderShow({ order }: { order: Order }) {
  const form = useForm({
    state: order.state,
    admin_note: order.admin_note ?? '',
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    form.patch(`/admin/shop_orders/${order.id}`)
  }

  return (
    <div className="max-w-2xl mx-auto p-8 text-dark-brown">
      <div className="mb-2">
        <a href="/admin/shop_orders" className="text-sm font-bold underline hover:opacity-80">
          ← All Orders
        </a>
      </div>
      <h1 className="font-bold text-4xl text-dark-brown mb-6">Order #{order.id}</h1>

      <div className="border-2 border-dark-brown rounded-xs p-4 mb-6 space-y-1">
        <p>
          <span className="font-bold">User:</span> {order.user.display_name} ({order.user.email})
        </p>
        <p>
          <span className="font-bold">Current koi balance:</span> {order.user_koi_balance} koi
        </p>
        <p>
          <span className="font-bold">Item:</span> {order.shop_item.name}
        </p>
        <p>
          <span className="font-bold">Price at order time:</span> {order.frozen_price} koi
        </p>
        <p>
          <span className="font-bold">Shipping address:</span>{' '}
          {order.address ?? <span className="italic">not provided</span>}
        </p>
        <p>
          <span className="font-bold">Ordered:</span> {order.created_at}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block font-bold mb-1">State</label>
          <select
            value={form.data.state}
            onChange={(e) => form.setData('state', e.target.value)}
            className="w-full border-2 border-dark-brown bg-light-brown p-2 rounded-xs"
          >
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <p className="text-xs mt-1">
            Rejecting refunds the user's koi automatically (order drops from their balance calculation).
          </p>
        </div>

        <div>
          <label className="block font-bold mb-1">Admin Note</label>
          <textarea
            value={form.data.admin_note}
            onChange={(e) => form.setData('admin_note', e.target.value)}
            rows={3}
            placeholder="Tracking number, notes, etc."
            className="w-full border-2 border-dark-brown bg-light-brown p-2 rounded-xs"
          />
        </div>

        <button
          type="submit"
          disabled={form.processing}
          className="bg-brown border-2 border-dark-brown text-light-brown font-bold px-6 py-2 rounded-xs hover:opacity-80 disabled:opacity-50"
        >
          {form.processing ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
