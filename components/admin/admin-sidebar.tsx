"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useState, useCallback } from "react"
import {
  LayoutDashboard,
  Calendar,
  Users,
  UserCog,
  Mail,
  FileText,
  Server,
  LogOut,
  Shield,
  Menu,
  X,
} from "lucide-react"
import { useRole } from "@/hooks/use-auth"
import { Skeleton } from "@/components/ui/skeleton"
import { authClient } from "@/lib/auth-client"
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const adminNavigation: NavItem[] = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Events", href: "/admin/events", icon: Calendar },
  { name: "Guests", href: "/admin/guests", icon: Users },
  { name: "Managers", href: "/admin/managers", icon: UserCog },
  { name: "Campaigns", href: "/admin/campaigns", icon: Mail },
  { name: "Templates", href: "/admin/templates", icon: FileText },
  { name: "SMTP", href: "/admin/settings/smtp", icon: Server },
]

const COLLAPSED_W = 72
const EXPANDED_W = 240
const HEADER_H = 56

/* ------------------------------------------------------------------ */
/*  Mobile nav drawer (Sheet)                                          */
/* ------------------------------------------------------------------ */
function MobileNavDrawer({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const pathname = usePathname()
  const router = useRouter()

  const handleSignOut = async () => {
    onOpenChange(false)
    await authClient.signOut()
    router.push("/login")
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        width="280px"
        className="p-0 flex flex-col bg-[#FAFAFA]"
      >
        {/* Drawer header */}
        <div className="flex items-center gap-2.5 h-14 px-5 border-b border-ora-sand">
          <Image
            src="/ora-logo-greyer.png"
            alt="ORA"
            width={30}
            height={30}
            className="object-contain"
          />
          <SheetTitle className="text-base font-light tracking-wide text-ora-charcoal">
            Events
          </SheetTitle>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-3 overflow-y-auto">
          <div className="flex flex-col gap-0.5">
            {adminNavigation.map((item) => {
              const isActive =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href)

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    "flex items-center gap-3 h-12 px-5 text-sm transition-colors",
                    isActive
                      ? "bg-[#F5F3F0] text-ora-charcoal font-medium border-r-[3px] border-ora-gold"
                      : "text-ora-graphite hover:bg-[#F5F3F0]/50 border-r-[3px] border-transparent"
                  )}
                >
                  <item.icon
                    className={cn(
                      "w-5 h-5 stroke-1 shrink-0",
                      isActive ? "text-ora-gold" : "text-ora-slate"
                    )}
                  />
                  <span>{item.name}</span>
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Bottom section */}
        <div className="border-t border-ora-sand p-4">
          <div className="flex items-center gap-1.5 px-3 mb-3">
            <Shield className="w-3.5 h-3.5 text-ora-gold stroke-1" />
            <span className="text-[11px] uppercase tracking-[0.15em] text-ora-gold">
              Administrator
            </span>
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-ora-graphite hover:bg-[#F5F3F0] rounded-full transition-colors"
          >
            <LogOut className="w-4 h-4 stroke-1" />
            Sign out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Header                                                              */
/* ------------------------------------------------------------------ */
export function AdminHeader() {
  const router = useRouter()
  const { isLoading } = useRole()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const handleSignOut = async () => {
    await authClient.signOut()
    router.push("/login")
  }

  return (
    <>
      <header
        className={cn(
          "flex items-center h-14 border-b border-ora-sand bg-[#FAFAFA]",
          "px-4 gap-3",
          "md:px-6 md:gap-3.5",
          "relative z-50"
        )}
      >
        {/* Hamburger — mobile only */}
        <button
          onClick={() => setMobileNavOpen(true)}
          className="md:hidden flex items-center justify-center w-9 h-9 -ml-1 rounded-lg hover:bg-[#F5F3F0] transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5 stroke-[1.5] text-ora-charcoal" />
        </button>

        {/* Logo */}
        <Link
          href="/admin"
          className="flex items-center gap-2.5 no-underline"
        >
          <Image
            src="/ora-logo-greyer.png"
            alt="ORA"
            width={34}
            height={34}
            className="object-contain"
          />
          <span className="text-lg font-light tracking-wide text-ora-charcoal leading-none hidden sm:inline">
            Events
          </span>
        </Link>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3 md:gap-4">
          {isLoading ? (
            <Skeleton className="h-5 w-28" />
          ) : (
            <>
              {/* Admin badge — hidden on very small screens */}
              <div className="hidden sm:flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-ora-gold stroke-1" />
                <span className="text-[11px] uppercase tracking-[0.15em] text-ora-gold">
                  Administrator
                </span>
              </div>

              {/* Sign out — icon-only on mobile, full on md+ */}
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 py-1.5 px-2.5 md:px-3 rounded-full hover:bg-[#F5F3F0] transition-colors border-none bg-transparent cursor-pointer"
              >
                <LogOut className="w-4 h-4 stroke-1 text-ora-graphite" />
                <span className="hidden md:inline text-[13px] text-ora-graphite">
                  Sign out
                </span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Mobile drawer */}
      <MobileNavDrawer open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Desktop sidebar (hidden on mobile)                                  */
/* ------------------------------------------------------------------ */
export function AdminSidebar() {
  const pathname = usePathname()
  const { isLoading } = useRole()
  const [expanded, setExpanded] = useState(false)

  const width = expanded ? EXPANDED_W : COLLAPSED_W

  return (
    <>
      {/* Collapsed rail spacer — hidden on mobile */}
      <div
        className="hidden md:block shrink-0"
        style={{ width: `${COLLAPSED_W}px` }}
      />

      {/* Actual sidebar — hidden on mobile, fixed overlay on desktop */}
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className="hidden md:flex flex-col fixed top-14 left-0 bottom-0 border-r border-ora-sand bg-[#FAFAFA] z-40 overflow-hidden transition-[width] duration-200 ease-in-out"
        style={{ width: `${width}px` }}
      >
        {/* Navigation */}
        <nav className="flex-1 py-3">
          {isLoading ? (
            <div className="flex flex-col gap-1">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-6 h-11"
                >
                  <Skeleton className="h-5 w-5 shrink-0" />
                  {expanded && <Skeleton className="h-4 w-20" />}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {adminNavigation.map((item) => {
                const isActive =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href)

                return (
                  <DesktopSidebarItem
                    key={item.name}
                    item={item}
                    isActive={isActive}
                    expanded={expanded}
                  />
                )
              })}
            </div>
          )}
        </nav>
      </aside>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Desktop sidebar item                                                */
/* ------------------------------------------------------------------ */
function DesktopSidebarItem({
  item,
  isActive,
  expanded,
}: {
  item: NavItem
  isActive: boolean
  expanded: boolean
}) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 h-11 px-6 no-underline transition-colors border-r-[3px]",
        isActive
          ? "bg-[#F5F3F0] border-ora-gold"
          : "border-transparent hover:bg-[#F5F3F0]/50"
      )}
    >
      <item.icon
        className={cn(
          "w-5 h-5 stroke-1 shrink-0 transition-colors",
          isActive ? "text-ora-gold" : "text-ora-slate"
        )}
      />
      {expanded && (
        <span
          className={cn(
            "text-sm whitespace-nowrap tracking-[0.01em]",
            isActive ? "font-medium text-ora-charcoal" : "text-ora-graphite"
          )}
        >
          {item.name}
        </span>
      )}
    </Link>
  )
}

export default AdminSidebar
