import { useState, useEffect, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { preload as preloadDialogue, playLetter, playThonk, stopAll, playUrl } from '@/lib/dialogueAudio'

export type DialogChoice = {
  label: string
  goTo?: number
  onSelect?: () => void
}

export type DialogStep = {
  text?: string
  // Inline mix of animated strings and React nodes (images, SVGs, etc.)
  segments?: Array<string | ReactNode>
  // Full ReactNode for the whole step body (no char animation)
  content?: ReactNode
  choices?: DialogChoice[]
  last?: boolean
}

export type DialogScript = {
  mascotSrc: string
  speakerName: string
  steps: DialogStep[]
  onEnd?: () => void
}

export default function PathDialogOverlay({
  isOpen,
  onClose,
  script,
}: {
  isOpen: boolean
  onClose: () => void
  script: DialogScript
}) {
  const { mascotSrc, speakerName, steps, onEnd } = script

  const [step, setStep] = useState(0)
  const [showInstantly, setShowInstantly] = useState(false)
  const [isRevealed, setIsRevealed] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [pressing, setPressing] = useState(false)
  const [showArrow, setShowArrow] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [dialogScale, setDialogScale] = useState(() =>
    typeof window !== 'undefined' ? Math.min(1, (window.innerWidth - 32) / 750) : 1,
  )

  useEffect(() => {
    const update = () => setDialogScale(Math.min(1, (window.innerWidth - 32) / 750))
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const currentDialog = steps[step]
  const hasSegments = !!currentDialog?.segments
  const hasContent = !!currentDialog?.content && !hasSegments
  // Derive plain text for audio timing: from segments string parts, or text field
  const text = hasSegments
    ? currentDialog.segments!.filter((s): s is string => typeof s === 'string').join('')
    : (currentDialog?.text ?? '')

  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const dialogTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const audioTimersRef = useRef<NodeJS.Timeout[]>([])

  useEffect(() => {
    if (isOpen) {
      preloadDialogue()
      playUrl('/click.wav', 0, undefined, 0)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      setStep(0)
      setShowInstantly(false)
      setIsRevealed(false)
      setShowArrow(false)
      setShowDialog(false)
      setSpeed(1)
      stopAll()
      if (dialogTimeoutRef.current) clearTimeout(dialogTimeoutRef.current)
    } else {
      dialogTimeoutRef.current = setTimeout(() => {
        setShowDialog(true)
      }, 1000)
    }
    return () => {
      if (dialogTimeoutRef.current) clearTimeout(dialogTimeoutRef.current)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !showDialog || showInstantly || hasContent) return

    audioTimersRef.current.forEach(clearTimeout)
    audioTimersRef.current = []

    const msPerChar = 30 / speed
    let charIndex = 0
    const chars = text.split('')
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i]
      if (/\s/.test(char)) {
        charIndex++
        continue
      }
      const delay = charIndex * msPerChar
      const nextChar = chars[i + 1]
      const timer = setTimeout(() => playLetter(char, nextChar), delay)
      audioTimersRef.current.push(timer)
      charIndex++
    }

    return () => {
      audioTimersRef.current.forEach(clearTimeout)
      audioTimersRef.current = []
    }
  }, [text, isOpen, showDialog, showInstantly, speed, hasContent])

  useEffect(() => {
    if (!isOpen || !showDialog) return

    if (speed === 1) {
      setShowInstantly(false)
      setIsRevealed(false)
      setShowArrow(false)
    }

    if (hasContent) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setIsRevealed(true), speed > 1 ? 0 : 400)
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
      }
    }

    const msPerChar = 30 / speed
    const charCount = text.replace(/\s+/g, '').length
    const duration = charCount * msPerChar + 300

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setIsRevealed(true)
    }, duration)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [text, isOpen, showDialog, speed, hasContent])

  const arrowTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (arrowTimeoutRef.current) clearTimeout(arrowTimeoutRef.current)
    if (isRevealed) {
      arrowTimeoutRef.current = setTimeout(() => setShowArrow(true), 500)
    } else {
      setShowArrow(false)
    }
    return () => {
      if (arrowTimeoutRef.current) clearTimeout(arrowTimeoutRef.current)
    }
  }, [isRevealed])

  const playClick = useCallback(() => {
    playUrl('/click.wav', 0, undefined, 0.5)
  }, [])

  const triggerClose = (afterClose?: () => void) => {
    setIsClosing(true)
    setTimeout(() => {
      setIsClosing(false)
      onClose()
      afterClose?.()
    }, 600)
  }

  const handleProgress = () => {
    if (!isRevealed) {
      if (speed < 4) {
        setSpeed(4)
      }
    } else {
      playClick()
      if (!currentDialog.choices) {
        if (currentDialog.last) {
          triggerClose(onEnd)
        } else if (step < steps.length - 1) {
          setShowInstantly(false)
          setIsRevealed(false)
          setSpeed(1)
          setStep((s) => s + 1)
        } else {
          triggerClose()
        }
      }
    }
  }

  const handleChoice = (choice: DialogChoice) => {
    playClick()
    if (choice.goTo != null) {
      setShowInstantly(false)
      setIsRevealed(false)
      setSpeed(1)
      setStep(choice.goTo)
    } else {
      triggerClose(choice.onSelect)
    }
  }

  // Renders a plain string with char-by-char animation, advancing globalCharIndex
  function renderAnimatedString(str: string, keyPrefix: string, counter: { value: number }) {
    return str.split(/(\s+)/).map((word, wordIdx) => {
      if (word.match(/^\s+$/)) {
        counter.value += word.length
        return (
          <span key={`${keyPrefix}-s${wordIdx}`} style={{ whiteSpace: 'pre-wrap' }}>
            {word}
          </span>
        )
      }
      return (
        <span key={`${keyPrefix}-w${wordIdx}`} className="inline-block">
          {word.split('').map((char, charIdx) => {
            const delay = counter.value++
            return (
              <motion.span
                key={charIdx}
                initial={showInstantly ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: showInstantly ? 0 : delay * (0.03 / speed),
                  type: 'spring',
                  stiffness: 1400,
                  damping: 80,
                  mass: 4,
                }}
                className="inline-block"
              >
                {char}
              </motion.span>
            )
          })}
        </span>
      )
    })
  }

  let dialogBody: ReactNode

  if (hasSegments) {
    const counter = { value: 0 }
    dialogBody = currentDialog.segments!.map((seg, segIdx) => {
      if (typeof seg === 'string') {
        return renderAnimatedString(seg, `${segIdx}`, counter)
      }
      const delay = counter.value
      return (
        <motion.span
          key={`${segIdx}-node`}
          className="inline-block align-middle"
          initial={showInstantly ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: showInstantly ? 0 : delay * (0.03 / speed),
            type: 'spring',
            stiffness: 500,
            damping: 30,
          }}
        >
          {seg}
        </motion.span>
      )
    })
  } else if (hasContent) {
    dialogBody = (
      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="inline">
        {currentDialog.content}
      </motion.span>
    )
  } else {
    const counter = { value: 0 }
    dialogBody = renderAnimatedString(text, 'text', counter)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center select-none"
          onClick={handleProgress}
          onMouseDown={() => isRevealed && setPressing(true)}
          onMouseUp={() => setPressing(false)}
          onMouseLeave={() => setPressing(false)}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isClosing ? 0 : 1 }}
            className="absolute inset-0 bg-black/40"
          />

          <motion.img
            src={mascotSrc}
            alt="Mascot"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: isClosing ? '100%' : '0%', opacity: isClosing ? 0 : 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 2 }}
            className="absolute z-30 object-contain object-bottom pointer-events-none -translate-x-1/2"
            style={{ bottom: 0, height: 'calc(50vh - 130px)', left: 'calc(50% - 10vw)', scale: 1.7, rotate: '12deg' }}
          />

          <div className="relative w-full max-w-4xl h-full flex items-center justify-center">
            <AnimatePresence>
              {showDialog && (
                <div style={{ transform: `scale(${dialogScale})`, transformOrigin: 'center' }}>
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0, y: 50 }}
                    animate={{
                      scale: isClosing ? 0.8 : pressing ? 0.96 : 1,
                      opacity: isClosing ? 0 : 1,
                      y: isClosing ? 50 : 0,
                    }}
                    exit={{ scale: 0.8, opacity: 0, y: 50 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="relative w-[750px] h-[260px] z-20 rotate-[1.36deg]"
                  >
                    <img
                      src="/dialogbox.svg"
                      alt="Dialog"
                      className="absolute inset-0 w-full h-full pointer-events-none"
                    />

                    <div className="absolute top-0 left-[60px] bg-[#E2826A] text-white px-7 py-1.5 rounded-full font-medium text-2xl rotate-[-5.3deg]">
                      {speakerName}
                    </div>

                    <div className="absolute inset-0 z-10 flex flex-col justify-center pl-[80px] pr-[50px] pt-[30px] pb-[30px]">
                      <p
                        key={step}
                        className="text-[#8A7B66] leading-[1.3] w-full text-left"
                        style={{
                          fontSize: '36px',
                          fontFamily: '"Google Sans Flex", sans-serif',
                          fontWeight: 500,
                        }}
                      >
                        {dialogBody}
                      </p>

                      {!currentDialog.choices && (
                        <motion.img
                          src="/next.svg"
                          alt="Next"
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: showArrow ? 1 : 0, scale: showArrow ? 1 : 0 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          className="absolute right-[60px] bottom-[70px] w-[20px] h-auto pointer-events-none"
                        />
                      )}
                    </div>

                    <AnimatePresence>
                      {currentDialog.choices && isRevealed && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, y: -8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: -8 }}
                          transition={{ type: 'spring', stiffness: 600, damping: 30 }}
                          className="absolute right-[40px] top-[0px] -translate-y-1/2 z-40"
                          style={{
                            background: '#FFFEF4',
                            border: '4px solid #5C4A2A',
                            borderRadius: '18px',
                            boxShadow: '0 4px 0 #5C4A2A',
                            minWidth: '160px',
                            overflow: 'hidden',
                          }}
                        >
                          {currentDialog.choices.map((choice, i) => (
                            <button
                              key={choice.label}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleChoice(choice)
                              }}
                              className="w-full flex items-center gap-2 px-5 py-3 cursor-pointer group relative"
                              style={{
                                fontFamily: '"Google Sans Flex", sans-serif',
                                fontWeight: 700,
                                fontSize: '22px',
                                color: '#3B2F1E',
                                borderTop: i > 0 ? '2px solid #D4C9A8' : 'none',
                                background: 'transparent',
                              }}
                            >
                              <span
                                className="transition-opacity duration-100 opacity-0 group-hover:opacity-100"
                                style={{ color: '#E2826A', fontSize: '18px', lineHeight: 1 }}
                              >
                                ►
                              </span>
                              {choice.label}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}
