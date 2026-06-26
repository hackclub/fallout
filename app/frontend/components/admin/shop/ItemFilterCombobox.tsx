import { useState } from 'react'
import { Command } from 'cmdk'
import { Search, Check, ChevronsUpDown, Package, ImageOff } from 'lucide-react'
import { Button } from '@/components/admin/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/admin/ui/popover'
import { formatAmount, type Currency } from '@/components/admin/shop/shopOrder'
import { cn } from '@/lib/utils'

export type ItemOption = { id: number; name: string; currency: Currency; image_url: string; price: number }

function Thumb({ url, className }: { url: string; className?: string }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted',
        className,
      )}
    >
      {url ? (
        <img src={url} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <ImageOff className="size-3 text-muted-foreground" />
      )}
    </span>
  )
}

// Searchable item picker for the orders filter bar. Items are already loaded, so cmdk filters
// client-side — mirrors UserSearchCombobox's look without needing a server endpoint.
export default function ItemFilterCombobox({
  items,
  value,
  onChange,
}: {
  items: ItemOption[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = items.find((i) => String(i.id) === value)

  function pick(id: string) {
    setOpen(false)
    onChange(id)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-52 justify-between gap-2 rounded-lg font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected ? (
              <Thumb url={selected.image_url} className="size-5" />
            ) : (
              <Package className="size-4 text-muted-foreground" />
            )}
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>
              {selected ? selected.name : 'All items'}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <div className="flex items-center border-b border-border px-3">
            <Search className="mr-2 size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              autoFocus
              placeholder="Search items…"
              className="flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-72 overflow-y-auto p-1">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">No items found.</Command.Empty>
            <Command.Item
              value="all-items"
              onSelect={() => pick('')}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded border border-border bg-muted">
                <Package className="size-3 text-muted-foreground" />
              </span>
              <span className="flex-1 font-medium">All items</span>
              {value === '' && <Check className="size-3.5 text-muted-foreground" />}
            </Command.Item>
            {items.map((item) => (
              <Command.Item
                key={item.id}
                value={`${item.name} ${item.id}`}
                onSelect={() => pick(String(item.id))}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
              >
                <Thumb url={item.image_url} className="size-6" />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatAmount(item.price, item.currency)}
                </span>
                {String(item.id) === value && <Check className="size-3.5 shrink-0 text-muted-foreground" />}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
