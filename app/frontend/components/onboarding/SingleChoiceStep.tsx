import SpeechBubble from './SpeechBubble'
import useDialogue from '@/hooks/useDialogue'

interface SingleChoiceStepProps {
  step: {
    prompt: string
    options: string[]
  }
  selected: string | null
  onSelect: (answer: string) => void
  onPromptComplete?: () => void
}

export default function SingleChoiceStep({ step, selected, onSelect, onPromptComplete }: SingleChoiceStepProps) {
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
      <ul
        className="flex flex-col gap-2 lg:gap-3 w-full lg:w-[40%] lg:min-w-80 transition-opacity duration-300"
        style={{ opacity: isComplete ? 1 : 0, pointerEvents: isComplete ? 'auto' : 'none' }}
      >
        {step.options.map((option) => (
          <li key={option}>
            <button
              className={`w-full min-h-14 rounded-xl cursor-pointer ease-in-out transition-all hover:scale-104 p-2 border-2 border-dark-brown
                ${selected === option ? 'bg-dark-brown text-light-brown' : 'bg-white'}`}
              onClick={() => onSelect(option)}
            >
              {option}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
