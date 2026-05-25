import SpeechBubble from './SpeechBubble'
import useDialogue from '@/hooks/useDialogue'

interface ProfessorEnrollmentCtaStepProps {
  step: {
    prompt: string
    body?: string
  }
  canEnroll: boolean
  isTrial: boolean
  submitting: boolean
  onEnroll: () => void
  onSkip: () => void
  onPromptComplete?: () => void
}

export default function ProfessorEnrollmentCtaStep({
  step,
  canEnroll,
  isTrial,
  submitting,
  onEnroll,
  onSkip,
  onPromptComplete,
}: ProfessorEnrollmentCtaStepProps) {
  const { displayedText, isComplete, skip } = useDialogue(step.prompt, { onComplete: onPromptComplete })

  return (
    <section className="relative z-1 w-full min-h-full pt-6 pb-28 flex flex-col items-center justify-center">
      <div className="flex items-center cursor-pointer" onClick={skip}>
        <img
          src="/onboarding/chinese_heidi.webp"
          className="w-28 lg:w-40 h-auto shrink-0 select-none"
          draggable={false}
        />
        {/* Ghost reserves the final bubble dimensions so Soup doesn't shift as text types in */}
        <div className="relative text-left">
          <div className="opacity-0 pointer-events-none select-none text-left" aria-hidden>
            <SpeechBubble dir="left" text={step.prompt} />
          </div>
          <div className="absolute inset-0 text-left">
            <SpeechBubble dir="left" text={displayedText} showCursor={!isComplete} />
          </div>
        </div>
      </div>
      <div
        className="flex flex-col items-center gap-3 w-full lg:w-[40%] lg:min-w-80 transition-opacity duration-300"
        style={{ opacity: isComplete ? 1 : 0, pointerEvents: isComplete ? 'auto' : 'none' }}
      >
        {step.body && <p className="text-sm lg:text-base text-dark-brown px-2 text-center">{step.body}</p>}
        {isTrial ? (
          <p className="text-sm text-brown px-2 text-center">
            We&apos;ll add you to the Slack channel within ~24hrs after you finish setting up and verify your account.
          </p>
        ) : (
          !canEnroll && (
            <p className="text-sm text-brown px-2 text-center">
              You&apos;ll be able to sign up for a mentor once your full account is set up.
            </p>
          )
        )}
        <button
          type="button"
          className="w-full min-h-14 rounded-xl cursor-pointer ease-in-out transition-all hover:scale-104 p-2 border-2 border-dark-brown bg-dark-brown text-light-brown disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          onClick={onEnroll}
          disabled={submitting || (!canEnroll && !isTrial)}
        >
          {submitting ? 'signing up…' : 'sign me up'}
        </button>
        <button
          type="button"
          className="w-full min-h-14 rounded-xl cursor-pointer ease-in-out transition-all hover:scale-104 p-2 border-2 border-dark-brown bg-white text-dark-brown disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          onClick={onSkip}
          disabled={submitting}
        >
          maybe later
        </button>
      </div>
    </section>
  )
}
