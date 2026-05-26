import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Inline keyboard-key indicator. Used inside admin tooltips, buttons, and shortcut help.
 *
 * variant="tooltip" (default): light text/border for use on dark tooltip backgrounds.
 * variant="muted": dark text/border for use on light surfaces (header bar, outline buttons).
 */
function Kbd({
  className,
  variant = 'tooltip',
  ...props
}: React.ComponentProps<'kbd'> & { variant?: 'tooltip' | 'muted' }) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-4 min-w-4 items-center justify-center rounded-sm border px-1 font-mono text-[10px] font-medium uppercase tracking-wide',
        variant === 'tooltip'
          ? 'border-background/30 bg-background/15 text-background'
          : 'border-foreground/20 bg-foreground/8 text-foreground/70',
        className,
      )}
      {...props}
    />
  )
}

export { Kbd }
