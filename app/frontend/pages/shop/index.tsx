import { Modal } from '@inertiaui/modal-react'
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ArrowLeftIcon } from '@heroicons/react/20/solid'
import { Link } from '@inertiajs/react'
import Frame from '@/components/shared/Frame'
import { gsap } from 'gsap'
import { Flip } from 'gsap/Flip'

gsap.registerPlugin(Flip)

type ShopItem = {
  id: number
  name: string
  description: string
  price: number
  image_url: string
  status: 'available' | 'unavailable'
  featured: boolean
  ticket: boolean
}

export default function ShopIndex({
  is_modal,
  shop_items,
  koi_balance,
  user_hours,
  user_id,
}: {
  is_modal: boolean
  shop_items: ShopItem[]
  koi_balance: number
  user_hours: number
  user_id: number
}) {
  const modalRef = useRef<{ close: () => void }>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const defaultPinned = shop_items.filter((i) => i.ticket).map((i) => i.id)
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

  function togglePin(id: number) {
    setAnimatingId(id)
    setPinnedOrder((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      localStorage.setItem(storageKey, JSON.stringify(next))
      return next
    })
    setTimeout(() => {
      setAnimatingId(null)
      const items = Array.from(listRef.current?.querySelectorAll('li') ?? []) as HTMLElement[]
      items.forEach((el) => (el.style.transition = 'none'))
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
        onComplete: () => items.forEach((el) => (el.style.transition = '')),
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
    <div className="w-full mx-auto p-2 xs:p-4 md:p-8 h-full">
      <div className="flex flex-col items-start">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center">
            {is_modal && (
              <button
                onClick={() => modalRef.current?.close()}
                className="md:hidden cursor-pointer text-dark-brown hover:opacity-80 shrink-0"
                aria-label="Back"
              >
                <ArrowLeftIcon className="w-8 h-8" />
              </button>
            )}
            <h1 className="font-bold text-3xl md:text-4xl text-dark-brown">Shop</h1>
          </div>
          <div className="flex items-center gap-2 bg-brown p-[5px] rounded-md border-2 border-dark-brown">
            <div className="bg-dark-brown/60 p-1 rounded-xs">
              <img src="/koifish.webp" alt="koi" className="w-10 lg:w-14 object-contain" />
            </div>
            <span className="text-xl lg:text-3xl font-bold text-light-brown mx-1">{koi_balance}</span>
          </div>
        </div>
        <span className="text-base lg:text-lg max-w-xl leading-5 mt-4">
          Prizes unrelated to the inperson event will be available for purchase after the hackathon (July 7th)
        </span>
        <span className="text-sm mt-2 font-bold">Tip: Click on the star to pin an item!</span>
        <ul
          ref={listRef}
          className={`mt-6 mb-12 h-full w-full grid gap-4 grid-cols-1 xs:grid-cols-2 ${is_modal ? 'lg:grid-cols-3' : 'lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'}`}
        >
          {sortedItems.map((item) => {
            const isTicket = item.ticket
            const canAfford = isTicket ? user_hours >= item.price : koi_balance >= item.price
            const buyable = item.status === 'available' && canAfford
            const pinned = pinnedOrder.includes(item.id)
            const cardClass =
              item.status === 'unavailable'
                ? 'border-2 border-dashed border-dark-brown bg-brown/30'
                : 'border-2 border-dark-brown bg-brown/30'
            return (
              <li
                key={item.id}
                className={`${cardClass} relative h-full w-full rounded-md text-dark-brown p-4 flex flex-col gap-2 hover:-translate-y-1 hover:shadow-sm hover:z-[1] transition-all duration-200`}
              >
                <button
                  onClick={() => togglePin(item.id)}
                  className={`cursor-pointer absolute -top-2 -right-2 w-7 h-7 hover:scale-118 rounded-full border border-dark-brown flex items-center justify-center transition-all duration-200 ${animatingId === item.id ? 'scale-[1.35] rotate-180' : 'scale-100 rotate-0'} ${pinned ? (isTicket ? 'bg-blue' : 'bg-dark-yellow') : 'bg-beige'}`}
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
                <span className="text-2xl font-bold leading-6 text-dark-brown pb-1">{item.name}</span>

                <div className="w-full h-50 p-4 rounded-sm border-3 border-dark-brown bg-beige relative overflow-hidden flex items-center justify-center">
                  {item.image_url && (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-contain" />
                  )}
                </div>
                <div className="py-1 flex items-start justify-between gap-4">
                  <span className="leading-tight text-base">{item.description}</span>
                  {isTicket ? (
                    <span className="text-2xl font-bold text-dark-brown shrink-0">{item.price}h</span>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <img src="/koifish.webp" alt="koi" className="w-12 object-contain" />
                      <span className="text-2xl font-bold text-dark-brown">{item.price}</span>
                    </div>
                  )}
                </div>

                {isTicket ? (
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
                    className="mt-auto w-full h-10 bg-brown border-2 border-dark-brown rounded-sm text-light-brown font-bold flex items-center justify-center text-2xl"
                  >
                    Buy
                  </Link>
                ) : item.status === 'unavailable' ? (
                  <div className="mt-auto w-full h-10 bg-brown border-2 border-dark-brown rounded-sm text-light-brown font-bold flex items-center justify-center cursor-not-allowed text-2xl opacity-50">
                    Unavailable
                  </div>
                ) : (
                  <div className="mt-auto w-full h-10 bg-brown border-2 border-dark-brown rounded-sm text-light-brown font-bold flex items-center justify-center cursor-not-allowed text-xl">
                    Not enough Koi
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
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
      </Modal>
    )
  }

  return content
}
