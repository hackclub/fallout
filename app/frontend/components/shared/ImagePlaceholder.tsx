import { PhotoIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

type Props = {
  text: string
  className?: string
}

export default function ImagePlaceholder({ text, className }: Props) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 p-4 text-center text-dark-brown', className)}>
      <PhotoIcon className="w-10 h-10" strokeWidth={1.25} aria-hidden />
      <span className="text-sm font-semibold">{text}</span>
    </div>
  )
}
