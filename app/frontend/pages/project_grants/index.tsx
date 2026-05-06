import { Link } from '@inertiajs/react'
import { ArrowLeftIcon } from '@heroicons/react/20/solid'
import Frame from '@/components/shared/Frame'

type Order = {
  id: number
  frozen_usd_cents: number
  frozen_koi_amount: number
  state: 'pending' | 'fulfilled' | 'rejected' | 'on_hold'
  admin_note: string | null
  created_at: string
}

const STATE_LABEL: Record<Order['state'], string> = {
  pending: 'Awaiting review',
  fulfilled: 'Approved',
  rejected: 'Rejected',
  on_hold: 'On hold',
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export default function ProjectGrantsIndex({ orders, koi_balance }: { orders: Order[]; koi_balance: number }) {
  return (
    <div className="w-screen min-h-screen bg-light-blue flex items-center justify-center p-4">
      <Frame className="relative z-10 w-full max-w-2xl">
        <div className="w-full p-2 md:p-6">
          <Link href="/path" className="inline-flex items-center gap-1 text-dark-brown text-sm mb-4 hover:underline">
            <ArrowLeftIcon className="w-4 h-4" /> Back to path
          </Link>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-dark-brown">Project funding</h1>
            <Link
              href="/project_grants/new"
              className="bg-dark-brown text-light-brown font-bold px-4 py-2 rounded-sm hover:opacity-90"
            >
              + New request
            </Link>
          </div>
          <p className="text-dark-brown mb-4">
            Your koi balance: <span className="font-bold">{koi_balance}</span>
          </p>

          {orders.length === 0 ? (
            <div className="bg-beige p-6 rounded-sm text-dark-brown text-center">
              You haven't requested any project funding yet.
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => (
                <div key={o.id} className="bg-beige p-4 rounded-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-dark-brown">{formatDollars(o.frozen_usd_cents)}</div>
                      <div className="text-sm text-dark-brown opacity-80">
                        paid {o.frozen_koi_amount} koi · {o.created_at}
                      </div>
                    </div>
                    <div className="text-sm font-bold px-3 py-1 rounded-sm bg-brown text-light-brown">
                      {STATE_LABEL[o.state]}
                    </div>
                  </div>
                  {o.admin_note && <p className="mt-2 text-sm text-dark-brown italic">Admin note: {o.admin_note}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </Frame>
    </div>
  )
}
