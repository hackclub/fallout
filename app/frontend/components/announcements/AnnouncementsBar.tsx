import { useMemo } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Announcement, AnnouncementKind } from './types'
import AnnouncementCard from './AnnouncementCard'
import Twine from './Twine'
import { useIdentityAnnouncement } from './useIdentityAnnouncement'
import { useUnsubmittedHoursAnnouncement } from './useUnsubmittedHoursAnnouncement'
import { useFeedbackAnnouncement } from './useFeedbackAnnouncement'

const ORDER: Record<AnnouncementKind, number> = { critical: 0, info: 1, promo: 2 }

export default function AnnouncementsBar() {
  const identity = useIdentityAnnouncement()
  const unsubmittedHours = useUnsubmittedHoursAnnouncement()
  const feedback = useFeedbackAnnouncement()

  const announcements = useMemo<Announcement[]>(
    () =>
      [identity, unsubmittedHours, feedback]
        .filter((a): a is Announcement => a !== null)
        .sort((a, b) => ORDER[a.kind] - ORDER[b.kind]),
    [identity, unsubmittedHours, feedback],
  )

  if (announcements.length === 0) return null
  const stacked = announcements.length > 1

  return (
    <div className="announcements-bar pointer-events-none ml-auto w-full max-w-[18rem] sm:max-w-xs">
      <div className="relative pointer-events-auto w-full">
        {stacked && <Twine />}
        <motion.ul layout className="relative flex flex-col items-stretch gap-2">
          <AnimatePresence initial={false}>
            {announcements.map((a, i) => (
              <AnnouncementCard key={a.id} announcement={a} index={i} stacked={stacked} />
            ))}
          </AnimatePresence>
        </motion.ul>
      </div>
    </div>
  )
}
