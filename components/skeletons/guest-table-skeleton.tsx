import { Skeleton } from "@/components/ui/skeleton"

export function GuestTableRowSkeleton() {
  return (
    <tr className="border-b border-ora-sand">
      {/* Checkbox */}
      <td className="p-4">
        <Skeleton className="h-4 w-4" />
      </td>
      {/* Name */}
      <td className="p-4">
        <Skeleton className="h-4 w-32" />
      </td>
      {/* Email */}
      <td className="p-4">
        <Skeleton className="h-4 w-40" />
      </td>
      {/* Company */}
      <td className="p-4">
        <Skeleton className="h-4 w-28" />
      </td>
      {/* Status */}
      <td className="p-4">
        <Skeleton className="h-6 w-20 rounded-full" />
      </td>
      {/* Actions */}
      <td className="p-4">
        <Skeleton className="h-8 w-8 rounded" />
      </td>
    </tr>
  )
}

export function GuestTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-lg border border-ora-sand bg-ora-white overflow-hidden">
      {/* Table header */}
      <div className="border-b border-ora-sand bg-ora-cream p-4">
        <div className="flex gap-4">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
      {/* Table body */}
      <table className="w-full">
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <GuestTableRowSkeleton key={i} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
