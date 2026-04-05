import { Link, router } from '@inertiajs/react'

type Order = {
  id: number
  user: { id: number; display_name: string; email: string }
  shop_item: { id: number; name: string }
  frozen_price: number
  state: string
  created_at: string
}

const STATE_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  fulfilled: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  on_hold: 'bg-gray-100 text-gray-800',
}

export default function AdminShopOrdersIndex({
  orders,
  state_filter,
}: {
  orders: Order[]
  state_filter: string
  pagy: unknown
}) {
  function filterByState(state: string) {
    router.get('/admin/shop_orders', state ? { state } : {}, { preserveState: true })
  }

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-bold text-4xl text-dark-brown">Shop Orders</h1>
      </div>

      <div className="flex gap-2 mb-6">
        {['', 'pending', 'fulfilled', 'rejected', 'on_hold'].map((s) => (
          <button
            key={s}
            onClick={() => filterByState(s)}
            className={`px-3 py-1 border-2 border-dark-brown font-bold text-sm rounded-xs ${state_filter === s ? 'bg-dark-brown text-light-brown' : 'text-dark-brown hover:opacity-80'}`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      <table className="w-full text-dark-brown text-sm">
        <thead>
          <tr className="border-b-2 border-dark-brown text-left">
            <th className="pb-2 pr-4">User</th>
            <th className="pb-2 pr-4">Item</th>
            <th className="pb-2 pr-4">Price</th>
            <th className="pb-2 pr-4">State</th>
            <th className="pb-2 pr-4">Date</th>
            <th className="pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b border-brown">
              <td className="py-2 pr-4">
                <p className="font-bold">{order.user.display_name}</p>
                <p className="text-xs">{order.user.email}</p>
              </td>
              <td className="py-2 pr-4">{order.shop_item.name}</td>
              <td className="py-2 pr-4">{order.frozen_price} koi</td>
              <td className="py-2 pr-4">
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${STATE_COLORS[order.state] ?? ''}`}>
                  {order.state}
                </span>
              </td>
              <td className="py-2 pr-4">{order.created_at}</td>
              <td className="py-2">
                <Link href={`/admin/shop_orders/${order.id}`} className="font-bold underline hover:opacity-80">
                  Manage
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {orders.length === 0 && <p className="text-dark-brown mt-8 text-center">No orders found.</p>}
    </div>
  )
}
