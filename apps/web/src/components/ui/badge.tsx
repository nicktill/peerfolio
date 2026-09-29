import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@web/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground",
        outline: "border text-muted-foreground",
        verified: "tint-gain text-gain-ink",
        warning: "bg-[--series-4]/15 text-[--series-4]",
        danger: "tint-loss text-loss-ink",
        brand: "bg-accent text-accent-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
