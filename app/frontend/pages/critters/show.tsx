import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { router, Link } from '@inertiajs/react'
import FlashMessages from '@/components/FlashMessages'
import Button from '@/components/shared/Button'

const REVEAL_DELAY_MS = 1600

type CritterProps = {
  id: number
  image_path: string
  spun: boolean
}

type PageProps = {
  critter: CritterProps
  clearing_path: string
}

export default function CritterShow({ critter, clearing_path }: PageProps) {
  const [revealed, setRevealed] = useState(false)
  const [ready, setReady] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const img = new Image()
    img.src = critter.image_path
    if (img.complete) {
      setReady(true)
    } else {
      img.onload = () => setReady(true)
    }
  }, [critter.image_path])

  useEffect(() => {
    if (!ready) return
    const video = videoRef.current
    if (!video) return

    video.play()

    let timer: ReturnType<typeof setTimeout>
    const onPlay = () => {
      timer = setTimeout(() => {
        setRevealed(true)
        if (!critter.spun) {
          router.put(`/spin/${critter.id}`, {}, { preserveState: true, preserveScroll: true })
        }
      }, REVEAL_DELAY_MS)
    }

    video.addEventListener('playing', onPlay, { once: true })
    return () => {
      video.removeEventListener('playing', onPlay)
      clearTimeout(timer)
    }
  }, [ready])

  function replay() {
    setRevealed(false)
    if (videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play()
    }
    setTimeout(() => setRevealed(true), REVEAL_DELAY_MS)
  }

  return (
    <>
      <FlashMessages />
      <div className="relative min-h-screen w-full overflow-hidden bg-dark-brown">
        <video
          ref={videoRef}
          src="/spin_animation.mp4"
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            style={{ transitionProperty: 'opacity', transitionDuration: revealed ? '800ms' : '0ms' }}
            className={`flex flex-col items-center gap-4 ${revealed ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            <img
              src={critter.image_path}
              alt="Critter"
              className={`w-64 max-w-[70vw] xs:w-80 sm:w-96 object-contain transition-[filter] ${revealed ? 'critter-reveal' : ''}`}
            />
            <div className="flex gap-4 mt-2">
              <Button onClick={replay}>Replay</Button>
              <Link href={clearing_path}>
                <Button>Visit Clearing</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

CritterShow.layout = (page: ReactNode) => page
