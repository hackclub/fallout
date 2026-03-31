import { useState, useRef } from 'react'
import { router } from '@inertiajs/react'
import { Modal, ModalLink } from '@inertiaui/modal-react'
import { MagnifyingGlassIcon, BookOpenIcon, ClockIcon, FilmIcon } from '@heroicons/react/16/solid'
import { ArrowLeftIcon, PlusIcon } from '@heroicons/react/20/solid'
import Frame from '@/components/shared/Frame'
import Button from '@/components/shared/Button'
import Input from '@/components/shared/Input'
import Pagination from '@/components/Pagination'
import type { ProjectCard, PagyProps } from '@/types'

function formatTime(seconds: number): string {
  if (seconds === 0) return '0min'
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hrs === 0) return `${mins}min`
  return mins > 0 ? `${hrs}hrs ${mins}min` : `${hrs}hrs`
}

export default function ProjectsIndex({
  projects,
  pagy,
  query,
  is_modal,
}: {
  projects: ProjectCard[]
  pagy: PagyProps
  query: string
  is_modal: boolean
}) {
  const modalRef = useRef<{ close: () => void }>(null)
  const [searchQuery, setSearchQuery] = useState(query)

  function search(e: React.FormEvent) {
    e.preventDefault()
    router.get('/projects', { query: searchQuery }, { preserveState: true })
  }

  const content = (
    <div className="w-full mx-auto p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-4">
          {is_modal && (
            <button
              onClick={() => modalRef.current?.close()}
              className="md:hidden cursor-pointer text-dark-brown hover:opacity-80 shrink-0"
              aria-label="Back"
            >
              <ArrowLeftIcon className="w-8 h-8" />
            </button>
          )}
          <h1 className="font-bold text-3xl md:text-4xl text-dark-brown">My Projects</h1>
        </div>
        <ModalLink href="/projects/new">
          <button 
            className="bg-dark-brown text-light-brown rounded-full w-12 h-12 flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer shadow-md" 
            aria-label="New Project"
          >
            <PlusIcon className="w-10 h-10" />
          </button>
        </ModalLink>
      </div>

      {/* <form onSubmit={search} className="mb-6">
        <div className="flex gap-2">
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="flex-1"
          />
          <Button type="submit" className="flex items-center gap-1.5">
            <MagnifyingGlassIcon className="w-4 h-4" />
            Search
          </Button>
        </div>
      </form> */}

      {projects.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {projects.map((project) => (
              <ModalLink
                key={project.id}
                href={`/projects/${project.id}`}
                replace
                className="text-left rounded-md overflow-hidden p-3 bg-brown cursor-pointer hover:shadow-lg transition-shadow outline-0"
              >
                {project.cover_image_url ? (
                  <div
                    className="aspect-video bg-light-brown rounded overflow-hidden bg-center bg-cover bg-no-repeat"
                    style={{ backgroundImage: `url(${project.cover_image_url})` }}
                  />
                ) : (
                  <div className="aspect-video bg-light-brown rounded flex items-center justify-center">
                    <span className="text-dark-brown text-xl">No image yet</span>
                  </div>
                )}
                <div className="pt-3 pb-2 px-2">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-white truncate text-xl">{project.name}</p>
                    {project.is_collaborator && (
                      <span className="text-[10px] uppercase font-bold bg-dark-brown text-light-brown px-1.5 py-0.5 rounded-full shrink-0">
                        Collaborator
                      </span>
                    )}
                  </div>
                  {project.description && (
                    <p className="text-xs text-light-brown mt-1 line-clamp-2">{project.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-light-brown">
                    <span className="flex items-center gap-1">
                      <BookOpenIcon className="w-3.5 h-3.5" />
                      {project.journal_entries_count} {project.journal_entries_count === 1 ? 'entry' : 'entries'}
                    </span>
                    <span className="flex items-center gap-1">
                      <ClockIcon className="w-3.5 h-3.5" />
                      {formatTime(project.time_logged)}
                    </span>
                    <span className="flex items-center gap-1">
                      <FilmIcon className="w-3.5 h-3.5" />
                      {project.recordings_count} {project.recordings_count === 1 ? 'recording' : 'recordings'}
                    </span>
                  </div>
                </div>
              </ModalLink>
            ))}
          </div>

          <div className="mt-6">
            <Pagination pagy={pagy} />
          </div>
        </>
      ) : (
        <p className="text-dark-brown text-center py-8">No projects yet.</p>
      )}
    </div>
  )

  if (is_modal) {
    return (
      <Modal
        ref={modalRef}
        panelClasses="h-full max-h-none md:max-h-full max-md:w-full max-md:max-w-none max-md:bg-light-brown max-md:overflow-hidden"
        paddingClasses="p-0 md:max-w-5xl md:mx-auto"
        closeButton={false}
        maxWidth="7xl"
      >
        <Frame className="h-full">{content}</Frame>
      </Modal>
    )
  }

  return content
}
