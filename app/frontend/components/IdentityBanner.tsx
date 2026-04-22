import { usePage } from '@inertiajs/react'
import type { SharedProps } from '@/types'

export default function IdentityBanner() {
  const { identity_gate } = usePage<SharedProps>().props

  if (!identity_gate || identity_gate.state === 'verified_with_address') return null

  const { state, verify_url, address_url } = identity_gate

  const { message, href } = (() => {
    switch (state) {
      case 'unverified':
        return {
          message: 'Finish verifying & enter your address on auth.hackclub.com to claim grants & prizes',
          href: verify_url,
        }
      case 'pending':
        return {
          message: "Your verification is under review on auth.hackclub.com — you'll be able to claim grants & prizes once approved",
          href: verify_url,
        }
      case 'verified_no_address':
        return {
          message: 'Enter your address on auth.hackclub.com to claim grants & prizes',
          href: address_url,
        }
    }
  })()

  return (
    <div className="fixed top-2 inset-x-2 z-30 flex pointer-events-none">
      <a
        href={href}
        className="pointer-events-auto bg-brown text-beige py-2 px-3 lg:px-6 text-sm sm:text-lg w-full xs:w-fit mx-auto hover:bg-light-brown border border-dark-brown hover:border-2 rounded-xs hover:text-dark-brown transition-all text-center font-medium underline"
      >
        {message}
      </a>
    </div>
  )
}
