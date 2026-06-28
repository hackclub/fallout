import { useState } from 'react'
import { router, usePage } from '@inertiajs/react'
import type { SharedProps } from '@/types'
import Frame from '@/components/shared/Frame'

const HOURS_GOAL = 60

export default function ClaimTicket({
  approved_hours,
  can_claim,
  identity_blocked,
  identity_state,
  claiming_disabled,
  already_claimed,
}: {
  approved_hours: number
  can_claim: boolean
  identity_blocked: boolean
  identity_state: string
  claiming_disabled: boolean
  already_claimed: boolean
}) {
  const { errors } = usePage<SharedProps>().props
  const [processing, setProcessing] = useState(false)

  function handleClaim() {
    setProcessing(true)
    router.post('/claim-ticket', {}, { onFinish: () => setProcessing(false) })
  }

  const alreadyClaimed = already_claimed

  return (
    <div className="w-screen min-h-screen overflow-x-hidden bg-light-blue flex items-center justify-center p-4 relative">
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
        <img src="/grass/9.svg" className="absolute bottom-[5%] left-[55%] z-1 w-7" />
        <img src="/grass/10.svg" className="absolute bottom-[25%] right-[20%] z-1 w-8" />
        <img src="/grass/11.svg" className="absolute bottom-[12%] right-[12%] z-1 w-10" />
        <img src="/grass/1.svg" className="absolute bottom-[35%] right-[8%] z-1 w-7" />
        <img src="/grass/3.svg" className="absolute bottom-[6%] right-[3%] z-1 w-8" />
        <img src="/grass/5.svg" className="absolute bottom-[20%] right-[30%] z-1 w-6 hidden lg:block" />
        <img src="/grass/7.svg" className="absolute bottom-[3%] left-[42%] z-1 w-7 hidden lg:block" />
      </div>

      <Frame className="relative z-10 w-full max-w-xl lg:max-w-3xl">
        <div className="w-full rounded-sm p-2 md:p-6 lg:p-8">
          {errors?.base && (
            <div className="border-2 border-dark-brown text-dark-brown p-4 mb-4 rounded-xs">
              <p>{Array.isArray(errors.base) ? errors.base[0] : errors.base}</p>
            </div>
          )}

          {/* Item card */}
          <div className="bg-beige rounded-sm p-2 lg:p-4 mb-6">
            <div className="px-4 sm:px-0 flex flex-col md:flex-row justify-between md:px-4 items-stretch gap-x-8 md:h-40 py-2 w-full">
              <div className="flex flex-col h-full">
                <div className="h-full flex md:flex-col justify-between">
                  <div>
                    <p className="font-bold text-xl sm:text-2xl text-dark-brown">Ticket to Fallout</p>
                    <p className="text-dark-brown py-1">Your invitation to the in-person Fallout event.</p>
                  </div>
                  <div className="mt-auto mb-2 flex px-2 py-1 gap-x-2 bg-brown h-fit w-fit px-3 rounded-sm">
                    <span className="text-lg font-bold text-beige">{HOURS_GOAL} hours</span>
                  </div>
                </div>
              </div>
              <div className="h-full w-auto bg-beige rounded-sm flex-shrink-0 mt-4 md:mt-0">
                <img
                  src="https://user-cdn.hackclub-assets.com/019d5ed7-69be-7db6-88f9-2062a45e4df1/ticket.webp"
                  alt="Fallout ticket"
                  className="h-36 md:h-full object-contain"
                />
              </div>
            </div>
          </div>

          {/* Hours summary */}
          <div className="mb-6 text-dark-brown">
            <div className="flex justify-between">
              <span>Your approved hours</span>
              <span className="font-bold">{approved_hours}h</span>
            </div>
            <div className="flex justify-between border-t-2 border-dark-brown pt-1 mt-2">
              <span className="font-bold">Required</span>
              <span className="font-bold">{HOURS_GOAL}h</span>
            </div>
          </div>

          {/* CTA */}
          <div className="flex md:gap-4 items-center">
            {alreadyClaimed ? (
              <div className="inline-flex min-w-44 items-center justify-center py-4 px-6 lg:px-10 lg:min-w-52 lg:py-5 bg-brown text-dark-brown rounded-xl font-bold text-xl lg:text-2xl border-dark-brown border-2 opacity-70 cursor-default select-none">
                Already claimed
              </div>
            ) : claiming_disabled ? (
              <div className="inline-flex min-w-44 items-center justify-center py-4 px-6 lg:px-10 lg:min-w-52 lg:py-5 bg-brown text-light-brown rounded-xl font-bold text-xl lg:text-2xl border-dark-brown border-2 cursor-not-allowed select-none text-center">
                Claiming closed
              </div>
            ) : identity_blocked ? (
              <div className="mt-auto w-full h-10 bg-brown border-2 border-dark-brown rounded-sm text-light-brown font-bold flex items-center justify-center cursor-not-allowed text-base px-2 text-center select-none">
                {identity_state === 'verified_no_address' ? 'Add address to claim' : 'Verify identity to claim'}
              </div>
            ) : (
              <div className={can_claim ? 'continue-button-breathe' : 'inline-block'}>
                <button
                  type="button"
                  disabled={!can_claim || processing}
                  onClick={handleClaim}
                  className={`inline-flex min-w-44 items-center justify-center py-4 px-6 lg:px-10 lg:min-w-52 lg:py-5 lg:px-14 bg-dark-brown text-light-brown rounded-xl font-bold text-xl lg:text-2xl border-dark-brown border-2 transform-gpu transition-all duration-200 tracking-widest ${can_claim && !processing ? 'cursor-pointer hover:bg-brown hover:text-light-brown hover:scale-[1.02] focus:scale-100 active:scale-100' : 'opacity-70 cursor-not-allowed'}`}
                >
                  {processing ? 'Claiming...' : 'CLAIM'}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => window.history.back()}
              className="cursor-pointer text-dark-brown font-bold px-6 py-2 rounded-sm hover:opacity-80 text-xl"
            >
              Cancel
            </button>
          </div>
        </div>
      </Frame>
    </div>
  )
}
