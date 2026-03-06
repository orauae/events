"use client"

import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-ora-white group-[.toaster]:text-ora-charcoal group-[.toaster]:border-ora-sand group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-ora-graphite",
          actionButton:
            "group-[.toast]:bg-ora-gold group-[.toast]:text-white",
          cancelButton:
            "group-[.toast]:bg-ora-cream group-[.toast]:text-ora-charcoal",
          success: "group-[.toaster]:border-green-500",
          error: "group-[.toaster]:border-red-500",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
