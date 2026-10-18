import { useMemo, type ReactNode } from 'react'
import { PhotoIcon } from '@heroicons/react/24/outline'
import Frame from '@/components/shared/Frame'

const GRASS_IMAGES = Array.from({ length: 11 }, (_, i) => `/grass/${i + 1}.svg`)
const GRASS_COUNT = 30

type CertificateProject = {
  name: string
  description: string | null
  thumbnail_url: string | null
  url: string
  approved_hours: number
}

type Props = {
  full_name: string
  avatar: string
  projects: CertificateProject[]
}

export default function CertificateVerificationShow({ full_name, avatar, projects }: Props) {
  return (
    <PageWrapper>
      <img src={avatar} alt="" className="w-20 h-20 rounded-full border-2 border-dark-brown mb-4" />
      <p className="text-lg font-bold mb-4">{full_name}</p>
      <p className="text-sm mb-4">
        Fallout is a six month long program ran by Hack Club where teenagers spent 60 hours building hardware projects.
        By earning this certification, students have proven themselves as technically adept and have shipped open source
        hardware.
      </p>
      <p className="text-sm mb-6">All submitted projects were evaluated and approved by members of the Fallout team.</p>

      <div className="flex flex-col gap-2 w-full">
        {projects.map((project) => (
          <a
            key={project.url}
            href={project.url}
            className="flex gap-3 py-2 px-3 border-2 border-dark-brown bg-light-brown text-left"
          >
            <div className="w-14 h-14 shrink-0 flex items-center justify-center overflow-hidden border-2 border-dark-brown">
              {project.thumbnail_url ? (
                <img src={project.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <PhotoIcon className="w-6 h-6 text-brown" strokeWidth={1.25} aria-hidden />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold truncate">{project.name}</span>
                <span className="shrink-0 text-sm">{project.approved_hours}h</span>
              </div>
              {project.description && <p className="text-xs line-clamp-2">{project.description}</p>}
            </div>
          </a>
        ))}
      </div>
    </PageWrapper>
  )
}

function PageWrapper({ children }: { children: ReactNode }) {
  const grassBlades = useMemo(
    () =>
      Array.from({ length: GRASS_COUNT }, (_, i) => ({
        id: i,
        src: GRASS_IMAGES[i % GRASS_IMAGES.length],
        left: Math.random() * 100,
        top: Math.random() * 100,
        scale: 0.4 + Math.random() * 0.4,
        rotation: (Math.random() - 0.5) * 30,
        flipX: Math.random() > 0.5,
      })),
    [],
  )

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Sky */}
      <div className="fixed top-0 left-0 right-0 h-[40vh] bg-light-blue overflow-hidden">
        <img src="/clouds/4.webp" alt="" className="absolute bottom-0 left-0 h-full -translate-x-1/3" />
        <img src="/clouds/1.webp" alt="" className="absolute bottom-0 left-40 h-full translate-x-1/3" />
        <img src="/clouds/2.webp" alt="" className="absolute bottom-0 right-0 -translate-x-5/6 h-full" />
        <img src="/clouds/3.webp" alt="" className="absolute bottom-0 right-0 h-full translate-x-1/3" />
      </div>

      {/* Ground */}
      <div className="fixed top-[40vh] left-0 right-0 bottom-0 bg-light-green">
        {grassBlades.map((g) => (
          <img
            key={g.id}
            src={g.src}
            alt=""
            className="absolute pointer-events-none select-none"
            style={{
              left: `${g.left}%`,
              top: `${g.top}%`,
              width: 40,
              height: 60,
              transform: `translate(-50%, -50%) scale(${g.flipX ? -g.scale : g.scale}, ${g.scale}) rotate(${g.rotation}deg)`,
            }}
          />
        ))}
      </div>

      {/* Card */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4 text-dark-brown">
        <Frame showBorderOnMobile>
          <div className="flex flex-col items-center text-center p-6 max-w-sm">{children}</div>
        </Frame>
      </div>
    </div>
  )
}

CertificateVerificationShow.layout = (page: ReactNode) => page
