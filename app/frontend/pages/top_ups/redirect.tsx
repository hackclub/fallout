import { useEffect } from 'react'
import Frame from '@/components/shared/Frame'

// Interstitial — bounces the user out to HCB's donation page. Routed via an
// Inertia render (not a 302) so we don't fight Inertia's XHR over cross-origin
// redirects. window.location.replace breaks out of the SPA entirely.
export default function TopUpsRedirect({ hcb_url }: { hcb_url: string }) {
  useEffect(() => {
    window.location.replace(hcb_url)
  }, [hcb_url])

  return (
    <div className="w-screen min-h-screen bg-light-blue flex items-center justify-center p-4">
      <Frame className="relative z-10 w-full max-w-md">
        <div className="w-full p-6 text-center">
          <p className="text-xl font-bold text-dark-brown mb-2">Redirecting you to HCB…</p>
          <p className="text-dark-brown text-sm mb-4">
            If nothing happens,{' '}
            <a href={hcb_url} className="underline font-bold">
              click here
            </a>
            .
          </p>
        </div>
      </Frame>
    </div>
  )
}
