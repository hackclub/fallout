import { usePage, router } from '@inertiajs/react'
import type { SharedProps } from '@/types'

export default function ImpersonationBanner() {
  const { impersonation } = usePage<SharedProps>().props
  if (!impersonation) return null

  return (
    <div className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-3 px-4 py-2 bg-coral border-b-2 border-dark-brown text-beige font-medium text-sm shadow-sm">
      <span>Impersonating — viewing as another user (admin: {impersonation.impersonator_name}).</span>
      <button
        onClick={() => router.delete(impersonation.stop_path)}
        className="shrink-0 px-3 py-1 bg-beige text-dark-brown border-2 border-dark-brown font-semibold hover:bg-light-brown cursor-pointer"
      >
        Stop impersonating
      </button>
    </div>
  )
}
