import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: string
  children?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      {/* Gold accent line (decorative) */}
      <div className="h-1 w-12 bg-ora-gold mb-4 rounded-full" aria-hidden="true" />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ora-charcoal">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-ora-graphite">{description}</p>
          )}
        </div>
        {children && <div className="flex items-center gap-3">{children}</div>}
      </div>
    </div>
  )
}
