"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import {
  Calendar,
  Users,
  LogOut,
  Menu,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { signOut } from "@/lib/auth-client"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

// Manager-only navigation - admins use /admin
const navigation: NavItem[] = [
  { name: "Events", href: "/events", icon: Calendar },
  { name: "Guests", href: "/guests", icon: Users },
]

/* ------------------------------------------------------------------ */
/*  Mobile drawer                                                       */
/* ------------------------------------------------------------------ */
function MobileSidebarDrawer({
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
    await signOut()
    router.push("/login")
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        width="272px"
        className="p-0 flex flex-col bg-ora-white"
      >
        {/* Logo */}
        <div className="flex items-center h-16 border-b border-ora-sand px-6">
          <Link
            href="/events"
            className="flex items-center gap-2"
            onClick={() => onOpenChange(false)}
          >
            <div className="h-8 w-8 bg-ora-gold" />
            <SheetTitle className="text-xl font-semibold text-ora-charcoal">
              EventOS
            </SheetTitle>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => onOpenChange(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors rounded-full",
                  isActive
                    ? "bg-ora-cream text-ora-charcoal"
                    : "text-ora-graphite hover:bg-ora-cream hover:text-ora-charcoal"
                )}
              >
                <item.icon className="h-5 w-5 stroke-1" />
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-ora-sand p-4">
          <div className="mb-2 px-3 py-1 text-xs text-ora-stone">
            <span>Event Manager</span>
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 px-3 py-2 text-sm font-medium text-ora-graphite transition-colors hover:bg-ora-cream hover:text-ora-charcoal rounded-full"
          >
            <LogOut className="h-5 w-5 stroke-1" />
            Sign out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Sidebar (responsive)                                                */
/* ------------------------------------------------------------------ */
export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    router.push("/login")
  }

  return (
    <>
      {/* Mobile top bar — visible < md */}
      <div className="md:hidden flex items-center h-14 border-b border-ora-sand bg-ora-white px-4 gap-3 shrink-0">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex items-center justify-center w-9 h-9 -ml-1 rounded-lg hover:bg-ora-cream transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5 stroke-[1.5] text-ora-charcoal" />
        </button>
        <Link href="/events" className="flex items-center gap-2">
          <div className="h-7 w-7 bg-ora-gold" />
          <span className="text-lg font-semibold text-ora-charcoal">
            EventOS
          </span>
        </Link>
      </div>

      {/* Mobile drawer */}
      <MobileSidebarDrawer open={mobileOpen} onOpenChange={setMobileOpen} />

      {/* Desktop sidebar — hidden < md */}
      <aside className="hidden md:flex h-screen w-64 flex-col border-r border-ora-sand bg-ora-white shrink-0">
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-ora-sand px-6">
          <Link href="/events" className="flex items-center gap-2">
            <div className="h-8 w-8 bg-ora-gold" />
            <span className="text-xl font-semibold text-ora-charcoal">
              EventOS
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors rounded-full",
                  isActive
                    ? "bg-ora-cream text-ora-charcoal"
                    : "text-ora-graphite hover:bg-ora-cream hover:text-ora-charcoal"
                )}
              >
                <item.icon className="h-5 w-5 stroke-1" />
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-ora-sand p-4">
          <div className="mb-2 px-3 py-1 text-xs text-ora-stone">
            <span>Event Manager</span>
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 px-3 py-2 text-sm font-medium text-ora-graphite transition-colors hover:bg-ora-cream hover:text-ora-charcoal rounded-full"
          >
            <LogOut className="h-5 w-5 stroke-1" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
