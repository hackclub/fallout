import { type ReactNode, useState } from 'react'
import { router } from '@inertiajs/react'
import { Modal, useModal } from '@inertiaui/modal-react'
import { Clock, GraduationCap } from 'lucide-react'
import Frame from '@/components/shared/Frame'
import { performModalMutation } from '@/lib/modalMutation'

type PageProps = {
  is_modal: boolean
}

const primaryButtonClass =
  'min-h-12 rounded-xl border-2 border-dark-brown bg-dark-brown text-light-brown font-medium cursor-pointer ease-in-out transition-all hover:scale-104 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100'

const secondaryButtonClass =
  'min-h-12 rounded-xl border-2 border-dark-brown bg-light-brown text-dark-brown font-medium cursor-pointer ease-in-out transition-all hover:scale-104 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100'

function ProfessorEnrollmentNew({ is_modal }: PageProps) {
  const [submitting, setSubmitting] = useState(false)
  const modal = useModal()

  function handleConfirm() {
    if (submitting) return
    setSubmitting(true)

    if (!is_modal) {
      router.post(
        '/professor_enrollment',
        {},
        {
          preserveScroll: true,
          onFinish: () => setSubmitting(false),
        },
      )
      return
    }

    void performModalMutation({
      url: '/professor_enrollment',
      method: 'post',
      modal,
      successMessage: "you're signed up for a mentor! we'll add you to the slack channel in ~24 hours.",
      errorMessage: 'something went wrong signing you up. please try again in a bit.',
      onFinish: () => setSubmitting(false),
    }).then((ok) => {
      if (!ok) return
      // Refresh auth on the root Inertia page so bulletin_board's "sign up for a mentor" link
      // flips to the "you're signed up for a mentor" message. The bulletin_board reads auth via
      // usePage() which subscribes to the ROOT page state — not modalContext.props — so a
      // parent.reload() would only update the modal's own props bag and never re-render the CTA.
      router.reload({ only: ['auth'] })
    })
  }

  function handleCancel() {
    if (submitting) return
    if (modal) {
      modal.close()
    } else {
      router.visit('/bulletin_board')
    }
  }

  const content = (
    <div className="flex flex-col gap-6 text-dark-brown px-2 py-5 sm:px-4 sm:py-7">
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center justify-center w-16 h-16 rounded-full border-2 border-dark-brown bg-beige">
          <GraduationCap className="w-8 h-8 text-dark-brown" strokeWidth={2} />
        </div>
        <h2 className="text-2xl font-bold text-center leading-tight">sign up for a mentor</h2>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-center text-base leading-relaxed">
          An experienced volunteer who will guide you when you&apos;re stuck or need direction.
        </p>
        <div className="flex items-center justify-center gap-1.5 text-sm text-brown">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden />
          <span>we&apos;ll add you to the slack channel in ~24 hours</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={handleCancel} disabled={submitting} className={secondaryButtonClass}>
          maybe later..
        </button>
        <button type="button" onClick={handleConfirm} disabled={submitting} className={primaryButtonClass}>
          {submitting ? 'signing up…' : 'sign me up!'}
        </button>
      </div>
    </div>
  )

  if (is_modal) {
    // panelClasses tags the panel so `.im-modal-wrapper:has(> .professor-enrollment-modal-panel)` in
    // application.css turns the wrapper into a flex container — needed to override the global
    // `h-full!` rule that otherwise leaves the panel pinned to the top of the viewport.
    // paddingClasses constrains the width since `min-w-full!` on the wrapper defeats maxWidth="md".
    return (
      <Modal
        maxWidth="md"
        panelClasses="professor-enrollment-modal-panel"
        paddingClasses="max-w-md mx-auto w-full"
        closeButton={false}
      >
        <Frame showBorderOnMobile>{content}</Frame>
      </Modal>
    )
  }

  return (
    <div className="min-h-screen w-full bg-light-blue flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Frame showBorderOnMobile>{content}</Frame>
      </div>
    </div>
  )
}

ProfessorEnrollmentNew.layout = (page: ReactNode) => page

export default ProfessorEnrollmentNew
