import { ClockIcon } from '@heroicons/react/20/solid'
import { DateTime } from 'luxon'
import { twMerge } from 'tailwind-merge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/shared/Tooltip'
import { useNowTick } from '@/lib/useNowTick'

// "2D, 12H, 32M" — leading zero units are dropped, so a deadline under an hour reads just "32M".
function countdownLabel(deadlineIso: string, now: Date): string | null {
  const remainingMs = new Date(deadlineIso).getTime() - now.getTime()
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null

  const totalMinutes = Math.floor(remainingMs / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days}D`)
  if (days > 0 || hours > 0) parts.push(`${hours}H`)
  parts.push(`${minutes}M`)
  return parts.join(', ')
}

function deadlineLabel(deadlineIso: string): string {
  const dt = DateTime.fromISO(deadlineIso)
  return dt.isValid ? dt.toFormat("LLLL d 'at' t") : deadlineIso
}

export default function ResubmitCountdown({ deadlineIso, className }: { deadlineIso: string; className?: string }) {
  // Ticks twice a minute so the displayed minute is never more than ~30s stale — the label recomputes
  // from `now` on every tick, so the count falls on its own without a reload.
  const now = useNowTick(30_000)
  const label = countdownLabel(deadlineIso, now)

  // Past the deadline the server stops offering Submit anyway, so render nothing rather than "0M".
  if (!label) return null

  return (
    <Tooltip side="top" gap={8}>
      <TooltipTrigger asChild>
        {/* The trigger itself stays unanimated so the tooltip anchors to a stable box; only the
            inner span breathes. */}
        <span className={twMerge('inline-block', className)}>
          <span className="countdown-breathe inline-flex items-center gap-1 text-xs font-bold text-coral">
            <ClockIcon className="w-4 h-4" />
            {label}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span className="block max-w-56 text-xs leading-snug">
          This is your final submission — approved or returned, you won&apos;t be able to submit this project again.
          Submit before {deadlineLabel(deadlineIso)}.
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
