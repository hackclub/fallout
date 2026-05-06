import type { ReactNode } from 'react'
import { Link, router } from '@inertiajs/react'
import type { ColumnDef } from '@tanstack/react-table'
import AdminLayout from '@/layouts/AdminLayout'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { DataTable } from '@/components/admin/DataTable'
import type { PagyProps } from '@/types'

type Order = {
  id: number
  user: { id: number; display_name: string; email: string }
  shop_item: { id: number; name: string }
  frozen_price: number
  quantity: number
  total_cost: number
  state: string
  created_at: string
}

const STATE_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  fulfilled: 'default',
  rejected: 'destructive',
  on_hold: 'secondary',
}

const columns: ColumnDef<Order>[] = [
  {
    accessorKey: 'user',
    header: 'User',
    cell: ({ row }) => (
      <div>
        <span className="font-medium">{row.original.user.display_name}</span>
        <p className="text-xs text-muted-foreground">{row.original.user.email}</p>
      </div>
    ),
  },
  {
    accessorKey: 'shop_item',
    header: 'Item',
    cell: ({ row }) => row.original.shop_item.name,
  },
  {
    accessorKey: 'total_cost',
    header: 'Price',
    cell: ({ row }) => `${row.original.total_cost} koi`,
  },
  {
    accessorKey: 'state',
    header: 'State',
    cell: ({ row }) => <Badge variant={STATE_VARIANTS[row.original.state] ?? 'outline'}>{row.original.state}</Badge>,
  },
  { accessorKey: 'created_at', header: 'Date' },
  {
    id: 'actions',
    cell: ({ row }) => (
      <Link href={`/admin/shop_orders/${row.original.id}`} className="text-primary hover:underline text-sm">
        Manage
      </Link>
    ),
  },
]

const STATES = ['', 'pending', 'fulfilled', 'rejected', 'on_hold']

export default function AdminShopOrdersIndex({
  orders,
  state_filter,
  pagy,
}: {
  orders: Order[]
  state_filter: string
  pagy: PagyProps
}) {
  function filterByState(state: string) {
    router.get('/admin/shop_orders', state ? { state } : {}, { preserveState: true })
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-4">Shop Orders</h1>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {STATES.map((s) => (
          <Button
            key={s}
            variant={state_filter === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => filterByState(s)}
          >
            {s || 'All'}
          </Button>
        ))}
      </div>

      <DataTable columns={columns} data={orders} pagy={pagy} noun="orders" />
    </div>
  )
}

AdminShopOrdersIndex.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
