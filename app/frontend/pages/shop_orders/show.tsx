import { Link } from '@inertiajs/react'
import Confetti from '@/components/shared/Confetti'
import Frame from '@/components/shared/Frame'

type Order = {
  id: number
  frozen_price: number
  quantity: number
  created_at: string
}

type ShopItem = {
  id: number
  name: string
  image_url: string
  currency: 'koi' | 'gold' | 'hours'
}

export default function ShopOrderShow({
  shop_item,
  order,
  just_purchased,
}: {
  shop_item: ShopItem
  order: Order
  just_purchased?: boolean
}) {
  const confetti = !!just_purchased
  const currencyIcon =
    shop_item.currency === 'gold' ? '/gold.webp' : shop_item.currency === 'hours' ? '/frozen-fire.svg' : '/koifish.webp'
  const currencyLabel = shop_item.currency === 'gold' ? 'gold' : shop_item.currency === 'hours' ? 'hours' : 'koi'

  return (
    <>
      <Confetti active={confetti} />
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
          <img src="/grass/9.svg" className="absolute bottom-[5%] left-[55%] z-1 w-7" />
          <img src="/grass/10.svg" className="absolute bottom-[25%] right-[20%] z-1 w-8" />
          <img src="/grass/11.svg" className="absolute bottom-[12%] right-[12%] z-1 w-10" />
          <img src="/grass/1.svg" className="absolute bottom-[35%] right-[8%] z-1 w-7" />
          <img src="/grass/3.svg" className="absolute bottom-[6%] right-[3%] z-1 w-8" />
          <img src="/grass/5.svg" className="absolute bottom-[20%] right-[30%] z-1 w-6 hidden lg:block" />
          <img src="/grass/7.svg" className="absolute bottom-[3%] left-[42%] z-1 w-7 hidden lg:block" />
        </div>
        <Frame className="relative z-10 w-full max-w-xl">
          <div className="p-6 lg:p-8 shadow-md text-dark-brown ">
            <h1 className="font-bold text-4xl">You're all set!</h1>
            <p className="text-sm mb-6">Order updates will show up in your mail!</p>

            <div className="bg-beige rounded-sm p-4 flex flex-col gap-4 items-center">
              <div className="flex justify-between w-full p-2 items-stretch">
                <div className="flex flex-col">
                  <p className="text-sm font-bold tracking-wide ">Order placed</p>
                  <p className="font-bold text-2xl text-dark-brown">
                    {shop_item.name}
                    {order.quantity > 1 ? ` x${order.quantity}` : ''}
                  </p>
                </div>
                <div className="mt-auto flex items-center gap-x-2 bg-brown h-fit w-fit px-3 py-1 rounded-sm">
                  <img src={currencyIcon} alt={currencyLabel} className="w-10 object-contain" />
                  <span className="text-2xl font-bold text-beige mx-1">{order.frozen_price * order.quantity}</span>
                </div>
              </div>
            </div>
            <Link
              href="/path"
              className="mt-4 bg-brown border-2 border-dark-brown text-light-brown font-bold px-6 py-2 rounded-sm hover:opacity-80 inline-block text-xl"
            >
              Back to Path
            </Link>
          </div>
        </Frame>
      </div>
    </>
  )
}
