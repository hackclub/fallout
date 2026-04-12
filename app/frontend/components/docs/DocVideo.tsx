import { useEffect, useRef } from 'react'
import { createPlayer } from '@videojs/react'
import { Video } from '@videojs/react/video'

const DocPlayer = createPlayer({ features: [] })

export default function DocVideo({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const video = el.querySelector('video')
        if (!video) return
        if (entry.isIntersecting) {
          video.play().catch(() => {})
        } else {
          video.pause()
        }
      },
      { threshold: 0.25 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [src])

  return (
    <div ref={containerRef} className="doc-video-container">
      <DocPlayer.Provider>
        <Video src={src} muted loop playsInline autoPlay={false} />
      </DocPlayer.Provider>
    </div>
  )
}
