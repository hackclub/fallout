import { useState, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import { Link } from '@inertiajs/react'
import type { SharedProps } from '@/types'
import { ModalLink } from '@inertiaui/modal-react'
import Shop from '@/components/Shop'
import Projects from '@/components/Projects'
import Path from '@/components/dashboard/Path'
import PathNode from '@/components/dashboard/PathNode'
import SignUpCta from '@/components/dashboard/SignUpCta'
import Leaderboard from '@/components/dashboard/Leaderboard'
import Header from '@/components/dashboard/Header'
import FlashMessages from '@/components/FlashMessages'
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
  const {
    user,
    auth: { user: authUser },
    sign_in_path,
  } = usePage<PageProps & SharedProps>().props
  const [mail] = useState<boolean>(true)
  const [notPressed] = useState<boolean>(true)
  const [loggedIn] = useState(false)
  const [users] = useState<LeaderboardUser[]>([
    { user: 'John Cena', hours: 100 },
    { user: 'Bobberson', hours: 45 },
    { user: 'randy', hours: 6 },
    { user: 'hi', hours: 2 },
    { user: 'bingbong', hours: 2 },
  ])
  const [shopOpen, setShopOpen] = useState<boolean>(false)

  const pathNodes = useMemo(() => Array.from({ length: 60 }, (_, i) => <PathNode key={i} index={i} />), [])

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
      <FlashMessages />
      <div className="fixed top-6 left-6 right-6 z-20">
        <Header koiBalance={user.koi} mail={mail} avatar={user.avatar} displayName={user.display_name} />
      </div>

      <div className="fixed top-6 bottom-6 right-6 z-10 flex items-end pt-[10%]">
        <div className="flex flex-col items-end space-y-6">
          {authUser?.is_trial && <SignUpCta signInPath={sign_in_path} />}
          <Leaderboard users={users} />
        </div>
      </div>

      <div className="fixed bottom-6 left-6 flex flex-col items-start space-y-4 z-10">
        <Tooltip>
          <TooltipTrigger>
            <Link href="/docs">
              <img src="/icon/guide.png" alt="Guide" className="w-25 cursor-pointer" />
            </Link>
          </TooltipTrigger>
          <TooltipContent>Guide</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <ModalLink href="/projects">
              <img src="/icon/project.png" alt="Projects" className="w-25 cursor-pointer" />
            </ModalLink>
          </TooltipTrigger>
          <TooltipContent>Projects</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <button>
              <img src="/icon/shop.png" alt="Shop" className="w-25 cursor-pointer" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Shop</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <button className="col-span-2 -mt-4">
              <img src="/icon/clearing.png" alt="Clearing" className="w-50 cursor-pointer" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Clearing</TooltipContent>
        </Tooltip>
      </div>

      <Path nodes={pathNodes} />
    </>
  )
}

DashboardIndex.layout = (page: ReactNode) => page
