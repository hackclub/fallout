import type { ReactNode } from 'react'
import { Link, router } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Button } from '@/components/admin/ui/button'
import { Badge } from '@/components/admin/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { PlusIcon } from 'lucide-react'

interface Campaign {
  id: number
  name: string
  status: 'draft' | 'sending' | 'sent' | 'cancelled'
  sent_at: string | null
  created_at: string
  created_by: { display_name: string; avatar: string | null }
  stats: { total: number; sent: number; failed: number; pending: number; unsubscribed: number; skipped: number }
  progress: number
}

interface Props {
  campaigns: Campaign[]
}

const STATUS_BADGE: Record<
  Campaign['status'],
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  draft: { label: 'Draft', variant: 'secondary' },
  sending: { label: 'Sending…', variant: 'default' },
  sent: { label: 'Sent', variant: 'outline' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
}

function StatusBadge({ status }: { status: Campaign['status'] }) {
  const { label, variant } = STATUS_BADGE[status]
  return <Badge variant={variant}>{label}</Badge>
}

export default function SoupCampaignsIndex({ campaigns }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Soup Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">Slack DM broadcast campaigns sent as Soup.</p>
        </div>
        <Button asChild>
          <Link href="/admin/soup_campaigns/new">
            <PlusIcon className="size-4 mr-1.5" />
            New Campaign
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {campaigns.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No campaigns yet. Create one to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Created by</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => router.visit(`/admin/soup_campaigns/${c.id}`)}
                  >
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="tabular-nums text-sm">
                      {c.stats.total > 0 ? (
                        <span>
                          {c.stats.sent} / {c.stats.total}
                          {c.stats.failed > 0 && (
                            <span className="text-destructive ml-1.5">({c.stats.failed} failed)</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.stats.total > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${c.progress}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">{c.progress}%</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {c.created_by.avatar && (
                          <img src={c.created_by.avatar} className="size-5 rounded-full" alt="" />
                        )}
                        <span className="text-sm">{c.created_by.display_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

SoupCampaignsIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
