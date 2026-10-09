import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import { cn } from "@web/lib/utils"

const buttonVariants = cva(
  // One physical feel for every button: it lifts on hover, presses in on click, and shows a keyboard ring.
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium tracking-[-0.005em] outline-none transition-[background-color,color,box-shadow,transform,border-color,filter] duration-200 ease-out focus-visible:ring-4 focus-visible:ring-primary/25 active:translate-y-px active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // A gradient with a lit top edge, and a sheen that sweeps across on hover.
        default:
          "overflow-hidden bg-gradient-to-b from-primary to-[hsl(var(--primary)/0.84)] text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_0_0_1px_hsl(var(--primary)/0.55),0_1px_2px_rgba(0,0,0,0.18),0_6px_14px_-6px_hsl(var(--primary)/0.55)] before:pointer-events-none before:absolute before:inset-y-0 before:-left-1/2 before:w-1/3 before:-skew-x-[20deg] before:bg-white/25 before:opacity-0 before:transition-[left,opacity] before:duration-700 hover:-translate-y-px hover:brightness-[1.06] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_0_0_1px_hsl(var(--primary)/0.55),0_2px_4px_rgba(0,0,0,0.16),0_12px_22px_-8px_hsl(var(--primary)/0.7)] hover:before:left-[130%] hover:before:opacity-100",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[inset_0_1px_0_hsl(var(--surface-hi)),0_0_0_1px_hsl(var(--border))] hover:bg-secondary/70 hover:shadow-[inset_0_1px_0_hsl(var(--surface-hi)),0_0_0_1px_hsl(var(--foreground)/0.14)]",
        outline:
          "border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.06)] hover:-translate-y-px hover:border-foreground/25 hover:bg-secondary/60 hover:shadow-[0_6px_14px_-8px_hsl(var(--foreground)/0.25)]",
        ghost: "hover:bg-secondary active:bg-secondary/70",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.18)] hover:-translate-y-px hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 [&_svg]:size-4",
        sm: "h-8 rounded-lg px-3 text-xs [&_svg]:size-3.5",
        lg: "h-11 px-6 text-[15px] [&_svg]:size-4",
        icon: "h-10 w-10 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size, className }))

    // Slot forwards onto exactly one child, so `children` must be passed
    // through untouched — wrapping it or appending a spinner alongside it
    // trips React.Children.only at runtime.
    if (asChild) {
      return (
        <Slot ref={ref} className={classes} {...props}>
          {children}
        </Slot>
      )
    }

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {children}
      </button>
    )
  },
)
Button.displayName = "Button"

export { buttonVariants }
