export function reviewStatusColor(status: string): string {
  if (status === 'approved')
    return 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800'
  if (status === 'returned')
    return 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800'
  if (status === 'rejected')
    return 'bg-red-50 text-red-600 border-red-300 dark:bg-red-950 dark:text-red-400 dark:border-red-800'
  return 'bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
}

export function ReviewStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded border font-medium ${reviewStatusColor(status)} ${className ?? ''}`}
    >
      {status}
    </span>
  )
}
