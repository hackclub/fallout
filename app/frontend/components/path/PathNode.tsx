import { useState, useEffect, useCallback, useContext } from 'react'
import { Link, usePage } from '@inertiajs/react'
// @ts-expect-error useModalStack lacks type declarations in this beta package
import { ModalLink, useModalStack } from '@inertiaui/modal-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/shared/Tooltip'
import { PathCenterContext } from '@/components/path/Path'
import { notify } from '@/lib/notifications'
import type { SharedProps } from '@/types'

const BILLBOARD_IMAGES = ['/path/1.webp', '/path/2.webp', '/path/3.webp']
const CRITTER_MARGIN_BOTTOM = ['mb-41', 'mb-40', 'mb-28']

export default function PathNode({
  index,
  interactive = true,
  hasProjects = false,
  journalEntryCount = 0,
  critterVariant,
  readDocsNudge = false,
}: {
  index: number
  interactive?: boolean
  hasProjects?: boolean
  journalEntryCount?: number
  critterVariant?: string
  readDocsNudge?: boolean
}) {
  const activeIndex = hasProjects ? journalEntryCount + 1 : 0
  const state: 'completed' | 'active' | 'locked' =
    index < activeIndex ? 'completed' : index === activeIndex ? 'active' : 'locked'

  const {
    auth: { user: authUser },
  } = usePage<SharedProps>().props
  const isTrial = authUser?.is_trial ?? false

  const pathCenterX = useContext(PathCenterContext)

  const { stack } = useModalStack()
  const modalOpen = stack.length > 0
  const [activeReady, setActiveReady] = useState(false)

  const snapPosition = useCallback(() => ({ x: pathCenterX, y: window.innerHeight - 40 }), [pathCenterX])

  // Delay showing active tooltip so it appears after modal fade-out
  useEffect(() => {
    if (state !== 'active' || index === 0) return
    const timer = setTimeout(() => setActiveReady(true), 500)
    return () => clearTimeout(timer)
  }, [state, index])

  const starImage = (
    <img
      src="/path/star.webp"
      fetchPriority="high"
      style={{ width: '100%', display: 'block', transform: 'translateY(20px)' }}
    />
  )

  const billboardImage = (
    <div className="relative">
      <img
        src={BILLBOARD_IMAGES[index % BILLBOARD_IMAGES.length]}
        fetchPriority="high"
        style={{
          width: '100%',
          display: 'block',
        }}
      />
      {critterVariant && state === 'completed' && (
        <img
          src={`/critters/${critterVariant}.webp`}
          alt={critterVariant}
          className={`absolute inset-0 m-auto ${CRITTER_MARGIN_BOTTOM[index % CRITTER_MARGIN_BOTTOM.length]} max-w-42`}
          style={{ imageRendering: 'pixelated' }}
        />
      )}
    </div>
  )

  const content = (
    <div style={{ pointerEvents: 'auto' }} className="cursor-pointer">
      {index === 0 ? (
        state === 'active' && interactive ? (
          <Link href="/projects/onboarding" className="outline-0">
            {starImage}
          </Link>
        ) : state === 'completed' && interactive ? (
          <button
            onClick={() =>
              notify(
                'alert',
                readDocsNudge
                  ? 'Check out the docs & resources (backpack icon to the left)'
                  : "You've finished this step! Want to create another project? Click the projects button in the left (Hint: Fish in a box)",
              )
            }
            className="outline-0"
          >
            {starImage}
          </button>
        ) : (
          starImage
        )
      ) : state === 'active' && interactive ? (
        isTrial || readDocsNudge ? (
          <button
            onClick={() =>
              notify(
                'alert',
                isTrial
                  ? 'You need to verify your account before continuing!'
                  : 'Check out the docs & resources (backpack icon to the left)',
              )
            }
            className="outline-0"
          >
            {billboardImage}
          </button>
        ) : (
          <ModalLink href="/journal_entries/new" className="outline-0">
            {billboardImage}
          </ModalLink>
        )
      ) : readDocsNudge && interactive ? (
        <button
          onClick={() => notify('alert', 'Check out the docs & resources (backpack icon to the left)')}
          className="outline-0"
        >
          {billboardImage}
        </button>
      ) : (
        billboardImage
      )}
    </div>
  )

  if (!interactive) return content

  if (state === 'active') {
    const tooltipText =
      readDocsNudge && index !== 0
        ? 'Locked'
        : index === 0
          ? 'Start here!'
          : journalEntryCount === 0
            ? 'Here next!'
            : 'Continue here!'
    const showAlways = readDocsNudge ? false : index === 0 ? !modalOpen : activeReady && !modalOpen
    return (
      <Tooltip side="top" gap={12} trackScroll alwaysShow={showAlways} snapWhenOffscreen={snapPosition}>
        <TooltipTrigger>{content}</TooltipTrigger>
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>
    )
  }

  if (state === 'completed') {
    return (
      <Tooltip side="top" gap={12} trackScroll>
        <TooltipTrigger>{content}</TooltipTrigger>
        <TooltipContent>Completed</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip side="top" gap={12} trackScroll>
      <TooltipTrigger>{content}</TooltipTrigger>
      <TooltipContent>Locked</TooltipContent>
    </Tooltip>
  )
}
