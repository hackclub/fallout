import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/admin/ui/tooltip'

function formatWaitDuration(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
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
}: {
  waitingSince: string
  cycleStartedAt: string | null
  prefix?: boolean
}) {
  const ship = formatWaitDuration(waitingSince)
  const cycle = cycleStartedAt ? formatWaitDuration(cycleStartedAt) : null
  return (
    <TooltipProvider>
      <span>
        {prefix && 'Waiting '}
        <DurationValue value={ship} label="This ship" />
        {cycle && cycle !== ship && (
          <span className="text-muted-foreground ml-1">
            (<DurationValue value={cycle} label="This cycle" />)
          </span>
        )}
      </span>
    </TooltipProvider>
  )
}
