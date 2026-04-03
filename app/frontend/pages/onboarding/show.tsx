import { type ReactNode, useState } from 'react'
import { Link, router } from '@inertiajs/react'
import DialogueStep from '../../components/onboarding/DialogueStep'
import SingleChoiceStep from '../../components/onboarding/SingleChoiceStep'
import MultiChoiceStep from '../../components/onboarding/MultiChoiceStep'
import Button from '@/components/shared/Button'

interface OnboardingStep {
  key: string
  type: 'dialogue' | 'single_choice' | 'multi_choice'
  prompt: string
  options?: string[]
}

interface PageProps {
  step: OnboardingStep
  step_index: number
  total_steps: number
  existing_answer: { answer_text: string; is_other: boolean } | null
  prev_step_key: string | null
}

function parseExistingMulti(existing: { answer_text: string } | null): string[] {
  if (!existing?.answer_text) return []
  try {
    return JSON.parse(existing.answer_text)
  } catch {
    return []
  }
}

function OnboardingShow({ step, step_index, total_steps, existing_answer, prev_step_key }: PageProps) {
  const [selected, setSelected] = useState<string | null>(
    step.type === 'single_choice' ? (existing_answer?.answer_text ?? null) : null,
  )
  const [multiSelected, setMultiSelected] = useState<string[]>(
    step.type === 'multi_choice' ? parseExistingMulti(existing_answer) : [],
  )
  const [processing, setProcessing] = useState(false)

  const progress = total_steps > 1 ? (step_index / (total_steps - 1)) * 100 : 0

  const canContinue =
    step.type === 'dialogue' ||
    (step.type === 'single_choice' && !!selected) ||
    (step.type === 'multi_choice' && multiSelected.length > 0)

  function handleContinue() {
    if (processing || !canContinue) return

    let answerText: string
    if (step.type === 'dialogue') answerText = 'acknowledged'
    else if (step.type === 'multi_choice') answerText = JSON.stringify(multiSelected)
    else answerText = selected!

    setProcessing(true)
    router.post(
      '/onboarding',
      {
        question_key: step.key,
        answer_text: answerText,
        is_other: false,
      },
      {
        onFinish: () => setProcessing(false),
      },
    )
  }

  function handleBack() {
    if (prev_step_key) {
      router.get(`/onboarding?step=${prev_step_key}`)
    }
  }

  function handleMultiToggle(option: string) {
    setMultiSelected((prev) => (prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]))
  }

  return (
    <div className="w-screen h-screen overflow-y-hidden bg-light-blue flex flex-col items-center text-dark-brown p-3 text-center text-base lg:text-lg">
      {step.type !== 'dialogue' && (
        <div className="w-full lg:w-[40%] bg-white rounded-full h-3 z-50">
          <div className="bg-blue h-3 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="absolute bottom-0 left-0 bg-light-green h-[45%] w-full" />

      {/* Clouds — pinned to bottom of sky band, overflow hidden */}
      <div className="absolute top-0 left-0 right-0 h-[55%] overflow-hidden pointer-events-none">
        <img src="/clouds/4.webp" alt="" className="absolute bottom-0 left-0 h-20 md:h-36 -translate-x-1/3" />
        <img src="/clouds/1.webp" alt="" className="absolute bottom-0 left-40 h-20 md:h-32 translate-x-1/3" />
        <img src="/clouds/2.webp" alt="" className="absolute bottom-0 right-0 -translate-x-5/6 h-20 md:h-28" />
        <img src="/clouds/3.webp" alt="" className="absolute bottom-0 right-0 h-20 md:h-36 translate-x-1/3" />
      </div>

      {/* Grass */}
      <img src="/grass/1.svg" className="absolute bottom-[32%] left-[3%] z-1 w-8" />
      <img src="/grass/2.svg" className="absolute bottom-[22%] left-[12%] z-1 w-10" />
      <img src="/grass/3.svg" className="absolute bottom-[10%] left-[8%] z-1 w-9" />
      <img src="/grass/4.svg" className="absolute bottom-[28%] left-[28%] z-1 w-7" />
      <img src="/grass/5.svg" className="absolute bottom-[15%] left-[22%] z-1 w-8" />
      <img src="/grass/6.svg" className="absolute bottom-[8%] left-[35%] z-1 w-7" />
      <img src="/grass/7.svg" className="absolute bottom-[30%] left-[45%] z-1 w-8" />
      <img src="/grass/8.svg" className="absolute bottom-[18%] left-[50%] z-1 w-9" />
      <img src="/grass/9.svg" className="absolute bottom-[5%] left-[55%] z-1 w-7" />
      <img src="/grass/10.svg" className="absolute bottom-[25%] right-[20%] z-1 w-8" />
      <img src="/grass/11.svg" className="absolute bottom-[12%] right-[12%] z-1 w-10" />
      <img src="/grass/1.svg" className="absolute bottom-[35%] right-[8%] z-1 w-7" />
      <img src="/grass/3.svg" className="absolute bottom-[6%] right-[3%] z-1 w-8" />
      <img src="/grass/5.svg" className="absolute bottom-[20%] right-[30%] z-1 w-6 hidden lg:block" />
      <img src="/grass/7.svg" className="absolute bottom-[3%] left-[42%] z-1 w-7 hidden lg:block" />

      {prev_step_key && (
        <button
          className="z-20 absolute bottom-4 left-4 text-lg underline cursor-pointer flex items-center h-12"
          onClick={handleBack}
        >
          go back
        </button>
      )}

      {canContinue && (
        <button
          className={`z-20 absolute bottom-4 right-4 py-3 px-8 bg-dark-brown text-light-brown rounded-xl font-bold text-lg hover:bg-light-brown hover:text-dark-brown transition-all border-dark-brown border-2 ${processing ? 'opacity-50 cursor-not-allowed' : ''}`}
          onClick={handleContinue}
          disabled={processing}
        >
          {processing ? 'saving...' : 'continue'}
        </button>
      )}

      {step.type === 'dialogue' && <DialogueStep step={step} />}

      {step.type === 'single_choice' && step.options && (
        <SingleChoiceStep
          step={{ prompt: step.prompt, options: step.options }}
          selected={selected}
          onSelect={setSelected}
        />
      )}

      {step.type === 'multi_choice' && step.options && (
        <MultiChoiceStep
          step={{ prompt: step.prompt, options: step.options }}
          selected={multiSelected}
          onToggle={handleMultiToggle}
        />
      )}
    </div>
  )
}

OnboardingShow.layout = (page: ReactNode) => page

export default OnboardingShow
