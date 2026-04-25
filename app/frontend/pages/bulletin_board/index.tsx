import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from '@inertiajs/react'
import { Modal } from '@inertiaui/modal-react'
import { ArrowLeftIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import { DateTime } from 'luxon'
import MarqueeText from '@/components/shared/MarqueeText'
import { SlidingNumber } from '@/components/shared/SlidingNumber'
import EventCard from '@/components/bulletin_board/EventCard'
import ExploreCard from '@/components/bulletin_board/ExploreCard'
import Masonry from 'react-masonry-css'
import { computeBulletinEventStatus, type SerializedBulletinEvent } from '@/lib/bulletinEventStatus'
import { useLiveReload } from '@/lib/useLiveReload'
import { useNowTick } from '@/lib/useNowTick'
import styles from './index.module.scss'

type SortOption = 'newest' | 'top'
type SourceOption = 'journals' | 'projects'
const SEARCH_DEBOUNCE_MS = 300

type Featured = { image: string; title: string; username: string }
type Explore = {
  username: string
  date: string
  project_name: string
  image?: string
  content: string
  description: string
  tags: string[]
  likes: number
  comments: number
}

type PageProps = {
  events: SerializedBulletinEvent[]
  featured: Featured[]
  explore: Explore[]
  is_modal: boolean
}

export default function BulletinBoardIndex({ events, featured, explore, is_modal }: PageProps) {
  const modalRef = useRef<{ close: () => void }>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortOption>('newest')
  const [source, setSource] = useState<SourceOption>('journals')
  const [exploreList, setExploreList] = useState<Explore[]>(explore)
  const [isSearching, setIsSearching] = useState(false)
  const isFirstSearchRender = useRef(true)
  const PAGE_SIZE = 3
  const [page, setPage] = useState(0)

  const liveProps = useLiveReload<PageProps>({ stream: 'bulletin_events', only: ['events'] })
  const now = useNowTick(1000)
  const liveEvents = liveProps?.events ?? events

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

  const totalPages = Math.max(1, Math.ceil(visibleEvents.length / PAGE_SIZE))
  const effectivePage = Math.min(page, totalPages - 1)
  useEffect(() => {
    if (page !== effectivePage) setPage(effectivePage)
  }, [effectivePage, page])
  const pageEvents = visibleEvents.slice(effectivePage * PAGE_SIZE, (effectivePage + 1) * PAGE_SIZE)

  useEffect(() => {
    if (!lightbox) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  useEffect(() => {
    if (isFirstSearchRender.current) {
      isFirstSearchRender.current = false
      return
    }
    setIsSearching(true)
    const abort = new AbortController()
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query, sort, source })
      fetch(`/bulletin_board/search?${params}`, {
        headers: { Accept: 'application/json' },
        signal: abort.signal,
      })
        .then((res) => res.json())
        .then((data: { explore: Explore[] }) => {
          setExploreList(data.explore)
          setIsSearching(false)
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            console.error(err)
            setIsSearching(false)
          }
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      abort.abort()
    }
  }, [query, sort, source])

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

        <div className={styles.inner}>
          <motion.section layout className={styles.section}>
            <h2 className={styles.sectionHeading}>Events</h2>

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
                          <SlidingNumber value={effectivePage + 1} />
                          <span className={styles.pageInfoSep}>/</span>
                          <SlidingNumber value={totalPages} />
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

          <motion.section layout className={styles.section}>
            <h2 className={styles.sectionHeading}>Featured</h2>
            <div className={styles.featuredGrid}>
              {featured.length === 0 ? (
                <div className={styles.emptyState}>nothing shipped yet — ship something cool!</div>
              ) : (
                featured.map((item, i) => (
                  <div key={i} className={styles.featuredCard}>
                    <button
                      type="button"
                      className={styles.featuredImageButton}
                      onClick={() => setLightbox(item.image)}
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

          <motion.section layout className={styles.section}>
            <h2 className={styles.sectionHeading}>Explore</h2>

            <div className={styles.searchRow}>
              <div className={styles.searchSection}>
                <MagnifyingGlassIcon className={styles.searchIcon} />

                <input
                  type="text"
                  placeholder="Search..."
                  className={styles.searchInput}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.filterRow}>
              <div className={styles.sortTabs} role="group" aria-label="Source">
                {(['journals', 'projects'] as const).map((key) => {
                  const active = source === key

                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSource(key)}
                      className={styles.sortTab}
                    >
                      {active && (
                        <motion.span
                          layoutId="sourcePillIndicator"
                          className={styles.sortTabActiveBg}
                          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                        />
                      )}
                      <span className={styles.sortTabLabel}>
                        {key.substring(0, 1).toUpperCase() + key.substring(1)}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className={styles.sortTabs} role="group" aria-label="Sort projects">
                {(['newest', 'top'] as const).map((key) => {
                  const active = sort === key

                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSort(key)}
                      className={styles.sortTab}
                    >
                      {active && (
                        <motion.span
                          layoutId="sortPillIndicator"
                          className={styles.sortTabActiveBg}
                          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                        />
                      )}

                      <span className={styles.sortTabLabel}>
                        {key.substring(0, 1).toUpperCase() + key.substring(1).replace(/_/g, ' ')}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className={styles.exploreScroll}>
              {isSearching ? (
                <div className={styles.exploreLoading} role="status" aria-label="Loading projects">
                  <div className={styles.spinner} aria-hidden />
                </div>
              ) : exploreList.length === 0 ? (
                <div className={styles.exploreEmpty}>{query.trim() ? 'no projects found' : 'no projects yet'}</div>
              ) : (
                <Masonry
                  breakpointCols={{ default: 3, 1023: 2, 767: 1 }}
                  className={styles.exploreMasonry}
                  columnClassName={styles.exploreMasonryColumn}
                >
                  {exploreList.map((entry, i) => (
                    <ExploreCard key={i} entry={entry} />
                  ))}
                </Masonry>
              )}
            </div>
          </motion.section>
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
