import { Link } from '@inertiajs/react'
import { ArrowLeftIcon } from '@heroicons/react/20/solid'
import Frame from '@/components/shared/Frame'

export default function TopUpsNoCard() {
  return (
    <div className="w-screen min-h-screen bg-light-blue flex items-center justify-center p-4">
      <Frame className="relative z-10 w-full max-w-xl">
        <div className="w-full p-2 md:p-6 lg:p-8">
          <Link
            href="/top_ups"
            className="inline-flex items-center gap-1 text-dark-brown text-sm mb-4 hover:underline cursor-pointer"
          >
            <ArrowLeftIcon className="w-4 h-4" /> Back
          </Link>

          <div className="bg-beige rounded-sm p-6 mb-6">
            <p className="font-bold text-xl sm:text-2xl text-dark-brown mb-2">
              You don't have an active HCB grant card yet
            </p>
            <p className="text-dark-brown text-sm mb-4">
              Top-ups load money onto your existing HCB grant card. To get a card, request project funding with your koi
              first — once an admin fulfills your first request, you'll have an active card and can come back here to
              add more of your own money.
            </p>

            <Link
              href="/project_grants/new"
              className="inline-flex items-center justify-center bg-dark-brown text-light-brown font-bold px-6 py-3 rounded-sm hover:bg-brown"
            >
              Request project funding
            </Link>
          </div>
        </div>
      </Frame>
    </div>
  )
}
