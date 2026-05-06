import { Link } from '@inertiajs/react'
import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/admin/ui/badge'
import type { ReviewRow } from '@/types'

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  approved: 'default',
  returned: 'destructive',
  rejected: 'destructive',
  cancelled: 'outline',
}

export function buildPendingColumns(
  basePath: string,
  siblingLabel?: string,
  extraColumns: ColumnDef<ReviewRow>[] = [],
): ColumnDef<ReviewRow>[] {
  return [
    {
      accessorKey: 'project_name',
      header: 'Project',
      cell: ({ row }) => (
        <Link href={`${basePath}/${row.original.id}`} className="font-medium hover:underline">
          {row.original.project_name}
        </Link>
      ),
    },
    {
      accessorKey: 'user_display_name',
      header: 'Owner',
    },
    {
      accessorKey: 'sibling_approved',
      header: '',
      cell: ({ row }) => {
        if (!row.original.sibling_approved || !siblingLabel) return null
        return (
          <Badge variant="default" className="text-xs whitespace-nowrap">
            {siblingLabel}
          </Badge>
        )
      },
    },
    ...extraColumns,
    {
      accessorKey: 'reviewer_display_name',
      header: 'Reviewer',
      cell: ({ row }) => {
        if (row.original.is_claimed) {
          return (
            <Badge variant="outline" className="text-xs">
              Claimed by {row.original.claimed_by_display_name}
            </Badge>
          )
        }
        return row.original.reviewer_display_name ?? <span className="text-muted-foreground">Unassigned</span>
      },
    },
    {
      accessorKey: 'created_at',
      header: 'Waiting Since',
    },
  ]
}

export function buildAllColumns(
  isAdmin: boolean,
  basePath: string,
  extraColumns: ColumnDef<ReviewRow>[] = [],
): ColumnDef<ReviewRow>[] {
  return [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) => {
        if (row.original.project_flagged && !isAdmin)
          return <span className="text-muted-foreground">{row.original.id}</span>
        return (
          <Link href={`${basePath}/${row.original.id}`} className="text-muted-foreground hover:underline">
            {row.original.id}
          </Link>
        )
      },
    },
    {
      accessorKey: 'project_name',
      header: 'Project',
      cell: ({ row }) => <span className="font-medium">{row.original.project_name}</span>,
    },
    {
      accessorKey: 'user_display_name',
      header: 'Owner',
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        if (row.original.project_flagged) {
          return (
            <Badge variant="destructive" className="capitalize">
              Flagged
            </Badge>
          )
        }
        return (
          <Badge variant={statusColors[row.original.status] ?? 'outline'} className="capitalize">
            {row.original.status}
          </Badge>
        )
      },
    },
    ...extraColumns,
    {
      accessorKey: 'reviewer_display_name',
      header: 'Reviewed By',
      cell: ({ row }) => row.original.reviewer_display_name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'created_at',
      header: 'Created',
    },
  ]
}
