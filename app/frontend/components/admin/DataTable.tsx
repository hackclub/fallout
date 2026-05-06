import { router } from '@inertiajs/react'
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useState } from 'react'
import { Button } from '@/components/admin/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import type { PagyProps } from '@/types'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  pagy?: PagyProps
  noun?: string
  pageParam?: string
  rowClassName?: (row: TData) => string | undefined
}

function goToPage(pageNum: number, param = 'page') {
  const url = new URL(window.location.href)
  url.searchParams.set(param, String(pageNum))
  router.get(url.pathname + url.search, {}, { preserveState: true })
}

function PagyInfo({ pagy, noun = 'results' }: { pagy: PagyProps; noun?: string }) {
  if (pagy.count === 0) return <span className="text-sm text-muted-foreground">No {noun}</span>

  if (pagy.pages <= 1) {
    return (
      <span className="text-sm text-muted-foreground">
        {pagy.count} {pagy.count === 1 ? noun.replace(/s$/, '') : noun}
      </span>
    )
  }

  const start = (pagy.page - 1) * pagy.limit + 1
  const end = Math.min(pagy.page * pagy.limit, pagy.count)
  return (
    <span className="text-sm text-muted-foreground">
      Showing {start}–{end} of {pagy.count} {noun}
    </span>
  )
}

export function DataTable<TData, TValue>({ columns, data, pagy, noun, pageParam, rowClassName }: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting },
  })

  return (
    <div>
      <div className="overflow-hidden rounded-md border border-border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className={rowClassName?.(row.original)}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pagy && (
        <div className="flex items-center justify-between pt-4">
          <PagyInfo pagy={pagy} noun={noun} />
          {pagy.pages > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => goToPage(pagy.prev!, pageParam)} disabled={!pagy.prev}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                {pagy.page} / {pagy.pages}
              </span>
              <Button variant="outline" size="sm" onClick={() => goToPage(pagy.next!, pageParam)} disabled={!pagy.next}>
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
