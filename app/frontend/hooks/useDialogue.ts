import { useState, useEffect, useRef, useCallback } from 'react'
import { preload, playLetter, playThonk, stopAll } from '@/lib/dialogueAudio'

interface UseDialogueOptions {
  speed?: number
  enabled?: boolean
  onComplete?: () => void
}

interface UseDialogueReturn {
  displayedText: string
  isComplete: boolean
  skip: () => void
}

const PAUSE_CHARS: Record<string, number> = {
  '.': 4,
  '!': 4,
  '?': 4,
  ',': 2,
  ';': 2,
  ':': 2,
  '—': 2,
  '-': 2,
}

export default function useDialogue(
  text: string,
  { speed = 45, enabled = true, onComplete }: UseDialogueOptions = {},
): UseDialogueReturn {
  const [displayedText, setDisplayedText] = useState('')
  const [isComplete, setIsComplete] = useState(false)
  const indexRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const skip = useCallback(() => {
    if (!enabled) return
    clearTimeout(timeoutRef.current)
    stopAll()
    playThonk()
    setDisplayedText(text)
    setIsComplete(true)
    onCompleteRef.current?.()
  }, [text, enabled])

  useEffect(() => {
    if (!enabled) {
      setDisplayedText('')
      setIsComplete(false)
      return
    }

    indexRef.current = 0
    setDisplayedText('')
    setIsComplete(false)
    preload()

    function tick() {
      const i = indexRef.current
      if (i >= text.length) {
        setIsComplete(true)
        onCompleteRef.current?.()
        return
      }

      const char = text[i]
      const nextChar = text[i + 1]
      const { consumed } = playLetter(char, nextChar)
      indexRef.current = i + consumed
      setDisplayedText(text.substring(0, indexRef.current))

      if (indexRef.current >= text.length) {
        setIsComplete(true)
        onCompleteRef.current?.()
        return
      }

      const pauseMultiplier = PAUSE_CHARS[char] ?? 1
      timeoutRef.current = setTimeout(tick, speed * pauseMultiplier)
    }

    timeoutRef.current = setTimeout(tick, speed)

    return () => {
      clearTimeout(timeoutRef.current)
      stopAll()
    }
  }, [text, speed, enabled])

  return { displayedText, isComplete, skip }
}
