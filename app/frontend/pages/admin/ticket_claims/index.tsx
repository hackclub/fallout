import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { router, Link, usePage } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/admin/ui/input-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/admin/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/admin/ui/tooltip'
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
import { CheckIcon, ClockIcon, ExternalLinkIcon, SearchIcon, XIcon } from 'lucide-react'

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

type StateFilter = 'all' | 'pending' | 'approved' | 'rejected'

const STATE_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  approved: 'default',
  rejected: 'destructive',
}

const HOURS_GOAL = 60
const FILTERS: StateFilter[] = ['all', 'pending', 'approved', 'rejected']

function HoursBar({ hours }: { hours: number }) {
  const pct = Math.min((hours / HOURS_GOAL) * 100, 100)
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-200" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
        {hours}/{HOURS_GOAL}h
      </span>
    </div>
  )
}

function ProjectsCell({ projects }: { projects: Project[] }) {
  if (projects.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs font-normal text-muted-foreground">
          {projects.length} {projects.length === 1 ? 'project' : 'projects'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <div className="flex flex-col">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/admin/projects/${p.id}`}
              className="truncate rounded px-2 py-1.5 text-sm hover:bg-muted transition-colors"
            >
              {p.name}
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function RowActions({ claim }: { claim: Claim }) {
  const [processing, setProcessing] = useState(false)

  function approve() {
    setProcessing(true)
    router.patch(`/admin/ticket_claims/${claim.id}/approve`, {}, { onFinish: () => setProcessing(false) })
  }

  function reject() {
    setProcessing(true)
    router.patch(`/admin/ticket_claims/${claim.id}/reject`, {}, { onFinish: () => setProcessing(false) })
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7" asChild>
            <Link href={`/admin/users/${claim.user.id}`} aria-label="View user">
              <ExternalLinkIcon className="size-3.5" />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>View user</TooltipContent>
      </Tooltip>

      {claim.state === 'pending' && (
        <>
          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7" disabled={processing} aria-label="Reject">
                    <XIcon className="size-3.5" />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent>Reject</TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reject claim for {claim.user.display_name}?</AlertDialogTitle>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button size="icon" className="size-7" disabled={processing} aria-label="Approve">
                    <CheckIcon className="size-3.5" />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent>Approve &amp; invite</TooltipContent>
            </Tooltip>
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
                  Approve &amp; send invite
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  )
}

export default function AdminTicketClaimsIndex({ claims }: { claims: Claim[] }) {
  const { errors } = usePage<{ errors?: { base?: string[] } }>().props
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [stateFilter, setStateFilter] = useState<StateFilter>('pending')
  const [search, setSearch] = useState('')

  const counts = useMemo(() => {
    const c = { all: claims.length, pending: 0, approved: 0, rejected: 0 }
    for (const claim of claims) c[claim.state]++
    return c
  }, [claims])

  const visibleClaims = useMemo(() => {
    const q = search.trim().toLowerCase()
    return claims.filter((claim) => {
      if (stateFilter !== 'all' && claim.state !== stateFilter) return false
      if (!q) return true
      return (
        claim.user.display_name.toLowerCase().includes(q) ||
        claim.user.email.toLowerCase().includes(q) ||
        claim.user.projects.some((p) => p.name.toLowerCase().includes(q))
      )
    })
  }, [claims, stateFilter, search])

  const visiblePending = visibleClaims.filter((c) => c.state === 'pending')
  const allPendingSelected = visiblePending.length > 0 && visiblePending.every((c) => selectedIds.has(c.id))
  const somePendingSelected = visiblePending.some((c) => selectedIds.has(c.id))

  function handleSelect(id: number, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function handleSelectAll(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const c of visiblePending) {
        if (checked) next.add(c.id)
        else next.delete(c.id)
      }
      return next
    })
  }

  function bulkAction(path: string) {
    setBulkProcessing(true)
    router.patch(
      path,
      { claim_ids: Array.from(selectedIds) },
      {
        onFinish: () => {
          setBulkProcessing(false)
          setSelectedIds(new Set())
        },
      },
    )
  }

  const selectedCount = selectedIds.size
  const showSelect = visiblePending.length > 0

  return (
    <TooltipProvider>
      <div className="pb-20">
        <div className="flex items-center gap-2 mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Ticket Claims</h1>
          {counts.pending > 0 && (
            <Badge variant="secondary" className="text-sm">
              {counts.pending} pending
            </Badge>
          )}
        </div>

        {errors?.base && (
          <div className="mb-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {Array.isArray(errors.base) ? errors.base[0] : errors.base}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((s) => (
              <Button
                key={s}
                variant={stateFilter === s ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStateFilter(s)}
                className="capitalize"
              >
                {s}
                <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{counts[s]}</span>
              </Button>
            ))}
          </div>

          <InputGroup className="ml-auto w-full sm:w-64">
            <InputGroupAddon align="inline-start">
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              placeholder="Search name, email, project..."
            />
          </InputGroup>
        </div>

        {visibleClaims.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ClockIcon className="size-8 mb-3 opacity-40" />
            <p className="text-sm">
              {search.trim()
                ? 'No claims match your search'
                : stateFilter === 'all'
                  ? 'No claims yet'
                  : `No ${stateFilter} claims`}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {showSelect ? (
                    <TableHead className="w-8">
                      <Checkbox
                        checked={allPendingSelected}
                        data-state={somePendingSelected && !allPendingSelected ? 'indeterminate' : undefined}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all pending"
                      />
                    </TableHead>
                  ) : (
                    <TableHead className="w-8" />
                  )}
                  <TableHead>User</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Projects</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Claimed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleClaims.map((claim) => {
                  const selected = selectedIds.has(claim.id)
                  return (
                    <TableRow key={claim.id} data-state={selected ? 'selected' : undefined}>
                      <TableCell>
                        {claim.state === 'pending' && (
                          <Checkbox
                            checked={selected}
                            onCheckedChange={(checked) => handleSelect(claim.id, !!checked)}
                            aria-label={`Select ${claim.user.display_name}`}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-0">
                          <img src={claim.user.avatar} alt="" className="size-7 rounded-full shrink-0" />
                          <div className="min-w-0">
                            <Link
                              href={`/admin/users/${claim.user.id}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {claim.user.display_name}
                            </Link>
                            <div className="text-xs text-muted-foreground truncate">{claim.user.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <HoursBar hours={claim.user.approved_hours} />
                      </TableCell>
                      <TableCell>
                        <ProjectsCell projects={claim.user.projects} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={STATE_VARIANTS[claim.state] ?? 'outline'}
                          className="text-[10px] px-1.5 py-0 capitalize"
                        >
                          {claim.state}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{claim.created_at}</TableCell>
                      <TableCell>
                        <RowActions claim={claim} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {selectedCount > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
            <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-lg">
              <span className="text-sm font-medium">
                {selectedCount} {selectedCount === 1 ? 'claim' : 'claims'} selected
              </span>
              <div className="h-4 w-px bg-border" />

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={bulkProcessing}>
                    <XIcon className="size-3.5" />
                    Reject all
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Reject {selectedCount} {selectedCount === 1 ? 'claim' : 'claims'}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This will mark {selectedCount === 1 ? 'this claim' : `all ${selectedCount} selected claims`} as
                      rejected. The {selectedCount === 1 ? 'user' : 'users'} will not receive a ticket.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => bulkAction('/admin/ticket_claims/bulk_reject')}
                      disabled={bulkProcessing}
                    >
                      Reject {selectedCount === 1 ? 'claim' : `${selectedCount} claims`}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={bulkProcessing}>
                    <CheckIcon className="size-3.5" />
                    Approve all
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Approve {selectedCount} {selectedCount === 1 ? 'claim' : 'claims'}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This will approve {selectedCount === 1 ? 'this claim' : `all ${selectedCount} selected claims`}{' '}
                      and send {selectedCount === 1 ? 'an invitation email' : `${selectedCount} invitation emails`} via
                      the Attend API.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => bulkAction('/admin/ticket_claims/bulk_approve')}
                      disabled={bulkProcessing}
                    >
                      Approve &amp; send {selectedCount === 1 ? 'invite' : `${selectedCount} invites`}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} disabled={bulkProcessing}>
                Clear
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

AdminTicketClaimsIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
