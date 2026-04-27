import { type ReactNode, useState, useRef, useEffect } from 'react'
import { router } from '@inertiajs/react'
import { Modal } from '@inertiaui/modal-react'
import NavigationButtons from '@/components/onboarding/NavigationButtons'
import Frame from '@/components/shared/Frame'
import Input from '@/components/shared/Input'
import TextArea from '@/components/shared/TextArea'
import ProgressBar from '@/components/shared/ProgressBar'
import SpeechBubble from '@/components/onboarding/SpeechBubble'
import { Pagination, PaginationPage } from '@/components/shared/Pagination'
import useDialogue from '@/hooks/useDialogue'
import { playUrl } from '@/lib/dialogueAudio'
import { clearPathEntryTransition, rememberPathEntryTransition } from '@/lib/pathTransition'

const contentPhaseForwardTransitionMs = 320
const pathTransitionMs = 950
const sceneTransitionEase = 'cubic-bezier(0.22, 1, 0.36, 1)'

type PendingProjectSubmission = {
  name: string
  description: string
}

function ProjectsOnboarding({ is_modal }: { is_modal: boolean }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [processing, setProcessing] = useState(false)
  const [finalizingSubmit, setFinalizingSubmit] = useState(false)
  const [finalStepSubmitted, setFinalStepSubmitted] = useState(false)
  const [pathTransitionStarted, setPathTransitionStarted] = useState(false)
  const [submitAttemptKey, setSubmitAttemptKey] = useState(0)
  const [firstDialogueReady, setFirstDialogueReady] = useState(false)
  const [spinOverlay, setSpinOverlay] = useState(false)
  const [spinOverlayOut, setSpinOverlayOut] = useState(false)
  const modalRef = useRef<{ close: () => void }>(null)
  const pendingSubmissionRef = useRef<PendingProjectSubmission | null>(null)
  const pathTransitionDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function resetFinalSubmitState() {
    setFinalizingSubmit(false)
    setFinalStepSubmitted(false)
    setPathTransitionStarted(false)
    pendingSubmissionRef.current = null
    if (pathTransitionDelayRef.current) {
      clearTimeout(pathTransitionDelayRef.current)
      pathTransitionDelayRef.current = null
    }
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (processing || finalizingSubmit || !name.trim() || !description.trim()) return
    pendingSubmissionRef.current = { name, description }
    setSubmitAttemptKey((current) => current + 1)
    setFinalizingSubmit(true)
    setFinalStepSubmitted(true)
  }

  function submitProject(data: PendingProjectSubmission) {
    setProcessing(true)
    let requestSucceeded = false

    router.post(
      '/projects',
      {
        project: {
          name: data.name,
          description: data.description,
          repo_link: '',
        },
        return_to: is_modal ? 'path' : 'path_projects',
      },
      {
        onSuccess: () => {
          requestSucceeded = true
          modalRef.current?.close()
        },
        onFinish: () => {
          setProcessing(false)

          if (!requestSucceeded && window.location.pathname.startsWith('/projects/onboarding')) {
            clearPathEntryTransition()
            resetFinalSubmitState()
          }
        },
      },
    )
  }

  function handleFinalProgressComplete() {
    const pendingSubmission = pendingSubmissionRef.current
    if (!finalStepSubmitted || pathTransitionStarted || !pendingSubmission) return

    setPathTransitionStarted(true)

    const doSubmit = () =>
      submitProject({
        name: pendingSubmission.name,
        description: pendingSubmission.description,
      })

    if (!is_modal) {
      rememberPathEntryTransition('onboarding-complete', {
        introMode: 'onboarding',
        pendingModal: 'projects',
        readDocsNudge: true,
      })

      pathTransitionDelayRef.current = setTimeout(() => {
        pathTransitionDelayRef.current = null
        doSubmit()
      }, pathTransitionMs)
    } else {
      doSubmit()
    }
  }

  const content = (
    <>
      {/* Sky-blue overlay that appears instantly when spin video ends — matches DialogueScene bg, preventing any flash */}
      {spinOverlay && (
        <div
          className="fixed inset-0 z-[60] bg-light-blue pointer-events-none transition-opacity duration-1000"
          style={{ opacity: spinOverlayOut ? 0 : 1 }}
          onTransitionEnd={() => setSpinOverlay(false)}
        />
      )}
      <form onSubmit={submit} className="w-full h-full mx-auto p-8">
        <Pagination className="flex flex-col h-full">
          <PaginationPage>
            {({ next }) => (
              <SpinPhase
                onComplete={() => {
                  setSpinOverlay(true) // instantly cover the flash with dark overlay
                  next()
                  requestAnimationFrame(() => requestAnimationFrame(() => setSpinOverlayOut(true)))
                }}
                onReliefDone={() => setFirstDialogueReady(true)}
              />
            )}
          </PaginationPage>

          <PaginationPage>
            {({ next }) => (
              <DialogueScene prompt="Oh. It's you again?" onContinue={next} dialogueEnabled={firstDialogueReady} />
            )}
          </PaginationPage>

          <PaginationPage>
            {({ next, prev }) => (
              <DialogueScene prompt="I was woken up from my nap to help you start" onContinue={next} onBack={prev} />
            )}
          </PaginationPage>

          <PaginationPage>{({ next, prev }) => <DialogueScene angry onContinue={next} onBack={prev} />}</PaginationPage>

          <PaginationPage>
            {({ next, prev, currentPage, totalPages }) => (
              <ContentPhase currentPage={currentPage} totalPages={totalPages} onContinue={next} onBack={prev}>
                <div className="flex flex-col w-full max-w-4xl mx-auto h-full flex-1">
                  <div className="mb-[clamp(0.5rem,2vh,1rem)] sm:mb-[clamp(1rem,4vh,2rem)] flex flex-nowrap items-center gap-[clamp(0.5rem,2vh,1rem)] shrink-0">
                    <img
                      src="/onboarding/chinese_heidi.webp"
                      className="h-auto w-[clamp(4rem,15vh,14rem)] shrink-0 object-contain"
                    />

                    <div className="min-w-0 flex-1 relative top-0 sm:pt-[clamp(1rem,4vh,3rem)]">
                      <SpeechBubble dir="left" style={{ maxWidth: 'min(32rem, 100%)' }}>
                        <span className="block whitespace-normal text-[clamp(11px,2.5vh,18px)] leading-tight">
                          watch this!! a 3 min overview of the ENTIRE program -- you'll regret not watching it
                        </span>
                      </SpeechBubble>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 relative w-full mb-[clamp(0.5rem,2vh,3rem)] lg:mb-[clamp(2rem,8vh,6rem)]">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <video
                        src="/intro.mp4"
                        className="max-w-full max-h-full border-2 border-dark-brown rounded-2xl bg-white focus:outline-none"
                        autoPlay
                        controls
                        playsInline
                      />
                    </div>
                  </div>
                </div>
              </ContentPhase>
            )}
          </PaginationPage>

          <PaginationPage>
            {({ next, prev, currentPage, totalPages }) => (
              <ContentPhase
                currentPage={currentPage}
                totalPages={totalPages}
                onContinue={next}
                continueDisabled={!description.trim()}
                onBack={prev}
              >
                <div className="flex flex-col gap-6 lg:gap-8 w-full max-w-4xl mx-auto my-auto">
                  <div className="relative mt-8 lg:mt-12">
                    <div className="mb-8 pb-2 flex flex-col gap-8 md:pb-0 md:mb-6 md:flex-row md:items-start md:justify-between md:gap-4">
                      <h2 className="font-outfit text-3xl lg:text-5xl font-bold lg:pr-96">START YOUR FIRST PROJECT!</h2>
                      <PosterCollage className="pointer-events-none relative z-10 w-56 aspect-video shrink-0 mx-auto md:mx-0 lg:hidden" />
                    </div>

                    <div className="relative">
                      <PosterCollage className="pointer-events-none absolute right-0 -top-24 -right-8 z-10 hidden lg:block w-80 aspect-video" />

                      <div className="border-2 border-dark-brown rounded-2xl bg-white p-6 lg:p-8 pr-6 lg:pr-72 text-base lg:text-xl">
                        <p className="mb-4">Build as many hardware projects as you want!</p>
                        <ul className="list-disc ml-6 space-y-2">
                          <li>We value effort more than technical ability (LITTLE TO NO AI)</li>
                          <li>
                            <span className="font-bold">Be original!</span> Don't be a direct copy of tutorials
                          </li>
                          <li>
                            <span className="font-bold">Be personal.</span> You don't need to solve climate change.
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 mt-4">
                    <h3 className="font-outfit text-2xl lg:text-3xl font-bold">WHAT DO YOU WANT TO BUILD?</h3>
                    <TextArea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="DESCRIBE IN 2-3 SENTENCES"
                      className="rounded-2xl w-full h-32 lg:h-40 resize-none text-lg lg:text-xl p-4 lg:p-6"
                    />
                    <p className="text-base lg:text-xl text-brown">Jot something down! You can edit later</p>
                  </div>
                </div>
              </ContentPhase>
            )}
          </PaginationPage>

          <PaginationPage>
            {({ prev, currentPage, totalPages }) => (
              <ContentPhase
                currentPage={currentPage}
                totalPages={totalPages}
                onBack={prev}
                submitLabel={finalizingSubmit || pathTransitionStarted || processing ? 'creating...' : "let's start"}
                submitVisible={
                  finalizingSubmit || pathTransitionStarted || processing || (!!name.trim() && !!description.trim())
                }
                submitDisabled={
                  !name.trim() || !description.trim() || finalizingSubmit || pathTransitionStarted || processing
                }
                progress={finalizingSubmit || pathTransitionStarted || processing ? 100 : 96}
                celebrateOnComplete={finalStepSubmitted}
                completionKey={submitAttemptKey}
                onProgressComplete={handleFinalProgressComplete}
                isPathTransitioning={pathTransitionStarted && !is_modal}
              >
                <div className="flex flex-col gap-6 lg:gap-8 w-full max-w-4xl mx-auto my-auto">
                  <h2 className="font-outfit text-3xl lg:text-5xl font-bold">HERE'S HOW IT WORKS</h2>

                  <div className="relative border-2 border-dark-brown rounded-2xl bg-white p-6 lg:p-8 text-base lg:text-xl">
                    <p className="mb-4">We need to make sure the time is real.</p>
                    <p className="mb-4">
                      So... You'll be <span className="font-bold">timelapsing + journaling</span>!
                    </p>
                    <p className="leading-relaxed mb-4">
                      Please read our{' '}
                      <span className="relative inline-block">
                        <a
                          href="/docs/requirements/what-is-shipping"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline font-bold hover:text-brown transition-colors"
                        >
                          shipping & journaling guidelines
                        </a>
                        <span
                          className="mt-7 hidden lg:flex items-center gap-2 absolute left-[102%] top-1/2 -translate-y-1/2 cursor-pointer w-max hover:opacity-80 transition-opacity"
                          onClick={() => window.open('/docs', '_blank')}
                        >
                          <img src="/onboarding/arrow.svg" alt="" className="w-12" />
                          <img
                            src="/onboarding/guide.png"
                            alt="Guide"
                            className="w-28 hover:-translate-y-1 transition-transform"
                          />
                        </span>
                      </span>
                    </p>
                    <p className="">Actually, take 15 min and just read everything.</p>

                    <div
                      className="flex lg:hidden items-center gap-2 mt-4 cursor-pointer hover:opacity-80 transition-opacity w-max"
                      onClick={() => window.open('/docs', '_blank')}
                    >
                      <img src="/onboarding/arrow.svg" alt="" className="w-8 sm:w-10" />
                      <img
                        src="/onboarding/guide.png"
                        alt="Guide"
                        className="w-16 sm:w-20 hover:-translate-y-1 transition-transform"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 mt-4">
                    <h3 className="font-outfit text-2xl lg:text-3xl font-bold">GIVE YOUR PROJECT A FUN NAME</h3>
                    <Input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="My Awesome Project"
                      className="rounded-2xl text-lg lg:text-xl p-4 lg:p-6"
                    />
                    <p className="text-base lg:text-xl text-brown">You'll be able to edit this later.</p>
                  </div>
                </div>
              </ContentPhase>
            )}
          </PaginationPage>
        </Pagination>
      </form>
    </>
  )

  if (is_modal) {
    return (
      <Modal ref={modalRef} panelClasses="h-full" paddingClasses="max-w-5xl mx-auto" closeButton={false} maxWidth="7xl">
        <Frame className="h-full" showBorderOnMobile>
          {content}
        </Frame>
      </Modal>
    )
  }

  return content
}

ProjectsOnboarding.layout = (page: ReactNode) => page

export default ProjectsOnboarding

function PosterCollage({ className }: { className: string }) {
  return (
    <div className={className}>
      <img
        src="/magazine/icepizero.webp"
        alt=""
        className="absolute bottom-0 left-0 w-[45%] rotate-[-20deg] rounded shadow-md z-0"
      />
      <img
        src="/magazine/jesuskeyboard.webp"
        alt=""
        className="absolute bottom-[10%] left-[25%] w-[45%] rotate-[2deg] rounded shadow-lg z-10"
      />
      <img
        src="/magazine/minimaimai.webp"
        alt=""
        className="absolute top-0 right-0 w-[45%] rotate-[18deg] rounded shadow-xl z-20"
      />
    </div>
  )
}

function SpinPhase({ onComplete, onReliefDone }: { onComplete: () => void; onReliefDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    const audio = audioRef.current
    if (!video) return

    video.play()

    const playAudio = () => {
      audio?.play().catch(() => {})
    }

    audio?.play().catch(() => {
      document.addEventListener('click', playAudio, { once: true })
    })

    const handleEnded = () => {
      playUrl('/heidisounds/relief.mp3', 1200, onReliefDone, 1.2).catch(onReliefDone)
      onComplete()
    }
    video.addEventListener('ended', handleEnded, { once: true })
    return () => {
      video.removeEventListener('ended', handleEnded)
      document.removeEventListener('click', playAudio)
    }
  }, [onComplete, onReliefDone])

  return (
    <div className="fixed inset-0 z-50 bg-dark-brown flex items-center justify-center">
      <video
        ref={videoRef}
        src="/spin_animation.mp4"
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000"
        style={{ opacity: visible ? 1 : 0 }}
      />
      <audio ref={audioRef} src="/staraudio.mp3" preload="auto" />
    </div>
  )
}

function Scene({ isTransitioning = false }: { isTransitioning?: boolean }) {
  return (
    <>
      <div
        className="absolute bottom-0 left-0 bg-light-green w-full"
        style={{
          height: isTransitioning ? '80%' : '45%',
          transition: `height ${pathTransitionMs}ms ${sceneTransitionEase}`,
        }}
      />

      <div
        className="absolute top-0 left-0 right-0 overflow-hidden pointer-events-none"
        style={{
          height: isTransitioning ? '20%' : '55%',
          transition: `height ${pathTransitionMs}ms ${sceneTransitionEase}`,
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

      <div
        style={{
          opacity: isTransitioning ? 0 : 1,
          transition: `opacity ${pathTransitionMs}ms ${sceneTransitionEase}`,
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
    </>
  )
}

function ContentPhase({
  currentPage,
  totalPages,
  onContinue,
  continueDisabled = false,
  onBack,
  submitLabel,
  submitVisible = false,
  submitDisabled = false,
  progress,
  celebrateOnComplete = false,
  completionKey,
  onProgressComplete,
  isPathTransitioning = false,
  children,
}: {
  currentPage: number
  totalPages: number
  onContinue?: () => void
  continueDisabled?: boolean
  onBack?: () => void
  submitLabel?: string
  submitVisible?: boolean
  submitDisabled?: boolean
  progress?: number
  celebrateOnComplete?: boolean
  completionKey?: number
  onProgressComplete?: () => void
  isPathTransitioning?: boolean
  children: ReactNode
}) {
  const [forwardTransitioning, setForwardTransitioning] = useState(false)
  const forwardTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const continueVisible = !!onContinue && !continueDisabled
  const submitInProgress = submitLabel === 'creating...'
  const baseProgress = totalPages > 1 ? (currentPage / (totalPages - 1)) * 100 : 0
  const currentProgress = progress ?? baseProgress
  const buttonsLocked = submitInProgress || forwardTransitioning

  useEffect(() => {
    return () => {
      if (forwardTransitionTimeoutRef.current) {
        clearTimeout(forwardTransitionTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (forwardTransitionTimeoutRef.current) {
      clearTimeout(forwardTransitionTimeoutRef.current)
      forwardTransitionTimeoutRef.current = null
    }

    setForwardTransitioning(false)
  }, [currentPage])

  function handleContinue() {
    if (!onContinue || continueDisabled || forwardTransitioning) return

    setForwardTransitioning(true)
    forwardTransitionTimeoutRef.current = setTimeout(() => {
      forwardTransitionTimeoutRef.current = null
      onContinue()
    }, contentPhaseForwardTransitionMs)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-light-blue p-4 text-dark-brown sm:p-6 lg:p-16">
      <Scene isTransitioning={isPathTransitioning} />

      <div
        className="relative z-10 px-2 pt-4 sm:px-4 sm:pt-5 lg:px-8 lg:pt-6"
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
          progress={currentProgress}
          celebrateOnComplete={celebrateOnComplete}
          completionKey={completionKey}
          onCompleteVisualsFinished={celebrateOnComplete ? onProgressComplete : undefined}
        />
      </div>

      <div
        className="relative z-10 flex min-h-0 flex-1 flex-col"
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
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ pointerEvents: buttonsLocked ? 'none' : undefined }}>
          <div className="flex min-h-full flex-col px-2 pt-6 pb-28 sm:px-4 sm:pt-8 lg:px-8 lg:pt-12 lg:pb-36">
            {children}
          </div>
        </div>
      </div>

      <NavigationButtons
        backVisible={!!onBack && !isPathTransitioning}
        backDisabled={buttonsLocked}
        onBack={onBack}
        continueVisible={submitLabel ? submitVisible : continueVisible}
        continueDisabled={submitLabel ? submitDisabled : continueDisabled || forwardTransitioning}
        continueLabel={submitLabel ?? 'continue'}
        continueType={submitLabel ? 'submit' : 'button'}
        onContinue={submitLabel ? undefined : handleContinue}
        continueTransitionOut={forwardTransitioning || isPathTransitioning}
      />
    </div>
  )
}

function DialogueScene({
  prompt = null,
  angry = false,
  dialogueEnabled = true,
  onContinue,
  onBack,
}: {
  prompt?: string | null
  angry?: boolean
  dialogueEnabled?: boolean
  onContinue: () => void
  onBack?: () => void
}) {
  const { displayedText, isComplete, skip } = useDialogue(prompt ?? '', {
    enabled: !!prompt && dialogueEnabled,
  })

  // While waiting for relief to finish, show an empty bubble with a waiting cursor
  const bubbleText = prompt && !dialogueEnabled ? '' : displayedText
  const showCursor = !!prompt && (!isComplete || !dialogueEnabled)
  const continueReady = !prompt || (dialogueEnabled && isComplete)

  useEffect(() => {
    if (!angry) return
    playUrl('/heidisounds/angy.mp3', 400, undefined, 1.2).catch(() => {})
  }, [angry])

  return (
    <div className="fixed inset-0 z-50 bg-light-blue flex flex-col items-center text-dark-brown overflow-hidden">
      <Scene />

      <section
        className="relative z-10 w-full flex-1 flex justify-center items-center flex-col cursor-pointer"
        onClick={prompt ? skip : undefined}
      >
        {prompt ? (
          <SpeechBubble text={bubbleText} showCursor={showCursor} />
        ) : (
          <div className="invisible">
            <SpeechBubble text="." />
          </div>
        )}

        <div className="relative">
          <img src="/onboarding/chinese_heidi.webp" className="w-60 lg:w-72 max-w-full h-auto" />
          {angry && (
            <img src="/onboarding/anger.svg" className="absolute top-[8%] left-1/2 -translate-x-1/2 w-16 lg:w-20" />
          )}
        </div>
      </section>

      <NavigationButtons
        backVisible={!!onBack}
        onBack={onBack}
        continueVisible={continueReady}
        continueLabel="continue"
        onContinue={onContinue}
      />
    </div>
  )
}

/* commented out for reference) ------
import Input from '@/components/shared/Input'
import TextArea from '@/components/shared/TextArea'
import { Label } from '@headlessui/react'

<PaginationPage>
  {({ next }) => (
    <div className="space-y-5 text-xl flex flex-col h-full">
      <h2 className="font-outfit text-3xl font-semibold">Welcome to Fallout!!</h2>
      <div className="space-y-4">
        <p>
          This is a walkthrough to get your started!
          <br />
          We've made a really cool video showing how Fallout works. Give it a watch!
        </p>
      </div>
      <div className="grow min-h-0 flex items-center justify-center">
        <video
          ref={videoRef}
          src="/intro.mp4"
          className="max-w-full max-h-full rounded-lg"
          autoPlay
          playsInline
          controls
        />
      </div>
      <Button type="button" onClick={next} className="ml-auto">
        Continue
      </Button>
    </div>
  )}
</PaginationPage>

<PaginationPage>
  {({ next, prev }) => (
    <div className="space-y-5 text-xl flex flex-col h-full">
      <h2 className="font-outfit text-3xl font-semibold">Start your first project</h2>
      <div className="space-y-4">
        <p>Build as many hardware projects as you wish, and we'll help you make it real.</p>
        <div className="flex justify-between">
          <div>
            <p>However, there are some things we look for!</p>
            <ul className="list-disc ml-5 pt-2 min-w-90">
              <li>We value effort more than technical ability.</li>
              <li>Be original and personal. You don't need to solve climate change.</li>
              <li>Most of your project should be physical and hands-on.</li>
              <li>It should be by you, not AI, or a tutorial online.</li>
            </ul>
          </div>
          <div className="hidden lg:flex items-center justify-center">
            <img src="/onboarding/example.webp" alt="Example Projects" className="w-60" />
          </div>
        </div>
        <p>
          We know starting your first project is hard. We have a community to help you!
          <br />
          There's a good chance your first idea isn't great, but just jot something down!
        </p>
      </div>
      <div className="grow min-h-0 flex flex-col">
        <label className="text-lg mb-2">
          <span className="font-bold">Describe what you want to build.</span> You'll be able to edit this later.
        </label>
        <TextArea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full h-full resize-y px-3 py-2 text-base"
        />
      </div>
      <div className="flex justify-between">
        <Button variant="link" type="button" onClick={prev}>
          Back
        </Button>
        <Button type="button" onClick={next} disabled={!description.trim()}>
          Continue
        </Button>
      </div>
    </div>
  )}
</PaginationPage>

<PaginationPage>
  {({ prev }) => (
    <div className="space-y-5 text-xl flex flex-col h-full">
      <h2 className="font-outfit text-3xl font-semibold">Here's how it'll work</h2>
      <div className="space-y-4">
        <p>We need to make sure the time you're spending is real.</p>
        <p>You'll be time-lapsing your progress, and journaling.</p>
        <p>
          Journaling is a great practice for your future self and others hoping to learn from your experiences.
          Don't use AI. AI doesn't know your experiences.
        </p>
        <div className="flex justify-between">
          <div className="space-y-4">
            <p>
              Screen record and film everything that's hands-on. We have more information in our documentation!
              (check the backpack icon on the main page →)
            </p>
            <p>
              We've written a lot of helpful notes in the documentation section.
              <br />
              Make sure to give it a read after this: (backpack icon on the main page →)
            </p>
          </div>
          <div className="hidden lg:flex justify-center items-center">
            <a href="/docs" target="_blank" rel="noopener noreferrer">
              <img src="/icon/guide.webp" alt="Guide Icon" className="w-50" />
            </a>
          </div>
        </div>
      </div>
      <div className="grow min-h-0 flex flex-col">
        <label className="text-lg mb-2">
          <span className="font-bold">Give your project a fun name.</span> You'll be able to edit this later.
        </label>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-base px-3 py-2"
          placeholder=""
        />
      </div>
      <div className="flex justify-between">
        <Button variant="link" type="button" onClick={prev}>
          Back
        </Button>
        <Button type="submit" disabled={!name.trim() || processing}>
          {processing ? 'Creating...' : "Let's start!"}
        </Button>
      </div>
    </div>
  )}
</PaginationPage>
------- */
