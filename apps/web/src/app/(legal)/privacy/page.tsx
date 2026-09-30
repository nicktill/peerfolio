import type { Metadata } from "next"
import Link from "next/link"
import { CONTACT_EMAIL } from "@web/components/site-footer"

export const metadata: Metadata = { title: "Privacy Policy" }

export default function PrivacyPage() {
  return (
    <article>
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Effective September 26, 2026</p>

      <p>
        Peerfolio lets you compare investment returns with friends. The rule the whole product is built on:{" "}
        <strong>percentages can be shared, dollar amounts never are.</strong> This page explains what we collect, what
        we do with it, who else touches it, and how to delete it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your Google account basics.</strong> You sign in with Google. We receive your name, email address and
          profile photo. We never see your Google password.
        </li>
        <li>
          <strong>Profile details you choose.</strong> Your handle, an optional bio, and whether your profile is public.
        </li>
        <li>
          <strong>Data from accounts you link through Plaid.</strong> If you connect a brokerage or bank, Plaid gives us
          the institution&apos;s name and logo, each account&apos;s name, type and last four digits, account balances,
          and your investment holdings (security, quantity, cost basis and value). To keep returns honest we also read
          your investment transactions to total up deposits and withdrawals for each day. We store only that daily
          total, not the individual transactions.
        </li>
        <li>
          <strong>Manual accounts.</strong> Accounts you add yourself, with a balance you type in or positions (ticker
          and quantity) that we price from market data.
        </li>
        <li>
          <strong>Daily portfolio snapshots.</strong> Once a day we record your total assets, liabilities, invested
          amount and net deposits. This history is what your returns are calculated from.
        </li>
        <li>
          <strong>Social activity.</strong> Leagues you create or join, reactions you send, and people you follow.
        </li>
        <li>
          <strong>Waitlist sign-ups.</strong> If you joined the waitlist, the email, name and note you gave us.
        </li>
      </ul>
      <p>
        We do not collect your bank or brokerage login credentials. You enter those directly into Plaid, and they never
        reach our servers.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>To show you your own portfolio, balances and holdings.</li>
        <li>
          To calculate time-weighted returns, which leave out deposits, withdrawals and newly linked accounts so that
          only investment performance counts.
        </li>
        <li>To rank members of your leagues and, if you opt in, the public board.</li>
        <li>To keep linked accounts up to date and tell you when a connection needs attention.</li>
      </ul>
      <p>
        We do not sell your data, share it with advertisers, or use it for advertising. We don&apos;t run third-party
        analytics or ad trackers.
      </p>

      <h2>What other people can see</h2>
      <p>
        <strong>Nobody else ever sees your balances, net worth, position sizes or email address.</strong> What others can
        see depends on where they see you:
      </p>
      <ul>
        <li>
          <strong>Members of a league you&apos;re in</strong> see your name, handle, profile photo, percentage return
          and return chart. Unless you turn it off for that league, they also see your top tickers as a percentage of
          your portfolio, never as dollar amounts.
        </li>
        <li>
          <strong>Anyone on the public board</strong>, only if you choose to go public, sees your name, handle, profile
          photo, bio, percentage return and top tickers as percentages. The board only ranks returns from accounts
          linked through Plaid, never manual accounts. You can make your profile private again at any time.
        </li>
      </ul>

      <h2>How Plaid connections are protected</h2>
      <ul>
        <li>
          When you link an institution, Plaid gives us an access token for it. We encrypt that token with AES-256-GCM
          before storing it, and the encryption key is kept separately from the database.
        </li>
        <li>
          Access tokens are used only on our servers to fetch your data from Plaid. They are never sent to your browser
          or to anyone else.
        </li>
        <li>
          When you disconnect an institution, we tell Plaid to revoke our access (Plaid&apos;s <code>/item/remove</code>
          ) and delete that institution&apos;s accounts and holdings from our database.
        </li>
        <li>All traffic between your browser, our servers and Plaid is encrypted in transit with TLS.</li>
      </ul>
      <p>
        Plaid&apos;s own handling of your data is described in the{" "}
        <a href="https://plaid.com/legal/#end-user-privacy-policy" target="_blank" rel="noreferrer">
          Plaid End User Privacy Policy
        </a>
        .
      </p>

      <h2>Services we rely on</h2>
      <p>These providers process data on our behalf, only as needed to run Peerfolio:</p>
      <ul>
        <li>
          <strong>Google</strong>, for sign-in.
        </li>
        <li>
          <strong>Plaid</strong>, to connect financial accounts.
        </li>
        <li>
          <strong>Vercel</strong>, which hosts the app.
        </li>
        <li>
          <strong>Neon</strong>, which hosts our Postgres database.
        </li>
        <li>
          <strong>Massive</strong>, our market data provider. We send it ticker symbols to get prices. It receives
          nothing about you.
        </li>
        <li>
          <strong>Anthropic</strong>, only when you paste holdings that aren&apos;t a plain table into the import box. We
          send it the text you pasted so it can pick out tickers, share counts and average costs. We don&apos;t send your
          name, email or login details, and we ask it to return only the holdings. Uploading a CSV or typing a simple list
          is read on our servers without it.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        We use cookies only to keep you signed in and to protect sign-in against forgery. We don&apos;t use advertising
        or tracking cookies.
      </p>

      <h2>Keeping and deleting your data</h2>
      <p>We keep your data for as long as you have an account. You can remove it at any time:</p>
      <ul>
        <li>
          <strong>Disconnect an institution</strong> from your Portfolio page. We revoke access through Plaid and delete
          that institution&apos;s accounts and holdings.
        </li>
        <li>
          <strong>Delete your account</strong> from{" "}
          <Link href="/settings">Settings</Link>. We revoke every Plaid connection, then delete your profile, accounts,
          holdings, snapshots, league memberships, reactions, follows and any waitlist sign-up under your email. Leagues
          you created are handed to their longest-standing member, or deleted if you were the only one.
        </li>
      </ul>
      <p>
        Deleted data may remain in our hosting providers&apos; encrypted backups for a limited time until those backups
        expire. You can also email us to ask for a copy of your data or for deletion.
      </p>

      <h2>Children</h2>
      <p>Peerfolio is not intended for anyone under 18, and we don&apos;t knowingly collect data from children.</p>

      <h2>Changes</h2>
      <p>
        If we change this policy, we&apos;ll update the date above. For significant changes we&apos;ll also tell you in
        the app or by email.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </article>
  )
}
