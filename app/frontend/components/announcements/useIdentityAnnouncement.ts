import { usePage } from '@inertiajs/react'
import type { SharedProps } from '@/types'
import type { Announcement } from './types'

export function useIdentityAnnouncement(): Announcement | null {
  const { identity_gate } = usePage<SharedProps>().props
  if (!identity_gate || identity_gate.state === 'verified_with_address') return null

  const { state, verify_url, address_url } = identity_gate
  const config = (() => {
    switch (state) {
      case 'unverified':
        return {
          message: 'Finish verifying & enter your address on auth.hackclub.com to claim grants & prizes',
          href: verify_url,
        }
      case 'pending':
        return {
          message:
            "Your verification is under review on auth.hackclub.com — you'll be able to claim grants & prizes once approved",
          href: verify_url,
        }
      case 'verified_no_address':
        return {
          message: 'Enter your address on auth.hackclub.com to claim grants & prizes',
          href: address_url,
        }
    }
  })()

  return {
    id: `identity:${state}`,
    kind: 'critical',
    message: config.message,
    href: config.href,
    dismissible: false,
  }
}
