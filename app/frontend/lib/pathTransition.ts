const PATH_ENTRY_TRANSITION_KEY = 'fallout:path-entry-transition'
const PATH_ENTRY_TRANSITION_MAX_AGE_MS = 15_000

type PathEntryTransition = {
  kind: 'onboarding-complete'
  createdAt: number
  introMode?: 'onboarding'
  pendingModal?: 'projects' | 'journal'
  projectId?: number
  readDocsNudge?: boolean
}

type RememberPathEntryTransitionOptions = Omit<PathEntryTransition, 'kind' | 'createdAt'>

export function rememberPathEntryTransition(
  kind: PathEntryTransition['kind'],
  options: RememberPathEntryTransitionOptions = {},
) {
  if (typeof window === 'undefined') return

  window.sessionStorage.setItem(
    PATH_ENTRY_TRANSITION_KEY,
    JSON.stringify({
      kind,
      createdAt: Date.now(),
      introMode: options.introMode ?? 'onboarding',
      pendingModal: options.pendingModal,
      projectId: options.projectId,
      readDocsNudge: options.readDocsNudge,
    } satisfies PathEntryTransition),
  )
}

export function clearPathEntryTransition() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(PATH_ENTRY_TRANSITION_KEY)
}

export function consumePathEntryTransition(): PathEntryTransition | null {
  if (typeof window === 'undefined') return null

  const raw = window.sessionStorage.getItem(PATH_ENTRY_TRANSITION_KEY)
  window.sessionStorage.removeItem(PATH_ENTRY_TRANSITION_KEY)

  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<PathEntryTransition>

    if (parsed.kind !== 'onboarding-complete' || typeof parsed.createdAt !== 'number') {
      return null
    }

    if (Date.now() - parsed.createdAt > PATH_ENTRY_TRANSITION_MAX_AGE_MS) {
      return null
    }

    return {
      kind: parsed.kind,
      createdAt: parsed.createdAt,
      introMode: parsed.introMode === 'onboarding' ? parsed.introMode : undefined,
      pendingModal: parsed.pendingModal === 'projects' || parsed.pendingModal === 'journal' ? parsed.pendingModal : undefined,
      projectId: typeof parsed.projectId === 'number' ? parsed.projectId : undefined,
      readDocsNudge: parsed.readDocsNudge === true ? true : undefined,
    }
  } catch {
    return null
  }
}
