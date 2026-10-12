import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import { cn } from "@web/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:translate-y-px motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] hover:opacity-90 active:translate-y-0 active:scale-[0.98] motion-reduce:active:scale-100",
        secondary: "border-input text-foreground hover:bg-secondary",
        outline: "border-input text-foreground hover:bg-secondary",
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
        destructive: "border-destructive/40 text-destructive hover:bg-destructive/10",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3 [&_svg]:size-4 max-[860px]:min-h-[40px]",
        sm: "h-7 px-3 text-[13px] [&_svg]:size-3.5 max-[860px]:min-h-[40px]",
        lg: "h-9 px-4 [&_svg]:size-4 max-[860px]:min-h-[44px]",
        icon: "h-8 w-8 [&_svg]:size-4 max-[860px]:min-h-[40px] max-[860px]:min-w-[40px]",
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
