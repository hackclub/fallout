import { type ReactNode, useEffect, useRef, useState } from 'react'
import { router } from '@inertiajs/react'
import DialogueStep from '../../components/onboarding/DialogueStep'
import SingleChoiceStep from '../../components/onboarding/SingleChoiceStep'
import MultiChoiceStep from '../../components/onboarding/MultiChoiceStep'
import NavigationButtons from '../../components/onboarding/NavigationButtons'
import ProgressBar from '@/components/shared/ProgressBar'
import { clearPathEntryTransition, rememberPathEntryTransition } from '@/lib/pathTransition'

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

const submitMorphDelayMs = 450
const finalPathTransitionDelayMs = 950
const sceneTransitionEase = 'cubic-bezier(0.22, 1, 0.36, 1)'

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
  const [finalizingSubmit, setFinalizingSubmit] = useState(false)
  const [finalStepSubmitted, setFinalStepSubmitted] = useState(false)
  const [pathTransitionStarted, setPathTransitionStarted] = useState(false)
  const [exitingStepKey, setExitingStepKey] = useState<string | null>(null)
  const [navigatingBack, setNavigatingBack] = useState(false)
  const [completedPromptStepKey, setCompletedPromptStepKey] = useState<string | null>(null)
  const submitDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const backDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingFinalSubmissionRef = useRef<{ stepKey: string; answerText: string } | null>(null)
  const previousStepKeyRef = useRef(step.key)
  const stepJustChanged = previousStepKeyRef.current !== step.key

  const isFinalStep = step.type !== 'dialogue' && step_index === total_steps - 1
  const isSubmitting = processing || finalizingSubmit
  const isBusy = isSubmitting || navigatingBack || pathTransitionStarted
  const baseProgress = total_steps > 1 ? (step_index / (total_steps - 1)) * 100 : 0
  const progress = isFinalStep ? (isSubmitting ? 100 : Math.min(baseProgress, 96)) : baseProgress
  const hideGoBackForTransition = navigatingBack && step_index <= 1

  const isPromptComplete = !stepJustChanged && completedPromptStepKey === step.key
  const hasAnswer =
    step.type === 'dialogue' ||
    (step.type === 'single_choice' && !!selected) ||
    (step.type === 'multi_choice' && multiSelected.length > 0)
  const canContinue = isPromptComplete && hasAnswer
  const isCurrentStepExiting = exitingStepKey === step.key
  const continueVisible = canContinue && !navigatingBack && !pathTransitionStarted && !isCurrentStepExiting
  const goBackVisible = !!prev_step_key && !hideGoBackForTransition && !pathTransitionStarted
  const continueButtonLabel =
    finalStepSubmitted || isCurrentStepExiting || isSubmitting ? 'saving...' : isFinalStep ? 'submit' : 'continue'
  const isPathTransitioning = pathTransitionStarted

  useEffect(() => {
    return () => {
      if (submitDelayRef.current) clearTimeout(submitDelayRef.current)
      if (backDelayRef.current) clearTimeout(backDelayRef.current)
    }
  }, [])

  useEffect(() => {
    previousStepKeyRef.current = step.key
  }, [step.key])

  useEffect(() => {
    if (submitDelayRef.current) {
      clearTimeout(submitDelayRef.current)
      submitDelayRef.current = null
    }
    if (backDelayRef.current) {
      clearTimeout(backDelayRef.current)
      backDelayRef.current = null
    }

    setProcessing(false)
    setFinalizingSubmit(false)
    setFinalStepSubmitted(false)
    setPathTransitionStarted(false)
    setExitingStepKey(null)
    setNavigatingBack(false)
    setCompletedPromptStepKey(null)
    pendingFinalSubmissionRef.current = null

    if (step.type === 'single_choice') {
      setSelected(existing_answer?.answer_text ?? null)
      setMultiSelected([])
      return
    }

    if (step.type === 'multi_choice') {
      setMultiSelected(parseExistingMulti(existing_answer))
      setSelected(null)
      return
    }

    setSelected(null)
    setMultiSelected([])
  }, [step.key, step.type, existing_answer?.answer_text])

  function submitAnswer(stepKey: string, answerText: string) {
    setProcessing(true)
    router.post(
      '/onboarding',
      {
        question_key: stepKey,
        answer_text: answerText,
        is_other: false,
      },
      {
        onFinish: () => {
          if (window.location.pathname.startsWith('/onboarding')) clearPathEntryTransition()
          setProcessing(false)
          setFinalizingSubmit(false)
          setExitingStepKey((current) => (current === stepKey ? null : current))
        },
      },
    )
  }

  function handleContinue() {
    if (isBusy || !canContinue) return

    let answerText: string
    if (step.type === 'dialogue') answerText = 'acknowledged'
    else if (step.type === 'multi_choice') answerText = JSON.stringify(multiSelected)
    else answerText = selected!

    setFinalizingSubmit(true)
    if (isFinalStep) {
      pendingFinalSubmissionRef.current = { stepKey: step.key, answerText }
      setFinalStepSubmitted(true)
      return
    }

    submitDelayRef.current = setTimeout(() => {
      submitDelayRef.current = null
      setExitingStepKey(step.key)
      submitAnswer(step.key, answerText)
    }, submitMorphDelayMs)
  }

  function handleFinalProgressComplete() {
    if (!isFinalStep || !finalStepSubmitted || pathTransitionStarted || !pendingFinalSubmissionRef.current) return

    const { stepKey, answerText } = pendingFinalSubmissionRef.current
    setPathTransitionStarted(true)

    submitDelayRef.current = setTimeout(() => {
      submitDelayRef.current = null
      rememberPathEntryTransition('onboarding-complete')
      submitAnswer(stepKey, answerText)
    }, finalPathTransitionDelayMs)
  }

  function handleBack() {
    if (isBusy) return
    if (prev_step_key) {
      setNavigatingBack(true)
      backDelayRef.current = setTimeout(() => {
        backDelayRef.current = null
        router.get(`/onboarding?step=${prev_step_key}`)
      }, 220)
    }
  }

  function handleMultiToggle(option: string) {
    setMultiSelected((prev) => (prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]))
  }

  return (
    <div className="w-screen h-screen overflow-y-hidden bg-light-blue flex flex-col items-center text-dark-brown p-3 text-center text-base lg:text-lg">
      {step.type !== 'dialogue' && (
        <div
          className="w-full"
          style={
            isPathTransitioning
              ? {
                  opacity: 0,
                  transform: 'translateY(28px)',
                  filter: 'blur(4px)',
                  transition: `opacity 480ms ${sceneTransitionEase}, transform 680ms ${sceneTransitionEase}, filter 480ms ${sceneTransitionEase}`,
                }
              : undefined
          }
        >
          <ProgressBar
            progress={progress}
            className="z-50 px-8 pt-6"
            animateAcrossVisitsKey="fallout-account-onboarding-progress"
            visitStepIndex={step_index}
            visitTotalSteps={total_steps}
            celebrateOnComplete
            onCompleteVisualsFinished={
              isFinalStep && finalStepSubmitted && !pathTransitionStarted ? handleFinalProgressComplete : undefined
            }
          />
        </div>
      )}

      <div
        className="absolute bottom-0 left-0 bg-light-green w-full"
        style={{
          height: isPathTransitioning ? '80%' : '45%',
          transition: `height ${finalPathTransitionDelayMs}ms ${sceneTransitionEase}`,
        }}
      />

      {/* Clouds — pinned to bottom of sky band, overflow hidden */}
      <div
        className="absolute top-0 left-0 right-0 overflow-hidden pointer-events-none"
        style={{
          height: isPathTransitioning ? '20%' : '55%',
          transition: `height ${finalPathTransitionDelayMs}ms ${sceneTransitionEase}`,
        }}
      >
        <img
          src="/clouds/4.webp"
          alt=""
          className="absolute bottom-0 left-0 h-30 md:h-50"
          style={{ transform: 'translateX(-33.333%) translateY(0%) scale(1)' }}
        />
        <img
          src="/clouds/1.webp"
          alt=""
          className="absolute bottom-0 left-40 h-30"
          style={{ transform: 'translateX(33.333%) translateY(0%) scale(1)' }}
        />
        <img
          src="/clouds/2.webp"
          alt=""
          className="absolute bottom-0 right-0 h-30"
          style={{ transform: 'translateX(-83.333%) translateY(0%) scale(1)' }}
        />
        <img
          src="/clouds/3.webp"
          alt=""
          className="absolute bottom-0 right-0 h-30 md:h-50 w-auto"
          style={{ transform: 'translateX(33.333%) translateY(0%) scale(1)' }}
        />
      </div>

      {/* Grass */}
      <div
        className="absolute inset-0"
        style={{
          opacity: isPathTransitioning ? 0 : 1,
          transition: `opacity ${finalPathTransitionDelayMs}ms ${sceneTransitionEase}`,
        }}
      >
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
      </div>

      <NavigationButtons
        backVisible={goBackVisible}
        backDisabled={isBusy}
        onBack={handleBack}
        continueVisible={continueVisible}
        continueDisabled={isBusy}
        continueLabel={continueButtonLabel}
        onContinue={handleContinue}
        continueTransitionOut={isPathTransitioning}
        sceneTransitionEase={sceneTransitionEase}
      />

      <div
        className="relative z-10 w-full flex-1 min-h-0 overflow-y-auto"
        style={
          isPathTransitioning
            ? {
                opacity: 0,
                transform: 'translateY(28px)',
                filter: 'blur(4px)',
                transition: `opacity 480ms ${sceneTransitionEase}, transform 680ms ${sceneTransitionEase}, filter 480ms ${sceneTransitionEase}`,
              }
            : undefined
        }
      >
        {step.type === 'dialogue' && (
          <DialogueStep step={step} onComplete={() => setCompletedPromptStepKey(step.key)} />
        )}

        {step.type === 'single_choice' && step.options && (
          <SingleChoiceStep
            step={{ prompt: step.prompt, options: step.options }}
            selected={selected}
            onSelect={setSelected}
            onPromptComplete={() => setCompletedPromptStepKey(step.key)}
          />
        )}

        {step.type === 'multi_choice' && step.options && (
          <MultiChoiceStep
            step={{ prompt: step.prompt, options: step.options }}
            selected={multiSelected}
            onToggle={handleMultiToggle}
            onPromptComplete={() => setCompletedPromptStepKey(step.key)}
          />
        )}
      </div>
    </div>
  )
}

OnboardingShow.layout = (page: ReactNode) => page

export default OnboardingShow
