import { useState, useEffect } from 'react'
import { usePage, router } from '@inertiajs/react'
import { useModalStack } from '@inertiaui/modal-react'
import type { SharedProps } from '@/types'
import { notify } from '@/lib/notifications'

type Props = {
  koiBalance: number
  goldBalance: number
  avatar: string
  displayName: string
}

export default function Header({ koiBalance, goldBalance, avatar, displayName }: Props) {
  const shared = usePage<SharedProps>().props
  const { visitModal } = useModalStack()
  const [showPfpPulse, setShowPfpPulse] = useState(() => {
    try {
      return !localStorage.getItem('pfp-editor-visited')
    } catch {
      return false
    }
  })

  useEffect(() => {
    function onVisited() {
      setShowPfpPulse(false)
    }
    window.addEventListener('pfp-editor-visited', onVisited)
    return () => window.removeEventListener('pfp-editor-visited', onVisited)
  }, [])

  function signOut(e: React.MouseEvent) {
    e.preventDefault()
    router.delete(shared.sign_out_path)
  }

  return (
    <header className="flex justify-between relative items-start">
      <div className="flex items-start">
        <div className="flex flex-col gap-2">
          <div className="relative w-fit cursor-pointer" onClick={() => visitModal('/profile')}>
            <img
              src={avatar}
              alt={displayName}
              className="rounded-lg aspect-square size-16 xs:size-20 bg-dark-brown border-2 border-dark-brown w-fit z-12"
            />
            {showPfpPulse && (
              <>
                <span className="absolute -top-1 -right-1 rounded-full size-4 bg-coral" />
                <span className="absolute -top-1 -right-1 rounded-full size-4 bg-coral animate-ping" />
              </>
            )}
          </div>
          <button
            type="button"
            className="relative w-fit cursor-pointer group"
            onClick={() => {
              if (shared.auth.user?.is_trial) {
                notify('alert', 'Please verify your account to access your mail.')
                return
              }
              if (shared.has_unread_mail) {
                new Audio('/sfx/youve-got-mail.mp3').play().catch(() => {})
              }
              visitModal('/mails')
            }}
          >
            <img src="/envelope.webp" alt="mail" className="h-12 sm:h-16" />
            {shared.has_unread_mail && (
              <>
                <span className="absolute top-0 right-0 rounded-full size-3 bg-coral" />
                <span className="absolute top-0 right-0 rounded-full size-3 bg-coral animate-ping" />
              </>
            )}
            <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-dark-brown px-2 py-1 text-xs text-light-brown opacity-0 transition-opacity group-hover:opacity-100">
              Mail
            </span>
          </button>
        </div>
      </div>

      <div className="flex flex-col-reverse xs:flex-row items-end space-x-2 sm:space-x-8 xs:items-center">
        <button
          type="button"
          onClick={() => visitModal('/streak_goal')}
          className="flex flex-row-reverse xs:flex-row items-center space-x-1 cursor-pointer group relative"
          aria-label="Streak"
        >
          <img src="/fire.svg" alt="streak" className="h-8 xl:h-10" />
          <span className="text-coral text-3xl xs:text-4xl xl:text-5xl font-bold">{shared.current_streak}</span>
          <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-dark-brown px-2 py-1 text-xs text-light-brown opacity-0 transition-opacity group-hover:opacity-100">
            Streak
          </span>
        </button>
        <button
          type="button"
          onClick={() => visitModal('/streak_goal')}
          className="flex flex-row-reverse xs:flex-row items-center space-x-1 cursor-pointer group relative"
          aria-label="Streak freezes"
        >
          <img src="/frozen-fire.svg" alt="streak freeze" className="h-8 xl:h-10" />
          <span className="text-ice-blue text-3xl xs:text-4xl xl:text-5xl font-bold">{shared.streak_freezes}</span>
          <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-dark-brown px-2 py-1 text-xs text-light-brown opacity-0 transition-opacity group-hover:opacity-100">
            Streak Freezes
          </span>
        </button>
        <div className="flex flex-row-reverse xs:flex-row items-center space-x-2 group relative">
          <img src="/koifish.webp" alt="koi" className="h-8 xs:h-10" />
          <span className="text-coral text-3xl xs:text-4xl xl:text-5xl font-bold">{koiBalance}</span>
          <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-dark-brown px-2 py-1 text-xs text-light-brown opacity-0 transition-opacity group-hover:opacity-100">
            Koi Balance
          </span>
        </div>
         <div className="flex flex-row-reverse xs:flex-row items-center space-x-2 group relative">
          <img src="/gold.webp" alt="gold" className="h-8 xs:h-10" />
          <span className="text-yellow-600 text-3xl xs:text-4xl xl:text-5xl font-bold">{goldBalance}</span>
          <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-dark-brown px-2 py-1 text-xs text-light-brown opacity-0 transition-opacity group-hover:opacity-100">
            Gold Balance
          </span>
        </div>
      </div>
    </header>
  )
}
