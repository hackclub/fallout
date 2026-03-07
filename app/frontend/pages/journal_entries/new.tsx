import { useState, type ReactNode } from 'react'
import { Deferred as InertiaDeferred, router } from '@inertiajs/react'
import { Deferred as ModalDeferred, Modal } from '@inertiaui/modal-react'
import Frame from '@/components/shared/Frame'
import MarkdownEditor from '@/components/shared/MarkdownEditor'

type Project = { id: number; name: string }

type Timelapse = {
  id: string
  name: string
  thumbnailUrl: string
  playbackUrl: string
  duration: number
  createdAt: number
}

type HackatimeProject = {
  name: string
  time: number
  timelapses: Timelapse[]
}

function NewJournal({ projects, selected_project_id, lapse_connected, is_modal, direct_upload_url, hackatime_projects }: {
  projects: Project[]
  selected_project_id: number | null
  lapse_connected: boolean
  is_modal: boolean
  direct_upload_url: string
  hackatime_projects: HackatimeProject[] | null
}) {
  const initialProject = selected_project_id
    ? projects.find((p) => p.id === selected_project_id) ?? null
    : projects.length === 1 ? projects[0] : null

  const [selectedProject, setSelectedProject] = useState<Project | null>(initialProject)
  const [selectedTimelapses, setSelectedTimelapses] = useState<Set<string>>(new Set())
  const [markdown, setMarkdown] = useState('')
  const [blobSignedIds, setBlobSignedIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const Deferred = is_modal ? ModalDeferred : InertiaDeferred

  function toggleTimelapse(id: string) {
    setSelectedTimelapses((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSubmit() {
    if (!selectedProject || selectedTimelapses.size === 0) return
    setSubmitting(true)
    router.post(`/projects/${selectedProject.id}/journal_entries`, {
      timelapse_ids: Array.from(selectedTimelapses),
      content: markdown,
      images: blobSignedIds,
    }, {
      onFinish: () => setSubmitting(false),
    })
  }

  const content = selectedProject ? (
    <div className="w-full h-full mx-auto p-8 overflow-y-auto">
      <h1 className="font-bold text-3xl mb-4">New Journal</h1>
      <p className="text-lg">Journaling for: <span className="font-bold">{selectedProject.name}</span></p>
      {!lapse_connected && (
        <div className="mt-6 p-4 border border-amber-300 bg-amber-50 rounded-lg">
          <p className="text-lg font-bold mb-2">Connect Lapse</p>
          <p className="mb-3">You need to connect Lapse to record timelapses for your journal.</p>
          <a href={`/auth/lapse/start?return_to=journal&project_id=${selectedProject.id}`} className="inline-block px-4 py-2 bg-dark-brown text-white rounded font-bold hover:opacity-90">
            Connect Lapse
          </a>
        </div>
      )}
      {lapse_connected && (
        <Deferred data="hackatime_projects" fallback={<TimelapseSkeleton />}>
          <TimelapseBrowser
            hackatimeProjects={hackatime_projects ?? []}
            selectedTimelapses={selectedTimelapses}
            onToggle={toggleTimelapse}
          />
        </Deferred>
      )}
      <div className="mt-6">
        <h2 className="font-bold text-xl mb-3">Write about your work</h2>
        <MarkdownEditor
          value={markdown}
          onChange={setMarkdown}
          onBlobsChange={setBlobSignedIds}
          directUploadUrl={direct_upload_url}
          previewUrl="/journal_entries/preview"
        />
      </div>
      {selectedTimelapses.size > 0 && (
        <div className="mt-6">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-3 bg-dark-brown text-white rounded-lg font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {submitting ? 'Creating...' : `Create Journal (${selectedTimelapses.size} timelapse${selectedTimelapses.size !== 1 ? 's' : ''})`}
          </button>
        </div>
      )}
    </div>
  ) : (
    <div className="w-full h-full mx-auto p-8">
      <h1 className="font-bold text-3xl mb-4">Which project?</h1>
      <p className="text-lg mb-6">Select the project you want to journal for:</p>
      <div className="flex flex-col gap-3">
        {projects.map((project) => (
          <button
            key={project.id}
            onClick={() => setSelectedProject(project)}
            className="text-lg font-bold text-dark-brown hover:underline text-left cursor-pointer"
          >
            {project.name}
          </button>
        ))}
      </div>
    </div>
  )

  if (is_modal) {
    return (
      <Modal panelClasses="h-full" paddingClasses="max-w-5xl mx-auto" closeButton={false} maxWidth="7xl">
        <Frame className="h-full">{content}</Frame>
      </Modal>
    )
  }

  return content
}

function TimelapseSkeleton() {
  return (
    <div className="mt-6 space-y-6">
      <div className="h-7 w-48 bg-gray-200 rounded animate-pulse" />
      <div>
        <div className="h-6 w-32 bg-gray-200 rounded animate-pulse mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="aspect-video rounded-lg bg-gray-200 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
}

function TimelapseBrowser({ hackatimeProjects, selectedTimelapses, onToggle }: {
  hackatimeProjects: HackatimeProject[]
  selectedTimelapses: Set<string>
  onToggle: (id: string) => void
}) {
  const projectsWithTimelapses = hackatimeProjects.filter((p) => p.timelapses.length > 0)
  const emptyProjects = hackatimeProjects.filter((p) => p.timelapses.length === 0)

  if (hackatimeProjects.length === 0) {
    return (
      <div className="mt-6 p-4 border border-gray-200 rounded-lg text-gray-500">
        No Hackatime projects found. Start coding to generate timelapses!
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-6">
      <h2 className="font-bold text-xl">Select timelapses for your journal</h2>
      {projectsWithTimelapses.map((project) => (
        <div key={project.name}>
          <h3 className="font-bold text-lg mb-3">{project.name}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {project.timelapses.map((timelapse) => {
              const selected = selectedTimelapses.has(timelapse.id)
              return (
                <button
                  key={timelapse.id}
                  type="button"
                  onClick={() => onToggle(timelapse.id)}
                  className={`group relative aspect-video rounded-lg overflow-hidden bg-gray-100 border-2 cursor-pointer transition-all ${
                    selected ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <img
                    src={timelapse.thumbnailUrl}
                    alt={timelapse.name}
                    className="w-full h-full object-cover"
                  />
                  {selected && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-2 pt-6">
                    <p className="text-white text-sm font-medium truncate text-left">{timelapse.name}</p>
                    <p className="text-white/70 text-xs text-left">{formatDuration(timelapse.duration)}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {emptyProjects.length > 0 && (
        <div className="text-sm text-gray-400">
          {emptyProjects.length} project{emptyProjects.length !== 1 && 's'} with no timelapses: {emptyProjects.map((p) => p.name).join(', ')}
        </div>
      )}
    </div>
  )
}

NewJournal.layout = (page: ReactNode) => page

export default NewJournal
