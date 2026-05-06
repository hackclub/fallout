import { useCallback, useRef, type ReactNode } from 'react'
import { Modal, useModal } from '@inertiaui/modal-react'
import { router } from '@inertiajs/react'
import EventDetailPanel from '@/components/bulletin_board/EventDetailPanel'
import type { SerializedBulletinEvent } from '@/lib/bulletinEventStatus'
import { useLiveReload, type LiveReloadMessage } from '@/lib/useLiveReload'
import styles from './show.module.scss'

type PageProps = {
  event: SerializedBulletinEvent
  is_modal: boolean
}

export default function BulletinEventShow({ event, is_modal }: PageProps) {
  const modalRef = useRef<{ close: () => void }>(null)
  const modal = useModal()

  const closeView = useCallback(() => {
    if (modal) {
      modal.close()
      return
    }
    if (modalRef.current) {
      modalRef.current.close()
      return
    }
    router.visit('/bulletin_board')
  }, [modal])

  const handleMessage = useCallback(
    (message: LiveReloadMessage) => {
      // Event was deleted — nothing left to show, so close the detail view. The default
      // refetch will still fire and 404 silently by the time the close animation runs.
      if (message.action === 'destroy' && String(message.id) === String(event.id)) {
        closeView()
      }
    },
    [event.id, closeView],
  )

  const liveProps = useLiveReload<PageProps>({
    stream: 'bulletin_events',
    only: ['event'],
    onMessage: handleMessage,
  })

  const liveEvent = liveProps?.event ?? event

  function handleBack() {
    if (modal?.canGoBack) {
      modal.goBack()
      return
    }
    closeView()
  }

  const panel = <EventDetailPanel event={liveEvent} onBack={handleBack} />

  if (is_modal) {
    return (
      <Modal
        ref={modalRef}
        panelClasses={`event-detail-modal-panel ${styles.modalPanel}`}
        paddingClasses=""
        closeButton={false}
        maxWidth="2xl"
      >
        {panel}
      </Modal>
    )
  }

  return (
    <div className={styles.standalonePage}>
      <div className={styles.standaloneInner}>{panel}</div>
    </div>
  )
}

BulletinEventShow.layout = (page: ReactNode) => page
