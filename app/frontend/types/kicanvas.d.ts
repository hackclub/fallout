import type { DetailedHTMLProps, HTMLAttributes } from 'react'

// KiCanvas web components (https://kicanvas.org), loaded at runtime by KiCadViewer.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'kicanvas-embed': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        controls?: 'none' | 'basic' | 'full'
        controlslist?: string
        theme?: string
        zoom?: string
      }
      'kicanvas-source': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & { src: string }
    }
  }
}
