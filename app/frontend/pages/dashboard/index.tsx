import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import { ModalLink } from '@inertiaui/modal-react'
import Shop from '@/components/Shop'
import Projects from '@/components/Projects'
import Path from '@/components/dashboard/Path'
import SignUpCta from '@/components/dashboard/SignUpCta'
import Leaderboard from '@/components/dashboard/Leaderboard'
import Header from '@/components/dashboard/Header'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/shared/Tooltip'

type LeaderboardUser = {
  user: string
  hours: number
}

type PageProps = {
  user: {
    display_name: string
    email: string
    koi: number
    avatar: string
  }
}

export default function DashboardIndex() {
  const { user } = usePage<PageProps>().props
  const [mail] = useState<boolean>(true)
  const [notPressed] = useState<boolean>(true)
  const [loggedIn, setLoggedIn] = useState(false)
  const [users] = useState<LeaderboardUser[]>([
    { user: 'John Cena', hours: 100 },
    { user: 'Bobberson', hours: 45 },
    { user: 'randy', hours: 6 },
    { user: 'hi', hours: 2 },
    { user: 'bingbong', hours: 2 },
  ])
  const [shopOpen, setShopOpen] = useState<boolean>(false)

  useEffect(() => {
    const isMobile = window.innerWidth < 640
    if (!loggedIn && isMobile) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [loggedIn])

  return (
    <>
      <div className="fixed top-6 left-6 right-6 z-20">
        <Header koiBalance={user.koi} mail={mail} avatar={user.avatar} displayName={user.display_name} />
      </div>

      <div className="fixed top-6 bottom-6 right-6 z-10 flex items-center pt-[10%]">
        <div className="flex flex-col items-end space-y-6">
          <SignUpCta onSignUp={() => setLoggedIn(true)} />
          <Leaderboard users={users} />
        </div>
      </div>

      <div className="fixed bottom-6 left-6 flex flex-col items-start space-y-4 z-10">
        <button>
          <img src="/icon/guide.png" alt="Guide" className="w-25 cursor-pointer" />
        </button>
        <Tooltip>
          <TooltipTrigger>
            <ModalLink href="/projects">
              <img src="/icon/project.png" alt="Projects" className="w-25 cursor-pointer" />
            </ModalLink>
          </TooltipTrigger>
          <TooltipContent>Projects</TooltipContent>
        </Tooltip>
        <button>
          <img src="/icon/shop.png" alt="Shop" className="w-25 cursor-pointer" />
        </button>
        <button className="col-span-2 -mt-4">
          <img src="/icon/clearing.png" alt="Clearing" className="w-50 cursor-pointer" />
        </button>
      </div>

      <Path />
    </>
  )
}

DashboardIndex.layout = (page: ReactNode) => page
