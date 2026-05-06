import { useForm, usePage } from '@inertiajs/react'
import { ArrowLeftIcon } from '@heroicons/react/20/solid'
import Frame from '@/components/shared/Frame'
import type { SharedProps } from '@/types'

type Rates = {
  koi_to_cents_numerator: number
  koi_to_cents_denominator: number
}

// Mirror HcbGrantSetting#koi_for_usd_cents (ceil) so the live preview matches what the
// model will charge on submit.
function koiForUsdCents(usdCents: number, rates: Rates): number {
  if (usdCents <= 0) return 0
  return Math.ceil((usdCents * rates.koi_to_cents_denominator) / rates.koi_to_cents_numerator)
}

export default function ProjectGrantsNew({ koi_balance, rates }: { koi_balance: number; rates: Rates }) {
  const { errors } = usePage<SharedProps>().props
  const form = useForm({ usd_dollars: '' })

  // User-facing input is integer dollars. Internally we still store cents in
  // `frozen_usd_cents`, but the form is restricted to whole dollars for simplicity.
  const dollars = parseInt(form.data.usd_dollars, 10)
  const dollarsValid = Number.isInteger(dollars) && dollars > 0
  const usdCents = dollarsValid ? dollars * 100 : 0
  const koiCost = dollarsValid ? koiForUsdCents(usdCents, rates) : 0
  const canAfford = koiCost > 0 && koi_balance >= koiCost
  const remaining = koi_balance - koiCost
  const isInteractive = dollarsValid && canAfford && !form.processing

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!dollarsValid) return
    form.transform((data) => ({ ...data, frozen_usd_cents: usdCents }))
    form.post('/project_grants')
  }

  return (
    <div className="w-screen min-h-screen overflow-x-hidden bg-light-blue flex items-center justify-center p-4 relative">
      {/* Ground */}
      <div className="absolute bottom-0 left-0 bg-light-green w-full h-[45%]" />

      {/* Clouds */}
      <div className="absolute top-0 left-0 right-0 overflow-hidden pointer-events-none h-[55%]">
        <img
          src="/clouds/4.webp"
          alt=""
          className="absolute bottom-0 left-0 h-20 md:h-36"
          style={{ transform: 'translateX(-33.333%)' }}
        />
        <img
          src="/clouds/1.webp"
          alt=""
          className="absolute bottom-0 left-40 h-20 md:h-32"
          style={{ transform: 'translateX(33.333%)' }}
        />
        <img
          src="/clouds/2.webp"
          alt=""
          className="absolute bottom-0 right-0 h-20 md:h-28"
          style={{ transform: 'translateX(-83.333%)' }}
        />
        <img
          src="/clouds/3.webp"
          alt=""
          className="absolute bottom-0 right-0 h-20 md:h-36"
          style={{ transform: 'translateX(33.333%)' }}
        />
      </div>

      {/* Grass */}
      <div className="absolute inset-0 pointer-events-none">
        <img src="/grass/1.svg" className="absolute bottom-[32%] left-[3%] z-1 w-8" />
        <img src="/grass/2.svg" className="absolute bottom-[22%] left-[12%] z-1 w-10" />
        <img src="/grass/3.svg" className="absolute bottom-[10%] left-[8%] z-1 w-9" />
        <img src="/grass/4.svg" className="absolute bottom-[28%] left-[28%] z-1 w-7" />
        <img src="/grass/5.svg" className="absolute bottom-[15%] left-[22%] z-1 w-8" />
        <img src="/grass/6.svg" className="absolute bottom-[8%] left-[35%] z-1 w-7" />
        <img src="/grass/7.svg" className="absolute bottom-[30%] left-[45%] z-1 w-8" />
        <img src="/grass/8.svg" className="absolute bottom-[18%] left-[50%] z-1 w-9" />
        <img src="/grass/10.svg" className="absolute bottom-[25%] right-[20%] z-1 w-8" />
        <img src="/grass/11.svg" className="absolute bottom-[12%] right-[12%] z-1 w-10" />
        <img src="/grass/1.svg" className="absolute bottom-[35%] right-[8%] z-1 w-7" />
        <img src="/grass/3.svg" className="absolute bottom-[6%] right-[3%] z-1 w-8" />
      </div>

      <Frame className="relative z-10 w-full max-w-xl lg:max-w-3xl">
        <div className="w-full rounded-sm p-2 md:p-6 lg:p-8">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-1 text-dark-brown text-sm mb-4 hover:underline cursor-pointer"
          >
            <ArrowLeftIcon className="w-4 h-4" /> Back
          </button>

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
            <div className="flex flex-col md:flex-row justify-between items-stretch gap-4 md:gap-8 w-full">
              <div className="flex flex-col flex-1 gap-4">
                <div>
                  <p className="font-bold text-xl sm:text-2xl text-dark-brown">Project funding</p>
                  <p className="text-dark-brown text-sm">
                    Convert koi for funding for your project as a HCB grant card.
                  </p>
                </div>

                <div>
                  <p className="block font-bold text-dark-brown mb-2 text-lg">How much do you need?</p>
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
              <div className="w-full md:w-40 md:h-40 bg-light-brown rounded-sm flex items-center justify-center p-4 shrink-0">
                <img src="/koi-gold.webp" alt="koi & gold coin" className="max-h-full max-w-full object-contain" />
              </div>
            </div>
          </div>

          <div className="mb-6 text-dark-brown">
            <div className="flex justify-between">
              <span>Balance</span>
              <span className="font-bold">{koi_balance} koi</span>
            </div>
            <div className="flex justify-between">
              <span>Cost{dollarsValid ? ` (for $${dollars})` : ''}</span>
              <span className="font-bold">{koiCost > 0 ? `-${koiCost} koi` : '— koi'}</span>
            </div>
            <div className="flex justify-between border-t-2 border-dark-brown pt-1 mt-2">
              <span className="font-bold">After request</span>
              <span className="font-bold">{koiCost > 0 ? `${remaining} koi` : `${koi_balance} koi`}</span>
            </div>
            {dollarsValid && !canAfford && (
              <p className="text-brown text-sm mt-2 font-bold">
                Not enough koi — you're short {koiCost - koi_balance}.
              </p>
            )}
          </div>

          <form onSubmit={submit}>
            <div className="flex md:gap-4">
              <div className={isInteractive ? 'continue-button-breathe' : 'inline-block'}>
                <button
                  type="submit"
                  disabled={!isInteractive}
                  className={`inline-flex min-w-44 items-center justify-center py-4 px-6 lg:min-w-52 lg:py-5 lg:px-14 bg-dark-brown text-light-brown rounded-xl font-bold text-xl lg:text-2xl border-dark-brown border-2 transform-gpu transition-all duration-200 ${
                    isInteractive
                      ? 'cursor-pointer hover:bg-brown hover:text-light-brown hover:scale-[1.02] focus:scale-100 active:scale-100'
                      : 'opacity-70 cursor-not-allowed'
                  }`}
                >
                  {form.processing ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
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
