import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/admin/ui/tooltip'

function waitDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

function formatWaitDuration(iso: string): string {
  const days = waitDays(iso)
  if (days < 1) return '<1d'
  return `${days}d`
}

function DurationValue({ value, label }: { value: string; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default">{value}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function WaitingLabel({
  waitingSince,
  cycleStartedAt,
  prefix = true,
  slaDays,
}: {
  waitingSince: string
  cycleStartedAt: string | null
  prefix?: boolean
  slaDays?: number
}) {
  const ship = formatWaitDuration(waitingSince)
  const cycle = cycleStartedAt ? formatWaitDuration(cycleStartedAt) : null
  // Red once THIS ship's wait reaches the SLA (breach). Cycle wait is informational only.
  const breached = slaDays != null && waitDays(waitingSince) >= slaDays
  return (
    <TooltipProvider>
      <span className={breached ? 'text-red-700 dark:text-red-400' : undefined}>
        {prefix && 'Waiting '}
        <DurationValue value={ship} label="This ship" />
        {cycle && cycle !== ship && (
          <span className={`ml-1 ${breached ? '' : 'text-muted-foreground'}`}>
            (<DurationValue value={cycle} label="This cycle" />)
          </span>
        )}
      </span>
    </TooltipProvider>
  )
}
