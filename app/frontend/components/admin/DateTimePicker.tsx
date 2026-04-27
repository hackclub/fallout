import { useState } from 'react'
import { DateTime } from 'luxon'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/admin/ui/button'
import { Calendar } from '@/components/admin/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/admin/ui/popover'

type Props = {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  minDate?: DateTime
}

const LOCAL_INPUT_FORMAT = "yyyy-LL-dd'T'HH:mm"
const DEFAULT_TIME = '21:00'

function parseLocal(value: string): DateTime | null {
  if (!value) return null
  const dt = DateTime.fromFormat(value, LOCAL_INPUT_FORMAT)
  return dt.isValid ? dt : null
}

function toLocalString(date: DateTime, time: string): string {
  const [hh = '21', mm = '00'] = time.split(':')
  return date.set({ hour: Number(hh), minute: Number(mm), second: 0, millisecond: 0 }).toFormat(LOCAL_INPUT_FORMAT)
}

function extractTime(value: string): string {
  const match = value.match(/T(\d{2}:\d{2})/)
  return match ? match[1] : DEFAULT_TIME
}

export default function DateTimePicker({ id, value, onChange, placeholder = 'Pick a date', required, minDate }: Props) {
  const [open, setOpen] = useState(false)
  const dt = parseLocal(value)
  const time = extractTime(value)
  const disabledDays = minDate ? { before: minDate.startOf('day').toJSDate() } : undefined
  const minTime = minDate && dt && dt.hasSame(minDate, 'day') ? minDate.toFormat('HH:mm') : undefined

  function handleDateSelect(next: Date | undefined) {
    if (!next) {
      onChange('')
      return
    }
    onChange(toLocalString(DateTime.fromJSDate(next), time))
  }

  function handleTimeChange(nextTime: string) {
    const base = dt ?? DateTime.now()
    onChange(toLocalString(base, nextTime))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn('w-full justify-start text-left font-normal', !dt && 'text-muted-foreground')}
        >
          <CalendarIcon className="mr-2 size-4" />
          {dt ? dt.toFormat("DDD 'at' t") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={dt?.toJSDate()}
          onSelect={handleDateSelect}
          captionLayout="dropdown"
          autoFocus
          disabled={disabledDays}
        />
        <div className="flex items-center gap-2 border-t border-border p-3">
          <label htmlFor={id ? `${id}-time` : undefined} className="text-sm font-medium">
            Time
          </label>
          <input
            id={id ? `${id}-time` : undefined}
            type="time"
            value={time}
            onChange={(e) => handleTimeChange(e.target.value)}
            required={required}
            min={minTime}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
