import { useState, useRef } from 'react'
import { router, usePage } from '@inertiajs/react'
import { Modal, useModal } from '@inertiaui/modal-react'
import { ArrowLeftIcon } from '@heroicons/react/20/solid'
import Frame from '@/components/shared/Frame'
import Button from '@/components/shared/Button'
import Input from '@/components/shared/Input'
import TextArea from '@/components/shared/TextArea'
import { performModalMutation } from '@/lib/modalMutation'
import type { ProjectForm, SharedProps } from '@/types'

export default function ProjectsForm({
  project,
  title,
  submit_url,
  method,
  is_modal,
  onModalEvent,
}: {
  project: ProjectForm
  title: string
  submit_url: string
  method: string
  is_modal: boolean
  onModalEvent?: (event: string, ...args: any[]) => void
}) {
  const { errors: pageErrors } = usePage<SharedProps>().props
  const modalRef = useRef<{ close: () => void }>(null)
  const modal = useModal()
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [repoLink, setRepoLink] = useState(project.repo_link)
  const [processing, setProcessing] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({})
  const errors = Object.keys(formErrors).length > 0 ? formErrors : pageErrors

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (processing) return
    setProcessing(true)
    setFormErrors({})
    const data = { project: { name, description, repo_link: repoLink } }

    if (!is_modal) {
      const options = {
        onFinish: () => setProcessing(false),
      }

      if (method === 'patch') {
        router.patch(submit_url, data, options)
      } else {
        router.post(submit_url, data, options)
      }

      return
    }

    void performModalMutation({
      url: submit_url,
      method: method === 'patch' ? 'patch' : 'post',
      data,
      modal,
      modalRef,
      successMessage: method === 'patch' ? 'Project updated.' : 'Project created.',
      errorMessage: method === 'patch' ? 'Failed to update project.' : 'Failed to create project.',
      successEvent: method === 'patch' ? 'projectSaved' : 'projectCreated',
      onModalEvent,
      onValidationError: setFormErrors,
      onFinish: () => setProcessing(false),
    })
  }

  const content = (
    <div className="w-full h-full flex flex-col mx-auto px-4 md:px-8 pt-4 md:pt-8 min-h-0">
      <div className="flex items-center gap-4 mb-6 shrink-0">
        {is_modal && (
          <button
            type="button"
            onClick={() => modalRef.current?.close()}
            className="cursor-pointer text-dark-brown hover:opacity-80 shrink-0"
            aria-label="Back"
          >
            <ArrowLeftIcon className="w-8 h-8" />
          </button>
        )}
        <h1 className="font-bold text-3xl md:text-4xl text-dark-brown">{title}</h1>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-4 md:pb-8 pr-2">
        <form onSubmit={submit} className="space-y-4">
          {Object.keys(errors).length > 0 && (
            <div className="bg-coral/30 border-2 border-dark-brown text-dark-brown p-4 mb-4 rounded">
              <ul>
                {Object.entries(errors).map(([field, messages]) =>
                  messages.map((msg) => (
                    <li key={`${field}-${msg}`}>
                      {field} {msg}
                    </li>
                  )),
                )}
              </ul>
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-bold text-dark-brown mb-1">
              Project name
            </label>
            <Input type="text" id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-bold text-dark-brown mb-1">
              Description
            </label>
            <TextArea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </div>

          <div>
            <label htmlFor="repo_link" className="block text-sm font-bold text-dark-brown mb-1">
              GitHub repo link
            </label>
            <Input
              type="url"
              id="repo_link"
              value={repoLink}
              onChange={(e) => setRepoLink(e.target.value)}
              placeholder="https://github.com/..."
            />
          </div>

          <div className="pt-2 mb-2">
            <Button type="submit" disabled={processing}>
              {processing ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )

  if (is_modal) {
    return (
      <Modal
        ref={modalRef}
        panelClasses="h-full max-h-none md:max-h-full max-md:w-full max-md:max-w-none max-md:overflow-hidden"
        paddingClasses="p-0 md:max-w-5xl md:mx-auto"
        closeButton={false}
      >
        <Frame className="h-full" showBorderOnMobile>
          {content}
        </Frame>
      </Modal>
    )
  }

  return content
}
