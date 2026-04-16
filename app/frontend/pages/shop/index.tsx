import { Modal } from '@inertiaui/modal-react'
import { useRef, useState, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { ArrowLeftIcon } from '@heroicons/react/20/solid'
import { Link } from '@inertiajs/react'
import Frame from '@/components/shared/Frame'
import { gsap } from 'gsap'
import { Flip } from 'gsap/Flip'
import PathDialogOverlay from '@/components/path/PathDialogOverlay'
import type { DialogScript } from '@/components/path/PathDialogOverlay'

gsap.registerPlugin(Flip)

type ShopItem = {
  id: number
  name: string
  description: string
  price: number
  image_url: string
  status: 'available' | 'unavailable'
  featured: boolean
  currency: 'koi' | 'gold' | 'hours'
}

export default function ShopIndex({
  is_modal,
  shop_items,
  koi_balance,
  gold_balance,
  user_hours,
  user_id,
  pending_dialog,
}: {
  is_modal: boolean
  shop_items: ShopItem[]
  koi_balance: number
  gold_balance: number
  user_hours: number
  user_id: number
  pending_dialog: string | null
}) {
  const modalRef = useRef<{ close: () => void }>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const defaultPinned = shop_items.filter((i) => i.currency === 'hours').map((i) => i.id)
  const storageKey = `shop_pins_${user_id}`

  function loadPinned(): number[] {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) return JSON.parse(saved) as number[]
    } catch {}
    return defaultPinned
  }

  const [pinnedOrder, setPinnedOrder] = useState<number[]>(loadPinned)
  const [sortedPinnedOrder, setSortedPinnedOrder] = useState<number[]>(loadPinned)
  const [animatingId, setAnimatingId] = useState<number | null>(null)

  const [activeDialog, setActiveDialog] = useState<DialogScript | null>(null)
  const campaignTriggered = useRef(false)

  const shopIntroScript: DialogScript = {
    mascotSrc: '/onboarding/chinese_heidi.webp',
    speakerName: 'Soup',
    steps: [
      { text: 'Welcome to the Shop!' },
      { text: 'Just a reminder, your Koi is converted to Gold once you build your project!' },
      {
        segments: [
          'Most items can be purchased with Koi or Gold ',
          <div key="koi" className="inline-grid grid-cols-1 grid-rows-1 place-items-center align-middle mb-2">
            <img
              src="/gold.webp"
              alt="golden"
              className="col-start-1 row-start-1 text-xs w-14 mr-2 object-contain opacity-80 -rotate-10"
            />
            <img
              src="/koifish.webp"
              alt="koi"
              className="z-10 rotate-10 col-start-1 row-start-1 text-xs w-14 mx-1 object-contain"
            />
          </div>,
          ', but some are ',
          <img key="gold" src="/gold.webp" alt="gold" className="inline w-14 mb-2 h-auto object-contain mr-2 " />,
          'only.',
        ],
      },
      {
        segments: [
          'Pin your favorites with the ',
          <svg
            key="star"
            width="24"
            height="24"
            viewBox="0 0 19 19"
            xmlns="http://www.w3.org/2000/svg"
            className="inline fill-[#8A7B66] align-middle mb-2"
          >
            <path d="M11.7967 0.316774C12.4608 -0.388533 13.6394 0.167963 13.5167 1.12889L12.8879 6.05537C12.833 6.48511 13.0611 6.90129 13.4529 7.08626L17.9439 9.20671C18.8199 9.62031 18.6549 10.9132 17.7031 11.0935L12.8234 12.0178C12.3977 12.0984 12.0724 12.444 12.0175 12.8737L11.3887 17.8002C11.266 18.7611 9.98537 19.0037 9.51979 18.1542L7.13283 13.7989C6.92462 13.419 6.49545 13.2164 6.0698 13.297L1.19011 14.2213C0.238311 14.4016 -0.388126 13.2586 0.275927 12.5533L3.6804 8.93731C3.97737 8.62189 4.03746 8.15111 3.82925 7.7712L1.44229 3.41597C0.976711 2.56646 1.87019 1.61748 2.74618 2.03108L7.23721 4.15152C7.62897 4.33649 8.09527 4.24817 8.39224 3.93274L11.7967 0.316774Z" />
          </svg>,
          ' so they stay at the top!',
        ],
      },
      { text: 'BYEEE', last: true },
    ],
    onEnd: () => {
      fetch('/dialog_campaigns/shop_intro/mark_seen', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '',
        },
      })
    },
  }

  useEffect(() => {
    if (!pending_dialog || campaignTriggered.current) return
    campaignTriggered.current = true
    setActiveDialog(shopIntroScript)
  }, [pending_dialog])

  const tipKey = `shop_pin_tip_${user_id}`
  const [tipPhase, setTipPhase] = useState<'hint' | 'nice' | 'gone'>(() => {
    try {
      return localStorage.getItem(tipKey) ? 'gone' : 'hint'
    } catch {
      return 'hint'
    }
  })
  const [hoveredItemId, setHoveredItemId] = useState<number | null>(null)

  function togglePin(id: number) {
    if (tipPhase === 'hint') {
      setTipPhase('nice')
      setTimeout(() => {
        setTipPhase('gone')
        try {
          localStorage.setItem(tipKey, '1')
        } catch {}
      }, 1500)
    }
    setAnimatingId(id)
    setPinnedOrder((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      localStorage.setItem(storageKey, JSON.stringify(next))
      return next
    })
    setTimeout(() => {
      setAnimatingId(null)
      const items = Array.from(listRef.current?.querySelectorAll('li') ?? []) as HTMLElement[]
      items.forEach((el) => {
        el.style.transition = 'none'
        el.style.transform = 'none' // neutralize any active :hover transform before capture
      })
      const state = Flip.getState(items)
      const scrollEl = listRef.current?.closest('.overflow-y-auto') as HTMLElement | null
      const scrollTop = scrollEl?.scrollTop ?? 0
      const winScrollY = window.scrollY
      ;(document.activeElement as HTMLElement | null)?.blur()
      flushSync(() => {
        setSortedPinnedOrder((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
      })
      if (scrollEl) scrollEl.scrollTop = scrollTop
      window.scrollTo({ top: winScrollY, behavior: 'instant' })
      Flip.from(state, {
        duration: 0.45,
        ease: 'power2.inOut',
        onComplete: () =>
          items.forEach((el) => {
            el.style.transition = ''
            el.style.transform = '' // restore CSS control so :hover works correctly
          }),
      })
    }, 300)
  }

  const sortedItems = [...shop_items].sort((a, b) => {
    const aIdx = sortedPinnedOrder.indexOf(a.id)
    const bIdx = sortedPinnedOrder.indexOf(b.id)
    const aPinned = aIdx !== -1
    const bPinned = bIdx !== -1
    if (aPinned && bPinned) return aIdx - bIdx
    if (aPinned !== bPinned) return aPinned ? -1 : 1
    return 0
  })

  const content = (
    <div className="w-full mx-auto p-2 xs:p-4 md:p-8 h-full overflow-y-auto">
      <div className="flex flex-col items-start">
        <div className="grid grid-cols-3 w-full items-center justify-between">
          {is_modal && (
            <button
              onClick={() => modalRef.current?.close()}
              className="cursor-pointer text-dark-brown hover:opacity-80 shrink-0"
              aria-label="Back"
            >
              <ArrowLeftIcon className="w-8 h-8" />
            </button>
          )}
          <div className="flex items-center justify-center">
            <h1 className="font-bold whitespace-nowrap text-2xl sm:text-3xl md:text-4xl text-dark-brown">The Shop</h1>
          </div>
        </div>
        <div className="my-2 mx-auto text-sm sm:text-base text-brown text-center max-w-sm leading-tight">
          Prizes unrelated to the inperson event will be available for purchase after the hackathon (July 7th)
        </div>
        <div className="sticky top-0 md:-top-6 left-0 z-10 w-full flex justify-center py-2 border-dark-brown/20 -mx-2 xs:-mx-4 md:-mx-8 px-2 xs:px-4 md:px-8">
          <div className="border-2 border-dark-brown bg-brown rounded-md p-[6px]">
            <ul className="flex items-center justify-center px-2 gap-2 w-fit">
              <li className="rounded-sm flex">
                <img src="/koifish.webp" alt="koi" className="text-xs w-10 mx-1 object-contain" />
                <span className="text-2xl font-bold text-light-brown mx-1">{koi_balance}</span>
              </li>
              <li className="rounded-sm flex">
                <img src="/gold.webp" alt="golden" className="text-xs w-10 mx-1 object-contain" />
                <span className="text-2xl font-bold text-light-brown mx-1">{gold_balance}</span>
              </li>
            </ul>
          </div>
        </div>
        <ul
          ref={listRef}
          className={`mt-6 mb-12 w-full grid gap-4 grid-cols-1 sm:grid-cols-2 auto-rows-[380px] ${is_modal ? 'lg:grid-cols-3' : 'lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'}`}
        >
          {sortedItems.map((item) => {
            const isHours = item.currency === 'hours'
            const canAfford = isHours
              ? user_hours >= item.price
              : item.currency === 'gold'
                ? gold_balance >= item.price
                : koi_balance >= item.price
            const buyable = item.status === 'available' && canAfford
            const pinned = pinnedOrder.includes(item.id)
            const cardClass =
              item.status === 'unavailable'
                ? 'border-2 border-dashed border-dark-brown bg-brown/30'
                : 'border-2 border-dark-brown bg-brown/60'
            return (
              <li
                key={item.id}
                className={`${cardClass} relative h-[380px] w-full rounded-md text-dark-brown p-4 flex flex-col gap-2 hover:-translate-y-1 hover:shadow-sm hover:z-[1] transition-all duration-300  group`}
                onMouseEnter={(e) => {
                  setHoveredItemId(item.id)
                  const svg = e.currentTarget.querySelector('button svg')
                  if (svg)
                    gsap.fromTo(
                      svg,
                      { rotation: 0 },
                      { rotation: 360, duration: 0.5, ease: 'power2.out', transformOrigin: '50% 50%' },
                    )
                }}
                onMouseLeave={() => setHoveredItemId(null)}
              >
                <button
                  onClick={() => togglePin(item.id)}
                  className={`cursor-pointer absolute -top-2 -right-2 w-7 h-7 hover:scale-118 rounded-full border border-dark-brown flex items-center justify-center transition-all duration-200 ${animatingId === item.id ? 'scale-[1.35] rotate-180' : 'scale-100 rotate-0'} ${pinned ? (isHours ? 'bg-blue' : 'bg-dark-yellow') : 'bg-beige'}`}
                  aria-label={pinned ? 'Unpin' : 'Pin'}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 19 19"
                    xmlns="http://www.w3.org/2000/svg"
                    className={pinned ? 'fill-dark-brown' : 'fill-brown'}
                  >
                    <path d="M11.7967 0.316774C12.4608 -0.388533 13.6394 0.167963 13.5167 1.12889L12.8879 6.05537C12.833 6.48511 13.0611 6.90129 13.4529 7.08626L17.9439 9.20671C18.8199 9.62031 18.6549 10.9132 17.7031 11.0935L12.8234 12.0178C12.3977 12.0984 12.0724 12.444 12.0175 12.8737L11.3887 17.8002C11.266 18.7611 9.98537 19.0037 9.51979 18.1542L7.13283 13.7989C6.92462 13.419 6.49545 13.2164 6.0698 13.297L1.19011 14.2213C0.238311 14.4016 -0.388126 13.2586 0.275927 12.5533L3.6804 8.93731C3.97737 8.62189 4.03746 8.15111 3.82925 7.7712L1.44229 3.41597C0.976711 2.56646 1.87019 1.61748 2.74618 2.03108L7.23721 4.15152C7.62897 4.33649 8.09527 4.24817 8.39224 3.93274L11.7967 0.316774Z" />
                  </svg>
                </button>
                {tipPhase !== 'gone' && hoveredItemId === item.id && (
                  <div className="absolute -top-9 right-0 bg-dark-brown text-light-brown text-xs font-bold px-2 py-1 rounded-md whitespace-nowrap pointer-events-none">
                    {tipPhase === 'nice' ? 'Nice!' : 'Click the ★ to pin!'}
                    <div className="absolute top-full right-3 border-4 border-transparent border-t-dark-brown" />
                  </div>
                )}
                <span className="text-2xl font-bold leading-6 text-dark-brown pb-1 break-words min-w-0 line-clamp-2">
                  {item.name}
                </span>

                <div className="w-full h-50 p-4 rounded-sm border-3 border-dark-brown bg-beige relative overflow-hidden flex items-center justify-center">
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      loading="lazy"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                      className="group-hover:scale-105 transition-transform duration-300 w-full h-full object-contain"
                    />
                  )}
                </div>
                <div className="py-1 flex items-start justify-between gap-4">
                  <span className="leading-tight text-base min-w-0 break-words line-clamp-3">{item.description}</span>
                  {item.currency === 'hours' ? (
                    <span className="text-2xl font-bold text-dark-brown shrink-0">{item.price}h</span>
                  ) : item.currency === 'gold' ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <img src="/gold.webp" alt="gold" className="w-12 mx-1 object-contain" />
                      <span className="text-2xl font-bold text-dark-brown">{item.price}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <div className="grid grid-cols-1 grid-rows-1 place-items-center">
                        <img
                          src="/gold.webp"
                          alt="golden"
                          className="col-start-1 row-start-1 text-xs w-11 mr-2 object-contain opacity-60 -rotate-10"
                        />
                        <img
                          src="/koifish.webp"
                          alt="koi"
                          className="z-10 rotate-10 col-start-1 row-start-1 text-xs w-11 mx-1 object-contain"
                        />
                      </div>
                      <span className="text-2xl font-bold text-dark-brown">{item.price}</span>
                    </div>
                  )}
                </div>

                {isHours ? (
                  <div className="mt-auto w-full h-10 bg-brown border-2 border-dark-brown rounded-sm overflow-hidden relative">
                    <div
                      className="h-full bg-dark-brown transition-all duration-500"
                      style={{ width: `${Math.min((user_hours / item.price) * 100, 100)}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-light-brown font-bold text-2xl">
                      {user_hours}h / {item.price}h
                    </span>
                  </div>
                ) : buyable ? (
                  <Link
                    href={`/shop/${item.id}/orders/new`}
                    className="mt-auto w-full h-10 bg-dark-brown border-2 border-dark-brown rounded-sm text-light-brown font-bold flex items-center justify-center text-2xl active:scale-94 transition-transform"
                  >
                    Buy
                  </Link>
                ) : item.status === 'unavailable' ? (
                  <div className="mt-auto w-full h-10 bg-brown border-2 border-dark-brown rounded-sm text-light-brown font-bold flex items-center justify-center cursor-not-allowed text-2xl opacity-50">
                    Unavailable
                  </div>
                ) : (
                  <div className="mt-auto w-full h-10 bg-brown border-2 border-dark-brown rounded-sm text-light-brown font-bold flex items-center justify-center cursor-not-allowed text-xl">
                    Not enough {item.currency === 'gold' ? 'Gold' : 'Koi'}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        <p className="text-xs text-center text-brown w-full">
          Prices and availability can change without notice depending on availability
        </p>
        <p className="text-xs text-center text-brown w-full font-bold">
          Don't see what you're looking for? Suggest it in the Shop Items canvas!
        </p>
      </div>
    </div>
  )

  const dialog = activeDialog && (
    <PathDialogOverlay isOpen={!!activeDialog} onClose={() => setActiveDialog(null)} script={activeDialog} />
  )

  if (is_modal) {
    return (
      <Modal
        ref={modalRef}
        panelClasses="h-full max-h-none md:max-h-full max-md:w-full max-md:max-w-none max-md:bg-light-brown max-md:overflow-hidden"
        paddingClasses="p-0 md:max-w-5xl md:mx-auto"
        closeButton={false}
        maxWidth="7xl"
      >
        <Frame className="h-full">{content}</Frame>
        {dialog}
      </Modal>
    )
  }

  return (
    <>
      {content}
      {dialog}
    </>
  )
}
