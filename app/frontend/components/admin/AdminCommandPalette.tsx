import { useState, useEffect, useCallback, useRef } from 'react'
import { Command } from 'cmdk'
import { router, usePage } from '@inertiajs/react'
import type { SharedProps } from '@/types'
import {
  LayoutDashboard,
  Clock,
  ClipboardCheck,
  Compass,
  Hammer,
  FolderOpen,
  Users,
  Flag,
  Store,
  ShoppingCart,
  Fish,
  Soup,
  ReceiptText,
  SlidersHorizontal,
  BriefcaseBusiness,
  Activity,
  type LucideIcon,
} from 'lucide-react'

interface AdminPermissions {
  is_admin: boolean
  is_hcb: boolean
  can_review_time_audits: boolean
  can_review_requirements_checks: boolean
  can_review_design_reviews: boolean
  can_review_build_reviews: boolean
  performance_enabled: boolean
}

type NavEntry = {
  label: string
  href: string
  icon: LucideIcon
  external?: boolean
  requirePermission?: keyof AdminPermissions
  group: string
}

const ALL_NAV: NavEntry[] = [
  { group: 'Navigation', label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  {
    group: 'Reviews',
    label: 'Time Audit',
    href: '/admin/reviews/time_audits',
    icon: Clock,
    requirePermission: 'can_review_time_audits',
  },
  {
    group: 'Reviews',
    label: 'Requirements Check',
    href: '/admin/reviews/requirements_checks',
    icon: ClipboardCheck,
    requirePermission: 'can_review_requirements_checks',
  },
  {
    group: 'Reviews',
    label: 'Design Review',
    href: '/admin/reviews/design_reviews',
    icon: Compass,
    requirePermission: 'can_review_design_reviews',
  },
  {
    group: 'Reviews',
    label: 'Build Review',
    href: '/admin/reviews/build_reviews',
    icon: Hammer,
    requirePermission: 'can_review_build_reviews',
  },
  { group: 'Data', label: 'Projects', href: '/admin/projects', icon: FolderOpen },
  { group: 'Data', label: 'Users', href: '/admin/users', icon: Users },
  { group: 'Data', label: 'Flagged Projects', href: '/admin/project_flags', icon: Flag, requirePermission: 'is_admin' },
  { group: 'Shop', label: 'Shop Items', href: '/admin/shop_items', icon: Store, requirePermission: 'is_admin' },
  {
    group: 'Shop',
    label: 'Shop Orders',
    href: '/admin/shop_orders',
    icon: ShoppingCart,
    requirePermission: 'is_admin',
  },
  {
    group: 'Finance',
    label: 'Koi Transactions',
    href: '/admin/koi_transactions',
    icon: Fish,
    requirePermission: 'is_admin',
  },
  {
    group: 'Finance',
    label: 'Soup Campaigns',
    href: '/admin/soup_campaigns',
    icon: Soup,
    requirePermission: 'is_admin',
  },
  {
    group: 'Finance',
    label: 'Project Grants',
    href: '/admin/project_grants/orders',
    icon: ReceiptText,
    requirePermission: 'is_admin',
  },
  {
    group: 'System',
    label: 'Jobs',
    href: '/jobs',
    icon: BriefcaseBusiness,
    external: true,
    requirePermission: 'is_admin',
  },
  {
    group: 'System',
    label: 'Flipper',
    href: '/flipper',
    icon: SlidersHorizontal,
    external: true,
    requirePermission: 'is_admin',
  },
  {
    group: 'System',
    label: 'Performance',
    href: '/admin/performance',
    icon: Activity,
    external: true,
    requirePermission: 'performance_enabled',
  },
]

export default function AdminCommandPalette() {
  const { admin_permissions, auth } = usePage<SharedProps & { admin_permissions?: AdminPermissions }>().props
  const perms: AdminPermissions = admin_permissions ?? {
    is_admin: auth.user?.is_admin ?? false,
    is_hcb: false,
    can_review_time_audits: false,
    can_review_requirements_checks: false,
    can_review_design_reviews: false,
    can_review_build_reviews: false,
    performance_enabled: false,
  }

  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const navigate = useCallback((entry: NavEntry) => {
    setOpen(false)
    if (entry.external) {
      window.location.href = entry.href
    } else {
      router.visit(entry.href)
    }
  }, [])

  const visible = ALL_NAV.filter((e) => !e.requirePermission || perms[e.requirePermission])

  // Group visible items
  const groups = visible.reduce<Record<string, NavEntry[]>>((acc, item) => {
    ;(acc[item.group] ??= []).push(item)
    return acc
  }, {})

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      <div
        className="relative w-full max-w-md rounded-xl border border-border bg-background shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command loop>
          <div className="flex items-center border-b border-border px-3">
            <svg
              className="size-4 shrink-0 text-muted-foreground mr-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <Command.Input
              ref={inputRef}
              placeholder="Go to..."
              className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 font-mono">
              esc
            </kbd>
          </div>

          <Command.List className="max-h-72 overflow-y-auto p-1.5">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">No results found.</Command.Empty>

            {Object.entries(groups).map(([group, items]) => (
              <Command.Group
                key={group}
                heading={group}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {items.map((item) => {
                  const Icon = item.icon
                  return (
                    <Command.Item
                      key={item.href}
                      value={item.label}
                      onSelect={() => navigate(item)}
                      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm cursor-pointer text-foreground aria-selected:bg-accent aria-selected:text-accent-foreground"
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      {item.label}
                    </Command.Item>
                  )
                })}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
