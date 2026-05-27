import { useEffect, useRef } from 'react'

/**
 * Returns true if the event target is a typing context (input / textarea /
 * contenteditable) — global hotkeys should ignore these unless they're modified
 * (Cmd/Ctrl) or explicitly listed via {allowInTyping: true}.
 */
function isTypingContext(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export type ShortcutMap = Record<
  string,
  | {
      handler: (e: KeyboardEvent) => void
      allowInTyping?: boolean
      requireModifier?: boolean // require cmd/ctrl to fire
      acceptsModifier?: boolean // fires with or without cmd/ctrl; handler decides
    }
  | undefined
>

/**
 * Bind a flat map of single-key shortcuts to the document. Keys are matched
 * case-insensitively. Respects typing contexts unless {allowInTyping: true}.
 *
 * The hook uses a ref so the latest handler closure runs without re-binding
 * on every render — important since each handler closes over component state.
 */
export function useReviewShortcuts(map: ShortcutMap, enabled = true) {
  const mapRef = useRef(map)
  mapRef.current = map

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't interfere with browser shortcuts that use modifiers — except where
      // the binding explicitly opts in via requireModifier.
      const hasModifier = e.metaKey || e.ctrlKey || e.altKey
      const key = e.key.toLowerCase()
      const binding = mapRef.current[key] || mapRef.current[e.key]
      if (!binding) return

      if (binding.requireModifier) {
        // Must have Cmd/Ctrl; if so, typing-context guard is intentionally bypassed
        // because modified keys (e.g. ⌘J) don't conflict with normal typing.
        if (!(e.metaKey || e.ctrlKey)) return
      } else if (binding.acceptsModifier) {
        // Fires with or without modifier — typing-context guard still applies for
        // the unmodified case; handler receives the event to discriminate.
        if (hasModifier && !e.metaKey && !e.ctrlKey) return // block alt-combos
        if (!hasModifier && !binding.allowInTyping && isTypingContext(e.target)) return
      } else {
        if (hasModifier) return
        if (!binding.allowInTyping && isTypingContext(e.target)) return
      }

      e.preventDefault()
      binding.handler(e)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
