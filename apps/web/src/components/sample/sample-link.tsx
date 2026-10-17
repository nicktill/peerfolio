import "@web/components/sample/sample.css"
import Link from "next/link"
import { Eye } from "lucide-react"
import { Tip } from "@web/components/ui/tip"

/** The quiet second action under an empty state's main button: opens the same screen on made-up data. */
export function SampleLink({ href, children = "See it with sample data" }: { href: string; children?: React.ReactNode }) {
  return (
    <Tip text="Opens the real screen with made-up people and numbers. Nothing of yours is read, and you can leave in one click.">
      <Link href={href} className="sb-link">
        <Eye aria-hidden /> {children}
      </Link>
    </Tip>
  )
}
