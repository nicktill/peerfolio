/**
 * A template (unlike a layout) remounts on every navigation, so each page eases
 * in as you move between them, like the landing page does.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>
}
