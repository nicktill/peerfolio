"use client"

import { Fragment, createContext, memo, useContext, useMemo, useSyncExternalStore } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { parseMarkdown, settleForStreaming, splitSigned, type Block, type Inline } from "@web/lib/ai/markdown"
import { isKnownUrl } from "@web/lib/ai/sources"

/** Web addresses seen in this conversation (tool results, search citations, the person's own messages). Others are not linked. */
const KnownUrls = createContext<Set<string> | null>(null)

const subscribe = () => () => {}
/** The app's own origin, so a link written as the full address of a Peerfolio page navigates in place. Unknown on the server. */
const useOrigin = () => useSyncExternalStore(subscribe, () => window.location.origin, () => undefined)

/**
 * A link in an answer. Web addresses open in a new tab and never hand the new page this window (`noopener`);
 * app pages navigate in place through the router. The look is the same blue for both, so every address in an
 * answer reads as clickable.
 */
export function AssistantLink({ href, kind, children }: { href: string; kind: "external" | "internal" | "mail"; children: React.ReactNode }) {
  const known = useContext(KnownUrls)
  if (kind === "internal") {
    return (
      <Link href={href} className="pf-ai-a">
        {children}
      </Link>
    )
  }
  if (kind === "mail") {
    return (
      <a href={href} className="pf-ai-a">
        {children}
      </a>
    )
  }
  // An address the model wrote from memory may not exist. Unless it was seen in this conversation it is shown, not linked.
  if (known && !isKnownUrl(href, known)) {
    return (
      <span className="pf-ai-a is-unverified" title="Not linked: this address didn't come from your data or a search, so it may not be real.">
        {children}
      </span>
    )
  }
  return (
    <a href={href} className="pf-ai-a is-ext" target="_blank" rel="noopener noreferrer">
      {children}
      <ArrowUpRight size={11} className="pf-ai-a-ic" aria-hidden />
      <span className="pf-ai-sr"> (opens in a new tab)</span>
    </a>
  )
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "text":
            // Signed gains and losses use the app's gain and loss colours, so "+1.2%" reads the same here as on the portfolio page.
            return (
              <Fragment key={i}>
                {splitSigned(n.v).map((piece, k) =>
                  piece.tone ? (
                    <span key={k} className={`pf-ai-num is-${piece.tone}`}>
                      {piece.v}
                    </span>
                  ) : (
                    piece.v
                  ),
                )}
              </Fragment>
            )
          case "br":
            return <br key={i} />
          case "code":
            return (
              <code key={i} className="pf-ai-ic">
                {n.v}
              </code>
            )
          case "strong":
            return (
              <strong key={i}>
                <Inlines nodes={n.c} />
              </strong>
            )
          case "em":
            return (
              <em key={i}>
                <Inlines nodes={n.c} />
              </em>
            )
          case "del":
            return (
              <del key={i}>
                <Inlines nodes={n.c} />
              </del>
            )
          case "link":
            return (
              <AssistantLink key={i} href={n.href} kind={n.kind}>
                <Inlines nodes={n.c} />
              </AssistantLink>
            )
        }
      })}
    </>
  )
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "p":
            return (
              <p key={i}>
                <Inlines nodes={b.c} />
              </p>
            )
          case "h":
            return (
              <p key={i} className={`pf-ai-h pf-ai-h${b.level}`}>
                <Inlines nodes={b.c} />
              </p>
            )
          case "list": {
            const Tag = b.ordered ? "ol" : "ul"
            return (
              <Tag key={i} start={b.ordered && b.start !== 1 ? b.start : undefined}>
                {b.items.map((item, k) => (
                  <li key={k}>
                    <Blocks blocks={item} />
                  </li>
                ))}
              </Tag>
            )
          }
          case "quote":
            return (
              <blockquote key={i}>
                <Blocks blocks={b.c} />
              </blockquote>
            )
          case "code":
            return (
              <pre key={i} className="pf-ai-pre" tabIndex={0}>
                <code>{b.v}</code>
              </pre>
            )
          case "hr":
            return <hr key={i} />
          case "table":
            return (
              <div key={i} className="pf-ai-tablewrap" tabIndex={0} role="region" aria-label="Table">
                <table>
                  <thead>
                    <tr>
                      {b.head.map((cell, k) => (
                        <th key={k} style={{ textAlign: b.align[k] ?? undefined }}>
                          <Inlines nodes={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, k) => (
                          <td key={k} style={{ textAlign: b.align[k] ?? undefined }}>
                            <Inlines nodes={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        }
      })}
    </>
  )
}

/**
 * An assistant answer as formatted text. While `streaming`, unfinished Markdown is closed for display so the
 * reply doesn't flicker between raw symbols and formatting; the caret sits at the end of the last line.
 */
export const Markdown = memo(function Markdown({ text, streaming = false, caret = false, known = null }: { text: string; streaming?: boolean; caret?: boolean; known?: Set<string> | null }) {
  const origin = useOrigin()
  const blocks = useMemo(() => parseMarkdown(streaming ? settleForStreaming(text) : text, origin), [text, streaming, origin])
  return (
    <KnownUrls.Provider value={known}>
      <div className={`pf-ai-md ${caret ? "has-caret" : ""}`}>
        <Blocks blocks={blocks} />
      </div>
    </KnownUrls.Provider>
  )
})
