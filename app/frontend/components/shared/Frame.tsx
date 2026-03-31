import type { ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

const Frame = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={twMerge('relative md:pl-4.25 md:pt-3.75 md:pr-6.25 md:pb-5.5', className)}>
    <div className="bg-light-brown h-full w-full p-4 md:p-3 overflow-y-auto">{children}</div>
    <img
      className="hidden md:block absolute top-0 left-0 w-22.5 h-20 pointer-events-none"
      src="/border/top_left.webp"
      alt=""
    />
    <img
      className="hidden md:block absolute top-0 right-0 w-22.5 h-20 pointer-events-none"
      src="/border/top_right.webp"
      alt=""
    />
    <img
      className="hidden md:block absolute bottom-0 left-0 w-22.5 h-20 pointer-events-none"
      src="/border/bottom_left.webp"
      alt=""
    />
    <img
      className="hidden md:block absolute bottom-0 right-0 w-22.5 h-20 pointer-events-none"
      src="/border/bottom_right.webp"
      alt=""
    />
    <div
      className="hidden md:block absolute top-20 left-0 bottom-20 w-22.5 pointer-events-none"
      style={{ backgroundImage: 'url(/border/left.webp)', backgroundSize: '100% 100%' }}
    />
    <div
      className="hidden md:block absolute top-20 right-0 bottom-20 w-22.5 pointer-events-none"
      style={{ backgroundImage: 'url(/border/right.webp)', backgroundSize: '100% 100%' }}
    />
    <div
      className="hidden md:block absolute top-0 left-22.5 right-22.5 h-20 pointer-events-none"
      style={{ backgroundImage: 'url(/border/top.webp)', backgroundSize: '100% 100%' }}
    />
    <div
      className="hidden md:block absolute bottom-0 left-22.5 right-22.5 h-20 pointer-events-none"
      style={{ backgroundImage: 'url(/border/bottom.webp)', backgroundSize: '100% 100%' }}
    />
  </div>
)

export default Frame
