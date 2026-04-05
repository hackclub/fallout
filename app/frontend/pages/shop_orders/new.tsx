import { useForm, usePage } from '@inertiajs/react'
import { useState } from 'react'
import type { SharedProps } from '@/types'
import Confetti from '@/components/shared/Confetti'

type ShopItem = { id: number; name: string; description: string; price: number; image_url: string }

export default function ShopOrderNew({
  shop_item,
  koi_balance,
  hca_addresses,
}: {
  shop_item: ShopItem
  koi_balance: number
  hca_addresses: string[]
}) {
  const { errors } = usePage<SharedProps>().props
  const form = useForm({ address_index: '0', quantity: '1', phone: '' })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [confetti, setConfetti] = useState(false)

  const maxQuantity = Math.floor(koi_balance / shop_item.price)
  const totalCost = shop_item.price * quantity
  const remaining = koi_balance - totalCost
  const hasAddresses = hca_addresses.length > 0

  function setQty(n: number) {
    const clamped = Math.max(1, Math.min(n, maxQuantity))
    setQuantity(clamped)
    form.setData('quantity', String(clamped))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setConfetti(true)
    form.post(`/shop/${shop_item.id}/orders`)
  }

  return (
    <>
      <Confetti active={confetti} />
      <div className="min-h-screen flex items-center justify-center p-4 bg-brown">
        <div className="w-full max-w-lg bg-light-brown border-2 border-dark-brown rounded-sm px-4 py-6 lg:p-8 shadow-md">
          <h1 className="font-bold text-4xl text-dark-brown mb-6">Purchase</h1>

          {Object.keys(errors).length > 0 && (
            <div className="border-2 border-dark-brown text-dark-brown p-4 mb-4 rounded-xs">
              {Object.values(errors)
                .flat()
                .map((msg, i) => (
                  <p key={i}>{msg}</p>
                ))}
            </div>
          )}

          <div className="border-2 border-dashed border-dark-brown bg-brown/40 rounded-xs p-4 mb-6 flex flex-col gap-4 items-center">
            <div className="flex justify-between w-full h-12 items-center">
              <div>
                <p className="font-bold text-2xl text-dark-brown">{shop_item.name}</p>
                <p className="text-dark-brown">{shop_item.description}</p>
              </div>
              <div className="flex items-center gap-1 h-full bg-light-brown px-4 rounded-sm">
                <span className="text-dark-brown text-2xl font-bold">{shop_item.price} </span>
                <img src="/koifish.webp" alt="koi" className="w-12 object-contain" />
              </div>
            </div>
            {shop_item.image_url && (
              <img src={shop_item.image_url} alt={shop_item.name} className="w-20 h-20 object-cover rounded-xs" />
            )}
          </div>

          <div className="mb-6">
            <p className="font-bold text-dark-brown mb-2">Quantity</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQty(quantity - 1)}
                disabled={quantity <= 1}
                className="w-8 h-8 border-2 border-dark-brown text-dark-brown font-bold rounded-xs hover:opacity-80 disabled:opacity-30"
              >
                −
              </button>
              <span className="font-bold text-dark-brown text-lg w-6 text-center">{quantity}</span>
              <button
                type="button"
                onClick={() => setQty(quantity + 1)}
                disabled={quantity >= maxQuantity}
                className="w-8 h-8 border-2 border-dark-brown text-dark-brown font-bold rounded-xs hover:opacity-80 disabled:opacity-30"
              >
                +
              </button>
              <span className="text-dark-brown text-sm">(max {maxQuantity})</span>
            </div>
          </div>

          <div className="space-y-2 mb-6 text-dark-brown">
            <div className="flex justify-between">
              <span>Your balance</span>
              <span className="font-bold">{koi_balance} koi</span>
            </div>
            <div className="flex justify-between">
              <span>Cost{quantity > 1 ? ` (${quantity} × ${shop_item.price})` : ''}</span>
              <span className="font-bold">-{totalCost} koi</span>
            </div>
            <div className="flex justify-between border-t-2 border-dark-brown pt-2">
              <span>After purchase</span>
              <span className="font-bold">{remaining} koi</span>
            </div>
          </div>

          <div className="mb-6">
            <p className="block font-bold text-dark-brown mb-1">Shipping address</p>
            {hasAddresses ? (
              <>
                <select
                  value={selectedIndex}
                  onChange={(e) => {
                    const i = Number(e.target.value)
                    setSelectedIndex(i)
                    form.setData('address_index', String(i))
                  }}
                  className="w-full border-2 border-dark-brown bg-light-brown text-dark-brown p-2 rounded-xs mb-2"
                >
                  {hca_addresses.map((addr, i) => (
                    <option key={i} value={i}>
                      {addr.split('\n')[0]}
                    </option>
                  ))}
                </select>
                <p className="text-dark-brown whitespace-pre-line text-sm border-2 border-dashed border-dark-brown bg-brown/40 p-2 rounded-xs">
                  {hca_addresses[selectedIndex]}
                </p>
              </>
            ) : (
              <p className="text-dark-brown">
                No addresses on file.{' '}
                <a
                  href="https://identity.hackclub.com/addresses"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-bold"
                >
                  Add one at identity.hackclub.com/addresses
                </a>{' '}
                first, then come back here.
              </p>
            )}
          </div>

          <div className="mb-6">
            <p className="block font-bold text-dark-brown mb-1">
              Phone number <span className="text-dark-brown font-normal text-sm">(for delivery)</span>
            </p>
            <input
              type="tel"
              required
              value={form.data.phone}
              onChange={(e) => form.setData('phone', e.target.value)}
              placeholder="+1 234 567 8900"
              className="w-full border-2 border-dark-brown bg-light-brown text-dark-brown p-2 rounded-xs"
            />
          </div>

          <form onSubmit={submit}>
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={form.processing || !hasAddresses || maxQuantity < 1 || !form.data.phone.trim()}
                className="cursor-pointer bg-brown border-2 border-dark-brown text-light-brown font-bold px-6 py-2 rounded-sm hover:opacity-80 disabled:opacity-50 text-xl"
              >
                {form.processing ? 'Placing order...' : 'Place Order'}
              </button>
              <button
                type="button"
                onClick={() => window.history.back()}
                className="cursor-pointerborder-2 border-dark-brown text-dark-brown font-bold px-6 py-2 rounded-sm hover:opacity-80 text-xl"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
