import { useState, useEffect, useRef } from 'react'
import { router, Link } from '@inertiajs/react'
import { LookoutProvider, useLookout, formatTime } from '@lookout/react'
import type { LookoutCallbacks } from '@lookout/react'
import * as Sentry from '@sentry/react'
import Button from '@/components/shared/Button'
import Input from '@/components/shared/Input'

type LookoutSessionProps = {
  token: string
  status: string
}

function log(ns: string, ...args: unknown[]) {
  console.log(`[lookout:${ns}]`, ...args)
}

const lookoutCallbacks: LookoutCallbacks = {
  onShareStart: () => log('capture', 'screen sharing started'),
  onShareStop: () => log('capture', 'screen sharing stopped'),
  onCapture: (capture) => log('capture', `screenshot captured (${capture.width}x${capture.height})`),
  onUploadSuccess: ({ screenshotId, trackedSeconds }) =>
    log('upload', `screenshot ${screenshotId} confirmed, tracked: ${formatTime(trackedSeconds)}`),
  onUploadFailure: (error) => log('upload', `FAILED: ${error.message}`),
  onPause: ({ totalActiveSeconds }) => log('session', `paused (active: ${formatTime(totalActiveSeconds)})`),
  onResume: () => log('session', 'resumed'),
  onStop: ({ trackedSeconds }) => log('session', `stopped, tracked: ${formatTime(trackedSeconds)}`),
  onComplete: ({ videoUrl }) => log('session', `complete, video: ${videoUrl}`),
  onCompilationFailed: () => log('session', 'compilation FAILED'),
  onError: (error, context) => log('session', `error in ${context}: ${error.message}`),
  onStatusChange: (prev, next) => log('session', `status: ${prev} → ${next}`),
}

function LookoutSessionShow({
  lookout_session,
  lookout_api_url,
  return_to,
}: {
  lookout_session: LookoutSessionProps
  lookout_api_url: string | null
  return_to: string | null
}) {
  const endedStatuses = ['stopped', 'compiling', 'complete', 'failed']
  const continuableStatuses = ['active', 'paused']
  const validModes = ['browser', 'camera', 'desktop'] as const
  type Mode = 'choose' | (typeof validModes)[number]

  const [mode, setMode] = useState<Mode>(() => {
    log('session', `loaded session status=${lookout_session.status}, api=${lookout_api_url}`)
    if (endedStatuses.includes(lookout_session.status)) return 'browser'

    const savedMode = new URLSearchParams(window.location.search).get('mode')
    if (
      savedMode &&
      (validModes as readonly string[]).includes(savedMode) &&
      continuableStatuses.includes(lookout_session.status)
    ) {
      return savedMode as Mode
    }

    return 'choose'
  })

  function selectMode(next: 'browser' | 'camera' | 'desktop') {
    const url = new URL(window.location.href)
    url.searchParams.set('mode', next)
    window.history.replaceState(null, '', url.toString())
    setMode(next)
  }

  return (
    <div className="min-h-screen bg-light-brown flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white rounded-lg border-2 border-dark-brown shadow-lg overflow-hidden">
        {mode === 'choose' && (
          <>
            <div className="p-6 border-b border-dark-brown flex items-center justify-between">
              <h1 className="font-bold text-2xl uppercase tracking-wide text-dark-brown">Lookout Recording</h1>
              <Link href={return_to || '/path'} className="text-dark-brown text-sm underline hover:no-underline">
                Back to Path
              </Link>
            </div>
            <div className="flex flex-col items-center gap-6 p-12">
              <p className="text-dark-brown text-lg font-bold">How would you like to record?</p>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    log('session', 'mode: browser')
                    selectMode('browser')
                  }}
                  className="flex flex-col items-center gap-3 p-6 border-2 border-dark-brown rounded-lg cursor-pointer hover:bg-light-brown transition-colors"
                >
                  <svg
                    className="w-10 h-10 text-dark-brown"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"
                    />
                  </svg>
                  <span className="font-bold text-dark-brown uppercase">Browser</span>
                  <span className="text-dark-brown text-xs">Share your screen</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    log('session', 'mode: camera')
                    selectMode('camera')
                  }}
                  className="flex flex-col items-center gap-3 p-6 border-2 border-dark-brown rounded-lg cursor-pointer hover:bg-light-brown transition-colors"
                >
                  <svg
                    className="w-10 h-10 text-dark-brown"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
                    />
                  </svg>
                  <span className="font-bold text-dark-brown uppercase">Camera</span>
                  <span className="text-dark-brown text-xs">Use your webcam</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    log('session', 'mode: desktop, opening lookout:// deep link')
                    window.location.href = `lookout://session?token=${lookout_session.token}`
                    selectMode('desktop')
                  }}
                  className="flex flex-col items-center gap-3 p-6 border-2 border-dark-brown rounded-lg cursor-pointer hover:bg-light-brown transition-colors"
                >
                  <svg
                    className="w-10 h-10 text-dark-brown"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z"
                    />
                  </svg>
                  <span className="font-bold text-dark-brown uppercase">Desktop</span>
                  <span className="text-dark-brown text-xs">Open in Lookout app</span>
                </button>
              </div>
            </div>
          </>
        )}

        {(mode === 'browser' || mode === 'camera') && (
          <LookoutProvider
            token={lookout_session.token}
            apiBaseUrl={lookout_api_url ?? ''}
            callbacks={lookoutCallbacks}
            capture={mode === 'camera' ? { mode: 'camera' } : undefined}
          >
            <BrowserRecorderUI returnTo={return_to} />
          </LookoutProvider>
        )}

        {mode === 'desktop' && (
          <DesktopModeUI
            token={lookout_session.token}
            apiBaseUrl={lookout_api_url ?? ''}
            onSessionEnded={() => setMode('browser')}
          />
        )}
      </div>
    </div>
  )
}

function RecordingHeader({
  status,
  isRecording,
  returnTo,
}: {
  status: string
  isRecording: boolean
  returnTo: string | null
}) {
  const isPaused = status === 'paused' || (status === 'active' && !isRecording)
  const canLeave = !isRecording && !isPaused && status !== 'compiling'

  return (
    <div className="p-6 border-b border-dark-brown flex items-center justify-between">
      <div className="flex items-center gap-3">
        {isRecording && <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />}
        {isPaused && <div className="w-3 h-3 bg-yellow-500 rounded-full" />}
        <h1 className="font-bold text-2xl uppercase tracking-wide text-dark-brown">
          {isRecording ? 'Recording' : isPaused ? 'Paused' : 'Lookout Recording'}
        </h1>
      </div>
      {canLeave && (
        <Link href={returnTo || '/path'} className="text-dark-brown text-sm underline hover:no-underline">
          Back to Path
        </Link>
      )}
    </div>
  )
}

function StatusBar({ displaySeconds, screenshotCount }: { displaySeconds: number; screenshotCount: number }) {
  return (
    <div className="flex items-center justify-between px-6 py-3 bg-light-brown border-b border-dark-brown">
      <p className="text-dark-brown font-bold text-3xl font-mono tabular-nums">{formatTime(displaySeconds)}</p>
      <p className="text-dark-brown text-sm">
        {screenshotCount} screenshot{screenshotCount !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

function BrowserRecorderUI({ returnTo }: { returnTo: string | null }) {
  const { state, actions } = useLookout()
  const [finished, setFinished] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [name, setName] = useState('')

  const isCamera = state.captureMode === 'camera'
  const showStatusBar = state.isRecording || state.status === 'paused'
  const [captureFailed, setCaptureFailed] = useState(false)

  // Auto-start camera preview whenever we need the user to confirm before recording
  useEffect(() => {
    if (isCamera && !state.isPreviewing && !state.isSharing) {
      actions.startPreview().catch(() => setCaptureFailed(true))
    }
  }, [isCamera, state.status, state.isPreviewing, state.isSharing])

  // Detect capture failure: 2 minutes sharing with no screenshot
  useEffect(() => {
    if (!state.isSharing || state.lastScreenshotUrl) return
    const timeout = setTimeout(() => {
      if (!state.lastScreenshotUrl) {
        log('capture', 'no screenshot after 2 minutes, marking capture as failed')
        setCaptureFailed(true)
      }
    }, 120_000)
    return () => clearTimeout(timeout)
  }, [state.isSharing, state.lastScreenshotUrl])

  // Also detect SDK-level capture errors
  useEffect(() => {
    if (state.status === 'error') setCaptureFailed(true)
  }, [state.status])

  // Tab title
  useEffect(() => {
    if (captureFailed) {
      document.title = 'Capture Failed'
    } else if (state.isRecording && document.hidden) {
      document.title = `Recording in Background (${formatTime(state.displaySeconds)})`
    } else if (state.isRecording) {
      document.title = `Recording: ${formatTime(state.displaySeconds)}`
    } else if (state.status === 'paused') {
      document.title = `Paused: ${formatTime(state.displaySeconds)}`
    } else if (state.status === 'compiling') {
      document.title = 'Compiling timelapse...'
    } else if (state.status === 'complete' || state.status === 'stopped') {
      document.title = 'Recording complete'
    } else {
      document.title = 'Lookout Recording'
    }
  }, [captureFailed, state.status, state.isRecording, state.displaySeconds])

  useEffect(() => {
    if (state.status === 'complete') setFinished(true)
    if (state.status === 'complete' || state.status === 'stopped') {
      setStopping(false)
    }
  }, [state.status])

  function handleStartSharing() {
    actions.startSharing().catch(() => setCaptureFailed(true))
  }

  async function handleStop() {
    const n = name.trim() || undefined
    log('session', `stopping${n ? `, name: "${n}"` : ''}`)
    await actions.stop({ name: n })
  }

  if (state.status === 'loading') {
    return (
      <>
        <RecordingHeader status={state.status} isRecording={false} returnTo={returnTo} />
        <div className="flex items-center justify-center p-12">
          <div className="w-8 h-8 border-4 border-dark-brown border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    )
  }

  if (captureFailed || state.status === 'error') {
    return (
      <>
        <RecordingHeader status={state.status} isRecording={false} returnTo={returnTo} />
        <div className="flex flex-col items-center gap-4 p-12">
          <p className="text-red-700 font-bold text-xl">Capture failed</p>
          <p className="text-dark-brown text-sm">Everything before the failure was saved. Try reloading the page.</p>
          <Button onClick={() => window.location.reload()} className="py-2 px-6 mt-2">
            Reload
          </Button>
        </div>
      </>
    )
  }

  if (state.status === 'failed') {
    return (
      <>
        <RecordingHeader status={state.status} isRecording={false} returnTo={returnTo} />
        <div className="flex flex-col items-center gap-4 p-12">
          <p className="text-red-700 font-bold text-xl">Compilation failed</p>
          <p className="text-dark-brown text-sm">
            Something went wrong while compiling your timelapse. Your screenshots were saved.
          </p>
          <Button onClick={() => router.visit(returnTo || '/path')} className="py-2 px-6 mt-2">
            Back to Path
          </Button>
        </div>
      </>
    )
  }

  if (state.status === 'stopped' || state.status === 'compiling') {
    return (
      <>
        <RecordingHeader status={state.status} isRecording={false} returnTo={returnTo} />
        <StatusBar displaySeconds={state.trackedSeconds} screenshotCount={state.screenshotCount} />
        <div className="flex flex-col items-center gap-4 p-12">
          <div className="w-10 h-10 border-4 border-dark-brown border-t-transparent rounded-full animate-spin" />
          <p className="text-dark-brown font-bold text-lg">Compiling your timelapse...</p>
        </div>
      </>
    )
  }

  if (finished) {
    return (
      <>
        <RecordingHeader status={state.status} isRecording={false} returnTo={returnTo} />
        <StatusBar displaySeconds={state.trackedSeconds} screenshotCount={state.screenshotCount} />
        <div className="flex flex-col items-center gap-4 p-8">
          <p className="text-dark-brown font-bold text-xl">Recording complete</p>
          {state.videoUrl && (
            <video
              src={state.videoUrl}
              controls
              className="w-full max-w-lg rounded border border-dark-brown"
              onError={() => {}}
            />
          )}
          <Button onClick={() => router.visit(returnTo || '/path')} className="py-2 px-6 text-lg mt-2">
            Back to Path
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      <RecordingHeader status={state.status} isRecording={state.isRecording} returnTo={returnTo} />
      {showStatusBar && <StatusBar displaySeconds={state.displaySeconds} screenshotCount={state.screenshotCount} />}

      <div className="flex flex-col gap-6 p-6">
        {isCamera && state.isPreviewing && state.previewStream ? (
          <CameraPreviewVideo stream={state.previewStream} />
        ) : state.lastScreenshotUrl ? (
          <div className="relative aspect-video rounded-lg overflow-hidden bg-light-brown border border-dark-brown">
            <img src={state.lastScreenshotUrl} alt="Latest capture" className="w-full h-full object-contain" />
            <span className="absolute bottom-2 right-2 text-xs bg-dark-brown/80 text-light-brown px-2 py-0.5 rounded">
              Latest capture
            </span>
          </div>
        ) : (
          <div className="aspect-video rounded-lg overflow-hidden bg-light-brown border border-dark-brown flex flex-col items-center justify-center gap-3">
            {state.isSharing ? (
              <>
                <div className="w-6 h-6 border-3 border-dark-brown border-t-transparent rounded-full animate-spin" />
                <p className="text-dark-brown text-sm">Capturing picture. This should only take a few seconds.</p>
              </>
            ) : (
              <p className="text-dark-brown text-lg">
                {isCamera ? 'Start your camera to begin recording' : 'Share your screen to begin recording'}
              </p>
            )}
          </div>
        )}

        {isCamera && state.availableCameras.length > 1 && state.isPreviewing && (
          <div className="flex items-center gap-3">
            <label htmlFor="camera-select" className="text-dark-brown text-sm font-bold">
              Camera:
            </label>
            <select
              id="camera-select"
              value={state.selectedCameraId ?? ''}
              onChange={(e) => actions.selectCamera(e.target.value)}
              className="flex-1 border-2 border-dark-brown rounded px-3 py-1.5 text-sm bg-white text-dark-brown"
            >
              {state.availableCameras.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {stopping ? (
          <div className="flex flex-col gap-4 border-2 border-dark-brown rounded-lg p-6">
            <p className="text-dark-brown font-bold text-lg">Name your timelapse</p>
            <p className="text-dark-brown text-sm">Give it a name, or skip to use the default.</p>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleStop()
              }}
              placeholder="My timelapse"
              maxLength={255}
              autoFocus
            />
            <div className="flex gap-3">
              <Button onClick={handleStop} className="py-2 px-6 flex-1">
                Save & Stop
              </Button>
              <button
                type="button"
                onClick={() => setStopping(false)}
                className="py-2 px-6 border-2 font-bold uppercase cursor-pointer bg-white text-dark-brown border-dark-brown flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 justify-center">
            {isCamera ? (
              <>
                {state.isPreviewing && !state.isRecording && (
                  <Button onClick={handleStartSharing} className="py-2 px-6">
                    Start Recording
                  </Button>
                )}
              </>
            ) : (
              <>
                {!state.isSharing && state.status === 'pending' && (
                  <Button onClick={handleStartSharing} className="py-2 px-6">
                    Share & Start
                  </Button>
                )}
                {!state.isSharing && (state.status === 'active' || state.status === 'paused') && (
                  <Button onClick={handleStartSharing} className="py-2 px-6">
                    Share & Resume
                  </Button>
                )}
              </>
            )}
            {state.isRecording && (
              <Button onClick={actions.pause} className="py-2 px-6">
                Pause
              </Button>
            )}
            {state.status === 'paused' && state.isSharing && (
              <Button onClick={actions.resume} className="py-2 px-6">
                Resume
              </Button>
            )}
            {(state.status === 'active' || state.status === 'paused') && (
              <button
                type="button"
                onClick={() => setStopping(true)}
                className="py-2 px-6 border-2 font-bold uppercase cursor-pointer bg-red-700 text-white border-dark-brown"
              >
                Stop
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function CameraPreviewVideo({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (video) {
      video.srcObject = stream
      video.play().catch(() => {})
    }
    return () => {
      if (video) {
        video.pause()
        video.srcObject = null
      }
    }
  }, [stream])

  return (
    <div className="relative aspect-video rounded-lg overflow-hidden bg-light-brown border border-dark-brown">
      <video
        ref={videoRef}
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />
    </div>
  )
}

function DesktopModeUI({
  token,
  apiBaseUrl,
  onSessionEnded,
}: {
  token: string
  apiBaseUrl: string
  onSessionEnded: () => void
}) {
  const deepLink = `lookout://session?token=${token}`

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/sessions/${token}/status`)
        if (!res.ok) return
        const data = await res.json()
        log('desktop', `poll status: ${data.status}`)
        if (['stopped', 'compiling', 'complete', 'failed'].includes(data.status)) {
          clearInterval(interval)
          onSessionEnded()
        }
      } catch {
        log('desktop', 'poll failed')
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [token, apiBaseUrl, onSessionEnded])

  return (
    <>
      <div className="p-6 border-b border-dark-brown">
        <h1 className="font-bold text-2xl uppercase tracking-wide text-dark-brown">Desktop Recording</h1>
      </div>
      <div className="flex flex-col items-center gap-4 p-12">
        <p className="text-dark-brown font-bold text-lg">Recording in Desktop App</p>
        <p className="text-dark-brown text-sm text-center">
          The Lookout desktop app should have opened. Complete your recording there,
          <br />
          then come back here when you're done.
        </p>
        <a
          href="https://lookout.hackclub.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-dark-brown text-sm underline hover:no-underline"
        >
          Download the Lookout desktop app
        </a>
        <a
          href={deepLink}
          className="py-2 px-6 border-2 font-bold uppercase cursor-pointer bg-brown text-light-brown border-dark-brown text-sm mt-2"
        >
          Re-open Desktop App
        </a>
        <div className="text-center">
          <p className="text-dark-brown text-sm">Not working? Paste the following into the app:</p>
          <code className="bg-light-brown px-1.5 py-0.5 rounded border border-dark-brown text-xs font-mono select-all mt-1 inline-block">
            {deepLink}
          </code>
        </div>
      </div>
    </>
  )
}

export default Sentry.withProfiler(LookoutSessionShow, { name: 'LookoutSessionShow' })
