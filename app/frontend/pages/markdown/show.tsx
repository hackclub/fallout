import { type ReactNode, useEffect, useRef } from 'react'
import { Head } from '@inertiajs/react'
import { router } from '@inertiajs/react'
import MarkdownLayout from '@/layouts/MarkdownLayout'
import DocVideo from '@/components/docs/DocVideo'
import { createRoot } from 'react-dom/client'

function MarkdownShow({ content_html, page_title }: { content_html: string; page_title: string }) {
  const contentRef = useRef<HTMLDivElement>(null)

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

    // Mount DocVideo into each <video> placeholder. Uses createRoot because
    // dangerouslySetInnerHTML content is outside React's tree — portals don't work.
    const roots: ReturnType<typeof createRoot>[] = []
    container.querySelectorAll<HTMLVideoElement>('video').forEach((video) => {
      const src = video.dataset.src || video.getAttribute('src') || ''
      if (!src) return
      const wrapper = document.createElement('div')
      video.replaceWith(wrapper)
      const root = createRoot(wrapper)
      root.render(<DocVideo src={src} />)
      roots.push(root)
    })

    return () => {
      controllers.forEach((c) => c.abort())
      roots.forEach((r) => r.unmount())
    }
  }, [content_html])

  return (
    <>
      <Head title={`${page_title} - Fallout`}>
        <style>{`:root { background-color: #fffcf5; } @media (prefers-color-scheme: dark) { :root { background-color: #1a1412; } }`}</style>
      </Head>
      <div ref={contentRef} className="markdown-content" dangerouslySetInnerHTML={{ __html: content_html }} />
    </>
  )
}

MarkdownShow.layout = (page: ReactNode) => <MarkdownLayout>{page}</MarkdownLayout>

export default MarkdownShow
