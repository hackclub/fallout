import { type ReactNode, useEffect, useState } from 'react'
import { Link, usePage } from '@inertiajs/react'
import Frame from '@/components/shared/Frame'
import FlashMessages from '@/components/FlashMessages'
import DocProgressBar from '@/components/docs/DocProgressBar'
import { DocSearchModal, DocSearchTrigger } from '@/components/docs/DocSearch'

interface MenuLink {
  type: 'link'
  title: string
  path: string
}

interface MenuSection {
  type: 'section'
  title: string
  items: { title: string; path: string }[]
  default_open?: boolean
}

type MenuItem = MenuLink | MenuSection

interface SearchEntry {
  title: string
  path: string
  excerpt: string
}

function NavLink({
  href,
  active,
  children,
  subpage = false,
  onClick,
}: {
  href: string
  active: boolean
  children: ReactNode
  subpage?: boolean
  onClick?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`block px-3 py-1.5 ${subpage ? 'rounded-r' : 'rounded'} ${active ? 'bg-brown text-light-brown font-semibold' : ''}`}
    >
      {children}
    </Link>
  )
}

function CollapsibleSection({
  title,
  items,
  currentPath,
  defaultOpen = true,
  onNavigate,
}: {
  title: string
  items: { title: string; path: string }[]
  currentPath: string
  defaultOpen?: boolean
  onNavigate?: () => void
}) {
  const storageKey = `docs-nav-${title}`
  const hasActiveChild = items.some((item) => currentPath === item.path)
  const [open, setOpen] = useState(() => {
    if (hasActiveChild) return true
    const stored = localStorage.getItem(storageKey)
    return stored !== null ? stored === 'true' : defaultOpen
  })

  useEffect(() => {
    if (hasActiveChild) setOpen(true)
  }, [currentPath])

  function toggle() {
    const next = !open
    setOpen(next)
    localStorage.setItem(storageKey, String(next))
  }

  return (
    <div>
      <button
        onClick={toggle}
        className="flex items-center justify-between w-full px-3 py-1.5 font-bold text-left cursor-pointer"
      >
        {title}
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>&#8250;</span>
      </button>
      {open && (
        <div className="ml-3 border-l-2 border-dark-brown/20 flex flex-col gap-0.5 mt-0.5">
          {items.map((item) => (
            <NavLink key={item.path} href={item.path} active={currentPath === item.path} subpage onClick={onNavigate}>
              {item.title}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

function Sidebar({
  menuItems,
  indexTitle,
  currentPath,
  onOpenSearch,
  onNavigate,
}: {
  menuItems: MenuItem[]
  indexTitle: string
  currentPath: string
  onOpenSearch: () => void
  onNavigate?: () => void
}) {
  return (
    <nav className="flex flex-col gap-0.5 p-2 overflow-y-auto h-full">
      <Link href="/path" className="block px-3 py-1.5">
        ← Back to the Path
      </Link>
      <hr className="my-1 border-dark-brown/20" />
      <DocSearchTrigger onOpen={onOpenSearch} />
      <hr className="my-1 border-dark-brown/20" />
      <NavLink href="/docs" active={currentPath === '/docs'} onClick={onNavigate}>
        {indexTitle}
      </NavLink>
      {menuItems.map((item, i) =>
        item.type === 'section' ? (
          <CollapsibleSection
            key={i}
            title={item.title}
            items={item.items}
            currentPath={currentPath}
            defaultOpen={item.default_open !== false}
            onNavigate={onNavigate}
          />
        ) : (
          <NavLink key={item.path} href={item.path} active={currentPath === item.path} onClick={onNavigate}>
            {item.title}
          </NavLink>
        ),
      )}
    </nav>
  )
}

export default function MarkdownLayout({ children }: { children: ReactNode }) {
  const { menu_items, index_title, search_index } = usePage<{
    menu_items: MenuItem[]
    index_title: string
    search_index: SearchEntry[]
  }>().props
  const currentPath = usePage().url.split('?')[0]
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [currentPath])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="docs-page relative min-h-screen">
      <DocProgressBar />
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-30 lg:hidden bg-light-brown border border-dark-brown/20 rounded-lg p-2 shadow-md"
        aria-label="Open navigation"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Mobile slide-out sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-screen w-80 p-4 transition-transform duration-200 lg:hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Frame className="flex-1 h-full">
          <Sidebar
            menuItems={menu_items}
            indexTitle={index_title}
            currentPath={currentPath}
            onOpenSearch={() => setSearchOpen(true)}
            onNavigate={() => setMobileOpen(false)}
          />
        </Frame>
      </aside>

      {/* Desktop sidebar */}
      <aside className="fixed top-0 left-0 z-10 hidden lg:flex h-screen p-4 w-90">
        <Frame className="flex-1">
          <Sidebar
            menuItems={menu_items}
            indexTitle={index_title}
            currentPath={currentPath}
            onOpenSearch={() => setSearchOpen(true)}
          />
        </Frame>
      </aside>

      <div className="lg:ml-90">
        <FlashMessages />
        <main className="max-w-3xl px-4 py-8 pt-16 lg:pt-8 lg:ml-20">{children}</main>
      </div>

      {/* Single search modal instance — prevents duplicate ⌘K listeners */}
      {searchOpen && <DocSearchModal index={search_index} onClose={() => setSearchOpen(false)} />}
    </div>
  )
}
