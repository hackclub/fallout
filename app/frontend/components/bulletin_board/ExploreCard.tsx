import { ModalLink } from '@inertiaui/modal-react'
import { Play } from 'lucide-react'
import { motion, type Transition } from 'motion/react'
import ImagePlaceholder from '@/components/shared/ImagePlaceholder'
import { SlidingNumber } from '@/components/shared/SlidingNumber'
import TextMorph from '@/components/shared/TextMorph'
import { relativeAgeParts } from '@/lib/relativeAge'
import styles from './ExploreCard.module.scss'

const JOURNAL_AGE_TRANSITION: Transition = { type: 'spring', stiffness: 260, damping: 34, mass: 0.35 }
const CARD_WRAP_TRANSITION: Transition = { type: 'spring', stiffness: 320, damping: 26, mass: 0.5 }

export type ExploreEntry = {
  id: number
  type: 'project' | 'journal'
  username: string
  avatar_url: string | null
  project_name: string
  tags: string[]
  href: string
  created_at?: string
  last_activity_at?: string | null
  image?: string | null
  project_description?: string
  latest_journal_excerpt?: string | null
  latest_journal_date?: string | null
  journal_entries_count?: number
  date?: string
  excerpt?: string
  media?:
    | { kind: 'image'; url: string }
    | { kind: 'video'; url: string; poster_url: string | null }
    | { kind: 'youtube'; thumbnail_url: string | null }
    | null
}

type Props = {
  entry: ExploreEntry
  now: Date
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' }
const CREATED_DATE_FORMAT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }

function formatDate(iso: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleDateString(undefined, DATE_FORMAT)
}

function formatCreatedDate(iso: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? iso : `Created ${parsed.toLocaleDateString(undefined, CREATED_DATE_FORMAT)}`
}

function journalCountLabel(count: number): string {
  return `${count} journal${count === 1 ? '' : 's'}`
}

function hasJournalMedia(entry: ExploreEntry): boolean {
  const media = entry.media

  return media?.kind === 'image' || media?.kind === 'video' || (media?.kind === 'youtube' && !!media.thumbnail_url)
}

function JournalAge({
  iso,
  now,
  className = styles.relativeAge,
}: {
  iso: string | undefined
  now: Date
  className?: string
}) {
  const age = relativeAgeParts(iso, now)

  if (!age) {
    return (
      <TextMorph as="span" className={className}>
        recently posted
      </TextMorph>
    )
  }

  if (age.kind === 'now') {
    return (
      <TextMorph as="span" className={className} transition={JOURNAL_AGE_TRANSITION}>
        {age.label}
      </TextMorph>
    )
  }

  return (
    <span className={className}>
      <SlidingNumber value={age.value} />
      <TextMorph as="span" transition={JOURNAL_AGE_TRANSITION}>
        {` ${age.unit} ago`}
      </TextMorph>
    </span>
  )
}

function renderJournalMedia(entry: ExploreEntry) {
  const media = entry.media

  if (!media) return null
  if (media.kind === 'image') return <img src={media.url} alt="" className={styles.mediaImage} loading="lazy" />
  if (media.kind === 'video') {
    return (
      <video
        src={media.url}
        poster={media.poster_url ?? undefined}
        className={styles.mediaImage}
        muted
        playsInline
        preload="metadata"
      />
    )
  }

  return media.thumbnail_url ? (
    <div className={styles.youtubePreview}>
      <img src={media.thumbnail_url} alt="" className={styles.mediaImage} loading="lazy" />
      <Play className={styles.playIcon} fill="white" strokeWidth={0} aria-hidden />
    </div>
  ) : null
}

export default function ExploreCard({ entry, now }: Props) {
  const initial = entry.username.trim().charAt(0).toUpperCase() || '?'
  const projectDescription = entry.project_description ?? ''
  const hasDescription = projectDescription.trim().length > 0
  const hasLatestJournal = (entry.latest_journal_excerpt ?? '').trim().length > 0
  const hasJournalExcerpt = (entry.excerpt ?? '').trim().length > 0
  const hasTags = entry.tags.length > 0
  const showMedia = entry.type === 'project' || hasJournalMedia(entry)
  const ariaLabel =
    entry.type === 'journal' ? `Open latest journal for ${entry.project_name}` : `Open ${entry.project_name}`
  const dateLabel =
    entry.type === 'project' && entry.created_at
      ? formatCreatedDate(entry.created_at)
      : entry.date
        ? formatDate(entry.date)
        : null

  return (
    <motion.div className={styles.cardWrap} transition={CARD_WRAP_TRANSITION}>
      <ModalLink href={entry.href} className={styles.card} aria-label={ariaLabel}>
        {showMedia && (
          <div className={styles.media} aria-hidden>
            {entry.type === 'journal' ? (
              renderJournalMedia(entry)
            ) : entry.image ? (
              <img src={entry.image} alt="" className={styles.mediaImage} loading="lazy" />
            ) : (
              <ImagePlaceholder text="No project cover" className={styles.mediaPlaceholder} />
            )}
          </div>
        )}

        <div className={styles.body}>
          <header className={styles.header}>
            <div className={styles.user}>
              <div className={styles.avatar} aria-hidden>
                {entry.avatar_url ? (
                  <img src={entry.avatar_url} alt="" className={styles.avatarImage} loading="lazy" />
                ) : (
                  initial
                )}
              </div>
              <span className={styles.username}>{entry.username}</span>
            </div>
            {dateLabel && <span className={styles.date}>{dateLabel}</span>}
          </header>

          <h3 className={styles.title}>{entry.project_name}</h3>
          {entry.type === 'project' && hasDescription && <p className={styles.description}>{projectDescription}</p>}
          {entry.type === 'journal' && hasJournalExcerpt && <p className={styles.content}>{entry.excerpt}</p>}

          {entry.type === 'project' && hasLatestJournal && (
            <div className={styles.latestJournal}>
              <div className={styles.latestJournalMeta}>
                <span className={styles.latestJournalLabel}>latest journal</span>
                {entry.latest_journal_date && (
                  <span className={styles.latestJournalWhen}>
                    <span className={styles.latestJournalSeparator}>•</span>
                    <JournalAge iso={entry.latest_journal_date} now={now} className={styles.latestJournalAge} />
                  </span>
                )}
              </div>
              <p className={styles.content}>{entry.latest_journal_excerpt}</p>
            </div>
          )}

          {hasTags && (
            <ul className={styles.tags}>
              {entry.tags.map((tag) => (
                <li key={tag} className={styles.tag}>
                  #{tag}
                </li>
              ))}
            </ul>
          )}

          <footer className={styles.footer}>
            {entry.type === 'project' ? (
              <span className={styles.entryCount}>{journalCountLabel(entry.journal_entries_count ?? 0)}</span>
            ) : (
              <JournalAge iso={entry.date} now={now} />
            )}
            <span className={styles.readMore}>{entry.type === 'project' ? 'View project' : 'Read journal'}</span>
          </footer>
        </div>
      </ModalLink>
    </motion.div>
  )
}
