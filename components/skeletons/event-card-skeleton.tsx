import { Skeleton } from "@/components/ui/skeleton"

export function EventCardSkeleton() {
  return (
    <div className="rounded-lg border border-ora-sand bg-ora-white p-6">
      {/* Gold accent line */}
      <Skeleton className="h-0.5 w-12 mb-4" />
      {/* Event name */}
      <Skeleton className="h-6 w-3/4 mb-2" />
      {/* Event date/location */}
      <Skeleton className="h-4 w-1/2 mb-4" />
      {/* Status badges */}
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
    </div>
  )
}

export function EventListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </div>
  )
}
