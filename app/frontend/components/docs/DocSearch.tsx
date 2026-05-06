import { useEffect, useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
import { router } from '@inertiajs/react'
import { createPortal } from 'react-dom'

interface SearchEntry {
  title: string
  path: string
  excerpt: string
}

function highlight(text: string, query: string): string {
  if (!query.trim()) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>')
}

export function DocSearchModal({ index, onClose }: { index: SearchEntry[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const fuse = useMemo(
    () =>
      new Fuse(index, {
        keys: [
          { name: 'title', weight: 3 },
          { name: 'excerpt', weight: 1 },
        ],
        threshold: 0.35,
        minMatchCharLength: 2,
        includeScore: true,
      }),
    [index],
  )

  const results = useMemo(
    () =>
      query.trim().length >= 2
        ? fuse
            .search(query)
            .slice(0, 10)
            .map((r) => r.item)
        : [],
    [fuse, query],
  )

  useEffect(() => {
    setActive(0)
  }, [results.length])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const el = listRef.current?.querySelectorAll('[data-result]')[active] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function navigate(path: string) {
    onClose()
    router.visit(path)
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && results[active]) {
      navigate(results[active].path)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return createPortal(
    <div
      className="doc-search-backdrop fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="doc-search-panel w-full max-w-xl mx-4 rounded-lg overflow-hidden flex flex-col">
        <div className="doc-search-input-row flex items-center gap-3 px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 doc-search-icon">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search docs…"
            className="doc-search-input flex-1 bg-transparent text-sm outline-none"
            style={{ fontSize: '15px' }}
          />
          <kbd className="doc-search-kbd text-xs px-1.5 py-0.5 rounded font-sans">esc</kbd>
        </div>

        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: '50vh' }}>
          {query.trim().length >= 2 && results.length === 0 && (
            <div className="doc-search-empty px-4 py-8 text-center text-sm">No results for &ldquo;{query}&rdquo;</div>
          )}
          {results.length > 0 && (
            <div className="py-1">
              {results.map((item, i) => (
                <button
                  key={item.path}
                  data-result
                  data-active={i === active}
                  onClick={() => navigate(item.path)}
                  onMouseEnter={() => setActive(i)}
                  className="doc-search-result w-full text-left px-4 py-2.5 flex flex-col gap-0.5"
                >
                  <span
                    className="doc-search-result-title text-sm font-semibold"
                    dangerouslySetInnerHTML={{ __html: highlight(item.title, query) }}
                  />
                  {item.excerpt && (
                    <span
                      className="doc-search-result-excerpt text-xs line-clamp-1"
                      dangerouslySetInnerHTML={{ __html: highlight(item.excerpt.slice(0, 120), query) }}
                    />
                  )}
                </button>
              ))}
            </div>
          )}
          {query.trim().length < 2 && (
            <div className="doc-search-empty px-4 py-6 text-center text-sm">Type to search across all docs</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function DocSearchTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="doc-search-trigger w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm cursor-pointer"
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="shrink-0">
        <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="flex-1 text-left">Search docs…</span>
      <span className="flex gap-0.5">
        <kbd className="doc-search-kbd text-xs px-1 py-0.5 rounded font-sans">⌘</kbd>
        <kbd className="doc-search-kbd text-xs px-1 py-0.5 rounded font-sans">K</kbd>
      </span>
    </button>
  )
}
