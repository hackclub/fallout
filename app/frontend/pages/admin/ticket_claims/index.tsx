import { useState } from 'react'
import type { ReactNode } from 'react'
import { router, Link, usePage } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent } from '@/components/admin/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/admin/ui/alert-dialog'
import { CheckIcon, ClockIcon, ExternalLinkIcon, XIcon } from 'lucide-react'

type Project = {
  id: number
  name: string
}

type ClaimUser = {
  id: number
  display_name: string
  email: string
  avatar: string
  approved_hours: number
  total_hours: number
  projects: Project[]
}

type Claim = {
  id: number
  state: 'pending' | 'approved' | 'rejected'
  created_at: string
  user: ClaimUser
}

const STATE_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  approved: 'default',
  rejected: 'destructive',
}

const HOURS_GOAL = 60

function HoursBar({ approved, total }: { approved: number; total: number }) {
  const pct = Math.min((approved / HOURS_GOAL) * 100, 100)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Approved</span>
        <span className="font-medium text-foreground">
          {approved}h approved / {total}h total
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-muted-foreground">
        {pct.toFixed(0)}% of {HOURS_GOAL}h goal
      </div>
    </div>
  )
}

function ClaimCard({ claim }: { claim: Claim }) {
  const [processing, setProcessing] = useState(false)
  const { errors } = usePage<{ errors?: { base?: string[] } }>().props

  function approve() {
    setProcessing(true)
    router.patch(`/admin/ticket_claims/${claim.id}/approve`, {}, { onFinish: () => setProcessing(false) })
  }

  function reject() {
    setProcessing(true)
    router.patch(`/admin/ticket_claims/${claim.id}/reject`, {}, { onFinish: () => setProcessing(false) })
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={claim.user.avatar} alt={claim.user.display_name} className="size-10 rounded-full shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{claim.user.display_name}</span>
                <Badge variant={STATE_VARIANTS[claim.state] ?? 'outline'}>{claim.state}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{claim.user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/users/${claim.user.id}`}>
                <ExternalLinkIcon className="size-3.5" />
                View user
              </Link>
            </Button>

            {claim.state === 'pending' && (
              <>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={processing}>
                      <XIcon className="size-3.5" />
                      Reject
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reject ticket claim for {claim.user.display_name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will mark their claim as rejected. They will not receive a ticket.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={reject} disabled={processing}>
                        Reject
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" disabled={processing}>
                      <CheckIcon className="size-3.5" />
                      Approve
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Approve ticket for {claim.user.display_name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will mark the claim as approved and register <strong>{claim.user.display_name}</strong> (
                        {claim.user.email}) with the Attend API. They'll receive an invitation email.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={approve} disabled={processing}>
                        Approve & send invite
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>
        <HoursBar approved={claim.user.approved_hours} total={claim.user.total_hours} />

        {claim.user.projects.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Projects</p>
            <div className="flex flex-wrap gap-1.5">
              {claim.user.projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/projects/${p.id}`}
                  className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted transition-colors"
                >
                  {p.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">Claimed {claim.created_at}</p>
      </CardContent>
    </Card>
  )
}

const STATES = ['', 'pending', 'approved', 'rejected']

export default function AdminTicketClaimsIndex({ claims, state_filter }: { claims: Claim[]; state_filter: string }) {
  const { errors } = usePage<{ errors?: { base?: string[] } }>().props

  function filterByState(state: string) {
    router.get('/admin/ticket_claims', state ? { state } : {}, { preserveState: true })
  }

  const pendingCount = claims.filter((c) => c.state === 'pending').length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ticket Claims</h1>
          {pendingCount > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {pendingCount} pending {pendingCount === 1 ? 'claim' : 'claims'} awaiting review
            </p>
          )}
        </div>
      </div>

      {errors?.base && (
        <div className="mb-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {Array.isArray(errors.base) ? errors.base[0] : errors.base}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-6">
        {STATES.map((s) => (
          <Button
            key={s}
            variant={state_filter === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => filterByState(s)}
          >
            {s === '' ? 'All' : s}
            {s === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center size-4 rounded-full bg-background/20 text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </Button>
        ))}
      </div>

      {claims.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <ClockIcon className="size-8 mb-3 opacity-40" />
          <p className="text-sm">No claims {state_filter ? `with state "${state_filter}"` : 'yet'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {claims.map((claim) => (
            <ClaimCard key={claim.id} claim={claim} />
          ))}
        </div>
      )}
    </div>
  )
}

AdminTicketClaimsIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
