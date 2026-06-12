import { Link } from '@inertiajs/react'
import Frame from '@/components/shared/Frame'

type ShopItem = {
  id: number
  name: string
  image_url: string
  currency: 'koi' | 'gold' | 'hours'
}

type Order = {
  id: number
  state: 'pending' | 'fulfilled' | 'rejected' | 'on_hold'
  frozen_price: number
  quantity: number
  created_at: string
  shop_item: ShopItem
}

const STATE_STYLES: Record<Order['state'], string> = {
  pending: 'bg-brown text-light-brown',
  fulfilled: 'bg-dark-brown text-light-brown',
  rejected: 'bg-red text-light-brown',
  on_hold: 'bg-dark-yellow text-dark-brown',
}

const STATE_LABELS: Record<Order['state'], string> = {
  pending: 'Pending',
  fulfilled: 'Fulfilled',
  rejected: 'Rejected',
  on_hold: 'On hold',
}

export default function ShopOrdersIndex({ orders }: { orders: Order[] }) {
  return (
    <div className="w-screen min-h-screen overflow-x-hidden bg-light-blue flex items-start justify-center p-4 pt-8 relative">
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
        <img src="/grass/9.svg" className="absolute bottom-[5%] left-[55%] z-1 w-7" />
        <img src="/grass/10.svg" className="absolute bottom-[25%] right-[20%] z-1 w-8" />
        <img src="/grass/11.svg" className="absolute bottom-[12%] right-[12%] z-1 w-10" />
        <img src="/grass/1.svg" className="absolute bottom-[35%] right-[8%] z-1 w-7" />
        <img src="/grass/3.svg" className="absolute bottom-[6%] right-[3%] z-1 w-8" />
        <img src="/grass/5.svg" className="absolute bottom-[20%] right-[30%] z-1 w-6 hidden lg:block" />
        <img src="/grass/7.svg" className="absolute bottom-[3%] left-[42%] z-1 w-7 hidden lg:block" />
      </div>

      <Frame className="relative z-10 w-full max-w-xl">
        <div className="p-6 lg:p-8 text-dark-brown">
          <div className="flex items-center gap-4 mb-2">
            <Link href="/shop" className="text-brown hover:text-dark-brown font-bold text-sm">
              ← Back to Shop
            </Link>
          </div>

          <h1 className="font-bold text-4xl mb-6">My Orders</h1>

          {orders.length === 0 ? (
            <div className="bg-beige rounded-sm p-8 text-center">
              <p className="text-brown font-bold text-lg mb-3">No orders yet</p>
              <Link
                href="/shop"
                className="inline-block bg-brown border-2 border-dark-brown text-light-brown font-bold px-6 py-2 rounded-sm hover:opacity-80 text-xl"
              >
                Visit the Shop
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {orders.map((order) => {
                const currencyIcon =
                  order.shop_item.currency === 'gold'
                    ? '/gold.webp'
                    : order.shop_item.currency === 'hours'
                      ? '/frozen-fire.svg'
                      : '/koifish.webp'

                return (
                  <li key={order.id}>
                    <Link
                      href={`/shop/${order.shop_item.id}/orders/${order.id}`}
                      className="flex items-center gap-4 bg-beige rounded-sm p-4 hover:opacity-90 transition-opacity"
                    >
                      <div className="w-14 h-14 border-2 border-dark-brown bg-light-brown rounded-sm flex items-center justify-center shrink-0 overflow-hidden">
                        {order.shop_item.image_url ? (
                          <img
                            src={order.shop_item.image_url}
                            alt={order.shop_item.name}
                            className="w-full h-full object-contain p-1"
                          />
                        ) : (
                          <div className="w-full h-full bg-brown/30" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-dark-brown truncate">
                          {order.shop_item.name}
                          {order.quantity > 1 ? ` ×${order.quantity}` : ''}
                        </p>
                        <p className="text-sm text-brown">{order.created_at}</p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1 bg-brown px-3 py-1 rounded-sm">
                          <img src={currencyIcon} alt={order.shop_item.currency} className="w-7 object-contain" />
                          <span className="font-bold text-beige text-lg">{order.frozen_price * order.quantity}</span>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-sm ${STATE_STYLES[order.state]}`}>
                          {STATE_LABELS[order.state]}
                        </span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Frame>
    </div>
  )
}
