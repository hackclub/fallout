import { useState, useEffect } from 'react'
import Button from '@/components/shared/Button'

const REQUIRED_PHRASE = 'i understand and i have checked my project'

export default function ShipWarningModal({
  open,
  requirementsUrl,
  submitting = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  requirementsUrl: string
  submitting?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const [text, setText] = useState('')

  // The modal stays mounted (returns null when closed), so clear the typed phrase each time it closes.
  useEffect(() => {
    if (!open) setText('')
  }, [open])

  if (!open) return null

  const confirmed = text.trim().toLowerCase() === REQUIRED_PHRASE

  return (
    <>
      <div className="fixed inset-0 z-20 backdrop-brightness-75" />
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
        <div className="w-full max-w-sm border-2 border-dark-brown bg-light-brown p-4">
          <h3 className="text-lg font-bold text-dark-brown">This is your last chance to submit</h3>
          <p className="mt-2 text-sm text-dark-brown">
            Are you sure you&apos;ve checked over the{' '}
            <a href={requirementsUrl} target="_blank" rel="noreferrer" className="font-bold underline">
              submission requirements
            </a>{' '}
            BEFORE submitting?
          </p>
          <p className="mt-2 text-sm font-bold text-dark-brown">You have been warned.</p>
          <p className="mt-3 text-sm text-dark-brown">
            Type <span className="font-bold">&quot;I understand and I have checked my project&quot;</span> to continue.
          </p>
          <input
            type="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={submitting}
            className="mt-2 w-full border-2 border-dark-brown bg-light-brown px-3 py-2 text-sm text-dark-brown disabled:opacity-50"
          />

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="border-2 border-dark-brown px-3 py-1.5 text-xs font-bold uppercase text-dark-brown disabled:opacity-50"
            >
              Cancel
            </button>
            <Button onClick={onConfirm} disabled={!confirmed || submitting} className="px-4 py-1.5 text-sm">
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
