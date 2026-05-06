import { useEffect, useRef, useState } from 'react'
import { createPlayer } from '@videojs/react'
import { Video, VideoSkin, videoFeatures } from '@videojs/react/video'
import '@videojs/react/video/skin.css'

const DocPlayer = createPlayer({ features: videoFeatures })

export default function DocVideo({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLoaded(true)
          observer.disconnect()
        }
      },
      { rootMargin: '300px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Autoplay when visible, pause when scrolled away
  useEffect(() => {
    if (!loaded) return
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
  }, [loaded])

  return (
    <div ref={containerRef} className="doc-video-container" style={{ width: '100%', display: 'flex' }}>
      {loaded && (
        <DocPlayer.Provider>
          <VideoSkin style={{ width: '100%', height: '100%' }}>
            <Video src={src} muted loop playsInline autoPlay={false} />
          </VideoSkin>
        </DocPlayer.Provider>
      )}
    </div>
  )
}
