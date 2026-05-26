import type { ReactNode } from 'react'
import AdminLayout from '@/layouts/AdminLayout'

export default function AdminDevDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dev</h1>
        <p className="text-sm text-muted-foreground mt-1">Unlisted scratchpad.</p>
      </div>
    </div>
  )
}

AdminDevDashboard.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
