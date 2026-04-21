import { useState } from 'react'
import { Link, usePage } from '@inertiajs/react'
import type { SharedProps } from '@/types'
import { useAdminDark } from '@/hooks/useAdminDark'
import {
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ArrowLeftStartOnRectangleIcon,
  SunIcon,
  MoonIcon,
} from '@heroicons/react/16/solid'
import {
  LayoutDashboard,
  Clock,
  ClipboardCheck,
  Compass,
  Hammer,
  FolderOpen,
  Users,
  SlidersHorizontal,
  BriefcaseBusiness,
  Flag,
  Store,
  ShoppingCart,
  Fish,
  Soup,
} from 'lucide-react'

interface AdminStats {
  users_count: number
  projects_count: number
  pending_reviews_count: number
  pending_time_audits_count: number
  pending_requirements_checks_count: number
  pending_design_reviews_count: number
  pending_build_reviews_count: number
  flagged_projects_count: number
}

interface AdminPermissions {
  is_admin: boolean
  can_review_time_audits: boolean
  can_review_requirements_checks: boolean
  can_review_design_reviews: boolean
  can_review_build_reviews: boolean
}

type PermissionKey = keyof AdminPermissions

type NavItem = {
  label: string
  href: string
  icon: typeof LayoutDashboard
  statKey: keyof AdminStats | null
  external?: boolean
  requirePermission?: PermissionKey
}

function buildNavSections(): { items: NavItem[] }[] {
  return [
    {
      items: [{ label: 'Dashboard', href: '/admin', icon: LayoutDashboard, statKey: null }],
    },
    {
      items: [
        {
          label: 'Time Audit',
          href: '/admin/reviews/time_audits',
          icon: Clock,
          statKey: 'pending_time_audits_count',
          requirePermission: 'can_review_time_audits',
        },
        {
          label: 'Requirements Check',
          href: '/admin/reviews/requirements_checks',
          icon: ClipboardCheck,
          statKey: 'pending_requirements_checks_count',
          requirePermission: 'can_review_requirements_checks',
        },
        {
          label: 'Design Review',
          href: '/admin/reviews/design_reviews',
          icon: Compass,
          statKey: 'pending_design_reviews_count',
          requirePermission: 'can_review_design_reviews',
        },
        {
          label: 'Build Review',
          href: '/admin/reviews/build_reviews',
          icon: Hammer,
          statKey: 'pending_build_reviews_count',
          requirePermission: 'can_review_build_reviews',
        },
      ],
    },
    {
      items: [
        {
          label: 'Projects',
          href: '/admin/projects',
          icon: FolderOpen,
          statKey: 'projects_count',
        },
        { label: 'Users', href: '/admin/users', icon: Users, statKey: 'users_count' },
        {
          label: 'Flagged',
          href: '/admin/project_flags',
          icon: Flag,
          statKey: 'flagged_projects_count',
          requirePermission: 'is_admin',
        },
      ],
    },
    {
      items: [
        { label: 'Shop Items', href: '/admin/shop_items', icon: Store, statKey: null, requirePermission: 'is_admin' },
        {
          label: 'Shop Orders',
          href: '/admin/shop_orders',
          icon: ShoppingCart,
          statKey: null,
          requirePermission: 'is_admin',
        },
        {
          label: 'Koi Transactions',
          href: '/admin/koi_transactions',
          icon: Fish,
          statKey: null,
          requirePermission: 'is_admin',
        },
        {
          label: 'Soup Campaigns',
          href: '/admin/soup_campaigns',
          icon: Soup,
          statKey: null,
          requirePermission: 'is_admin',
        },
      ],
    },
    {
      items: [
        {
          label: 'Jobs',
          href: '/jobs',
          icon: BriefcaseBusiness,
          external: true,
          statKey: null,
          requirePermission: 'is_admin',
        },
        {
          label: 'Flipper',
          href: '/flipper',
          icon: SlidersHorizontal,
          external: true,
          statKey: null,
          requirePermission: 'is_admin',
        },
      ],
    },
  ]
}

function renderNavItem(item: NavItem, pathname: string, collapsed: boolean, admin_stats?: AdminStats) {
  const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
  const Icon = item.icon
  const Component = item.external ? 'a' : Link
  const linkProps = item.external ? { href: item.href, target: '_self' as const } : { href: item.href }
  const stat = item.statKey && admin_stats ? admin_stats[item.statKey] : null

  return (
    <Component
      key={item.href}
      {...linkProps}
      title={item.label}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 h-8 text-sm whitespace-nowrap transition-colors ${
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
      }`}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1">{item.label}</span>
          {stat != null && (
            <span className="text-[10px] leading-none font-medium rounded-full px-1.5 py-0.5 bg-muted text-muted-foreground">
              {stat}
            </span>
          )}
        </>
      )}
    </Component>
  )
}

export default function AdminSidebar() {
  const { auth, admin_stats, admin_permissions } = usePage<
    SharedProps & { admin_stats?: AdminStats; admin_permissions?: AdminPermissions }
  >().props
  const perms: AdminPermissions = admin_permissions ?? {
    is_admin: auth.user?.is_admin ?? false,
    can_review_time_audits: false,
    can_review_requirements_checks: false,
    can_review_design_reviews: false,
    can_review_build_reviews: false,
  }
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('admin-sidebar-collapsed') === '1'
    } catch {
      return false
    }
  })
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('admin-sidebar-collapsed', next ? '1' : '0')
      } catch {}
      return next
    })
  }
  const [dark, toggleDark] = useAdminDark()

  const textClass = `transition-opacity duration-200 ${collapsed ? 'opacity-0' : 'opacity-100'}`
  const iconBtn =
    'p-1 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-accent-foreground transition-colors cursor-pointer shrink-0'

  return (
    <aside
      className={`shrink-0 overflow-hidden border-r border-border bg-sidebar text-sidebar-foreground flex flex-col transition-[width] duration-200 ease-in-out sticky top-0 h-screen ${collapsed ? 'w-12' : 'w-56'}`}
    >
      {/* Header sits outside the fixed-width wrapper so the collapse button
          tracks the aside's actual width and stays visible when collapsed. */}
      <div className="flex items-center px-2.5 py-3 border-b border-sidebar-border">
        <Link
          href="/admin"
          className={`text-sm font-semibold tracking-tight whitespace-nowrap flex-1 min-w-0 truncate ${textClass}`}
        >
          Fallout Admin
        </Link>
        <button onClick={toggleCollapsed} className={iconBtn} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronDoubleRightIcon className="size-4" /> : <ChevronDoubleLeftIcon className="size-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-hidden py-2 px-1.5">
        {buildNavSections().map((section, i) => {
          const visibleItems = section.items.filter((item) => !item.requirePermission || perms[item.requirePermission])
          if (visibleItems.length === 0) return null
          return (
            <div key={i}>
              {i > 0 && <div className="my-2 mx-2 border-t border-sidebar-border" />}
              <div className="space-y-0.5">
                {visibleItems.map((item) => renderNavItem(item, pathname, collapsed, admin_stats))}
              </div>
            </div>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border overflow-hidden px-1.5 py-2">
        <div className="flex items-center gap-2 px-1 whitespace-nowrap">
          {auth.user && (
            <>
              <img src={auth.user.avatar} alt={auth.user.display_name} className="size-6 rounded-full shrink-0" />
              <span className={`text-xs text-muted-foreground truncate flex-1 ${textClass}`}>
                {auth.user.display_name}
              </span>
            </>
          )}
          {!auth.user && <div className="flex-1" />}
          <Link href="/path" title="Leave Admin" className={iconBtn}>
            <ArrowLeftStartOnRectangleIcon className="size-4" />
          </Link>
          <button
            onClick={toggleDark}
            className={iconBtn}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
          </button>
        </div>
      </div>
    </aside>
  )
}
