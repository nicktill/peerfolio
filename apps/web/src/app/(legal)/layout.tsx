import Image from "next/image"
import Link from "next/link"
import { SiteFooter } from "@web/components/site-footer"

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="" width={26} height={26} className="rounded-md" />
            <span className="text-[15px] font-semibold tracking-tight">Peerfolio</span>
          </Link>
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 text-[15px] leading-7 text-foreground/90 sm:py-14
          [&_a]:underline [&_a]:underline-offset-2
          [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-foreground
          [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground
          [&_li]:mt-1.5 [&_p]:mt-4 [&_strong]:font-semibold [&_strong]:text-foreground
          [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5"
      >
        {children}
      </main>

      <SiteFooter />
    </div>
  )
}
