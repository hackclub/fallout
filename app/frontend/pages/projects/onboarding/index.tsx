import { type ReactNode, useState, useRef, useEffect } from 'react'
import { router } from '@inertiajs/react'
import { Modal } from '@inertiaui/modal-react'
import Frame from '@/components/shared/Frame'
import Button from '@/components/shared/Button'
import Input from '@/components/shared/Input'
import TextArea from '@/components/shared/TextArea'
import { Pagination, PaginationPage } from '@/components/shared/Pagination'

function IntroVideo({ onContinue }: { onContinue: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ended, setEnded] = useState(false)

  useEffect(() => {
    videoRef.current?.play().catch(() => {})
  }, [])

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center">
        <video
          ref={videoRef}
          src="/intro.mp4"
          className="w-full aspect-video rounded-lg"
          autoPlay
          playsInline
          controls
          onEnded={() => setEnded(true)}
        />
      </div>
      <div className="flex justify-end mt-auto pt-4">
        <Button type="button" onClick={onContinue}>
          Continue
        </Button>
      </div>
    </>
  )
}

function ProjectsOnboarding({ is_modal }: { is_modal: boolean }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [processing, setProcessing] = useState(false)
  const modalRef = useRef<{ close: () => void }>(null)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (processing) return
    setProcessing(true)
    const data: Record<string, string> = { name, description }
    if (is_modal) data.return_to = 'path'
    router.post('/projects', data, {
      onFinish: () => setProcessing(false),
      onSuccess: () => modalRef.current?.close(),
    })
  }

  const content = (
    <form onSubmit={submit} className="w-full h-full mx-auto p-8">
      <Pagination className="flex flex-col h-full">
        <PaginationPage>{({ next }) => <IntroVideo onContinue={next} />}</PaginationPage>

        <PaginationPage>
          {({ next, prev }) => (
            <>
              <div className="flex flex-col flex-1 min-h-0">
                <h1 className="font-bold text-3xl mb-4">Let's get started!</h1>
                <p className="text-lg mb-4">
                  Build any hardware project and we'll help you make it real, but there are some things we look out for.
                </p>
                <p className="text-lg mb-4">
                  We value effort more than technical ability. Build something you've been wanting to make! It can be
                  really simple, but it should feel closer to a product than a demo. Your goal is to build something
                  others can re-create, experience, and build off of. AI is always low effort and will not help you to
                  create something personal.
                </p>
                <p className="text-lg mb-4">
                  Don't worry if you don't know how to get there, you'll be part of a greater community where you can
                  ask for help!
                </p>
                <p className="text-lg mb-6">First, describe what you want to build, and why!</p>
                <TextArea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="flex-1 min-h-lh overflow-y-auto resize-y"
                />
              </div>
              <div className="flex justify-between mt-auto pt-4">
                <Button variant="link" type="button" onClick={prev}>
                  go back
                </Button>
                <Button type="button" onClick={next} disabled={!description.trim()}>
                  Continue
                </Button>
              </div>
            </>
          )}
        </PaginationPage>

        <PaginationPage>
          {({ next, prev }) => (
            <>
              <div className="flex-1">
                <h1 className="font-bold text-3xl mb-4">Here's how it'll work</h1>
                <p className="text-lg mb-4">
                  You'll be tracking your progress and hours through a combination of journaling and timelapses.
                </p>
                <p className="text-lg mb-4">
                  You should timelapse/screen record everything that is hands-on. Time spent on research, design, CAD,
                  assembly counts, but waiting for 3D prints, or downloading software do not.
                </p>
                <p className="text-lg mb-4">
                  Journals can be tedious to write. Treat journals as notes for your future self and others to learn off
                  from your experience. AI doesn't know about your experience, so don't use it.
                </p>
                <p className="text-lg mb-6">
                  We're trusting you to track your hours truthfully. We'll be checking what you submit. Fraudulent
                  submissions will lead to a ban.
                </p>
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="custom-checkbox"
                  />
                  <span className="text-lg font-bold">I understand and I agree!</span>
                </label>
              </div>
              <div className="flex justify-between mt-auto pt-4">
                <Button variant="link" type="button" onClick={prev}>
                  go back
                </Button>
                <Button type="button" onClick={next} disabled={!agreed}>
                  Continue
                </Button>
              </div>
            </>
          )}
        </PaginationPage>

        <PaginationPage>
          {({ prev }) => (
            <>
              <div className="flex-1">
                <h1 className="font-bold text-3xl mb-4">Alright, let's go!</h1>
                <p className="text-lg mb-4">If you had to remember 3 things from this, it'd be:</p>
                <ol className="text-lg mb-6 list-decimal list-inside space-y-2">
                  <li>Build something you've been wanting to make</li>
                  <li>Timelapse/screen record your hands-on work</li>
                  <li>Track your hours truthfully</li>
                </ol>
                <p className="text-lg mb-4">
                  You should start designing your project and log it using lapse! Click on the next truck to do so!
                </p>
                <p className="text-lg mb-6">Before we wrap here, give your project a fun name</p>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My awesome project"
                  autoFocus
                />
              </div>
              <div className="flex justify-between mt-auto pt-4">
                <Button variant="link" type="button" onClick={prev}>
                  go back
                </Button>
                <Button type="submit" disabled={!name.trim() || processing}>
                  {processing ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </>
          )}
        </PaginationPage>
      </Pagination>
    </form>
  )

  if (is_modal) {
    return (
      <Modal ref={modalRef} panelClasses="h-full" paddingClasses="max-w-5xl mx-auto" closeButton={false} maxWidth="7xl">
        <Frame className="h-full">{content}</Frame>
      </Modal>
    )
  }

  return content
}

ProjectsOnboarding.layout = (page: ReactNode) => page

export default ProjectsOnboarding
