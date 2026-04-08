import SpeechBubble from './SpeechBubble'
import useDialogue from '@/hooks/useDialogue'

interface DialogueStepProps {
  step: {
    prompt: string
  }
  onComplete?: () => void
}

export default function DialogueStep({ step, onComplete }: DialogueStepProps) {
  const { displayedText, isComplete, skip } = useDialogue(step.prompt, { onComplete })

  return (
    <section className="relative z-1 min-h-full w-full cursor-pointer" onClick={skip}>
      <div
        className="absolute left-1/2 flex w-fit -translate-x-1/2 flex-col items-center px-4"
        style={{ top: 'calc(55% - clamp(5rem, 12vw, 8rem))' }}
      >
        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 'calc(100% - 0.75rem)' }}>
          <SpeechBubble
            text={displayedText}
            showCursor={!isComplete}
            style={{ maxWidth: 'min(34rem, calc(100vw - 2rem))' }}
          />
        </div>
        <img
          src="/onboarding/chinese_heidi.webp"
          className="w-60 lg:w-72 max-w-full h-auto select-none"
          draggable={false}
        />
      </div>
    </section>
  )
}
