import { useState } from 'react'
import { usePage, router } from '@inertiajs/react'
// @ts-expect-error useModalStack lacks type declarations in this beta package
import { useModalStack } from '@inertiaui/modal-react'
import type { SharedProps } from '@/types'
import { useClickOutside } from '@/hooks/useClickOutside'

type Props = {
  koiBalance: number
  avatar: string
  displayName: string
}

export default function Header({ koiBalance, avatar, displayName }: Props) {
  const shared = usePage<SharedProps>().props
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useClickOutside<HTMLDivElement>(() => setIsOpen(false))
  const { visitModal } = useModalStack()

  function signOut(e: React.MouseEvent) {
    e.preventDefault()
    router.delete(shared.sign_out_path)
  }

  return (
    <header className="flex justify-between relative items-start">
      <div ref={containerRef} className="flex items-start">
        <img
          src={avatar}
          alt={displayName}
          className="top-0 left-0 rounded-full aspect-square size-16 bg-dark-brown border-2 border-dark-brown w-fit z-12"
        />
        <div className="flex flex-col -ml-8">
          <button
            type="button"
            aria-expanded={isOpen}
            aria-haspopup="menu"
            onClick={() => setIsOpen(!isOpen)}
            className="h-16 bg-light-brown pl-10 pr-5 min-w-40 border-2 border-dark-brown text-dark-brown text-xl flex items-center rounded-r-full z-11 cursor-pointer"
          >
            <span className="-mt-0.5">{displayName}</span>
          </button>

          <div
            aria-hidden={!isOpen}
            className={`bg-dark-brown overflow-hidden transition-all duration-200 rounded-bl-2xl -mt-8 pt-8 ${
              isOpen ? 'max-h-24 rounded-br-4xl' : 'max-h-0 rounded-br-4xl'
            }`}
          >
            <button
              type="button"
              tabIndex={isOpen ? 0 : -1}
              onClick={signOut}
              className="text-light-brown w-full pl-10 pr-5 py-3 text-left text-lg hover:brightness-150 transition-all cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="flex space-x-8 items-center">
        <div className="flex items-center space-x-2">
          <img src="/koifish.webp" alt="koi" className="h-10" />
          <span className="text-coral text-4xl xl:text-5xl font-bold">{koiBalance}</span>
        </div>
        <button
          type="button"
          className="relative cursor-pointer"
          onClick={() => {
            if (shared.has_unread_mail) {
              new Audio('/sfx/youve-got-mail.mp3').play().catch(() => {})
            }
            visitModal('/mails')
          }}
        >
          <img src="/envelope.webp" alt="mail" className="h-10" />
          {shared.has_unread_mail && (
            <>
              <span className="absolute top-1 right-0 rounded-full size-3 bg-coral" />
              <span className="absolute top-1 right-0 rounded-full size-3 bg-coral animate-ping" />
            </>
          )}
        </button>
      </div>
    </header>
  )
}
