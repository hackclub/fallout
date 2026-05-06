import type { ReactNode } from 'react'
import { Link } from '@inertiajs/react'
import type { ColumnDef } from '@tanstack/react-table'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { DataTable } from '@/components/admin/DataTable'
import type { PagyProps } from '@/types'

type Transaction = {
  id: number
  user: { id: number; display_name: string }
  actor: { id: number; display_name: string } | null
  amount: number
  reason: string
  description: string
  created_at: string
}

const columns: ColumnDef<Transaction>[] = [
  {
    accessorKey: 'user',
    header: 'User',
    cell: ({ row }) => <span className="font-medium">{row.original.user.display_name}</span>,
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }) => (
      <span className={`font-medium ${row.original.amount > 0 ? 'text-green-700' : 'text-red-700'}`}>
        {row.original.amount > 0 ? `+${row.original.amount}` : row.original.amount} koi
      </span>
    ),
  },
  { accessorKey: 'reason', header: 'Reason' },
  { accessorKey: 'description', header: 'Description' },
  {
    accessorKey: 'actor',
    header: 'By',
    cell: ({ row }) => row.original.actor?.display_name ?? 'System',
  },
  { accessorKey: 'created_at', header: 'Date' },
]

export default function AdminKoiTransactionsIndex({
  transactions,
  user_id_filter,
  pagy,
}: {
  transactions: Transaction[]
  user_id_filter: string
  pagy: PagyProps
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Koi Transactions</h1>
          {user_id_filter && (
            <Badge variant="secondary" className="text-sm">
              User #{user_id_filter}
            </Badge>
          )}
        </div>
        <Button asChild variant="outline">
          <Link
            href={
              user_id_filter ? `/admin/koi_transactions/new?user_id=${user_id_filter}` : '/admin/koi_transactions/new'
            }
          >
            + Adjust Koi
          </Link>
        </Button>
      </div>

      <DataTable columns={columns} data={transactions} pagy={pagy} noun="transactions" />
    </div>
  )
}

AdminKoiTransactionsIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
