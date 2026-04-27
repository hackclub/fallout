import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Link } from '@inertiajs/react'
import { Modal } from '@inertiaui/modal-react'
import { ArrowLeftIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { AnimatePresence, LayoutGroup, motion, type Transition } from 'motion/react'
import { DateTime } from 'luxon'
import MarqueeText from '@/components/shared/MarqueeText'
import { SlidingNumber } from '@/components/shared/SlidingNumber'
import TextMorph from '@/components/shared/TextMorph'
import EventCard from '@/components/bulletin_board/EventCard'
import ExploreCard from '@/components/bulletin_board/ExploreCard'
import Masonry from 'react-masonry-css'
import { computeBulletinEventStatus, type SerializedBulletinEvent } from '@/lib/bulletinEventStatus'
import { formatRelativeAgeLabel, relativeAgeParts, type RelativeAgeParts } from '@/lib/relativeAge'
import { useLiveReload } from '@/lib/useLiveReload'
import { useNowTick } from '@/lib/useNowTick'
import styles from './index.module.scss'

type SortOption = 'active' | 'newest'
type CategoryOption = 'projects' | 'journals'
const EXPLORE_FILTER_DEBOUNCE_MS = 300
const EXPLORE_PAGE_SIZE = 5
// Coalesces bursts of bulletin_explore broadcasts (e.g. a project discard cascading to its journals)
// so we issue at most one bucket refresh per ~half-second of activity.
const EXPLORE_LIVE_REFRESH_DEBOUNCE_MS = 500
// Server-side cap on /bulletin_board/search?limit=… is 50; mirror it client-side so a deeply
// scrolled user still gets the top slice refreshed without forcing the server to over-query.
const EXPLORE_LIVE_REFRESH_MAX_LIMIT = 50
const EXPLORE_LOAD_AHEAD_PX = 480
const EVENT_COUNT_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 34,
  mass: 0.35,
}
const EXPLORE_POSITION_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 34,
  mass: 0.4,
}
const EXPLORE_FADE_TRANSITION: Transition = {
  duration: 0.18,
  ease: 'easeOut',
}
const EXPLORE_CARD_TRANSITION = {
  layout: EXPLORE_POSITION_TRANSITION,
  opacity: EXPLORE_FADE_TRANSITION,
  y: EXPLORE_FADE_TRANSITION,
}

type Featured = { image: string; title: string; username: string }
type ExploreProject = {
  id: number
  type: 'project'
  username: string
  avatar_url: string | null
  created_at: string
  last_activity_at: string | null
  project_name: string
  image: string | null
  project_description: string
  latest_journal_excerpt: string | null
  latest_journal_date: string | null
  journal_entries_count: number
  tags: string[]
  href: string
}

type ExploreMedia =
  | { kind: 'image'; url: string }
  | { kind: 'video'; url: string; poster_url: string | null }
  | { kind: 'youtube'; thumbnail_url: string | null }

type ExploreJournal = {
  id: number
  type: 'journal'
  username: string
  avatar_url: string | null
  date: string
  project_name: string
  excerpt: string
  media: ExploreMedia | null
  tags: string[]
  href: string
}

type ExploreEntry = ExploreProject | ExploreJournal

type ExplorePayload = {
  category: CategoryOption
  entries: ExploreEntry[]
  next_cursor: string | null
  has_more: boolean
  sort: SortOption
  query: string
}

type ExploreInitialPayload = {
  default_category: CategoryOption
  default_project_sort: SortOption
  projects: ExplorePayload
  journals: ExplorePayload
}

type ExploreStats = {
  projects_count: number
  journals_count: number
  last_project_created_at: string | null
  last_journal_created_at: string | null
}

type PageProps = {
  events: SerializedBulletinEvent[]
  featured: Featured[]
  explore: ExploreInitialPayload
  explore_stats: ExploreStats
  is_modal: boolean
}

function exploreBucketKey(category: CategoryOption, sort: SortOption, query: string): string {
  return `${category}:${sort}:${query.trim()}`
}

function exploreEntryKey(entry: ExploreEntry): string {
  return `${entry.type}-${entry.id}`
}

function nearestScrollParent(element: HTMLElement | null): HTMLElement | Window {
  let parent = element?.parentElement ?? null

  while (parent) {
    if (parent === document.body || parent === document.documentElement || parent === document.scrollingElement) {
      return window
    }

    const style = window.getComputedStyle(parent)
    if (/(auto|scroll|overlay)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight) return parent
    parent = parent.parentElement
  }

  return window
}

function isWindowScrollParent(scrollParent: HTMLElement | Window): scrollParent is Window {
  return scrollParent === window
}

function isSentinelWithinLoadRange(sentinel: HTMLElement, scrollParent: HTMLElement | Window): boolean {
  const sentinelBounds = sentinel.getBoundingClientRect()
  const viewportBounds = isWindowScrollParent(scrollParent)
    ? { top: 0, bottom: window.innerHeight }
    : scrollParent.getBoundingClientRect()

  return (
    sentinelBounds.top <= viewportBounds.bottom + EXPLORE_LOAD_AHEAD_PX && sentinelBounds.bottom >= viewportBounds.top
  )
}

type ExplorePulseProps = {
  projectsCount: number
  journalsCount: number
  lastProjectAge: RelativeAgeParts | null
  lastJournalAge: RelativeAgeParts | null
  ariaLabel: string
}

function ExplorePulseTime({
  age,
  prefix,
  emptyLabel,
}: {
  age: RelativeAgeParts | null
  prefix: string
  emptyLabel: string
}) {
  const visiblePrefix = prefix.trimEnd()

  if (!age) {
    return (
      <motion.span layout className={styles.explorePulseTime} transition={EVENT_COUNT_TRANSITION}>
        <TextMorph as="span" transition={EVENT_COUNT_TRANSITION}>
          {emptyLabel}
        </TextMorph>
      </motion.span>
    )
  }

  if (age.kind === 'now') {
    return (
      <motion.span layout className={styles.explorePulseTime} transition={EVENT_COUNT_TRANSITION}>
        <TextMorph as="span" transition={EVENT_COUNT_TRANSITION}>
          {visiblePrefix}
        </TextMorph>
        <TextMorph as="span" transition={EVENT_COUNT_TRANSITION}>
          {age.label}
        </TextMorph>
      </motion.span>
    )
  }

  return (
    <motion.span layout className={styles.explorePulseTime} transition={EVENT_COUNT_TRANSITION}>
      <TextMorph as="span" transition={EVENT_COUNT_TRANSITION}>
        {visiblePrefix}
      </TextMorph>
      <SlidingNumber value={age.value} />
      <TextMorph as="span" transition={EVENT_COUNT_TRANSITION}>
        {`${age.unit} ago`}
      </TextMorph>
    </motion.span>
  )
}

// Memoized so the 1s clock tick in EventsSection does not re-render this subtree. The numeric
// portion (count, relative-time value) flows through SlidingNumber while surrounding labels
// morph with TextMorph.
const ExplorePulse = memo(function ExplorePulse({
  projectsCount,
  journalsCount,
  lastProjectAge,
  lastJournalAge,
  ariaLabel,
}: ExplorePulseProps) {
  return (
    <motion.div
      layout
      aria-label={ariaLabel}
      className={styles.explorePulse}
      initial={false}
      transition={EVENT_COUNT_TRANSITION}
    >
      <motion.div layout className={styles.explorePulseLine} transition={EVENT_COUNT_TRANSITION}>
        <motion.span
          layout
          className={styles.explorePulseSegment}
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={EVENT_COUNT_TRANSITION}
        >
          <SlidingNumber value={projectsCount} />
          <TextMorph as="span" transition={EVENT_COUNT_TRANSITION}>
            {projectsCount === 1 ? 'project pinned' : 'projects pinned'}
          </TextMorph>
        </motion.span>

        <motion.span layout className={styles.explorePulseSeparator} transition={EVENT_COUNT_TRANSITION}>
          •
        </motion.span>

        <motion.span
          layout
          className={styles.explorePulseSegment}
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={EVENT_COUNT_TRANSITION}
        >
          <SlidingNumber value={journalsCount} />
          <TextMorph as="span" transition={EVENT_COUNT_TRANSITION}>
            {journalsCount === 1 ? 'journal posted' : 'journals posted'}
          </TextMorph>
        </motion.span>
      </motion.div>

      <motion.div layout className={styles.explorePulseMetaLine} transition={EVENT_COUNT_TRANSITION}>
        <ExplorePulseTime age={lastProjectAge} prefix="Last project created: " emptyLabel="No projects pinned yet" />
        <motion.span layout className={styles.explorePulseSeparator} transition={EVENT_COUNT_TRANSITION}>
          •
        </motion.span>
        <ExplorePulseTime age={lastJournalAge} prefix="Last journal created: " emptyLabel="No journals posted yet" />
      </motion.div>
    </motion.div>
  )
})

type EventsSectionProps = {
  events: SerializedBulletinEvent[]
}

const EVENTS_PAGE_SIZE = 3

// Owns the 1s clock tick (`useNowTick(1000)`) and the events live-reload subscription so that
// event-status recomputation does not re-render the whole bulletin-board page every second.
// Memoized: parent only feeds primitive-stable `events` from Inertia props.
const EventsSection = memo(function EventsSection({ events }: EventsSectionProps) {
  const liveEventProps = useLiveReload<Pick<PageProps, 'events'>>({ stream: 'bulletin_events', only: ['events'] })
  const now = useNowTick(1000)
  const liveEvents = liveEventProps?.events ?? events

  const eventCounts = useMemo(
    () =>
      liveEvents.reduce(
        (counts, event) => {
          const status = computeBulletinEventStatus(event, now)
          if (status === 'happening') counts.happening += 1
          if (status === 'upcoming') counts.upcoming += 1
          return counts
        },
        { happening: 0, upcoming: 0 },
      ),
    [liveEvents, now],
  )
  const hasEventCounts = eventCounts.happening > 0 || eventCounts.upcoming > 0
  const [displayedEventCounts, setDisplayedEventCounts] = useState(eventCounts)

  useEffect(() => {
    if (!hasEventCounts) return

    setDisplayedEventCounts((counts) =>
      counts.happening === eventCounts.happening && counts.upcoming === eventCounts.upcoming ? counts : eventCounts,
    )
  }, [eventCounts, hasEventCounts])

  // Happening events first (scheduled-end sorted by end time asc, manual live sorted
  // by start time asc so longer-running comes first); then upcoming sorted by start time asc.
  const visibleEvents = useMemo(() => {
    const ms = (iso: string | null) => (iso ? DateTime.fromISO(iso).toMillis() : Infinity)
    const bucket = (e: SerializedBulletinEvent) => {
      const status = computeBulletinEventStatus(e, now)
      if (status !== 'happening') return 2
      return e.ends_at ? 0 : 1
    }
    const sortKey = (e: SerializedBulletinEvent, b: number) => (b === 0 ? ms(e.ends_at) : ms(e.starts_at))
    return liveEvents
      .filter((e) => {
        const status = computeBulletinEventStatus(e, now)
        return status === 'upcoming' || status === 'happening'
      })
      .sort((a, b) => {
        const ba = bucket(a)
        const bb = bucket(b)
        if (ba !== bb) return ba - bb
        return sortKey(a, ba) - sortKey(b, bb)
      })
  }, [liveEvents, now])

  const [page, setPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(visibleEvents.length / EVENTS_PAGE_SIZE))
  const effectivePage = Math.min(page, totalPages - 1)
  useEffect(() => {
    if (page !== effectivePage) setPage(effectivePage)
  }, [effectivePage, page])
  const pageEvents = visibleEvents.slice(effectivePage * EVENTS_PAGE_SIZE, (effectivePage + 1) * EVENTS_PAGE_SIZE)

  const eventCountLabel = [
    eventCounts.happening > 0
      ? `${eventCounts.happening} ${eventCounts.happening === 1 ? 'event' : 'events'} happening now`
      : null,
    eventCounts.upcoming > 0
      ? `${eventCounts.upcoming} upcoming ${eventCounts.upcoming === 1 ? 'event' : 'events'}`
      : null,
  ]
    .filter(Boolean)
    .join(' • ')

  return (
    <motion.section layout className={styles.section}>
      <motion.div layout className={styles.eventsHeader}>
        <h2 className={styles.sectionHeading}>Events</h2>

        <motion.div
          layout
          aria-hidden={!hasEventCounts}
          aria-label={hasEventCounts ? eventCountLabel : undefined}
          className={styles.eventCountLine}
          initial={false}
          animate={{ opacity: hasEventCounts ? 1 : 0, y: hasEventCounts ? 0 : -4 }}
          transition={EVENT_COUNT_TRANSITION}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {displayedEventCounts.happening > 0 && (
              <motion.span
                key="happening"
                layout
                className={styles.eventCountSegment}
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={EVENT_COUNT_TRANSITION}
              >
                <TextMorph as="span" transition={EVENT_COUNT_TRANSITION}>
                  {`${displayedEventCounts.happening} ${displayedEventCounts.happening === 1 ? 'event happening now' : 'events happening now'}`}
                </TextMorph>
              </motion.span>
            )}
            {displayedEventCounts.happening > 0 && displayedEventCounts.upcoming > 0 && (
              <motion.span
                key="separator"
                layout
                className={styles.eventCountSeparator}
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={EVENT_COUNT_TRANSITION}
              >
                •
              </motion.span>
            )}
            {displayedEventCounts.upcoming > 0 && (
              <motion.span
                key="upcoming"
                layout
                className={styles.eventCountSegment}
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={EVENT_COUNT_TRANSITION}
              >
                <TextMorph as="span" transition={EVENT_COUNT_TRANSITION}>
                  {`${displayedEventCounts.upcoming} ${displayedEventCounts.upcoming === 1 ? 'upcoming event' : 'upcoming events'}`}
                </TextMorph>
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      <motion.div layout className={styles.eventsArea}>
        <AnimatePresence initial={false} mode="popLayout">
          {visibleEvents.length === 0 ? (
            <motion.div
              key="empty"
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className={styles.eventsEmpty}
            >
              no events yet
            </motion.div>
          ) : (
            <motion.div
              key="events"
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className={styles.eventsStack}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={effectivePage}
                  className={styles.eventsGrid}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: 'easeInOut' }}
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    {pageEvents.map((event) => (
                      <EventCard key={event.id} event={event} now={now} />
                    ))}
                  </AnimatePresence>
                </motion.div>
              </AnimatePresence>

              <motion.div layout className={styles.eventsFooter}>
                <span className={styles.tzNote}>times shown in your local timezone</span>
                <div className={styles.pagination}>
                  <button
                    type="button"
                    className={styles.pageButton}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={effectivePage === 0 || totalPages <= 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className={styles.pageArrow} />
                  </button>
                  <span className={styles.pageInfo} aria-live="polite">
                    <TextMorph as="span">{(effectivePage + 1).toString()}</TextMorph>
                    <span className={styles.pageInfoSep}>/</span>
                    <TextMorph as="span">{totalPages.toString()}</TextMorph>
                  </span>
                  <button
                    type="button"
                    className={styles.pageButton}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={effectivePage >= totalPages - 1 || totalPages <= 1}
                    aria-label="Next page"
                  >
                    <ChevronRight className={styles.pageArrow} />
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <motion.div layout className={styles.dmNotice}>
        want to run one? DM
        <a
          href="https://hackclub.enterprise.slack.com/team/U08R4Q9H8EB"
          className={styles.dmNoticeLink}
          target="_blank"
          rel="noopener noreferrer"
        >
          @tanishq!
        </a>
      </motion.div>
    </motion.section>
  )
})

type FeaturedSectionProps = {
  featured: Featured[]
  onImageOpen: (image: string) => void
}

// Memoized so parent state changes (lightbox open/close, live-reload broadcasts) don't re-run
// motion.section layout measurements or MarqueeText ResizeObservers. `featured` comes from a
// static controller payload and `onImageOpen` is a stable useState setter, so memo's default
// referential check is sufficient.
const FeaturedSection = memo(function FeaturedSection({ featured, onImageOpen }: FeaturedSectionProps) {
  return (
    <motion.section layout className={styles.section}>
      <h2 className={styles.sectionHeading}>Featured</h2>
      <div className={styles.featuredGrid}>
        {featured.length === 0 ? (
          <div className={styles.emptyState}>nothing shipped yet — ship something cool!</div>
        ) : (
          featured.map((item) => (
            <div key={item.image} className={styles.featuredCard}>
              <button
                type="button"
                className={styles.featuredImageButton}
                onClick={() => onImageOpen(item.image)}
                aria-label={`View ${item.title} full size`}
              >
                <img src={item.image} alt={item.title} className={styles.featuredImage} loading="lazy" />
              </button>
              <div className={styles.featuredMeta}>
                <div className={styles.featuredText}>
                  <MarqueeText text={item.title} className={styles.featuredTitle} />
                  <MarqueeText text={`by ${item.username}`} className={styles.featuredUsername} />
                </div>
                <div className={styles.featuredIcons}>
                  <img src="/logos/github-black.svg" alt="GitHub Logo" className={styles.featuredIcon} />
                  <img src="/logos/slack.svg" alt="Slack Logo" className={styles.featuredIcon} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className={styles.dmNotice}>
        want more? check out projects from
        <a
          href="https://blueprint.hackclub.com/explore?sort=top&type=projects"
          className={styles.dmNoticeLink}
          target="_blank"
          rel="noopener noreferrer"
        >
          Blueprint
        </a>
        and
        <a
          href="https://highway.hackclub.com/projects"
          className={styles.dmNoticeLink}
          target="_blank"
          rel="noopener noreferrer"
        >
          Highway
        </a>
      </div>
    </motion.section>
  )
})

type ExploreSectionProps = {
  explore: ExploreInitialPayload
  exploreStats: ExploreStats
  innerRef: RefObject<HTMLDivElement | null>
}

// Owns ALL explore-only state (category, sort, query, buckets, loading flags, viewport
// height, jump-button visibility), the 60s explore tick, the bulletin_explore live-reload
// subscription, and the explore JSX. Memoized so unrelated parent state changes (lightbox
// open/close) don't re-run this subtree, AND so changes inside this subtree (category
// switch, search input, debounced fetches, scroll observer updates) stay isolated here —
// the back button, sticky header, EventsSection, and FeaturedSection are not touched.
const ExploreSection = memo(function ExploreSection({ explore, exploreStats, innerRef }: ExploreSectionProps) {
  const exploreSectionRef = useRef<HTMLElement | null>(null)
  const exploreControlsRef = useRef<HTMLDivElement | null>(null)
  const exploreJumpLayerRef = useRef<HTMLDivElement | null>(null)
  const exploreMeasuredRef = useRef<HTMLDivElement | null>(null)
  const exploreSentinelRef = useRef<HTMLDivElement | null>(null)
  const [query, setQuery] = useState(explore.projects.query)
  const [category, setCategory] = useState<CategoryOption>(explore.default_category)
  const [projectSort, setProjectSort] = useState<SortOption>(explore.default_project_sort)
  const [exploreBuckets, setExploreBuckets] = useState<Record<string, ExplorePayload>>(() => ({
    [exploreBucketKey('projects', explore.projects.sort, explore.projects.query)]: explore.projects,
    [exploreBucketKey('journals', explore.journals.sort, explore.journals.query)]: explore.journals,
  }))
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [exploreViewportHeight, setExploreViewportHeight] = useState<number | 'auto'>('auto')
  const [exploreVisibleWindow, setExploreVisibleWindow] = useState(() => ({
    key: exploreBucketKey(
      explore.default_category,
      explore.default_category === 'projects' ? explore.default_project_sort : 'newest',
      explore.projects.query,
    ),
    count: EXPLORE_PAGE_SIZE,
  }))
  const [showExploreJump, setShowExploreJump] = useState(false)
  const isFirstExploreFetchRender = useRef(true)
  const exploreRequestSeq = useRef(0)
  const exploreLoadInFlightRef = useRef(false)
  const previousExploreEntryKeysRef = useRef<Record<string, Set<string>>>({})

  // Debounced live refresh of the active explore bucket. Each broadcast on the bulletin_explore
  // stream flips the counter through useLiveReload's `only: ['explore_stats']` partial reload, and
  // also schedules a /bulletin_board/search refetch sized to the slice the user has currently
  // loaded so masonry cards animate in/out as data changes server-side. The setTimeout callback
  // reads from liveRefreshDepsRef so it always sees the latest category/sort/query — that ref is
  // assigned every render below, after the derived values are computed.
  const liveRefreshTimerRef = useRef<number | null>(null)
  const liveRefreshAbortRef = useRef<AbortController | null>(null)
  const liveRefreshDepsRef = useRef<{
    category: CategoryOption
    activeSort: SortOption
    activeQuery: string
    activeExploreKey: string
    loadedCount: number
  }>({
    category: explore.default_category,
    activeSort: explore.default_category === 'projects' ? explore.default_project_sort : 'newest',
    activeQuery: '',
    activeExploreKey: '',
    loadedCount: 0,
  })

  const liveExploreProps = useLiveReload<Pick<PageProps, 'explore_stats'>>({
    stream: 'bulletin_explore',
    only: ['explore_stats'],
    onMessage: () => {
      if (liveRefreshTimerRef.current !== null) {
        window.clearTimeout(liveRefreshTimerRef.current)
      }
      liveRefreshTimerRef.current = window.setTimeout(() => {
        liveRefreshTimerRef.current = null
        const deps = liveRefreshDepsRef.current
        // Bucket is empty or hasn't rendered yet — the search effect is already on the hook for
        // fetching it fresh, so a parallel refresh would just race itself.
        if (deps.loadedCount === 0) return

        const limit = Math.min(deps.loadedCount, EXPLORE_LIVE_REFRESH_MAX_LIMIT)
        const requestSeq = ++exploreRequestSeq.current
        liveRefreshAbortRef.current?.abort()
        const abort = new AbortController()
        liveRefreshAbortRef.current = abort
        const params = new URLSearchParams({
          category: deps.category,
          sort: deps.activeSort,
          limit: String(limit),
        })
        if (deps.activeQuery) params.set('query', deps.activeQuery)

        fetch(`/bulletin_board/search?${params}`, {
          headers: { Accept: 'application/json' },
          signal: abort.signal,
        })
          .then((res) => {
            if (!res.ok) throw new Error(`Explore live refresh failed with ${res.status}`)
            return res.json()
          })
          .then((data: ExplorePayload) => {
            if (requestSeq !== exploreRequestSeq.current) return
            // Replace the active bucket and drop all others — they'd be stale on the next toggle
            // anyway, and re-fetching on demand is cheaper than tracking which buckets are still
            // valid against an unknown server-side change.
            setExploreBuckets(() => ({ [deps.activeExploreKey]: data }))
          })
          .catch((err) => {
            if (err.name === 'AbortError') return
            if (requestSeq !== exploreRequestSeq.current) return
            console.error(err)
          })
      }, EXPLORE_LIVE_REFRESH_DEBOUNCE_MS)
    },
  })
  useEffect(() => {
    return () => {
      if (liveRefreshTimerRef.current !== null) window.clearTimeout(liveRefreshTimerRef.current)
      liveRefreshAbortRef.current?.abort()
    }
  }, [])
  const exploreNow = useNowTick(60_000)
  const liveExploreStats = liveExploreProps?.explore_stats ?? exploreStats

  const exploreCounts = useMemo(
    () => ({
      projects: liveExploreStats.projects_count,
      journals: liveExploreStats.journals_count,
    }),
    [liveExploreStats.journals_count, liveExploreStats.projects_count],
  )
  const [displayedExploreCounts, setDisplayedExploreCounts] = useState(exploreCounts)

  useEffect(() => {
    setDisplayedExploreCounts((counts) =>
      counts.projects === exploreCounts.projects && counts.journals === exploreCounts.journals ? counts : exploreCounts,
    )
  }, [exploreCounts])

  const activeSort = category === 'projects' ? projectSort : 'newest'
  const activeQuery = query.trim()
  const activeExploreKey = exploreBucketKey(category, activeSort, activeQuery)
  const activeExploreBucket = exploreBuckets[activeExploreKey]
  const isExploreBucketPending = !activeExploreBucket
  const cachedExploreEntries = activeExploreBucket?.entries ?? []
  const activeVisibleLimit =
    exploreVisibleWindow.key === activeExploreKey ? exploreVisibleWindow.count : EXPLORE_PAGE_SIZE
  const exploreList = cachedExploreEntries.slice(0, activeVisibleLimit)
  const exploreEntryKeys = useMemo(() => exploreList.map(exploreEntryKey), [exploreList])
  const previousExploreEntryKeys = previousExploreEntryKeysRef.current[activeExploreKey]
  const enteringExploreEntryKeys = useMemo(() => {
    if (!previousExploreEntryKeys) return new Set<string>()

    return new Set(exploreEntryKeys.filter((key) => !previousExploreEntryKeys.has(key)))
  }, [activeExploreKey, exploreEntryKeys, previousExploreEntryKeys])
  const nextCursor = activeExploreBucket?.next_cursor ?? null
  const hasHiddenCachedExploreEntries = cachedExploreEntries.length > exploreList.length
  const hasServerExploreEntries = activeExploreBucket?.has_more ?? false
  const hasMoreExplore = hasHiddenCachedExploreEntries || hasServerExploreEntries
  // Sync render-time derived values into the live-refresh ref so the debounced setTimeout reads
  // the latest filter/sort/loaded-count when a broadcast eventually fires.
  liveRefreshDepsRef.current = {
    category,
    activeSort,
    activeQuery,
    activeExploreKey,
    loadedCount: exploreList.length,
  }
  const exploreEmptyLabel = activeQuery
    ? category === 'projects'
      ? 'no projects found'
      : 'no journals found'
    : category === 'projects'
      ? 'no projects yet'
      : 'no journals yet'

  function resetExploreVisibleWindow(key: string) {
    exploreRequestSeq.current += 1
    exploreLoadInFlightRef.current = false
    setIsLoadingMore(false)
    setExploreVisibleWindow({ key, count: EXPLORE_PAGE_SIZE })
  }

  function handleQueryChange(value: string) {
    setQuery(value)
    resetExploreVisibleWindow(exploreBucketKey(category, activeSort, value.trim()))
  }

  function handleCategoryChange(nextCategory: CategoryOption) {
    if (nextCategory === category) return

    setCategory(nextCategory)
    resetExploreVisibleWindow(
      exploreBucketKey(nextCategory, nextCategory === 'projects' ? projectSort : 'newest', activeQuery),
    )
  }

  function handleProjectSortChange(nextSort: SortOption) {
    if (nextSort === projectSort) return

    setProjectSort(nextSort)
    resetExploreVisibleWindow(exploreBucketKey('projects', nextSort, activeQuery))
  }

  useEffect(() => {
    setExploreVisibleWindow((visibleWindow) =>
      visibleWindow.key === activeExploreKey ? visibleWindow : { key: activeExploreKey, count: EXPLORE_PAGE_SIZE },
    )
  }, [activeExploreKey])

  useEffect(() => {
    if (isExploreBucketPending) return

    previousExploreEntryKeysRef.current[activeExploreKey] = new Set(exploreEntryKeys)
  }, [activeExploreKey, exploreEntryKeys, isExploreBucketPending])

  useEffect(() => {
    if (isFirstExploreFetchRender.current) {
      isFirstExploreFetchRender.current = false
      return
    }

    if (exploreBuckets[activeExploreKey]) {
      setIsSearching(false)
      setIsLoadingMore(false)
      exploreLoadInFlightRef.current = false
      return
    }

    const requestSeq = ++exploreRequestSeq.current
    const requestedCategory = category
    const requestedSort = activeSort
    const requestedQuery = activeQuery
    const requestedKey = activeExploreKey
    setIsSearching(true)
    setIsLoadingMore(false)
    exploreLoadInFlightRef.current = false
    const abort = new AbortController()
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ category: requestedCategory, sort: requestedSort })
      if (requestedQuery) params.set('query', requestedQuery)
      fetch(`/bulletin_board/search?${params}`, {
        headers: { Accept: 'application/json' },
        signal: abort.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Explore search failed with ${res.status}`)
          return res.json()
        })
        .then((data: ExplorePayload) => {
          if (requestSeq !== exploreRequestSeq.current) return
          setExploreBuckets((buckets) => ({ ...buckets, [requestedKey]: data }))
          setIsSearching(false)
        })
        .catch((err) => {
          if (requestSeq !== exploreRequestSeq.current) return
          if (err.name !== 'AbortError') {
            console.error(err)
            setIsSearching(false)
          }
        })
    }, EXPLORE_FILTER_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      abort.abort()
    }
  }, [activeExploreKey, activeQuery, activeSort, category, exploreBuckets])

  function loadMoreExplore() {
    if (
      (!hasHiddenCachedExploreEntries && !nextCursor) ||
      isSearching ||
      isLoadingMore ||
      exploreLoadInFlightRef.current
    )
      return
    exploreLoadInFlightRef.current = true

    const requestSeq = ++exploreRequestSeq.current
    const requestedKey = activeExploreKey
    const requestedQuery = activeQuery

    setIsLoadingMore(true)
    // Hold the spinner visible for at least 100ms so even instant localhost
    // responses surface the loading state to the user.
    if (hasHiddenCachedExploreEntries) {
      const cachedCount = cachedExploreEntries.length
      setTimeout(() => {
        if (requestSeq !== exploreRequestSeq.current) return
        setExploreVisibleWindow((visibleWindow) => {
          const currentCount = visibleWindow.key === requestedKey ? visibleWindow.count : EXPLORE_PAGE_SIZE

          return {
            key: requestedKey,
            count: Math.min(currentCount + EXPLORE_PAGE_SIZE, cachedCount),
          }
        })
        exploreLoadInFlightRef.current = false
        setIsLoadingMore(false)
      }, 100)
      return
    }

    const params = new URLSearchParams({ category, sort: activeSort, cursor: nextCursor! })
    if (requestedQuery) params.set('query', requestedQuery)

    setTimeout(() => {
      if (requestSeq !== exploreRequestSeq.current) return
      fetch(`/bulletin_board/search?${params}`, { headers: { Accept: 'application/json' } })
        .then((res) => {
          if (!res.ok) throw new Error(`Explore load more failed with ${res.status}`)
          return res.json()
        })
        .then((data: ExplorePayload) => {
          if (requestSeq !== exploreRequestSeq.current) return
          setExploreBuckets((buckets) => {
            const current = buckets[requestedKey]
            return {
              ...buckets,
              [requestedKey]: {
                ...data,
                entries: [...(current?.entries ?? []), ...data.entries],
              },
            }
          })
          setExploreVisibleWindow((visibleWindow) => {
            const currentCount = visibleWindow.key === requestedKey ? visibleWindow.count : EXPLORE_PAGE_SIZE

            return {
              key: requestedKey,
              count: currentCount + data.entries.length,
            }
          })
          exploreLoadInFlightRef.current = false
          setIsLoadingMore(false)
        })
        .catch((err) => {
          if (requestSeq !== exploreRequestSeq.current) return
          console.error(err)
          exploreLoadInFlightRef.current = false
          setIsLoadingMore(false)
        })
    }, 100)
  }

  const loadMoreCallbackRef = useRef(loadMoreExplore)
  loadMoreCallbackRef.current = loadMoreExplore
  const exploreLoadCheckFrameRef = useRef(0)
  const scheduleExploreLoadCheckRef = useRef<() => void>(() => {})

  const canLoadMoreRef = useRef(false)
  canLoadMoreRef.current =
    hasMoreExplore &&
    (hasHiddenCachedExploreEntries || !!nextCursor) &&
    !isLoadingMore &&
    !isSearching &&
    !isExploreBucketPending &&
    !exploreLoadInFlightRef.current

  const scheduleExploreLoadCheck = () => {
    window.cancelAnimationFrame(exploreLoadCheckFrameRef.current)
    exploreLoadCheckFrameRef.current = window.requestAnimationFrame(() => {
      const sentinel = exploreSentinelRef.current
      if (!sentinel || !canLoadMoreRef.current) return

      if (isSentinelWithinLoadRange(sentinel, nearestScrollParent(sentinel))) {
        loadMoreCallbackRef.current()
      }
    })
  }
  scheduleExploreLoadCheckRef.current = scheduleExploreLoadCheck

  useLayoutEffect(() => {
    const measured = exploreMeasuredRef.current
    if (!measured) return

    const updateHeight = () => {
      const nextHeight = Math.ceil(measured.getBoundingClientRect().height)
      if (nextHeight <= 0) return

      setExploreViewportHeight((height) => (height === nextHeight ? height : nextHeight))
      scheduleExploreLoadCheckRef.current()
    }

    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(measured)

    return () => observer.disconnect()
  }, [activeExploreKey])

  useEffect(() => {
    const sentinel = exploreSentinelRef.current
    if (!sentinel || !hasMoreExplore) return
    const scrollParent = nearestScrollParent(sentinel)
    const scheduleCheck = () => scheduleExploreLoadCheckRef.current()

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) scheduleCheck()
      },
      {
        root: isWindowScrollParent(scrollParent) ? null : scrollParent,
        rootMargin: `0px 0px ${EXPLORE_LOAD_AHEAD_PX}px 0px`,
      },
    )
    const onVisibleAgain = () => {
      if (!document.hidden) scheduleCheck()
    }
    const scrollOptions: AddEventListenerOptions = { passive: true }
    const documentScrollOptions: AddEventListenerOptions = { passive: true, capture: true }

    observer.observe(sentinel)
    scrollParent.addEventListener('scroll', scheduleCheck, scrollOptions)
    document.addEventListener('scroll', scheduleCheck, documentScrollOptions)
    window.addEventListener('resize', scheduleCheck)
    window.addEventListener('focus', scheduleCheck)
    window.addEventListener('pageshow', scheduleCheck)
    document.addEventListener('visibilitychange', onVisibleAgain)
    scheduleCheck()

    return () => {
      window.cancelAnimationFrame(exploreLoadCheckFrameRef.current)
      observer.disconnect()
      scrollParent.removeEventListener('scroll', scheduleCheck)
      document.removeEventListener('scroll', scheduleCheck, documentScrollOptions)
      window.removeEventListener('resize', scheduleCheck)
      window.removeEventListener('focus', scheduleCheck)
      window.removeEventListener('pageshow', scheduleCheck)
      document.removeEventListener('visibilitychange', onVisibleAgain)
    }
  }, [hasMoreExplore, activeExploreKey])

  useEffect(() => {
    if (!hasMoreExplore) return
    scheduleExploreLoadCheckRef.current()
  }, [
    activeExploreKey,
    exploreList.length,
    hasMoreExplore,
    isExploreBucketPending,
    isLoadingMore,
    isSearching,
    nextCursor,
  ])

  useEffect(() => {
    let setupFrame = 0
    let cleanup = () => {}

    const setupExploreJump = () => {
      const controls = exploreControlsRef.current
      const section = exploreSectionRef.current
      if (!controls || !section) {
        setupFrame = window.requestAnimationFrame(setupExploreJump)
        return
      }

      let frame = 0

      const updateExploreJump = () => {
        const scrollParent = nearestScrollParent(controls)
        const innerBounds = innerRef.current?.getBoundingClientRect()
        if (innerBounds) {
          exploreJumpLayerRef.current?.style.setProperty('--explore-jump-left', `${innerBounds.left}px`)
          exploreJumpLayerRef.current?.style.setProperty('--explore-jump-width', `${innerBounds.width}px`)
        }

        const controlBounds = controls.getBoundingClientRect()
        const sectionBounds = section.getBoundingClientRect()
        const viewportBounds = isWindowScrollParent(scrollParent)
          ? { top: 0, height: window.innerHeight }
          : scrollParent.getBoundingClientRect()

        setShowExploreJump(
          controlBounds.bottom < viewportBounds.top &&
            sectionBounds.bottom > viewportBounds.top + viewportBounds.height * 0.35,
        )
      }

      const scheduleUpdate = () => {
        window.cancelAnimationFrame(frame)
        frame = window.requestAnimationFrame(updateExploreJump)
      }

      const scrollTargets = new Set<HTMLElement | Window>([window])
      if (document.scrollingElement instanceof HTMLElement) scrollTargets.add(document.scrollingElement)

      let parent = controls.parentElement
      while (parent) {
        scrollTargets.add(parent)
        parent = parent.parentElement
      }

      const documentScrollOptions: AddEventListenerOptions = { passive: true, capture: true }

      scheduleUpdate()
      scrollTargets.forEach((target) => target.addEventListener('scroll', scheduleUpdate, { passive: true }))
      document.addEventListener('scroll', scheduleUpdate, documentScrollOptions)
      window.addEventListener('resize', scheduleUpdate)
      const observer = new ResizeObserver(scheduleUpdate)
      observer.observe(controls)
      observer.observe(section)
      if (innerRef.current) observer.observe(innerRef.current)

      cleanup = () => {
        window.cancelAnimationFrame(frame)
        scrollTargets.forEach((target) => target.removeEventListener('scroll', scheduleUpdate))
        document.removeEventListener('scroll', scheduleUpdate, documentScrollOptions)
        window.removeEventListener('resize', scheduleUpdate)
        observer.disconnect()
      }
    }

    setupExploreJump()

    return () => {
      window.cancelAnimationFrame(setupFrame)
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function scrollToExploreControls() {
    const target = exploreControlsRef.current ?? exploreSectionRef.current
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // Explore-stats relative time uses the 60s tick — the displayed values change at minute
  // granularity at most. The tick lives inside this component so the parent (back button,
  // sticky header, EventsSection, FeaturedSection) is not woken up every minute.
  const lastProjectAge = useMemo<RelativeAgeParts | null>(
    () => relativeAgeParts(liveExploreStats.last_project_created_at, exploreNow),
    [exploreNow, liveExploreStats.last_project_created_at],
  )
  const lastJournalAge = useMemo<RelativeAgeParts | null>(
    () => relativeAgeParts(liveExploreStats.last_journal_created_at, exploreNow),
    [exploreNow, liveExploreStats.last_journal_created_at],
  )
  const explorePulseLabel = useMemo(
    () =>
      [
        `${displayedExploreCounts.projects} ${displayedExploreCounts.projects === 1 ? 'project' : 'projects'} pinned`,
        `${displayedExploreCounts.journals} ${displayedExploreCounts.journals === 1 ? 'journal' : 'journals'} posted`,
        formatRelativeAgeLabel(lastProjectAge, 'Last project created: ', 'No projects pinned yet'),
        formatRelativeAgeLabel(lastJournalAge, 'Last journal created: ', 'No journals posted yet'),
      ].join(' • '),
    [displayedExploreCounts.projects, displayedExploreCounts.journals, lastProjectAge, lastJournalAge],
  )
  const exploreStateKey = isExploreBucketPending
    ? `pending-${activeExploreKey}`
    : exploreList.length === 0
      ? `empty-${activeExploreKey}`
      : `results-${activeExploreKey}`

  return (
    <motion.section
      ref={exploreSectionRef}
      layout="position"
      transition={EXPLORE_POSITION_TRANSITION}
      className={clsx(styles.section, styles.exploreSection)}
    >
      <motion.div layout="position" transition={EXPLORE_POSITION_TRANSITION} className={styles.exploreHeader}>
        <motion.h2 layout="position" transition={EXPLORE_POSITION_TRANSITION} className={styles.sectionHeading}>
          Explore
        </motion.h2>

        <ExplorePulse
          projectsCount={displayedExploreCounts.projects}
          journalsCount={displayedExploreCounts.journals}
          lastProjectAge={lastProjectAge}
          lastJournalAge={lastJournalAge}
          ariaLabel={explorePulseLabel}
        />
      </motion.div>

      <div ref={exploreControlsRef} className={styles.exploreControls}>
        <motion.div layout="position" transition={EXPLORE_POSITION_TRANSITION} className={styles.searchRow}>
          <div className={styles.searchSection}>
            <MagnifyingGlassIcon className={styles.searchIcon} />

            <input
              type="text"
              placeholder="Search..."
              className={styles.searchInput}
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
            />
          </div>
        </motion.div>

        <motion.div layout="position" transition={EXPLORE_POSITION_TRANSITION} className={styles.filterRow}>
          <motion.div
            layout="position"
            transition={EXPLORE_POSITION_TRANSITION}
            className={styles.sortTabs}
            data-active-index={category === 'projects' ? 0 : 1}
            role="group"
            aria-label="Explore category"
          >
            <span className={styles.sortTabActiveBg} aria-hidden />
            {(['projects', 'journals'] as const).map((key) => {
              const active = category === key
              const label = key === 'projects' ? 'Projects' : 'Journals'

              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleCategoryChange(key)}
                  className={styles.sortTab}
                >
                  <span className={styles.sortTabLabel}>{label}</span>
                </button>
              )
            })}
          </motion.div>

          <AnimatePresence initial={false} mode="popLayout">
            {category === 'projects' && (
              <motion.div
                key="project-sort"
                transition={EXPLORE_POSITION_TRANSITION}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className={styles.sortTabs}
                data-active-index={projectSort === 'active' ? 0 : 1}
                role="group"
                aria-label="Sort explore projects"
              >
                <span className={styles.sortTabActiveBg} aria-hidden />
                {(['active', 'newest'] as const).map((key) => {
                  const active = projectSort === key
                  const label = key === 'active' ? 'Active' : 'New'

                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => handleProjectSortChange(key)}
                      className={styles.sortTab}
                    >
                      <span className={styles.sortTabLabel}>{label}</span>
                    </button>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <div ref={exploreJumpLayerRef} className={styles.exploreJumpLayer}>
        <div className={styles.exploreJumpInner}>
          <AnimatePresence initial={false}>
            {showExploreJump && (
              <motion.button
                key="explore-jump"
                transition={EXPLORE_POSITION_TRANSITION}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                type="button"
                className={styles.exploreJumpButton}
                onClick={scrollToExploreControls}
              >
                Scroll to top
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      <motion.div layout="position" transition={EXPLORE_POSITION_TRANSITION} className={styles.exploreScroll}>
        <motion.div
          className={styles.exploreViewport}
          initial={false}
          animate={{ height: exploreViewportHeight }}
          transition={EXPLORE_POSITION_TRANSITION}
          onUpdate={() => scheduleExploreLoadCheckRef.current()}
          onAnimationComplete={() => scheduleExploreLoadCheckRef.current()}
        >
          <div
            ref={exploreMeasuredRef}
            className={clsx(
              styles.exploreMeasured,
              (isSearching || isExploreBucketPending) && styles.exploreMeasuredPending,
            )}
            aria-busy={isSearching || isExploreBucketPending}
          >
            <AnimatePresence initial={false} mode="wait">
              {isExploreBucketPending ? (
                <motion.div
                  key={exploreStateKey}
                  className={styles.explorePending}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={EXPLORE_FADE_TRANSITION}
                />
              ) : exploreList.length === 0 ? (
                <motion.div
                  key={exploreStateKey}
                  className={styles.exploreEmpty}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={EXPLORE_FADE_TRANSITION}
                >
                  {exploreEmptyLabel}
                </motion.div>
              ) : (
                <motion.div
                  key={exploreStateKey}
                  className={styles.exploreResults}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={EXPLORE_FADE_TRANSITION}
                >
                  <LayoutGroup id={`explore-${activeExploreKey}`}>
                    <Masonry
                      breakpointCols={{ default: 3, 1023: 2, 767: 1 }}
                      className={styles.exploreMasonry}
                      columnClassName={styles.exploreMasonryColumn}
                    >
                      {exploreList.map((entry) => {
                        const entryKey = exploreEntryKey(entry)
                        const isEntering = enteringExploreEntryKeys.has(entryKey)

                        return (
                          <motion.div
                            key={entryKey}
                            layout="position"
                            layoutId={entryKey}
                            className={styles.exploreCardMotion}
                            initial={isEntering ? { opacity: 0, y: 8 } : false}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={EXPLORE_CARD_TRANSITION}
                          >
                            <ExploreCard entry={entry} now={exploreNow} />
                          </motion.div>
                        )
                      })}
                    </Masonry>
                  </LayoutGroup>

                  {hasMoreExplore && (
                    <div ref={exploreSentinelRef} className={styles.loadMoreRow}>
                      {isLoadingMore ? (
                        <div className={styles.loadMoreSpinner} role="status" aria-label="Loading more">
                          <div className={styles.spinner} aria-hidden />
                        </div>
                      ) : (
                        !isSearching && (
                          <button type="button" className={styles.loadMoreButton} onClick={loadMoreExplore}>
                            Not loading automatically? Load more manually.
                          </button>
                        )
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {(isSearching || isExploreBucketPending) && (
                <motion.div
                  key="loading-overlay"
                  className={styles.exploreLoadingOverlay}
                  role="status"
                  aria-label="Loading explore results"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={EXPLORE_FADE_TRANSITION}
                >
                  <div className={styles.exploreLoadingChip}>
                    <div className={styles.spinner} aria-hidden />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </motion.section>
  )
})

export default function BulletinBoardIndex({ events, featured, explore, explore_stats, is_modal }: PageProps) {
  const modalRef = useRef<{ close: () => void }>(null)
  const innerRef = useRef<HTMLDivElement | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    if (!lightbox) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  const backButton = is_modal ? (
    <button type="button" onClick={() => modalRef.current?.close()} aria-label="Back" className={styles.backButton}>
      <ArrowLeftIcon className={styles.backArrow} />
    </button>
  ) : (
    <Link href="/path" aria-label="Back" className={styles.backButton}>
      <ArrowLeftIcon className={styles.backArrow} />
    </Link>
  )

  const content = (
    <div className={clsx(styles.content, is_modal ? styles.contentModal : styles.contentStandalone)}>
      <div className={styles.panel}>
        <div className={styles.stickyHeader}>{backButton}</div>

        <div ref={innerRef} className={styles.inner}>
          <EventsSection events={events} />

          <FeaturedSection featured={featured} onImageOpen={setLightbox} />

          <ExploreSection explore={explore} exploreStats={explore_stats} innerRef={innerRef} />
        </div>
      </div>
    </div>
  )

  const lightboxEl =
    lightbox && typeof document !== 'undefined'
      ? createPortal(
          <div className={styles.lightbox} onClick={() => setLightbox(null)} role="dialog" aria-modal="true">
            <img src={lightbox} alt="" className={styles.lightboxImage} />
          </div>,
          document.body,
        )
      : null

  if (is_modal) {
    return (
      <Modal
        ref={modalRef}
        panelClasses={clsx('bulletin-board-modal-panel', styles.modalPanel)}
        paddingClasses=""
        closeButton={false}
        maxWidth="7xl"
      >
        {content}
        {lightboxEl}
      </Modal>
    )
  }

  return (
    <>
      {content}
      {lightboxEl}
    </>
  )
}

BulletinBoardIndex.layout = (page: ReactNode) => page
