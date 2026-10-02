import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { LoaderIcon } from 'lucide-react'
import { Button } from '@/components/admin/ui/button'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const PAGE_BATCH = 10

export default function PdfViewer({ url }: { url: string }) {
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE_BATCH)

  useEffect(() => {
    let cancelled = false
    setDoc(null)
    setError(null)
    setShown(PAGE_BATCH)
    const task = pdfjs.getDocument({ url })
    task.promise.then(
      (d) => (cancelled ? d.destroy() : setDoc(d)),
      (e: Error) => !cancelled && setError(e.message),
    )
    return () => {
      cancelled = true
      task.destroy()
    }
  }, [url])

  if (error) return <p className="p-6 text-sm text-muted-foreground">Couldn't open this PDF ({error}).</p>
  if (!doc)
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <LoaderIcon className="size-5 animate-spin" />
      </div>
    )

  const count = Math.min(doc.numPages, shown)
  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {Array.from({ length: count }, (_, i) => (
        <PdfPage key={`${url}#${i + 1}`} doc={doc} index={i + 1} />
      ))}
      {shown < doc.numPages && (
        <Button variant="raised" size="sm" onClick={() => setShown((n) => n + PAGE_BATCH)}>
          Show more pages ({doc.numPages - shown} left)
        </Button>
      )}
    </div>
  )
}

function PdfPage({ doc, index }: { doc: pdfjs.PDFDocumentProxy; index: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    let render: pdfjs.RenderTask | null = null
    doc.getPage(index).then((page) => {
      const canvas = ref.current
      if (cancelled || !canvas) return
      const scale = Math.min(2, (window.devicePixelRatio || 1) * 1.25)
      const viewport = page.getViewport({ scale })
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = `${viewport.width / scale}px`
      render = page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport })
      render.promise.catch(() => {})
    })
    return () => {
      cancelled = true
      render?.cancel()
    }
  }, [doc, index])

  return <canvas ref={ref} className="max-w-full rounded-md bg-white shadow-sm" />
}
