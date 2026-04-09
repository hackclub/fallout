import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { router, Link } from '@inertiajs/react'
import FlashMessages from '@/components/FlashMessages'
import Button from '@/components/shared/Button'

const REVEAL_DELAY_MS = 1600

type CritterProps = {
  id: number
  variant: string
  image_path: string
  audio_path: string
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
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    let imageReady = false
    let videoReady = false
    let audioReady = false

    const checkAll = () => {
      if (imageReady && videoReady && audioReady) setReady(true)
    }

    const img = new Image()
    img.src = critter.image_path
    if (img.complete) {
      imageReady = true
    } else {
      img.onload = () => {
        imageReady = true
        checkAll()
      }
    }

    const video = videoRef.current
    if (video) {
      if (video.readyState >= 3) {
        videoReady = true
      } else {
        video.addEventListener(
          'canplay',
          () => {
            videoReady = true
            checkAll()
          },
          { once: true },
        )
      }
    } else {
      videoReady = true
    }

    const audio = audioRef.current
    if (audio) {
      if (audio.readyState >= 3) {
        audioReady = true
      } else {
        audio.addEventListener(
          'canplay',
          () => {
            audioReady = true
            checkAll()
          },
          { once: true },
        )
      }
    } else {
      audioReady = true
    }

    checkAll()
  }, [critter.image_path])

  useEffect(() => {
    if (!ready) return
    const video = videoRef.current
    if (!video) return

    video.play()

    const audio = audioRef.current
    audio?.play().catch(() => {
      const playAudio = () => audio?.play().catch(() => {})
      document.addEventListener('click', playAudio, { once: true })
    })

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
    if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {})
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
        <audio ref={audioRef} src={critter.audio_path} preload="auto" />

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            style={{ transitionProperty: 'opacity', transitionDuration: revealed ? '1500ms' : '0ms' }}
            className={`flex flex-col items-center gap-4 ${revealed ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            <img src={critter.image_path} alt="Critter" className="w-64 max-w-[70vw] xs:w-80 sm:w-96 object-contain" />
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
