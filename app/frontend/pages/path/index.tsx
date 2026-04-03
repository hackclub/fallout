import { useState, useEffect, useRef, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Link, router, usePage } from '@inertiajs/react'
import type { SharedProps } from '@/types'
import { useModalStack, ModalLink } from '@inertiaui/modal-react'
import Shop from '@/components/Shop'
import Projects from '@/components/Projects'
import Path from '@/components/path/Path'
import PathNode from '@/components/path/PathNode'
import SignUpCta from '@/components/path/SignUpCta'
import Leaderboard from '@/components/path/Leaderboard'
import BgmPlayer from '@/components/path/BgmPlayer'
import Header from '@/components/path/Header'
import FlashMessages from '@/components/FlashMessages'
import { notify } from '@/lib/notifications'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/shared/Tooltip'

type PageProps = {
  user: {
    display_name: string
    email: string
    koi: number
    avatar: string
  }
  has_projects: boolean
  journal_entry_count: number
  critter_variants: (string | null)[]
}

export default function PathIndex() {
  const {
    user,
    has_projects,
    journal_entry_count,
    critter_variants,
    has_unread_mail,
    auth: { user: authUser },
    sign_in_path,
  } = usePage<PageProps & SharedProps>().props
  const [notPressed] = useState<boolean>(true)
  const [loggedIn] = useState(false)

  const { visitModal, stack } = useModalStack()

  const modalOpen = stack.length > 0

  const [readDocsNudge, setReadDocsNudge] = useState(false)
  const prevHasProjects = useRef(has_projects)

  // Detect first project creation: has_projects flips false → true while modal is closing
  useEffect(() => {
    if (!prevHasProjects.current && has_projects) {
      setReadDocsNudge(true)
    }
    prevHasProjects.current = has_projects
  }, [has_projects])

  // Delay showing "Read this!" tooltip so it appears after modal fade-out
  const [docsNudgeReady, setDocsNudgeReady] = useState(false)
  useEffect(() => {
    if (!readDocsNudge) return
    const timer = setTimeout(() => setDocsNudgeReady(true), 500)
    return () => clearTimeout(timer)
  }, [readDocsNudge])

  const [autoOpenModal, setAutoOpenModal] = useState(() => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    const open = params.get('open')
    return open === 'journal' || open === 'projects'
  })

  const pathNodes = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => (
        <PathNode
          key={i}
          index={i}
          hasProjects={has_projects}
          journalEntryCount={journal_entry_count}
          critterVariant={i >= 1 ? (critter_variants[i - 1] ?? undefined) : undefined}
          readDocsNudge={readDocsNudge}
        />
      )),
    [has_projects, journal_entry_count, critter_variants, readDocsNudge],
  )

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const open = params.get('open')
    const projectId = params.get('project_id')
    const shouldNudgeDocs = params.get('nudge') === 'read_docs'

    if (shouldNudgeDocs) {
      setReadDocsNudge(true)
    }

    if (open === 'journal' || open === 'projects' || shouldNudgeDocs) {
      params.delete('open')
      params.delete('project_id')
      params.delete('nudge')
      const newUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname
      window.history.replaceState({}, '', newUrl)
    }

    if (open === 'journal') {
      const modalUrl = projectId ? `/projects/${projectId}/journal_entries/new` : '/journal_entries/new'
      visitModal(modalUrl, { config: { duration: 0 } }).finally(() => setAutoOpenModal(false))
      return
    }

    if (open === 'projects') {
      visitModal('/projects').finally(() => setAutoOpenModal(false))
      return
    }

    setAutoOpenModal(false)
  }, [])

  function reloadPathProgress() {
    router.reload({ only: ['has_projects', 'journal_entry_count', 'critter_variants'] })
  }

  return (
    <>
      <FlashMessages />
      <div className="fixed z-20 top-2 left-2 right-2 xs:p-6 flex flex-col gap-2">
        <Header koiBalance={user.koi} avatar={user.avatar} displayName={user.display_name} />
      </div>

      <div className="fixed h-full z-10 flex justify-end items-end p-8 w-full pointer-events-none">
        <div className="flex flex-col items-center justify-center sm:justify-end w-full sm:w-fit h-fit space-y-6 pointer-events-auto ">
          {authUser?.is_trial && <SignUpCta signInPath={sign_in_path} />}
          {/* <Leaderboard /> */}
          <div className="hidden xs:block">
            <BgmPlayer />
          </div>
        </div>
      </div>

      <div className="fixed z-10 flex flex-row xs:flex-col items-center xs:items-start space-y-4 bottom-2 left-2 xs:bottom-6 xs:left-6">
        <Tooltip alwaysShow={docsNudgeReady && !modalOpen}>
          <TooltipTrigger>
            <Link href="/docs" onClick={() => setReadDocsNudge(false)}>
              <img src="/icon/guide.webp" alt="Guide" className="cursor-pointer w-20 xs:w-25" />
            </Link>
          </TooltipTrigger>
          <TooltipContent>{readDocsNudge ? 'Read this!' : 'Docs & Resources'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            {has_projects && !authUser?.is_trial ? (
              <ModalLink href="/projects" onProjectDeleted={reloadPathProgress} className="outline-0">
                <img src="/icon/project.webp" alt="Projects" className="cursor-pointer w-25" />
              </ModalLink>
            ) : (
              <button
                onClick={() =>
                  notify(
                    'alert',
                    has_projects
                      ? 'You need to verify your account before continuing!'
                      : 'This is locked! Click on the star',
                  )
                }
              >
                <img src="/icon/project.webp" alt="Projects" className="cursor-pointer w-25" />
              </button>
            )}
          </TooltipTrigger>
          <TooltipContent>Projects</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <button onClick={() => notify('alert', "The shop isn't open yet. Check back later!")}>
              <img src="/icon/shop.webp" alt="Shop" className="cursor-pointer w-20 xs:w-25" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Shop</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            {!authUser?.is_trial ? (
              <Link href="/clearing" className="col-span-2 -mt-4">
                <img src="/icon/clearing.webp" alt="Clearing" className="cursor-pointer w-20 xs:w-50" />
              </Link>
            ) : (
              <button
                className="col-span-2 -mt-4"
                onClick={() => notify('alert', 'You need to verify your account before continuing!')}
              >
                <img src="/icon/clearing.webp" alt="Clearing" className="cursor-pointer w-20 xs:w-50" />
              </button>
            )}
          </TooltipTrigger>
          <TooltipContent>Clearing</TooltipContent>
        </Tooltip>
      </div>

      <Path nodes={pathNodes} />

      {autoOpenModal && stack.length === 0 && <div className="fixed inset-0 z-30 bg-black/75" />}
    </>
  )
}

PathIndex.layout = (page: ReactNode) => page
