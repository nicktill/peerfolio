import type { Metadata } from "next"
import Link from "next/link"
import { CONTACT_EMAIL } from "@web/components/site-footer"

export const metadata: Metadata = { title: "Terms of Service" }

export default function TermsPage() {
  return (
    <article>
      <h1>Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Effective September 26, 2026</p>

      <p>
        These terms cover your use of Peerfolio (the website at peerfolio.org and the app behind it). By creating an
        account you agree to them. How we handle your data is covered in the{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>What Peerfolio is</h2>
      <p>
        Peerfolio shows your investment returns and lets you compare them with friends in private leagues and, if you
        choose, on a public board. It is a tracking and comparison tool.
      </p>
      <p>
        <strong>Peerfolio is not a broker, bank or investment adviser, and nothing in it is financial advice.</strong>{" "}
        We don&apos;t hold your money, place trades, or recommend securities. Seeing what other people hold or how they
        perform is not a recommendation to do the same. Make your own decisions, or talk to a licensed professional.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be at least 18 to use Peerfolio.</li>
        <li>You sign in with Google. Keep that account secure; you&apos;re responsible for activity on yours.</li>
        <li>
          Only link financial accounts that you own or are authorized to access. Linking happens through Plaid, which has
          its own terms.
        </li>
      </ul>

      <h2>Accuracy of numbers</h2>
      <ul>
        <li>
          Balances and holdings from linked accounts come from your institution through Plaid. Market prices for
          manual positions come from a third-party data provider and reflect the previous trading day&apos;s close.
          Either can be delayed, incomplete or wrong.
        </li>
        <li>
          Returns are calculated from once-a-day snapshots and only cover the time since you joined. They won&apos;t
          match your brokerage statements exactly.
        </li>
        <li>
          Manual accounts are self-reported. They count in private leagues but are never ranked on the public board.
        </li>
        <li>Don&apos;t rely on Peerfolio for tax, accounting or trading decisions.</li>
      </ul>

      <h2>Playing fair</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Enter numbers you know are false to move up a league or the board.</li>
        <li>Harass other members, or use a handle, bio or league name that is abusive or impersonates someone.</li>
        <li>
          Try to see other people&apos;s balances or private data, probe or overload the service, or access it by
          automated means other than the app itself.
        </li>
        <li>Use Peerfolio to promote securities, run a scheme, or break any law.</li>
      </ul>
      <p>We may remove content, rankings or accounts that break these rules.</p>

      <h2>Your content</h2>
      <p>
        You own what you put into Peerfolio. You give us permission to store it and to show it as described in the
        Privacy Policy and the settings you choose. For example, your percentage return is shown to your leagues.
      </p>

      <h2>Ending your account</h2>
      <p>
        You can delete your account at any time from <Link href="/settings">Settings</Link>, which also revokes every
        linked institution. We may suspend or close accounts that break these terms, and we may change or discontinue
        features. If we shut Peerfolio down, we&apos;ll give reasonable notice and delete your data.
      </p>

      <h2>No warranty</h2>
      <p>
        Peerfolio is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind, including
        accuracy, availability or fitness for a particular purpose.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent the law allows, Peerfolio is not liable for indirect, incidental or consequential damages, or for
        investment losses, arising from your use of the service. Our total liability for any claim is limited to the
        amount you paid us in the twelve months before the claim, which for a free account is zero.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms. We&apos;ll change the date above, and for significant changes we&apos;ll tell you in
        the app or by email. If you keep using Peerfolio after a change takes effect, the new terms apply.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </article>
  )
}
