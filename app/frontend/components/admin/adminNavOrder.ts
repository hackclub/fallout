// Flat ordered list of all admin nav hrefs — used to compute slide direction
// on page transitions. Order matches the visual top-to-bottom sidebar order.
export const ADMIN_NAV_ORDER: string[] = [
  '/admin',
  '/admin/dashboard/requirements_design',
  '/admin/reviews/time_audits',
  '/admin/reviews/requirements_checks',
  '/admin/reviews/design_reviews',
  '/admin/reviews/build_reviews',
  '/admin/reviews/mine',
  '/admin/projects',
  '/admin/users',
  '/admin/hours_stats',
  '/admin/project_flags',
  '/admin/bulletin_events',
  '/admin/featured_projects',
  '/admin/shop_items',
  '/admin/shop_orders',
  '/admin/ticket_claims',
  '/admin/koi_transactions',
  '/admin/soup_campaigns',
  '/admin/project_grants/orders',
  '/jobs',
  '/flipper',
  '/admin/performance',
]

export function navIndex(pathname: string): number {
  const exact = ADMIN_NAV_ORDER.indexOf(pathname)
  if (exact !== -1) return exact
  // Prefix match for nested pages (e.g. /admin/projects/123 → /admin/projects)
  for (let i = ADMIN_NAV_ORDER.length - 1; i >= 0; i--) {
    const href = ADMIN_NAV_ORDER[i]
    if (href !== '/admin' && pathname.startsWith(href)) return i
  }
  return -1
}
