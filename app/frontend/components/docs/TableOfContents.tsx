import { type RefObject, useEffect, useRef, useState } from 'react'

interface Heading {
  id: string
  text: string
  level: number
}

const BAR_WIDTHS: Record<number, string> = {
  1: 'w-6',
  2: 'w-4.5',
  3: 'w-3',
}

const INDENT: Record<number, string> = {
  1: 'pl-0',
  2: 'pl-3',
  3: 'pl-6',
}

export default function TableOfContents({ contentRef }: { contentRef: RefObject<HTMLDivElement | null> }) {
  const [headings, setHeadings] = useState<Heading[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hovered, setHovered] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const nodes = el.querySelectorAll('h1[id], h2[id], h3[id]')
    const items: Heading[] = []
    nodes.forEach((node) => {
      const id = node.getAttribute('id')
      if (id) {
        items.push({
          id,
          text: node.textContent?.trim() || '',
          level: parseInt(node.tagName[1], 10),
        })
      }
    })
    setHeadings(items)
  }, [contentRef])

  useEffect(() => {
    const el = contentRef.current
    if (!el || headings.length === 0) return

    const headingEls = headings.map((h) => document.getElementById(h.id)).filter((el): el is HTMLElement => el !== null)

    if (headingEls.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

        if (visible.length > 0) {
          setActiveId(visible[0].target.id)
        }
      },
      { rootMargin: '0px 0px -70% 0px', threshold: 0 },
    )

    headingEls.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [headings, contentRef])

  function scrollTo(id: string) {
    const el = document.getElementById(id)
    if (!el) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' })
  }

  if (headings.length === 0) return null

  return (
    <div
      ref={containerRef}
      className="toc-sidebar fixed right-6 top-32 z-10 hidden xl:block"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Bars (default view) */}
      <div
        className={`flex flex-col items-end gap-2.5 transition-opacity duration-150 ${hovered ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      >
        {headings.map((heading) => (
          <div
            key={heading.id}
            className={`toc-bar h-0.5 rounded-full ${BAR_WIDTHS[heading.level] || 'w-3'} ${
              activeId === heading.id ? 'toc-bar-active' : ''
            }`}
          />
        ))}
      </div>

      {/* Expanded heading list (on hover) */}
      <div
        className={`absolute top-0 right-0 transition-opacity duration-150 ${hovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <div className="bg-light-brown border border-dark-brown/15 rounded-lg shadow-md py-2 px-3 min-w-48 max-w-72">
          {headings.map((heading) => (
            <button
              key={heading.id}
              onClick={() => scrollTo(heading.id)}
              className={`block w-full text-left py-1 text-sm cursor-pointer rounded px-1.5 truncate ${INDENT[heading.level] || ''} ${
                activeId === heading.id ? 'font-semibold' : 'text-dark-brown'
              } hover:bg-dark-brown/5`}
              style={activeId === heading.id ? { color: '#1a6fa0' } : undefined}
            >
              {heading.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
