import { useTheme } from "@/theme"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// Opt News toasts: card surface, semantic icon color, the action in the filled-action orange. Outcomes only;
// errors that need fixing stay inline next to the field (ProblemNote).
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolved } = useTheme()

  return (
    <Sonner
      theme={resolved}
      className="toaster group"
      closeButton
      duration={4500}
      gap={10}
      icons={{
        success: <CircleCheckIcon className="size-[18px] text-success" />,
        info: <InfoIcon className="size-[18px] text-brand-text" />,
        warning: <TriangleAlertIcon className="size-[18px] text-warning" />,
        error: <OctagonXIcon className="size-[18px] text-destructive" />,
        loading: <Loader2Icon className="size-[18px] animate-spin text-muted-foreground" />,
      }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--card-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "calc(var(--radius) + 2px)",
          "--width": "380px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "cn-toast font-sans !items-start gap-3 !p-4 shadow-[0_12px_32px_-12px_rgb(27_21_20/0.28)] dark:shadow-[0_12px_32px_-12px_rgb(0_0_0/0.6)]",
          icon: "!mt-0.5",
          title: "!text-sm !font-semibold !leading-snug",
          description: "!text-[0.8125rem] !leading-relaxed !text-muted-foreground",
          actionButton:
            "!h-8 !rounded-md !bg-primary !px-3 !text-[0.8125rem] !font-semibold !text-primary-foreground hover:!bg-[color-mix(in_oklab,var(--primary),black_12%)]",
          cancelButton: "!h-8 !rounded-md !bg-muted !px-3 !text-[0.8125rem] !text-foreground",
          closeButton:
            "!left-auto !right-0 !translate-x-1/3 !-translate-y-1/3 !border-border !bg-card !text-muted-foreground hover:!text-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
