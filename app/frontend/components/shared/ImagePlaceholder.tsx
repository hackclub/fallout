import type { ReactNode } from 'react'
import { InformationCircleIcon, PhotoIcon } from '@heroicons/react/24/outline'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/shared/Tooltip'
import { cn } from '@/lib/utils'

type Props = {
  text: string
  className?: string
  helpTooltip?: ReactNode
}

export default function ImagePlaceholder({ text, className, helpTooltip }: Props) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 p-4 text-center text-dark-brown', className)}>
      <PhotoIcon className="w-10 h-10" strokeWidth={1.25} aria-hidden />
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
        {text}
        {helpTooltip && (
          <Tooltip side="top" gap={6} interactive>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="More info"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                }}
                className="cursor-help text-brown hover:text-dark-brown"
              >
                <InformationCircleIcon className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{helpTooltip}</TooltipContent>
          </Tooltip>
        )}
      </span>
    </div>
  )
}
