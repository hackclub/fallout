import { router } from '@inertiajs/react'
import { Button } from '@/components/admin/ui/button'

// Toggles the "users that can get a ticket" filter on a review queue. The active state is
// persisted server-side in the session, so we only send the next desired value.
export default function TicketFilterButton({ basePath, active }: { basePath: string; active: boolean }) {
  return (
    <Button
      variant={active ? 'default' : 'outline'}
      size="sm"
      onClick={() =>
        router.get(basePath, { ticket: active ? 'all' : 'eligible' }, { preserveScroll: true, replace: true })
      }
    >
      Filter: Users that can get a ticket
    </Button>
  )
}
