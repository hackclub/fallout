import { Link } from '@inertiajs/react'
import { ArrowLeftIcon } from '@heroicons/react/20/solid'
import Frame from '@/components/shared/Frame'

type Request = {
  id: number
  token: string
  amount_cents: number
  matched_at: string | null
  refunded_at: string | null
  donated_at: string | null
  created_at: string
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusFor(r: Request): { label: string; tone: 'pending' | 'stale' | 'loaded' | 'refunded' } {
  if (r.refunded_at) return { label: 'Refunded', tone: 'refunded' }
  if (r.matched_at) return { label: 'Loaded onto card', tone: 'loaded' }

  // r.created_at is ISO 8601; new Date(iso) parses with correct TZ semantics.
  const ageMs = Date.now() - new Date(r.created_at).getTime()
  if (Number.isFinite(ageMs) && ageMs > 24 * 60 * 60 * 1000) {
    return { label: 'Not received', tone: 'stale' }
  }
  return { label: 'Awaiting donation', tone: 'pending' }
}

const TONE_CLASSES: Record<'pending' | 'stale' | 'loaded' | 'refunded', string> = {
  pending: 'bg-brown text-light-brown',
  stale: 'bg-light-brown text-dark-brown',
  loaded: 'bg-dark-brown text-light-brown',
  refunded: 'bg-light-brown text-dark-brown',
}

export default function TopUpsIndex({ requests, has_active_card }: { requests: Request[]; has_active_card: boolean }) {
  return (
    <div className="w-screen min-h-screen bg-light-blue flex items-center justify-center p-4">
      <Frame className="relative z-10 w-full max-w-2xl">
        <div className="w-full p-2 md:p-6">
          <Link href="/path" className="inline-flex items-center gap-1 text-dark-brown text-sm mb-4 hover:underline">
            <ArrowLeftIcon className="w-4 h-4" /> Back to path
          </Link>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-dark-brown">Card top-ups</h1>
            <Link
              href="/top_ups/new"
              className="bg-dark-brown text-light-brown font-bold px-4 py-2 rounded-sm hover:opacity-90"
            >
              + New top-up
            </Link>
          </div>
          <p className="text-dark-brown mb-4 text-sm">
            Add your own money to your HCB grant card via a donation to Fallout. Doesn't count against your project
            funding.
          </p>

          {!has_active_card && (
            <div className="bg-light-brown text-dark-brown p-4 rounded-sm mb-4 text-sm">
              You don't have an active HCB grant card right now. Request project funding first.
            </div>
          )}

          {requests.length === 0 ? (
            <div className="bg-beige p-6 rounded-sm text-dark-brown text-center">
              You haven't created any top-ups yet.
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => {
                const status = statusFor(r)
                return (
                  <div key={r.id} className="bg-beige p-4 rounded-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-2xl font-bold text-dark-brown">{formatDollars(r.amount_cents)}</div>
                        <div className="text-sm text-dark-brown opacity-80">
                          {formatDate(r.created_at)} · token {r.token}
                        </div>
                      </div>
                      <div className={`text-sm font-bold px-3 py-1 rounded-sm ${TONE_CLASSES[status.tone]}`}>
                        {status.label}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Frame>
    </div>
  )
}
