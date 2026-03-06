"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface AdminBreadcrumbProps {
  items: BreadcrumbItem[]
  isLoading?: boolean
}

export function AdminBreadcrumb({ items, isLoading }: AdminBreadcrumbProps) {
  return (
    <nav className="flex items-center gap-0 text-xs" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1

        return (
          <div key={index} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="h-3 w-3 mx-1.5 text-ora-stone stroke-1 flex-shrink-0" />
            )}
            {isLoading && item.href ? (
              <Skeleton className="h-3.5 w-20" />
            ) : isLast ? (
              <span className="text-ora-charcoal font-medium">{item.label}</span>
            ) : item.href ? (
              <Link
                href={item.href}
                className="text-ora-graphite hover:text-ora-charcoal transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-ora-graphite">{item.label}</span>
            )}
          </div>
        )
      })}
    </nav>
  )
}
