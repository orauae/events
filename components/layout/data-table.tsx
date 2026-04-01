"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface Column<T> {
  key: string
  header: React.ReactNode
  cell: (item: T) => React.ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (item: T) => string
  emptyMessage?: string
  className?: string
  onRowClick?: (item: T) => void
  /** Accessible label describing the table contents */
  ariaLabel?: string
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = "No data available",
  className,
  onRowClick,
  ariaLabel,
}: DataTableProps<T>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-ora-sand bg-ora-white overflow-hidden",
        className
      )}
      role="region"
      aria-label={ariaLabel || "Data table"}
    >
      <table className="w-full" role="table">
        <thead>
          <tr className="border-b border-ora-sand bg-ora-cream">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "px-4 py-3 text-left text-sm font-medium text-ora-charcoal",
                  column.className
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-sm text-ora-graphite"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item) => (
              <tr
                key={keyExtractor(item)}
                className={cn(
                  "border-b border-ora-sand last:border-b-0 transition-colors",
                  onRowClick && "cursor-pointer hover:bg-ora-cream focus-visible:bg-ora-cream focus-visible:outline-2 focus-visible:outline-ora-gold"
                )}
                onClick={() => onRowClick?.(item)}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(item); } } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "button" : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-4 py-3 text-sm text-ora-charcoal",
                      column.className
                    )}
                  >
                    {column.cell(item)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
