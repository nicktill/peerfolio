import { redirect } from "next/navigation"
import { sportsMode } from "@web/lib/sports/flag"
import { sportsAccessForRequest } from "@web/lib/sports/access"

/** Sports league pages are invisible to anyone the flag does not allow (admin-only mode): back to Fantasy. */
export default async function SportsLayout({ children }: { children: React.ReactNode }) {
  // Only admin mode gates the pages; "1" and off behave exactly as before (and keep the pages static).
  if (sportsMode() === "admin" && !(await sportsAccessForRequest())) redirect("/fantasy")
  return children
}
