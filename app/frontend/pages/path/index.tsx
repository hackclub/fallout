import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Link, router, usePage } from '@inertiajs/react'
import type { SharedProps } from '@/types'
import { useModalStack, ModalLink } from '@inertiaui/modal-react'
import { motion, type Transition } from 'motion/react'
import Path from '@/components/path/Path'
import PathNode from '@/components/path/PathNode'
import SignUpCta from '@/components/path/SignUpCta'
import BgmPlayer from '@/components/path/BgmPlayer'
import Header from '@/components/path/Header'
import FlashMessages from '@/components/FlashMessages'
import { notify } from '@/lib/notifications'
import { consumePathEntryTransition } from '@/lib/pathTransition'
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

const PATH_ENTRY_HUD_DELAY_MS = 420
const PATH_ENTRY_NODES_DELAY_MS = 640
const PATH_ENTRY_FLASH_DELAY_MS = 1050
const PATH_ENTRY_FINISH_MS = 1800
const PATH_ENTRY_FADE_TRANSITION: Transition = {
  duration: 0.7,
  ease: [0.22, 1, 0.36, 1],
}

type PathIntroMode = 'regular' | 'onboarding'

type PendingPathModal = { kind: 'projects' } | { kind: 'journal'; projectId?: number }

type InitialPathEntryState = {
  introMode: PathIntroMode
  shouldAnimateIntro: boolean
  shouldCleanupQuery: boolean
  pendingModal: PendingPathModal | null
  readDocsNudge: boolean
}

function buildPathIntroState(active = false, mode: PathIntroMode = 'regular') {
  return {
    active,
    mode,
    sceneReady: !active,
    hudVisible: !active,
    nodesVisible: !active,
    flashVisible: !active,
  }
}

function buildPendingPathModal(open: string | null, projectId: string | null): PendingPathModal | null {
  if (open === 'projects') return { kind: 'projects' }
  if (open === 'journal') {
    const parsedProjectId = projectId ? Number(projectId) : NaN
    return {
      kind: 'journal',
      projectId: Number.isFinite(parsedProjectId) ? parsedProjectId : undefined,
    }
  }

  return null
}

function buildInitialPathEntryState(): InitialPathEntryState {
  if (typeof window === 'undefined') {
    return {
      introMode: 'regular',
      shouldAnimateIntro: false,
      shouldCleanupQuery: false,
      pendingModal: null,
      readDocsNudge: false,
    }
  }

  const transition = consumePathEntryTransition()
  const params = new URLSearchParams(window.location.search)
  const open = params.get('open')
  const projectId = params.get('project_id')
  const shouldNudgeDocsFromQuery = params.get('nudge') === 'read_docs'
  const modalFromQuery = buildPendingPathModal(open, projectId)
  const modalFromTransition =
    transition?.pendingModal === 'projects'
      ? ({ kind: 'projects' } satisfies PendingPathModal)
      : transition?.pendingModal === 'journal'
        ? ({ kind: 'journal', projectId: transition.projectId } satisfies PendingPathModal)
        : null

  return {
    introMode: transition?.introMode === 'onboarding' ? 'onboarding' : 'regular',
    shouldAnimateIntro: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    shouldCleanupQuery: open === 'journal' || open === 'projects' || shouldNudgeDocsFromQuery,
    pendingModal: modalFromTransition ?? modalFromQuery,
    readDocsNudge: transition?.readDocsNudge ?? shouldNudgeDocsFromQuery,
  }
}

export default function PathIndex() {
  const [initialPathEntry] = useState(buildInitialPathEntryState)
  const {
    user,
    has_projects,
    journal_entry_count,
    critter_variants,
    auth: { user: authUser },
    sign_in_path,
  } = usePage<PageProps & SharedProps>().props
  const [loggedIn] = useState(false)

  const { visitModal, stack } = useModalStack()

  const modalOpen = stack.length > 0

  const [readDocsNudge, setReadDocsNudge] = useState(initialPathEntry.readDocsNudge)
  const [docsNudgeReady, setDocsNudgeReady] = useState(false)
  const [introFinished, setIntroFinished] = useState(!initialPathEntry.shouldAnimateIntro)
  const [pendingModal, setPendingModal] = useState<PendingPathModal | null>(initialPathEntry.pendingModal)
  const prevHasProjects = useRef(has_projects)
  const [pathIntro, setPathIntro] = useState(() =>
    initialPathEntry.shouldAnimateIntro ? buildPathIntroState(true, initialPathEntry.introMode) : buildPathIntroState(),
  )
  const activePathNodeIndex = has_projects ? Math.min(journal_entry_count + 1, 59) : 0

  // Detect first project creation: has_projects flips false → true while modal is closing
  useEffect(() => {
    if (!prevHasProjects.current && has_projects) {
      setReadDocsNudge(true)
    }
    prevHasProjects.current = has_projects
  }, [has_projects])

  // Delay showing "Read this!" tooltip so it appears after modal fade-out
  useEffect(() => {
    if (!readDocsNudge) {
      setDocsNudgeReady(false)
      return
    }

    const timer = setTimeout(() => setDocsNudgeReady(true), 500)
    return () => clearTimeout(timer)
  }, [readDocsNudge])

  const pathNodes = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => (
        <PathNode
          key={i}
          index={i}
          interactive={!pathIntro.active}
          hasProjects={has_projects}
          journalEntryCount={journal_entry_count}
          critterVariant={i >= 1 ? (critter_variants[i - 1] ?? undefined) : undefined}
          readDocsNudge={readDocsNudge}
        />
      )),
    [has_projects, journal_entry_count, critter_variants, pathIntro.active, readDocsNudge],
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

  useLayoutEffect(() => {
    if (initialPathEntry.shouldCleanupQuery) {
      const params = new URLSearchParams(window.location.search)
      params.delete('open')
      params.delete('project_id')
      params.delete('nudge')
      const newUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname
      window.history.replaceState({}, '', newUrl)
    }

    if (!initialPathEntry.shouldAnimateIntro) {
      setPathIntro(buildPathIntroState())
      setIntroFinished(true)
      return
    }

    const previousOverflow = document.body.style.overflow
    const restoreOverflow = !loggedIn && window.innerWidth < 640 ? 'hidden' : previousOverflow
    const timers: number[] = []
    let firstFrame = 0
    let secondFrame = 0

    setIntroFinished(false)
    setPathIntro(buildPathIntroState(true, initialPathEntry.introMode))

    document.body.style.overflow = 'hidden'

    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        setPathIntro((current) => ({ ...current, sceneReady: true }))
      })
    })

    timers.push(
      window.setTimeout(() => setPathIntro((current) => ({ ...current, hudVisible: true })), PATH_ENTRY_HUD_DELAY_MS),
    )
    timers.push(
      window.setTimeout(
        () => setPathIntro((current) => ({ ...current, nodesVisible: true })),
        PATH_ENTRY_NODES_DELAY_MS,
      ),
    )
    timers.push(
      window.setTimeout(
        () => setPathIntro((current) => ({ ...current, flashVisible: true })),
        PATH_ENTRY_FLASH_DELAY_MS,
      ),
    )
    timers.push(
      window.setTimeout(() => {
        document.body.style.overflow = restoreOverflow
        setPathIntro(buildPathIntroState())
        setIntroFinished(true)
      }, PATH_ENTRY_FINISH_MS),
    )

    return () => {
      document.body.style.overflow = restoreOverflow
      timers.forEach(clearTimeout)
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [initialPathEntry.introMode, initialPathEntry.shouldAnimateIntro, initialPathEntry.shouldCleanupQuery, loggedIn])

  useEffect(() => {
    if (!introFinished || !pendingModal || stack.length > 0) return

    const modalUrl =
      pendingModal.kind === 'projects'
        ? '/projects'
        : pendingModal.projectId
          ? `/projects/${pendingModal.projectId}/journal_entries/new`
          : '/journal_entries/new'

    setPendingModal(null)
    void visitModal(modalUrl)
  }, [introFinished, pendingModal, stack.length, visitModal])

  function reloadPathProgress() {
    router.reload({ only: ['has_projects', 'journal_entry_count', 'critter_variants'] })
  }

  return (
    <>
      <motion.div
        initial={false}
        animate={{ opacity: pathIntro.flashVisible ? 1 : 0 }}
        transition={PATH_ENTRY_FADE_TRANSITION}
        className="relative z-30"
        style={{ pointerEvents: pathIntro.flashVisible ? 'auto' : 'none' }}
      >
        <FlashMessages />
      </motion.div>

      <motion.div
        initial={false}
        animate={{ opacity: pathIntro.hudVisible ? 1 : 0 }}
        transition={PATH_ENTRY_FADE_TRANSITION}
        className="fixed z-20 top-2 left-2 right-2 xs:p-6 flex flex-col gap-2"
        style={{ pointerEvents: pathIntro.hudVisible ? 'auto' : 'none' }}
      >
        <Header koiBalance={user.koi} avatar={user.avatar} displayName={user.display_name} />
      </motion.div>

      <motion.div
        initial={false}
        animate={{ opacity: pathIntro.hudVisible ? 1 : 0 }}
        transition={{ ...PATH_ENTRY_FADE_TRANSITION, delay: pathIntro.hudVisible ? 0.12 : 0 }}
        className="fixed h-full z-10 flex justify-end items-end p-8 w-full pointer-events-none"
      >
        <div className="flex flex-col items-center justify-center sm:justify-end w-full sm:w-fit h-fit space-y-6 pointer-events-auto">
          {authUser?.is_trial && <SignUpCta signInPath={sign_in_path} />}
          <div className="hidden xs:block">
            <BgmPlayer />
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={false}
        animate={{ opacity: pathIntro.hudVisible ? 1 : 0 }}
        transition={{ ...PATH_ENTRY_FADE_TRANSITION, delay: pathIntro.hudVisible ? 0.2 : 0 }}
        className="fixed z-10 flex flex-row xs:flex-col items-center xs:items-start space-y-4 bottom-2 left-2 xs:bottom-6 xs:left-6"
        style={{ pointerEvents: pathIntro.hudVisible ? 'auto' : 'none' }}
      >
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
            {has_projects ? (
              <ModalLink href="/projects" onProjectDeleted={reloadPathProgress} className="outline-0">
                <img src="/icon/project.webp" alt="Projects" className="cursor-pointer w-25" />
              </ModalLink>
            ) : (
              <button onClick={() => notify('alert', 'This is locked! Click on the star')}>
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
      </motion.div>

      <Path
        nodes={pathNodes}
        introTransition={{
          active: pathIntro.active,
          mode: pathIntro.mode,
          sceneReady: pathIntro.sceneReady,
          nodesVisible: pathIntro.nodesVisible,
          targetNodeIndex: activePathNodeIndex,
        }}
      />
    </>
  )
}

PathIndex.layout = (page: ReactNode) => page
