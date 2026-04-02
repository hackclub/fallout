import { type ReactNode, useState, useRef } from 'react'
import { router } from '@inertiajs/react'
import { Modal } from '@inertiaui/modal-react'
import Frame from '@/components/shared/Frame'
import Button from '@/components/shared/Button'
import Input from '@/components/shared/Input'
import TextArea from '@/components/shared/TextArea'
import { Pagination, PaginationPage } from '@/components/shared/Pagination'
import { Label } from '@headlessui/react'

function ProjectsOnboarding({ is_modal }: { is_modal: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
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
            <div className="space-y-5 text-xl flex flex-col h-full overflow-scroll">
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
              <div className="grow flex flex-col">
                <label className="text-lg mb-2">
                  <span className="font-bold">Describe what you want to build.</span> You'll be able to edit this later.
                </label>
                <TextArea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full min-h-10 h-full resize-y px-3 py-2 text-base"
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
            <div className="space-y-5 text-xl flex flex-col h-full overflow-scroll">
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
              <div className="grow h-full flex flex-col">
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
