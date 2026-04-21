import Button from '@/components/shared/Button'
import { Link } from '@inertiajs/react'
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
  ChevronDownIcon,
} from '@heroicons/react/16/solid'
import { useState, useEffect, useCallback, useRef } from 'react'
import type { PreflightCheck } from '@/types'

type Step = 'guidelines' | 'checklist' | 'scan' | 'submitted'

const CHECKLIST_ITEMS = [
  "My digital design is complete and I've tried my best to make sure it'll work",
  "I've documented my design and README so that others can replicate my design and understand how it works.",
  'My design is closer to a product than a demo. Components are well integrated: not handing in mid air, glued, taped, etc.',
  'My work is original. If I followed a tutorial, I made significant modifications and improvements to make it my own.',
  'I have an zine page: A5 sized, with required information and renders of my design.',
]

function SubmissionLayout({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="relative w-screen h-screen flex items-center justify-center bg-linear-to-b from-light-blue to-blue from-20%">
      <div className="text-center flex flex-col items-center text-dark-brown bg-lighter-blue w-full max-w-2xl border border-dark-brown mt-12 mb-18 mx-4 p-4 md:p-0 md:h-[calc(100vh-4rem)]">
        {title && (
          <p
            className="w-[calc(100%+5rem)] sm:w-[calc(100%+7rem)] mt-8 uppercase font-outfit text-2xl xs:text-4xl font-bold text-center bg-blue text-white py-4 px-6 xs:px-10"
            style={{ clipPath: 'polygon(0 0, 100% 0, calc(100% - 1.5rem) 50%, 100% 100%, 0 100%, 1.5rem 50%)' }}
          >
            {title}
          </p>
        )}
        {children}
      </div>
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none overflow-hidden">
        <img
          src="/submission/decoration.webp"
          alt=""
          className="hidden md:block md:-mb-12 lg:-mb-24 2xl:-mb-34 w-full"
          aria-hidden="true"
        />
      </div>
    </div>
  )
}

function GuidelinesStep({ onContinue }: { onContinue: () => void }) {
  const [confirmed, setConfirmed] = useState(false)

  return (
    <SubmissionLayout title="Read The Guidelines">
      <p className="max-w-sm pb-6 py-4">
        Please read through our{' '}
        <a href="/docs/requirements/submitting-design" className="underline uppercase" target="_blank">
          submission guidelines
        </a>{' '}
        before continuing.
      </p>
      <div className="my-auto flex flex-col items-center pb-20">
        <img src="/icon/project.webp" className="w-24" alt="Project Icon"></img>
        <p className="text-2xl max-w-sm sm:text-4xl font-bold max-w-140 py-4">95% of rejections could have taken 5 MIN to fix</p>
        <Button
          onClick={confirmed ? onContinue : () => setConfirmed(true)}
          className="bg-brown text-light-brown border-2 border-dark-brown font-bold uppercase py-2 px-4 w-fit sm:px-6 text-xl sm:text-2xl"
        >
          {confirmed ? 'Are you sure?' : "I've read & am ready to submit!"}
        </Button>
        <Link href="/path" className="underline mt-4">
          Nevermind! Take me back.
        </Link>
        <p className="pt-4">Our reviewers will manually check.</p>
        <p>Make sure your design is shipped and looks like it will work.</p>
      </div>
    </SubmissionLayout>
  )
}

function ChecklistStep({
  projectName,
  onBack,
  onContinue,
}: {
  projectName: string
  onBack: () => void
  onContinue: () => void
}) {
  const [checked, setChecked] = useState<boolean[]>(new Array(CHECKLIST_ITEMS.length).fill(false))
  const allChecked = checked.every(Boolean)

  function toggle(index: number) {
    setChecked((prev) => prev.map((v, i) => (i === index ? !v : v)))
  }

  return (
    <SubmissionLayout title="Pre-ship Checklist">
      <p className="max-w-sm pb-6 py-4 wrap-anywhere">
        Check over <span className="italic font-bold">{projectName}</span> again!
        <br />
        We're here to help you build{' '}
        <a href="/docs/requirements/what-is-shipping" className="underline" target="_blank">
          real & shipped
        </a>{' '}
        projects.
      </p>
      <div className="w-full px-8 text-left space-y-3">
        {CHECKLIST_ITEMS.map((item, i) => (
          <label key={i} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checked[i]}
              onChange={() => toggle(i)}
              className="mt-1 accent-brown w-4 h-4 shrink-0"
            />
            <span>{item}</span>
          </label>
        ))}
      </div>
      <div className="my-auto flex flex-col items-center pb-20 grow">
        <div className="space-x-4">
          <Button
            onClick={onBack}
            className="bg-light-brown text-dark-brown border-2 border-dark-brown font-bold uppercase"
          >
            Back
          </Button>
          <Button
            onClick={onContinue}
            disabled={!allChecked}
            className="bg-brown text-light-brown border-2 border-dark-brown font-bold uppercase mt-auto disabled:opacity-50"
          >
            Continue
          </Button>
        </div>
      </div>
    </SubmissionLayout>
  )
}

function Spinner() {
  return (
    <svg className="w-5 h-5 text-brown animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return <Spinner />
    case 'passed':
      return <CheckCircleIcon className="w-5 h-5 text-green-700" />
    case 'failed':
      return <XCircleIcon className="w-5 h-5 text-red-700" />
    case 'warn':
      return <ExclamationTriangleIcon className="w-5 h-5 text-yellow-700" />
    case 'skipped':
      return <MinusCircleIcon className="w-5 h-5 text-dark-brown opacity-50" />
    default:
      return null
  }
}

function CheckRow({ check }: { check: PreflightCheck }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-5 h-5 shrink-0">
        <StatusIcon status={check.status} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-dark-brown font-medium text-sm">{check.label}</p>
        {check.status !== 'running' && check.status !== 'passed' && check.message && (
          <p
            className={`text-xs ${check.status === 'failed' ? 'text-red-700' : check.status === 'warn' ? 'text-yellow-700' : 'text-dark-brown opacity-60'}`}
          >
            {check.message}
          </p>
        )}
      </div>
    </div>
  )
}

function ScanStep({
  projectId,
  projectName,
  runId,
  onRunIdChange,
  onBack,
  onContinue,
}: {
  projectId: number
  projectName: string
  runId: number | null
  onRunIdChange: (id: number) => void
  onBack: () => void
  onContinue: () => void
}) {
  const [checks, setChecks] = useState<PreflightCheck[] | null>(null)
  const [overallStatus, setOverallStatus] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const slowdownRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runIdRef = useRef<number | null>(runId)

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (slowdownRef.current) {
      clearTimeout(slowdownRef.current)
      slowdownRef.current = null
    }
  }, [])

  const poll = useCallback(async () => {
    if (!runIdRef.current) return
    try {
      const res = await fetch(`/projects/${projectId}/ships/preflight/status?run_id=${runIdRef.current}`)
      if (!res.ok) return
      const data = await res.json()
      setChecks(data.checks)
      setOverallStatus(data.status)
      if (data.status !== 'running') {
        stopPolling()
      }
    } catch {
      // Retry on next interval
    }
  }, [projectId, stopPolling])

  const startPolling = useCallback(() => {
    intervalRef.current = setInterval(poll, 1500)
    slowdownRef.current = setTimeout(() => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = setInterval(poll, 5000)
      }
    }, 10000)
    poll()
  }, [poll])

  const startScan = useCallback(async () => {
    stopPolling()
    setChecks(null)
    setOverallStatus(null)
    setSubmitError(null)
    try {
      const res = await fetch(`/projects/${projectId}/ships/preflight/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '',
        },
      })
      const data = await res.json()
      runIdRef.current = data.run_id
      onRunIdChange(data.run_id)
      startPolling()
    } catch {
      setOverallStatus('failed')
    }
  }, [projectId, stopPolling, startPolling, onRunIdChange])

  useEffect(() => {
    if (runId) {
      runIdRef.current = runId
      startPolling()
    } else {
      startScan()
    }
    return stopPolling
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit() {
    if (submitting || !runIdRef.current) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/projects/${projectId}/ships`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '',
        },
        body: JSON.stringify({ run_id: runIdRef.current }),
      })
      if (res.ok) {
        onContinue()
      } else {
        const data = await res.json()
        setSubmitError(data.error || 'Submission failed. Please try again.')
      }
    } catch {
      setSubmitError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const scanning = overallStatus === 'running' || overallStatus === null
  const failed = checks?.filter((c) => c.status === 'failed') ?? []
  const warned = checks?.filter((c) => c.status === 'warn') ?? []
  const running = checks?.filter((c) => c.status === 'running') ?? []
  const passed = checks?.filter((c) => c.status === 'passed') ?? []
  const skipped = checks?.filter((c) => c.status === 'skipped') ?? []
  const hiddenChecks = [...skipped, ...passed]

  const hasFails = failed.length > 0
  const warnCount = warned.length

  return (
    <SubmissionLayout title="Pre-ship Scan">
      <p className="max-w-sm pb-4 py-4 wrap-anywhere">
        Scanning <span className="italic font-bold">{projectName}</span> for easy-to-miss errors.
        <br />
        This can take a few minutes!
      </p>
      <div className="w-full px-6 text-left overflow-y-auto h-100 md:grow mb-10 min-h-0">
        {failed.map((c) => (
          <CheckRow key={c.key} check={c} />
        ))}
        {warned.map((c) => (
          <CheckRow key={c.key} check={c} />
        ))}
        {running.map((c) => (
          <CheckRow key={c.key} check={c} />
        ))}
        {hiddenChecks.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="flex items-center gap-1 text-sm text-dark-brown opacity-60 hover:opacity-100 cursor-pointer"
            >
              <ChevronDownIcon className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
              {[skipped.length > 0 && `${skipped.length} skipped`, passed.length > 0 && `${passed.length} passed`]
                .filter(Boolean)
                .join(' / ')}
            </button>
            {!collapsed && (
              <div className="mt-1">
                {hiddenChecks.map((c) => (
                  <CheckRow key={c.key} check={c} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {submitError && <p className="text-red-700 text-sm px-6 py-2">{submitError}</p>}
      <div className="flex items-center justify-center gap-4 py-6 mb-shrink-0">
        <Button
          onClick={onBack}
          className="bg-light-brown text-dark-brown border-2 border-dark-brown font-bold uppercase"
        >
          Back
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={scanning || hasFails || submitting}
          className="bg-brown text-light-brown border-2 border-dark-brown font-bold uppercase disabled:opacity-50"
        >
          {submitting
            ? 'Submitting...'
            : scanning
              ? 'Scanning...'
              : hasFails
                ? 'Fix to submit'
                : warnCount > 0
                  ? `Submit with ${warnCount} warning${warnCount !== 1 ? 's' : ''}`
                  : 'Submit'}
        </Button>
      </div>
    </SubmissionLayout>
  )
}

function SubmittedStep({ projectName }: { projectName: string }) {
  return (
    <SubmissionLayout>
      <div className="my-auto flex flex-col items-center">
        <div className="flex items-center space-x-4">
          <p className="uppercase text-blue font-outfit font-bold text-5xl">Submitted!</p>
          <svg className="size-12 text-blue" viewBox="0 0 54 55" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M31.2465 0.818409C32.9227 1.83047 33.9096 2.64259 34.9489 4.34155C35.9843 5.60513 35.9843 5.60513 37.4448 5.57075C38.5214 5.5425 39.5978 5.50766 40.674 5.46648C42.5983 5.46384 43.621 5.8424 45.1689 7.00447C47.7979 9.73529 48.7128 11.2552 48.7964 15.1215C48.8731 17.5855 48.8731 17.5855 49.859 19.7475C50.6257 20.3271 51.43 20.854 52.2346 21.3778C54.2229 24.1415 54.203 27.3268 53.7487 30.6178C52.868 32.8959 51.7459 34.356 49.7743 35.7511C49.2434 36.2593 49.2434 36.2593 48.7018 36.7778C48.8012 37.7719 48.9089 38.7673 49.0902 39.7495C49.3089 41.8841 48.7028 43.6485 47.6924 45.5044C45.5841 48.0391 43.3898 49.5996 40.122 50.1244C39.3436 50.0875 38.5656 50.0445 37.7878 49.9961C36.6389 49.9269 36.6389 49.9269 35.5798 50.1244C34.1867 51.5424 34.1867 51.5424 33.0563 53.2044C30.3391 55.2267 27.2074 55.2065 23.9718 54.7444C21.7644 53.8616 20.3061 52.7854 19.0511 50.734C18.0157 49.4704 18.0157 49.4704 16.5552 49.5048C15.4786 49.5331 14.4022 49.5679 13.326 49.6091C11.4017 49.6117 10.379 49.2331 8.83107 48.0711C6.15444 45.3486 5.29562 43.5608 5.20359 39.6653C5.11146 37.3615 5.11146 37.3615 4.14098 35.3641C3.37077 34.778 2.56819 34.2367 1.76537 33.6978C-0.222853 30.934 -0.203036 27.7487 0.251297 24.4578C1.11926 22.2126 2.1773 20.7292 4.19421 19.4528C5.43651 18.3997 5.43651 18.3997 5.40271 16.9142C5.37493 15.8192 5.34068 14.7243 5.30019 13.6297C5.29761 11.6725 5.66979 10.6322 6.8123 9.0578C9.49716 6.38387 10.9915 5.45324 14.7927 5.36822C17.2152 5.29019 17.2152 5.29019 19.3409 4.28741C19.9107 3.5076 20.4288 2.68949 20.9437 1.87114C23.8266 -0.274423 27.9426 -0.502935 31.2465 0.818409ZM34.3679 18.4261C34.0997 18.7226 33.8315 19.019 33.5551 19.3245C33.2574 19.6512 32.9596 19.978 32.6529 20.3146C32.1812 20.8409 32.1812 20.8409 31.6999 21.3778C31.3803 21.7296 31.0606 22.0814 30.7312 22.4439C28.8341 24.5392 26.9701 26.6566 25.1981 28.8632C24.4765 29.5911 24.4765 29.5911 22.4578 30.6178C20.7923 28.9238 19.1268 27.2298 17.4108 25.4844C16.245 26.5008 15.0792 27.5172 13.878 28.5644C15.7455 30.8747 17.7089 33.0811 19.745 35.2378C19.9808 35.497 20.2165 35.7563 20.4593 36.0234C21.2177 36.8433 21.2177 36.8433 22.4578 37.8044C23.8056 37.8144 24.2568 37.4983 25.2336 36.5772C25.4834 36.2623 25.7332 35.9473 25.9906 35.6228C27.6176 33.6398 29.3076 31.7372 31.0375 29.8478C33.609 27.0237 33.609 27.0237 36.1476 24.169C36.4091 23.8719 36.6706 23.5748 36.9401 23.2687C37.6446 22.344 38.1286 21.412 38.6079 20.3511C37.7886 19.4739 36.9459 18.6189 36.0845 17.7845C35.0427 17.6705 35.0427 17.6705 34.3679 18.4261Z"
              fill="currentColor"
            />
          </svg>
        </div>
        <p className="pt-10">
          <span className="italic font-bold">{projectName}</span> has been submitted for review!
        </p>
        <p className="pt-6">
          Our reviewers will manually check your project.
          <br />
          This will take some time, so be patient.
          <br />
          In the meantime, you <strong>should start another project</strong>!
        </p>
        <Link
          href="/path"
          className="bg-brown text-light-brown border-2 border-dark-brown font-bold uppercase mt-10 px-4 py-2"
        >
          Back to the path
        </Link>
        <img src="/icon/project.webp" className="w-32 pt-4" alt="Project Icon"></img>
      </div>
    </SubmissionLayout>
  )
}

export default function ShipsPreflight({ project }: { project: { id: number; name: string } }) {
  const [step, setStep] = useState<Step>('guidelines')
  const [runId, setRunId] = useState<number | null>(null)

  return (
    <>
      {step === 'guidelines' && <GuidelinesStep onContinue={() => setStep('checklist')} />}
      {step === 'checklist' && (
        <ChecklistStep
          projectName={project.name}
          onBack={() => setStep('guidelines')}
          onContinue={() => setStep('scan')}
        />
      )}
      {step === 'scan' && (
        <ScanStep
          projectId={project.id}
          projectName={project.name}
          runId={runId}
          onRunIdChange={setRunId}
          onBack={() => setStep('checklist')}
          onContinue={() => setStep('submitted')}
        />
      )}
      {step === 'submitted' && <SubmittedStep projectName={project.name} />}
    </>
  )
}
