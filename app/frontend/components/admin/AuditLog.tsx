import { Badge } from '@/components/admin/ui/badge'
import { Card, CardContent } from '@/components/admin/ui/card'
import { Skeleton } from '@/components/admin/ui/skeleton'

export interface AuditLogEntry {
  id: number
  event: string
  item_label?: string
  whodunnit_name: string | null
  created_at: string
  changes: { field: string; before: string; after: string }[]
}

const eventLabels: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  destroy: 'Deleted',
}

const eventVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  create: 'default',
  update: 'secondary',
  destroy: 'destructive',
}

export function AuditLogLoading() {
  return (
    <div>
      <Skeleton className="h-6 w-32 mb-4" />
      <Skeleton className="h-40 w-full rounded-md" />
    </div>
  )
}

export default function AuditLog({ entries }: { entries: AuditLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No audit log entries.</p>
  }

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight mb-4">Audit Log</h2>
      <Card className="py-0 max-h-140 overflow-y-auto">
        <div className="divide-y divide-border">
          {entries.map((entry) => (
            <div key={entry.id} className="px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant={eventVariants[entry.event] ?? 'outline'} className="text-[10px]">
                  {eventLabels[entry.event] ?? entry.event}
                </Badge>
                {entry.item_label && <span className="text-xs text-muted-foreground">{entry.item_label}</span>}
                <span className="font-medium">{entry.whodunnit_name ?? 'System'}</span>
                <span className="text-muted-foreground">{entry.created_at}</span>
              </div>
              {entry.changes.length > 0 && (
                <div className="mt-2 space-y-1 text-xs">
                  {entry.changes.map((change, i) => (
                    <div key={i} className="text-muted-foreground">
                      <span className="font-medium text-foreground">{change.field}</span>:{' '}
                      <span className="line-through">{change.before || '(empty)'}</span>
                      {' → '}
                      <span>{change.after || '(empty)'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
