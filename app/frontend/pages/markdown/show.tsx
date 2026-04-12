import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Head } from '@inertiajs/react'
import { router } from '@inertiajs/react'
import MarkdownLayout from '@/layouts/MarkdownLayout'
import DocVideo from '@/components/docs/DocVideo'

interface VideoPortal {
  container: HTMLDivElement
  src: string
}

function MarkdownShow({ content_html, page_title }: { content_html: string; page_title: string }) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [videoPortals, setVideoPortals] = useState<VideoPortal[]>([])

  useEffect(() => {
    const container = contentRef.current
    if (!container) return

    // Inertia-navigate internal doc links
    const links = container.querySelectorAll('a')
    const controllers: AbortController[] = []

    links.forEach((anchor) => {
      const href = anchor.getAttribute('href')
      if (!href) return
      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) return

      anchor.setAttribute('data-inertia', 'true')
      const controller = new AbortController()
      anchor.addEventListener(
        'click',
        (e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
          e.preventDefault()
          router.visit(href)
        },
        { signal: controller.signal },
      )
      controllers.push(controller)
    })

    // Lazy-load images
    container.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      img.loading = 'lazy'
    })

    // Replace <video> elements with portalled DocVideo components
    const portals: VideoPortal[] = []
    container.querySelectorAll<HTMLVideoElement>('video').forEach((video) => {
      const src = video.getAttribute('src') || video.querySelector('source')?.getAttribute('src') || ''
      if (!src) return
      const placeholder = document.createElement('div')
      video.replaceWith(placeholder)
      portals.push({ container: placeholder, src })
    })
    setVideoPortals(portals)

    return () => controllers.forEach((c) => c.abort())
  }, [content_html])

  return (
    <>
      <Head title={`${page_title} - Fallout`}>
        <style>{`:root { background-color: #fffcf5; } @media (prefers-color-scheme: dark) { :root { background-color: #1a1412; } }`}</style>
      </Head>
      <div ref={contentRef} className="markdown-content" dangerouslySetInnerHTML={{ __html: content_html }} />
      {videoPortals.map(({ container, src }, i) => createPortal(<DocVideo src={src} />, container, String(i)))}
    </>
  )
}

MarkdownShow.layout = (page: ReactNode) => <MarkdownLayout>{page}</MarkdownLayout>

export default MarkdownShow
