import { useMemo } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Announcement, AnnouncementKind } from './types'
import AnnouncementCard from './AnnouncementCard'
import Twine from './Twine'
import { useIdentityAnnouncement } from './useIdentityAnnouncement'
import { useFeedbackAnnouncement } from './useFeedbackAnnouncement'

const ORDER: Record<AnnouncementKind, number> = { critical: 0, info: 1, promo: 2 }

export default function AnnouncementsBar() {
  const identity = useIdentityAnnouncement()
  const feedback = useFeedbackAnnouncement()

  const announcements = useMemo<Announcement[]>(
    () =>
      [identity, feedback].filter((a): a is Announcement => a !== null).sort((a, b) => ORDER[a.kind] - ORDER[b.kind]),
    [identity, feedback],
  )

  if (announcements.length === 0) return null
  const stacked = announcements.length > 1

  return (
    <div className="announcements-bar pointer-events-none flex justify-center">
      <div className="relative pointer-events-auto w-full xs:w-fit max-w-3xl">
        {stacked && <Twine />}
        <motion.ul layout className="relative flex flex-col items-stretch gap-2 xs:gap-3">
          <AnimatePresence initial={false}>
            {announcements.map((a, i) => (
              <AnnouncementCard key={a.id} announcement={a} index={i} stacked={stacked} isOnly={!stacked} />
            ))}
          </AnimatePresence>
        </motion.ul>
      </div>
    </div>
  )
}
