import type { ReactNode } from 'react'
import FlashMessages from '@/components/FlashMessages'
import { notify } from '@/lib/notifications'
import { router } from '@inertiajs/react'
import Progress from '@/components/onboarding/Progress'
import Dialogue from '@/components/onboarding/Dialogue'
import SingleChoice from '@/components/onboarding/SingleChoice'
import MultiChoice from '@/components/onboarding/MultiChoice'
import TextInput from '@/components/onboarding/TextInput'
import Custom from '@/components/onboarding/Custom'
import { useState } from 'react'

export interface OnboardingStep {
  key: string
  type: 'dialogue' | 'single_choice' | 'multi_choice' | 'text' | 'custom'
  prompt: string
  subtitle?: string
  options?: string[]
  allow_other?: boolean
  input_type?: string
  placeholder?: string
  component?: string
}

export interface StepProps {
  step: OnboardingStep
  existingAnswer: { answer_text: string; is_other: boolean } | null
  onSubmit: (data: { answer_text: string; is_other: boolean }) => void
  processing: boolean
}

interface PageProps {
  step: OnboardingStep
  step_index: number
  total_steps: number
  existing_answer: { answer_text: string; is_other: boolean } | null
}

const STEP_COMPONENTS: Record<string, React.ComponentType<StepProps>> = {
  dialogue: Dialogue,
  single_choice: SingleChoice,
  multi_choice: MultiChoice,
  text: TextInput,
  custom: Custom,
}

export default function OnboardingShow({ step, step_index, total_steps, existing_answer }: PageProps) {
  const [processing, setProcessing] = useState(false)

  function handleSubmit(data: { answer_text: string; is_other: boolean }) {
    setProcessing(true)
    router.post(
      '/onboarding',
      {
        question_key: step.key,
        answer_text: data.answer_text,
        is_other: data.is_other,
      },
      {
        onFinish: () => setProcessing(false),
        onError: () => notify('alert', 'Something went wrong. Please try again.'),
      },
    )
  }

  const StepComponent = STEP_COMPONENTS[step.type]

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <FlashMessages />
      <Progress current={step_index} total={total_steps} />
      <div className="w-full max-w-lg mt-8">
        {StepComponent && (
          <StepComponent
            step={step}
            existingAnswer={existing_answer}
            onSubmit={handleSubmit}
            processing={processing}
          />
        )}
      </div>
    </div>
  )
}

OnboardingShow.layout = (page: ReactNode) => page
