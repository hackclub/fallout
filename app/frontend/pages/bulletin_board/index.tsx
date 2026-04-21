import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from '@inertiajs/react'
import { Modal } from '@inertiaui/modal-react'
import { ArrowLeftIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import clsx from 'clsx'
import { motion } from 'motion/react'
import MarqueeText from '@/components/shared/MarqueeText'
import styles from './index.module.scss'

type SortOption = 'newest' | 'top'
type SourceOption = 'journals' | 'projects'
const SEARCH_DEBOUNCE_MS = 300

type Event = { title: string; date: string }
type Featured = { image: string; title: string; username: string }
type Explore = {
  username: string
  date: string
  project_name: string
  content: string
  description: string
  tags: string[]
  likes: number
  comments: number
}

type PageProps = {
  events: Event[]
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
          <section className={styles.section}>
            <h2 className={styles.sectionHeading}>Events</h2>

            <div className={styles.eventsGrid}>
              {events.length === 0 ? (
                <div className={styles.emptyState}>no events yet</div>
              ) : (
                events.map((event, i) => (
                  <div key={i} className={styles.eventCard}>
                    <h3 className={styles.eventCardTitle}>{event.title}</h3>
                    <div className={styles.eventCardImage} />
                    <div className={styles.eventCardDate}>{event.date}</div>
                  </div>
                ))
              )}
            </div>

            <div className={styles.dmNotice}>
              want to run one? DM
              <a
                href="https://hackclub.enterprise.slack.com/team/U08R4Q9H8EB"
                className={styles.dmNoticeLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                @tanishq!
              </a>
            </div>
          </section>

          <section className={styles.section}>
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
          </section>

          <section className={styles.section}>
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
              <div className={styles.exploreGrid}>
                {isSearching ? (
                  <div className={styles.exploreLoading} role="status" aria-label="Loading projects">
                    <div className={styles.spinner} aria-hidden />
                  </div>
                ) : exploreList.length === 0 ? (
                  <div className={styles.emptyState}>{query.trim() ? 'no projects found' : 'no projects yet'}</div>
                ) : (
                  exploreList.map((entry, i) => (
                    <div key={i} className={styles.exploreCard}>
                      <div className={styles.exploreBody}>
                        <div className={styles.exploreUserRow}>
                          <div className={styles.exploreAvatar} aria-hidden />
                          <span className={styles.exploreUsername}>{entry.username}</span>
                        </div>

                        <div className={styles.explorePhoto}>photo of journal</div>

                        <div className={styles.exploreMetaRow}>
                          <span className={styles.exploreDate}>{entry.date}</span>
                          <Link href="#" className={styles.exploreProjectLink}>
                            {entry.project_name}
                          </Link>
                        </div>

                        <p className={styles.exploreContent}>{entry.content}</p>
                        <p className={styles.exploreDescription}>{entry.description}</p>

                        <button className={styles.exploreExpand}>Expand</button>
                      </div>

                      <div className={styles.exploreFooter}>
                        <div className={styles.exploreTags}>
                          {entry.tags.map((tag) => (
                            <span key={tag}>#{tag}</span>
                          ))}
                        </div>
                        <div className={styles.exploreCounts}>
                          <span>{entry.likes}</span>
                          <span>{entry.comments}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
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
