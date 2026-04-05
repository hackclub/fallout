import { useEffect, useState } from 'react'
import { Link } from '@inertiajs/react'
import Confetti from '@/components/shared/Confetti'

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
}

export default function ShopOrderShow({ shop_item, order }: { shop_item: ShopItem; order: Order }) {
  const [confetti, setConfetti] = useState(false)

  useEffect(() => {
    setConfetti(true)
  }, [])

  return (
    <>
      <Confetti active={confetti} />
      <div className="min-h-screen flex items-center justify-center p-4 bg-brown">
        <div className="w-full max-w-lg bg-light-brown border-2 border-dark-brown rounded-sm px-4 py-6 lg:p-8 shadow-md text-dark-brown">
          <h1 className="font-bold text-4xl mb-6">You're all set!</h1>

          <div className="border-2 border-dashed border-dark-brown bg-brown/40 rounded-xs p-4 mb-6 flex flex-col gap-4 items-center">
            <div className="flex justify-between w-full h-12 items-center">
              <div>
                <p className="text-sm font-bold tracking-wide ">Order placed</p>
                <p className="font-bold text-2xl text-dark-brown">
                  {shop_item.name}
                  {order.quantity > 1 ? ` x${order.quantity}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-1 h-full bg-light-brown px-4 rounded-sm">
                <span className="text-dark-brown text-2xl font-bold">{order.frozen_price * order.quantity}</span>
                <img src="/koifish.webp" alt="koi" className="w-12 object-contain" />
              </div>
            </div>
            {shop_item.image_url && (
              <img src={shop_item.image_url} alt={shop_item.name} className="w-20 h-20 object-cover rounded-xs" />
            )}
          </div>

          <p className="text-sm mb-6">We'll reach out with updates. In the meantime, keep building!</p>

          <Link
            href="/path"
            className="bg-brown border-2 border-dark-brown text-light-brown font-bold px-6 py-2 rounded-sm hover:opacity-80 inline-block text-xl"
          >
            Back to Path
          </Link>
        </div>
      </div>
    </>
  )
}
