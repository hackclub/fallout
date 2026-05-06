import { useEffect, useRef, useState } from 'react'
import { router } from '@inertiajs/react'
import { useModal } from '@inertiaui/modal-react'
import { consumer } from './cable'

export type LiveReloadAction = 'create' | 'update' | 'destroy'

export type LiveReloadMessage = {
  stream: string
  id?: number | string
  action: LiveReloadAction
}

export type LiveReloadOptions = {
  stream: string
  only?: string[]
  enabled?: boolean
  onMessage?: (message: LiveReloadMessage) => void
}

type ModalReloadOpts = { only?: string[]; onSuccess?: (response: unknown) => void }
type ModalContext = {
  reload: (opts?: ModalReloadOpts) => void
  props?: Record<string, unknown>
} | null

// Subscribes to a broadcast stream and refreshes the current view when messages arrive.
//
// Inside an InertiaUI Modal overlay, router.reload() hits the base page URL — not the modal's —
// and the modal package's own reload mutates props in place via a chain that doesn't reliably
// propagate to React subtrees in this fork. We drive re-renders through React state instead:
// modal.reload still runs (to refresh modal.props for any other readers), and on its onSuccess
// we snapshot a shallow copy of modal.props into local state. Consumers read the state — a
// guaranteed new object reference — so their memos and renders fire reliably on every broadcast.
//
// Outside a modal, we fall back to router.reload({ only }) which drives Inertia's own partial
// reload machinery, and returns null so consumers use their Inertia page props directly.
//
// onMessage fires synchronously on each broadcast with the payload ({ stream, id?, action }) so
// callers can react to specific changes — e.g. closing a detail modal when its resource is
// destroyed — before or independently of the refetch.
export function useLiveReload<P = Record<string, unknown>>({
  stream,
  only,
  enabled = true,
  onMessage,
}: LiveReloadOptions): P | null {
  const [liveProps, setLiveProps] = useState<P | null>(null)
  const modal = useModal() as ModalContext
  const modalRef = useRef(modal)
  modalRef.current = modal
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage
  const onlyRef = useRef(only)
  onlyRef.current = only
  const onlyKey = only ? only.join(',') : ''

  useEffect(() => {
    if (!enabled) return
    const subscription = consumer.subscriptions.create(
      { channel: 'LiveUpdatesChannel', stream },
      {
        received: (data: unknown) => {
          const message = data as LiveReloadMessage
          onMessageRef.current?.(message)

          const m = modalRef.current
          const currentOnly = onlyRef.current
          if (m && typeof m.reload === 'function') {
            m.reload({
              only: currentOnly,
              onSuccess: () => {
                // Shallow-copy mutated modal.props into React state — the new object reference
                // guarantees a re-render, bypassing the fork's fragile prop-propagation chain.
                const snapshot = m.props ? { ...m.props } : null
                setLiveProps(snapshot as P | null)
              },
            })
          } else {
            router.reload(currentOnly ? { only: currentOnly } : undefined)
          }
        },
      },
    )
    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, enabled, onlyKey])

  return liveProps
}
