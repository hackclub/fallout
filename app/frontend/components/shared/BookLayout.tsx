import type { ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

const BookLayout = ({
  children,
  className,
  showJoint = true,
}: {
  children: ReactNode
  className?: string
  showJoint?: boolean
}) => (
  <div className="h-full xl:p-12 flex">
    <div className={twMerge('relative flex-1 h-full my-auto', className)}>
      <div className="inset-0 bg-light-brown h-full w-full">{children}</div>
      <div className="hidden xl:block absolute pointer-events-none -left-5 -right-5 top-5 -bottom-5">
        <div className="absolute left-0 bottom-0 top-0 w-5 bg-[#d4bb9d]"></div>
        <div className="absolute left-0 bottom-0 right-0 h-5 bg-[#d4bb9d]"></div>
        <div className="absolute right-0 bottom-0 top-0 w-5 bg-[#d4bb9d]"></div>
      </div>
      <div className="hidden xl:block absolute pointer-events-none -left-10 -right-10 top-10 -bottom-10">
        <div className="absolute left-0 bottom-0 top-0 w-5 bg-[#ae9578]"></div>
        <div className="absolute left-0 bottom-0 right-0 h-5 bg-[#ae9578]"></div>
        <div className="absolute right-0 bottom-0 top-0 w-5 bg-[#ae9578]"></div>
      </div>
      <div className="hidden xl:block absolute pointer-events-none -left-15 -right-15 top-15 -bottom-15">
        <div className="absolute left-0 bottom-0 top-0 w-5 bg-dark-brown"></div>
        <div className="absolute left-0 bottom-0 right-0 h-5 bg-dark-brown"></div>
        <div className="absolute right-0 bottom-0 top-0 w-5 bg-dark-brown"></div>
      </div>
      {showJoint && (
        <div className="hidden xl:block absolute pointer-events-none left-1/2 top-0 -translate-x-1/2 -bottom-15 w-px bg-dark-brown"></div>
      )}
    </div>
  </div>
)

export default BookLayout
