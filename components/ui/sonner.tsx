"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      expand={false}
      richColors={false}
      closeButton
      duration={4500}
      icons={{
        success: <CircleCheckIcon className="size-4 text-[hsl(var(--accent-positive))]" />,
        info:    <InfoIcon className="size-4 text-primary" />,
        warning: <TriangleAlertIcon className="size-4 text-[hsl(var(--accent-warning))]" />,
        error:   <OctagonXIcon className="size-4 text-[hsl(var(--accent-danger))]" />,
        loading: <Loader2Icon className="size-4 animate-spin text-[hsl(var(--text-muted))]" />,
      }}
      style={
        {
          "--normal-bg": "hsl(var(--card))",
          "--normal-text": "hsl(var(--foreground))",
          "--normal-border": "hsl(var(--border))",
          "--border-radius": "8px",
          "--font-family": "var(--font-sans)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:shadow-[0_4px_12px_-2px_rgba(15,30,63,0.08),0_0_0_1px_rgba(15,30,63,0.04)]",
          title: "text-[13px] font-medium leading-snug",
          description: "text-[12px] text-[hsl(var(--text-muted))] leading-relaxed mt-0.5",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-md group-[.toast]:text-[12px] group-[.toast]:font-medium group-[.toast]:px-2.5 group-[.toast]:py-1 group-[.toast]:h-auto",
          cancelButton: "group-[.toast]:bg-transparent group-[.toast]:text-[hsl(var(--text-muted))] group-[.toast]:rounded-md group-[.toast]:text-[12px] group-[.toast]:px-2 group-[.toast]:py-1 group-[.toast]:h-auto hover:group-[.toast]:bg-[hsl(var(--surface-muted))]",
          closeButton: "group-[.toast]:bg-card group-[.toast]:border group-[.toast]:border-border group-[.toast]:text-[hsl(var(--text-muted))]",
          icon: "shrink-0",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
