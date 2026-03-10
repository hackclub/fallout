import { useState, useRef, useEffect } from 'react'

const BGM_SRC = '/bgm/falling_into_the_sky__kale_wu.mp3'
const STORAGE_KEY = 'bgm-want'
// Events that trigger user activation per the HTML spec, unlocking audio autoplay
const ACTIVATION_EVENTS = ['keydown', 'mousedown', 'pointerdown', 'pointerup', 'touchend'] as const

export default function BgmPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [wantBgm, setWantBgm] = useState(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) ?? 'true') === 'true'
    } catch {
      return true
    }
  })

  const wantBgmRef = useRef(wantBgm)
  wantBgmRef.current = wantBgm

  useEffect(() => {
    const audio = new Audio(BGM_SRC)
    audio.loop = true
    audioRef.current = audio

    function removeListeners() {
      for (const event of ACTIVATION_EVENTS) {
        document.removeEventListener(event, tryPlay)
      }
    }

    function tryPlay() {
      if (!wantBgmRef.current || !audio.paused) return
      audio.play().then(() => {
        setIsPlaying(true)
        removeListeners()
      }).catch(() => {})
    }

    tryPlay()
    // Auto-play on first user activation gesture if browser blocked autoplay
    for (const event of ACTIVATION_EVENTS) {
      document.addEventListener(event, tryPlay)
    }

    return () => {
      removeListeners()
      audio.pause()
      audio.src = ''
      audioRef.current = null
    }
  }, [])

  function toggle() {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
      setWantBgm(false)
      localStorage.setItem(STORAGE_KEY, 'false')
    } else {
      audio.play().then(() => {
        setIsPlaying(true)
        if (!wantBgm) {
          setWantBgm(true)
          localStorage.setItem(STORAGE_KEY, 'true')
        }
      }).catch(() => {})
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
      aria-label={isPlaying ? 'Mute background music' : 'Unmute background music'}
    >
      {isPlaying ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-dark-brown">
          <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
          <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-dark-brown">
          <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM17.78 9.22a.75.75 0 1 0-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 1 0 1.06-1.06L20.56 12l1.72-1.72a.75.75 0 1 0-1.06-1.06l-1.72 1.72-1.72-1.72Z" />
        </svg>
      )}
    </button>
  )
}
