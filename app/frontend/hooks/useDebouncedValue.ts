import { useEffect, useState } from 'react'

/**
 * Returns the latest `value` only after it has stayed unchanged for `delayMs`.
 * Used to debounce live search inputs so we don't fire a request on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])

  return debounced
}
