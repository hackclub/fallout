import { useState, useRef, useEffect } from 'react'
import { useForm, usePage } from '@inertiajs/react'
import type { SharedProps } from '@/types'
import { ArrowLeftIcon } from '@heroicons/react/20/solid'
import Frame from '@/components/shared/Frame'

type ShopItem = {
  id: number
  name: string
  description: string
  price: number
  image_url: string
  currency: 'koi' | 'gold'
  requires_shipping: boolean
}

export default function ShopOrderNew({
  shop_item,
  koi_balance,
  gold_balance,
  hca_addresses,
}: {
  shop_item: ShopItem
  koi_balance: number
  gold_balance: number
  hca_addresses: string[]
}) {
  const { errors } = usePage<SharedProps>().props
  const form = useForm({ address_index: '0', quantity: '1', phone: '' })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const balance = shop_item.currency === 'gold' ? gold_balance : koi_balance
  const currencyLabel = shop_item.currency === 'gold' ? 'gold' : 'koi'
  const currencyIcon = shop_item.currency === 'gold' ? '/gold.webp' : '/koifish.webp'
  const maxQuantity = Math.floor(balance / shop_item.price)
  const totalCost = shop_item.price * quantity
  const remaining = balance - totalCost
  const hasAddresses = hca_addresses.length > 0
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  const phoneDigits = form.data.phone.replace(/\D/g, '')
  const phoneValid = phoneDigits.length >= 7 && phoneDigits.length <= 15
  const shippingReady = !shop_item.requires_shipping || (hasAddresses && phoneValid)
  const isInteractive = !form.processing && maxQuantity >= 1 && shippingReady

  function setQty(n: number) {
    const clamped = Math.max(1, Math.min(n, maxQuantity))
    setQuantity(clamped)
    form.setData('quantity', String(clamped))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    form.post(`/shop/${shop_item.id}/orders`)
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
        <img src="/grass/9.svg" className="absolute bottom-[5%] left-[55%] z-1 w-7" />
        <img src="/grass/10.svg" className="absolute bottom-[25%] right-[20%] z-1 w-8" />
        <img src="/grass/11.svg" className="absolute bottom-[12%] right-[12%] z-1 w-10" />
        <img src="/grass/1.svg" className="absolute bottom-[35%] right-[8%] z-1 w-7" />
        <img src="/grass/3.svg" className="absolute bottom-[6%] right-[3%] z-1 w-8" />
        <img src="/grass/5.svg" className="absolute bottom-[20%] right-[30%] z-1 w-6 hidden lg:block" />
        <img src="/grass/7.svg" className="absolute bottom-[3%] left-[42%] z-1 w-7 hidden lg:block" />
      </div>

      <Frame className="relative z-10 w-full max-w-xl lg:max-w-3xl ">
        <div className="w-full rounded-sm p-2 md:p-6 lg:p-8">
          {Object.keys(errors).length > 0 && (
            <div className="border-2 border-dark-brown text-dark-brown p-4 mb-4 rounded-xs">
              {Object.values(errors)
                .flat()
                .map((msg, i) => (
                  <p key={i}>{msg}</p>
                ))}
            </div>
          )}

          <div className="bg-beige rounded-sm p-2 lg:p-4 mb-6 flex flex-col gap-4 items-center">
            <div className="px-4 sm:px-0 flex flex-col md:flex-row justify-between md:px-4 items-stretch gap-x-8 md:h-40 py-2 w-full">
              <div className="flex flex-col h-full">
                <div className="h-full flex md:flex-col justify-between">
                  <div>
                    <p className="font-bold text-xl sm:text-2xl text-dark-brown">{shop_item.name}</p>
                    <p className="text-dark-brown">{shop_item.description}</p>
                  </div>
                  <div className="mt-auto mb-2 flex px-2 py-1 gap-x-2 bg-brown h-fit w-fit px-3 rounded-sm">
                    <img src={currencyIcon} alt={currencyLabel} className="text-xs w-10 object-contain" />
                    <span className="text-2xl font-bold text-beige mx-1">{shop_item.price} </span>
                  </div>
                </div>

                <div className="mt-auto flex items-center gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setQty(quantity - 1)}
                    disabled={quantity <= 1}
                    className="w-6 h-6 text-light-brown font-bold rounded-sm hover:opacity-80 disabled:opacity-30 bg-brown enabled:cursor-pointer"
                  >
                    −
                  </button>
                  <span className="font-bold text-dark-brown text-lg w-6 text-center">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQty(quantity + 1)}
                    disabled={quantity >= maxQuantity}
                    className="w-6 h-6 text-light-brown font-bold rounded-sm hover:opacity-80 disabled:opacity-30 bg-brown enabled:cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="h-full w-auto bg-beige rounded-sm">
                {shop_item.image_url && (
                  <img src={shop_item.image_url} alt={shop_item.name} className="h-full object-contain" />
                )}
              </div>
            </div>
          </div>
          <div className="mb-6 text-dark-brown">
            <div className="flex justify-between">
              <span>Balance</span>
              <span className="font-bold">
                {balance} {currencyLabel}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Cost{quantity > 1 ? ` (${quantity} × ${shop_item.price})` : ''}</span>
              <span className="font-bold">
                -{totalCost} {currencyLabel}
              </span>
            </div>
            <div className="flex justify-between border-t-2 border-dark-brown pt-1 mt-2 ">
              <span className="font-bold">After purchase</span>
              <span className="font-bold">
                {remaining} {currencyLabel}
              </span>
            </div>
          </div>

          {shop_item.requires_shipping && (
            <div className="w-full justify-between flex flex-col sm:flex-row gap-3 mb-6">
              <div className="w-full sm:w-[50%]">
                <p className="block font-bold text-dark-brown mb-1 text-lg">Shipping address</p>
                {hasAddresses ? (
                  <>
                    <div ref={dropdownRef} className="relative mb-2">
                      <button
                        type="button"
                        onClick={() => setDropdownOpen((o) => !o)}
                        className="w-full flex items-center justify-between text-light-brown border-dark-brown font-medium bg-brown px-3 py-2 text-lg rounded-sm cursor-pointer"
                      >
                        <span>{hca_addresses[selectedIndex].split('\n')[0]}</span>
                        <svg
                          className={`w-4 h-4 ml-2 shrink-0 transition-transform duration-150 ${dropdownOpen ? 'rotate-180' : ''}`}
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                      {dropdownOpen && (
                        <ul className="absolute z-20 w-full mt-2 bg-beige border-2 border-dark-brown rounded-sm shadow-md overflow-hidden">
                          {hca_addresses.map((addr, i) => (
                            <li
                              key={i}
                              onClick={() => {
                                setSelectedIndex(i)
                                form.setData('address_index', String(i))
                                setDropdownOpen(false)
                              }}
                              className={`p-2 px-3 cursor-pointer rounded-xs  ${i === selectedIndex ? 'font-bold bg-brown text-light-brown ' : 'text-dark-brown hover:bg-light-brown'}`}
                            >
                              {addr.split('\n')[0]}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <p className="bg-beige text-dark-brown whitespace-pre-line text-sm p-4 rounded-sm">
                      {hca_addresses[selectedIndex]}
                    </p>
                  </>
                ) : (
                  <p className="text-brown">
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

              <div className="w-full sm:w-[50%]">
                <p className="block font-bold text-lg text-dark-brown mb-1">
                  Phone number <span className="text-dark-brown font-normal text-sm">(for delivery)</span>
                </p>
                <input
                  type="tel"
                  required
                  value={form.data.phone}
                  onChange={(e) => form.setData('phone', e.target.value.replace(/[^\d+\-\s().]/g, ''))}
                  placeholder="+1 234 567 8900"
                  className="w-full border-2 border-beige focus:border-dark-brown transition-all text-dark-brown px-3 py-2 rounded-sm bg-beige focus:bg-white"
                />
                {form.data.phone.trim() && !phoneValid && (
                  <p className="text-brown text-sm mt-1">Enter a valid phone number (7–15 digits)</p>
                )}
              </div>
            </div>
          )}

          <form onSubmit={submit}>
            <div className="flex md:gap-4">
              <div className={isInteractive ? 'continue-button-breathe' : 'inline-block'}>
                <button
                  type="submit"
                  disabled={!isInteractive}
                  className={`inline-flex min-w-44 items-center justify-center py-4 px-6 lg:px-10 lg:min-w-52 lg:py-5 lg:px-14 bg-dark-brown text-light-brown rounded-xl font-bold text-xl lg:text-2xl border-dark-brown border-2 transform-gpu transition-all duration-200 ${isInteractive ? 'cursor-pointer hover:bg-brown hover:text-light-brown hover:scale-[1.02] focus:scale-100 active:scale-100' : 'opacity-70 cursor-not-allowed'}`}
                >
                  {form.processing ? 'Placing order...' : 'Place Order'}
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
