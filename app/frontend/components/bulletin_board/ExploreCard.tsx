import { Link } from '@inertiajs/react'
import { motion } from 'motion/react'
import { HeartIcon, ChatBubbleOvalLeftIcon } from '@heroicons/react/20/solid'
import styles from './ExploreCard.module.scss'

export type ExploreEntry = {
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

type Props = {
  entry: ExploreEntry
  href?: string
}

export default function ExploreCard({ entry, href = '#' }: Props) {
  const initial = entry.username.trim().charAt(0).toUpperCase() || '?'
  const hasDescription = entry.description?.trim().length > 0
  const hasTags = entry.tags && entry.tags.length > 0

  return (
    <motion.div
      className={styles.cardWrap}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26, mass: 0.5 }}
    >
      <Link href={href} className={styles.card} aria-label={`Open ${entry.project_name}`}>
        <div className={styles.media} aria-hidden>
          {entry.image ? (
            <img src={entry.image} alt="" className={styles.mediaImage} loading="lazy" />
          ) : (
            <div className={styles.mediaGradient} />
          )}
        </div>

        <div className={styles.body}>
          <header className={styles.header}>
            <div className={styles.user}>
              <div className={styles.avatar} aria-hidden>
                {initial}
              </div>
              <span className={styles.username}>{entry.username}</span>
            </div>
            <span className={styles.date}>{entry.date}</span>
          </header>

          <h3 className={styles.title}>{entry.project_name}</h3>
          <p className={styles.content}>{entry.content}</p>
          {hasDescription && <p className={styles.description}>{entry.description}</p>}

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
            <div className={styles.counts}>
              <span className={styles.count}>
                <HeartIcon className={styles.iconHeart} aria-hidden />
                <span>{entry.likes}</span>
              </span>
              <span className={styles.count}>
                <ChatBubbleOvalLeftIcon className={styles.iconChat} aria-hidden />
                <span>{entry.comments}</span>
              </span>
            </div>
            <span className={styles.readMore}>Read more</span>
          </footer>
        </div>
      </Link>
    </motion.div>
  )
}
