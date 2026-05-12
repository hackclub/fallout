import { useForm, usePage, Link } from '@inertiajs/react'
import { ArrowLeftIcon } from '@heroicons/react/20/solid'
import Frame from '@/components/shared/Frame'
import type { SharedProps } from '@/types'

type Props = {
  user_email: string
  card_last4: string | null
  card_purpose: string | null
}

export default function TopUpsNew({ user_email, card_last4, card_purpose }: Props) {
  const { errors } = usePage<SharedProps>().props
  const form = useForm({ usd_dollars: '' })

  const dollars = parseInt(form.data.usd_dollars, 10)
  const dollarsValid = Number.isInteger(dollars) && dollars > 0
  const usdCents = dollarsValid ? dollars * 100 : 0
  const isInteractive = dollarsValid && !form.processing

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!dollarsValid) return
    form.transform((data) => ({ ...data, amount_cents: usdCents }))
    form.post('/top_ups')
  }

  return (
    <div className="w-screen min-h-screen overflow-x-hidden bg-light-blue flex items-center justify-center p-4 relative">
      <div className="absolute bottom-0 left-0 bg-light-green w-full h-[45%]" />

      <Frame className="relative z-10 w-full max-w-xl lg:max-w-3xl">
        <div className="w-full rounded-sm p-2 md:p-6 lg:p-8">
          <Link
            href="/top_ups"
            className="inline-flex items-center gap-1 text-dark-brown text-sm mb-4 hover:underline cursor-pointer"
          >
            <ArrowLeftIcon className="w-4 h-4" /> Back
          </Link>

          {Object.keys(errors).length > 0 && (
            <div className="border-2 border-dark-brown text-dark-brown p-4 mb-4 rounded-xs">
              {Object.values(errors)
                .flat()
                .map((msg, i) => (
                  <p key={i}>{msg}</p>
                ))}
            </div>
          )}

          <div className="bg-beige rounded-sm p-4 lg:p-6 mb-6">
            <div className="flex flex-col gap-4">
              <div>
                <p className="font-bold text-xl sm:text-2xl text-dark-brown">Top up your card</p>
                <p className="text-dark-brown text-sm">
                  Donate to Fallout and we'll add the equivalent amount to your HCB grant card. This{' '}
                  <strong>doesn't</strong> count against your koi-funded project funding — it's your own money, on your
                  own card.
                </p>
              </div>

              {(card_last4 || card_purpose) && (
                <div className="text-dark-brown text-sm">
                  Destination card{card_purpose ? ` (${card_purpose})` : ''}
                  {card_last4 ? ` ending in ${card_last4}` : ''}.
                </div>
              )}

              <div>
                <p className="block font-bold text-dark-brown mb-2 text-lg">How much do you want to add?</p>
                <div className="flex items-center gap-2">
                  <span className="text-dark-brown text-2xl font-bold whitespace-nowrap">USD $</span>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={form.data.usd_dollars}
                    onChange={(e) => form.setData('usd_dollars', e.target.value.replace(/\D/g, ''))}
                    required
                    placeholder="50"
                    className="flex-1 min-w-0 border-2 border-beige focus:border-dark-brown transition-all text-dark-brown text-xl font-bold px-3 py-2 rounded-sm bg-light-brown focus:bg-white"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6 text-dark-brown text-sm space-y-2">
            <p>
              You'll be redirected to HCB to pay with a card on file for <span className="font-bold">{user_email}</span>
              . Funds land on your card once the payment captures (usually instantly; refunds before deposit are flagged
              for admin).
            </p>
            <p className="border-2 border-dark-brown p-3 rounded-xs">
              <span className="font-bold">Don't edit the donation message on HCB.</span> It contains a token we use to
              match the donation back to you. If you change it, the money won't reach your card automatically.
            </p>
          </div>

          <form onSubmit={submit}>
            <div className="flex md:gap-4">
              <button
                type="submit"
                disabled={!isInteractive}
                className={`inline-flex min-w-44 items-center justify-center py-4 px-6 lg:min-w-52 lg:py-5 lg:px-14 bg-dark-brown text-light-brown rounded-xl font-bold text-xl lg:text-2xl border-dark-brown border-2 transform-gpu transition-all duration-200 ${
                  isInteractive
                    ? 'cursor-pointer hover:bg-brown hover:text-light-brown hover:scale-[1.02] focus:scale-100 active:scale-100'
                    : 'opacity-70 cursor-not-allowed'
                }`}
              >
                {form.processing ? 'Submitting...' : dollarsValid ? `Donate $${dollars}` : 'Donate'}
              </button>
              <button
                type="button"
                onClick={() => window.history.back()}
                className="cursor-pointer text-dark-brown font-bold px-6 py-2 rounded-sm hover:opacity-80 text-xl"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </Frame>
    </div>
  )
}
