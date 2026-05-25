import { Kbd } from '@/components/admin/ui/kbd'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/admin/ui/alert-dialog'

export type ShortcutEntry = {
  key: string
  // Multi-key combos (e.g. Cmd+Enter) — render each segment as its own Kbd.
  combo?: string[]
  description: string
}

/**
 * Modal cheatsheet of every active review shortcut. Rendered once per page;
 * controlled by `open` / `onOpenChange` from the parent so the same `?` key
 * can both open and close it (handled by the parent's shortcut map).
 */
export function ShortcutHelpDialog({
  open,
  onOpenChange,
  entries,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: ShortcutEntry[]
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md!">
        <AlertDialogHeader>
          <AlertDialogTitle>Keyboard shortcuts</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {entries.map((entry) => (
            <ShortcutRow key={entry.key} entry={entry} />
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogAction>Got it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ShortcutRow({ entry }: { entry: ShortcutEntry }) {
  const segments = entry.combo ?? [entry.key]
  return (
    <>
      <div className="flex items-center gap-1 justify-self-start">
        {segments.map((seg, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground text-xs">+</span>}
            <KbdLight>{seg}</KbdLight>
          </span>
        ))}
      </div>
      <div className="text-muted-foreground self-center">{entry.description}</div>
    </>
  )
}

// Light variant of Kbd for use on the dialog's popover background — Kbd itself is
// tuned for the dark tooltip surface, which would render unreadable on the popover.
function KbdLight({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[11px] font-medium uppercase tracking-wide text-foreground">
      {children}
    </kbd>
  )
}

// Re-export so consumers don't need a separate import.
export { Kbd }
