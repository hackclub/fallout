import { type ReactNode, useState, useRef, useEffect } from 'react'
import { router } from '@inertiajs/react'
import { Modal } from '@inertiaui/modal-react'
import Frame from '@/components/shared/Frame'
import Button from '@/components/shared/Button'
import Input from '@/components/shared/Input'
import TextArea from '@/components/shared/TextArea'
import SpeechBubble from '@/components/onboarding/SpeechBubble'
import { Pagination, PaginationPage } from '@/components/shared/Pagination'

function ProjectsOnboarding({ is_modal }: { is_modal: boolean }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [processing, setProcessing] = useState(false)
  const modalRef = useRef<{ close: () => void }>(null)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (processing) return
    setProcessing(true)
    const data: Record<string, string> = { name, description }
    data.return_to = is_modal ? 'path' : 'path_projects'
    router.post('/projects', data, {
      onFinish: () => setProcessing(false),
      onSuccess: () => modalRef.current?.close(),
    })
  }

  const content = (
    <form onSubmit={submit} className="w-full h-full mx-auto p-8">
      <Pagination className="flex flex-col h-full">
        <PaginationPage>{({ next }) => <SpinPhase onComplete={next} />}</PaginationPage>

        <PaginationPage>
          {({ next }) => <DialogueScene prompt="Oh. It's you again?" onContinue={next} />}
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
              <div className="flex flex-col w-full max-w-4xl mx-auto h-full">
                <div className="flex items-start gap-3 mb-4">
                  <img src="/onboarding/chinese_heidi.webp" className="w-42 lg:w-56 h-auto" />

                  <div className="h-full pt-8">
                    <SpeechBubble dir="left">
                      watch this!! a 3 min overview of the ENTIRE program -- you'll regret not watching it
                    </SpeechBubble>
                  </div>
                </div>

                <div className="flex-1 flex items-center justify-center pb-12">
                  <div className="w-full border-2 border-dark-brown rounded-2xl overflow-hidden bg-white aspect-video">
                    <video src="/intro.mp4" className="w-full h-full object-contain" autoPlay controls playsInline />
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
              submitLabel={processing ? 'Creating...' : "Let's start!"}
              submitDisabled={!name.trim() || !description.trim() || processing}
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
      <img src="/onboarding/icepizero.png" alt="" className="absolute bottom-0 left-0 w-[45%] rotate-[-20deg] rounded shadow-md z-0" />
      <img
        src="/onboarding/jesuskeyboard.png"
        alt=""
        className="absolute bottom-[10%] left-[25%] w-[45%] rotate-[2deg] rounded shadow-lg z-10"
      />
      <img src="/onboarding/minimaimai.png" alt="" className="absolute top-0 right-0 w-[45%] rotate-[18deg] rounded shadow-xl z-20" />
    </div>
  )
}

function SpinPhase({ onComplete }: { onComplete: () => void }) {
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

    const handleEnded = () => onComplete()
    video.addEventListener('ended', handleEnded, { once: true })
    return () => {
      video.removeEventListener('ended', handleEnded)
      document.removeEventListener('click', playAudio)
    }
  }, [onComplete])

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

function Scene() {
  return (
    <>
      <div className="absolute bottom-0 left-0 bg-light-green h-[45%] w-full" />

      <div className="absolute top-0 left-0 right-0 h-[55%] overflow-hidden pointer-events-none">
        <img src="/clouds/4.webp" alt="" className="absolute bottom-0 left-0 h-20 md:h-36 -translate-x-1/3" />
        <img src="/clouds/1.webp" alt="" className="absolute bottom-0 left-40 h-20 md:h-32 translate-x-1/3" />
        <img src="/clouds/2.webp" alt="" className="absolute bottom-0 right-0 -translate-x-5/6 h-20 md:h-28" />
        <img src="/clouds/3.webp" alt="" className="absolute bottom-0 right-0 h-20 md:h-36 translate-x-1/3" />
      </div>

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
  submitDisabled = false,
  children,
}: {
  currentPage: number
  totalPages: number
  onContinue?: () => void
  continueDisabled?: boolean
  onBack?: () => void
  submitLabel?: string
  submitDisabled?: boolean
  children: ReactNode
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="fixed inset-0 z-50 p-16 bg-light-blue flex flex-col text-dark-brown overflow-hidden">
      <Scene />

      <div className="relative z-10 px-8 pt-6">
        <style>{`
          @keyframes progress-stripe {
            0% { background-position: 0 0; }
            100% { background-position: 42.43px 0; }
          }
        `}</style>
        <div className="w-full max-w-4xl mx-auto h-8 bg-white rounded-full border-3 border-gray-950 border-b-[6px] overflow-hidden relative">
          <div
            className="h-full bg-blue transition-all duration-500 relative rounded-full"
            style={{ width: `${Math.round((currentPage / totalPages) * 100)}%` }}
          >
            <div
              className="absolute inset-0 opacity-30 mix-blend-overlay"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(-45deg, transparent, transparent 15px, white 15px, white 30px)',
                backgroundSize: '42.43px 42.43px',
                animation: 'progress-stripe 1.5s linear infinite',
              }}
            />
          </div>
        </div>
      </div>

      <div
        className="relative z-10 flex-1 flex flex-col px-8 py-12 overflow-y-auto transition-opacity duration-1000"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {children}
      </div>

      <div className="relative z-20 flex items-center justify-between px-8 pb-4">
        {onBack ? (
          <button
            className="flex items-center gap-3 text-2xl lg:text-3xl font-bold cursor-pointer hover:text-brown transition-colors"
            onClick={onBack}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-8 h-8 lg:w-10 lg:h-10"
            >
              <path
                fillRule="evenodd"
                d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
                clipRule="evenodd"
              />
            </svg>
            Go back
          </button>
        ) : (
          <div />
        )}

        {submitLabel ? (
          <button
            type="submit"
            disabled={submitDisabled}
            className="py-4 px-10 lg:py-5 lg:px-14 bg-dark-brown text-light-brown rounded-2xl font-bold text-xl lg:text-2xl hover:bg-light-brown hover:text-dark-brown transition-all border-dark-brown border-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitLabel}
          </button>
        ) : onContinue ? (
          <button
            disabled={continueDisabled}
            className="py-4 px-10 lg:py-5 lg:px-14 bg-dark-brown text-light-brown rounded-2xl font-bold text-xl lg:text-2xl hover:bg-light-brown hover:text-dark-brown transition-all border-dark-brown border-2 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={continueDisabled ? undefined : onContinue}
          >
            continue
          </button>
        ) : null}
      </div>
    </div>
  )
}

function DialogueScene({
  prompt = null,
  angry = false,
  onContinue,
  onBack,
}: {
  prompt?: string | null
  angry?: boolean
  onContinue: () => void
  onBack?: () => void
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-light-blue flex flex-col items-center text-dark-brown overflow-hidden">
      <Scene />

      <section
        className="relative z-10 w-full flex-1 flex justify-center items-center flex-col transition-opacity duration-1000"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {prompt ? (
          <SpeechBubble text={prompt} />
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

      {onBack && (
        <button
          className="z-20 absolute bottom-4 left-4 text-lg underline cursor-pointer flex items-center h-12"
          onClick={onBack}
        >
          go back
        </button>
      )}

      <button
        className="z-20 absolute bottom-6 right-6 lg:bottom-10 lg:right-10 py-4 px-10 lg:py-5 lg:px-14 bg-dark-brown text-light-brown rounded-2xl font-bold text-xl lg:text-2xl hover:bg-light-brown hover:text-dark-brown transition-all border-dark-brown border-2"
        style={{ opacity: visible ? 1 : 0, transitionDuration: '1000ms' }}
        onClick={onContinue}
      >
        continue
      </button>
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
