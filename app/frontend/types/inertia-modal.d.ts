declare module '@inertiaui/modal-react' {
  import type { ComponentType, ReactNode } from 'react'
  interface ModalContext {
    isOpen: boolean
    close: () => void
    reload: (options?: any) => void
    navigate: (url: string, options?: any) => Promise<any>
    goBack: () => void
    canGoBack: boolean
    getParentModal: () => ModalContext | null
    getChildModal: () => ModalContext | null
    emit: (event: string, ...args: any[]) => void
  }
  export function renderApp(App: ComponentType<any>, props: any): ReactNode
  export function ModalLink(props: {
    href: string
    navigate?: boolean
    replace?: boolean
    children?: ReactNode
    [key: string]: any
  }): JSX.Element
  export function Modal(props: {
    children?: ReactNode
    panelClasses?: string
    paddingClasses?: string
    maxWidth?: string
    duration?: number
    [key: string]: any
  }): JSX.Element
  export function useModal(): ModalContext | null
  export function useModalStack(): {
    stack: any[]
    visit: (...args: any[]) => Promise<any>
    visitModal: (url: string, options?: any) => Promise<any>
    navigateModal: (url: string, options?: any) => Promise<any>
    [key: string]: any
  }
  export function useModalIndex(): number | null
}
