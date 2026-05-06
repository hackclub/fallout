import { useMemo, type ReactNode } from 'react'
import { usePage, router } from '@inertiajs/react'
import Frame from '@/components/shared/Frame'
import type { SharedProps, BanType } from '@/types'

const GRASS_IMAGES = Array.from({ length: 11 }, (_, i) => `/grass/${i + 1}.svg`)
const GRASS_COUNT = 30

const BAN_MESSAGES: Record<BanType, string> = {
  fallout: 'Your account has been suspended from Fallout.',
  hcb: 'Your account has been suspended due to misuse of funds.',
  hardware: 'Your account has been suspended due to a previous violation in another program.',
  age: 'Your account has been suspended because you do not meet the age requirements.',
  hackatime: 'Your account has been suspended due to fraudulent activity in Hackatime.',
}

const DEFAULT_MESSAGE = 'Your account has been suspended from Fallout.'

export default function BansShow() {
  const shared = usePage<SharedProps>().props
  const banType = shared.auth.user?.ban_type

  function signOut(e: React.MouseEvent) {
    e.preventDefault()
    router.delete(shared.sign_out_path)
  }

  return (
    <PageWrapper>
      <div className="flex flex-col items-center text-center p-6 max-w-sm">
        <h1 className="font-outfit font-bold text-3xl mb-2">Account Suspended</h1>
        <p className="text-brown mb-6">
          {banType ? BAN_MESSAGES[banType] : DEFAULT_MESSAGE} If you believe this is a mistake, please reach out to us
          at{' '}
          <a href="mailto:fallout@hackclub.com" className="underline font-bold">
            fallout@hackclub.com
          </a>
          .
        </p>
        <button
          onClick={signOut}
          className="py-1.5 px-4 bg-brown text-light-brown border-2 border-dark-brown font-bold uppercase"
        >
          Sign Out
        </button>
      </div>
    </PageWrapper>
  )
}

function PageWrapper({ children }: { children: ReactNode }) {
  const grassBlades = useMemo(
    () =>
      Array.from({ length: GRASS_COUNT }, (_, i) => ({
        id: i,
        src: GRASS_IMAGES[i % GRASS_IMAGES.length],
        left: Math.random() * 100,
        top: Math.random() * 100,
        scale: 0.4 + Math.random() * 0.4,
        rotation: (Math.random() - 0.5) * 30,
        flipX: Math.random() > 0.5,
      })),
    [],
  )

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed top-0 left-0 right-0 h-[40vh] bg-light-blue overflow-hidden">
        <img src="/clouds/4.webp" alt="" className="absolute bottom-0 left-0 h-full -translate-x-1/3" />
        <img src="/clouds/1.webp" alt="" className="absolute bottom-0 left-40 h-full translate-x-1/3" />
        <img src="/clouds/2.webp" alt="" className="absolute bottom-0 right-0 -translate-x-5/6 h-full" />
        <img src="/clouds/3.webp" alt="" className="absolute bottom-0 right-0 h-full translate-x-1/3" />
      </div>

      <div className="fixed top-[40vh] left-0 right-0 bottom-0 bg-light-green">
        {grassBlades.map((g) => (
          <img
            key={g.id}
            src={g.src}
            alt=""
            className="absolute pointer-events-none select-none"
            style={{
              left: `${g.left}%`,
              top: `${g.top}%`,
              width: 40,
              height: 60,
              transform: `translate(-50%, -50%) scale(${g.flipX ? -g.scale : g.scale}, ${g.scale}) rotate(${g.rotation}deg)`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4 text-dark-brown">
        <Frame showBorderOnMobile>{children}</Frame>
      </div>
    </div>
  )
}

BansShow.layout = (page: ReactNode) => page
