import type { ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import AdminLayout from '@/layouts/AdminLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { Badge } from '@/components/admin/ui/badge'
import { PageProps } from '@inertiajs/core'

interface LeaderboardRow {
  id: number
  display_name: string
  avatar: string | null
  approved_projects: number
  design_returned_projects: number
  return_rate: number
}

interface Totals {
  approved_projects: number
  design_returned_projects: number
  return_rate: number
}

interface Props extends PageProps{
  leaderboard: LeaderboardRow[]
  totals: Totals
}

function formatRate(value: number): string {
  return `${Math.round(value * 1000) / 10}%`
}

export default function RequirementsDesignDashboard() {
  const { leaderboard, totals } = usePage<Props>().props

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Return %</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">RC-Approved Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{totals.approved_projects}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Returned In Design</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{totals.design_returned_projects}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Overall Return Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{formatRate(totals.return_rate)}</p>
          </CardContent>
        </Card>
      </div>

      <Card><CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Rank</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead className="text-right">Approved RC</TableHead>
                <TableHead className="text-right">Returned DR</TableHead>
                <TableHead className="text-right">Approved:Returned</TableHead>
                <TableHead className="text-right">Return Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No data :(
                  </TableCell>
                </TableRow>
              ) : (
                leaderboard.map((row, index) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {row.avatar ? (
                          <img src={row.avatar} className="size-8 rounded-full shrink-0" alt="" />
                        ) : (
                          <div className="size-8 rounded-full bg-muted shrink-0" />
                        )}
                        <span className="font-medium">{row.display_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.approved_projects}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.design_returned_projects}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.approved_projects}:{row.design_returned_projects}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={row.design_returned_projects > 0 ? 'destructive' : 'secondary'}>
                        {formatRate(row.return_rate)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

RequirementsDesignDashboard.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
