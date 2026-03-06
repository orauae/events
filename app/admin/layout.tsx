"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useRole } from "@/hooks/use-auth"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminSidebar, AdminHeader } from "@/components/admin"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { isAdmin, isLoading } = useRole()

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      router.push("/events")
    }
  }, [isAdmin, isLoading, router])

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-ora-cream">
        {/* Header skeleton */}
        <div className="flex items-center h-14 border-b border-ora-sand bg-ora-white px-4 md:px-6 gap-3">
          {/* Hamburger placeholder — mobile */}
          <div className="md:hidden w-9 h-9" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-7 w-20 hidden sm:block" />
        </div>
        <div className="flex flex-1 min-h-0">
          {/* Sidebar skeleton — desktop only */}
          <aside className="hidden md:flex flex-col w-18 border-r border-ora-sand bg-ora-white shrink-0">
            <nav className="flex-1 py-3">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div key={i} className="flex items-center justify-center py-3">
                  <Skeleton className="h-5 w-5" />
                </div>
              ))}
            </nav>
          </aside>
          <main className="flex-1 min-w-0 overflow-auto">
            <div className="pt-1 px-4 pb-6 md:px-6 lg:px-8 lg:pb-8">
              <Skeleton className="h-8 w-48 mb-6" />
              <Skeleton className="h-64 w-full" />
            </div>
          </main>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  return (
    <div className="flex flex-col h-screen bg-ora-cream">
      <AdminHeader />
      <div className="flex flex-1 min-h-0">
        <AdminSidebar />
        <main className="flex-1 min-w-0 overflow-auto">
          <div className="pt-1 px-4 pb-6 md:px-6 lg:px-8 lg:pb-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
