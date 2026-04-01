import type { ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

const BookLayout = ({
  children,
  className,
  showJoint = true,
  showBorderOnMobile = false,
}: {
  children: ReactNode
  className?: string
  showJoint?: boolean
  showBorderOnMobile?: boolean
}) => (
  <div
    className={twMerge(
      'h-full flex',
      showBorderOnMobile ? 'relative pl-4.25 pt-3.75 pr-6.25 pb-5.5 xl:p-12' : 'relative xl:p-12',
    )}
  >
    <div className={twMerge('relative flex-1 h-full my-auto', className)}>
      <div className="inset-0 bg-light-brown h-full w-full max-xl:p-3 md:max-xl:p-4">{children}</div>
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
    {showBorderOnMobile && (
      <>
        <img
          className="absolute top-0 left-0 w-22.5 h-20 pointer-events-none xl:hidden z-10"
          src="/border/top_left.webp"
          alt=""
        />
        <img
          className="absolute top-0 right-0 w-22.5 h-20 pointer-events-none xl:hidden z-10"
          src="/border/top_right.webp"
          alt=""
        />
        <img
          className="absolute bottom-0 left-0 w-22.5 h-20 pointer-events-none xl:hidden z-10"
          src="/border/bottom_left.webp"
          alt=""
        />
        <img
          className="absolute bottom-0 right-0 w-22.5 h-20 pointer-events-none xl:hidden z-10"
          src="/border/bottom_right.webp"
          alt=""
        />
        <div
          className="absolute top-20 left-0 bottom-20 w-22.5 pointer-events-none xl:hidden z-10"
          style={{ backgroundImage: 'url(/border/left.webp)', backgroundSize: '100% 100%' }}
        />
        <div
          className="absolute top-20 right-0 bottom-20 w-22.5 pointer-events-none xl:hidden z-10"
          style={{ backgroundImage: 'url(/border/right.webp)', backgroundSize: '100% 100%' }}
        />
        <div
          className="absolute top-0 left-22.5 right-22.5 h-20 pointer-events-none xl:hidden z-10"
          style={{ backgroundImage: 'url(/border/top.webp)', backgroundSize: '100% 100%' }}
        />
        <div
          className="absolute bottom-0 left-22.5 right-22.5 h-20 pointer-events-none xl:hidden z-10"
          style={{ backgroundImage: 'url(/border/bottom.webp)', backgroundSize: '100% 100%' }}
        />
      </>
    )}
  </div>
)

export default BookLayout
