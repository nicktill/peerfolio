"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import {
  ArrowUpRight,
  Check,
  Clipboard,
  Clock3,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  Youtube,
} from "lucide-react"
import { Button } from "@web/components/ui/button"
import { ThemeToggle } from "@web/components/theme-toggle"

type Depth = "Quick" | "Standard" | "Detailed"
type ViewState = "empty" | "preview" | "loading" | "success" | "error"

const sampleVideo = {
  title: "The Future of Artificial Intelligence",
  channel: "Marques Brownlee",
  duration: "18:42",
  thumbnail: "https://i.ytimg.com/vi/zjkBMFhNj_g/hqdefault.jpg",
}

const recap = {
  overview:
    "AI is moving from a novelty into an everyday layer of software. The biggest shift is not just better models, but the way they can understand context, use tools, and work alongside people. That creates enormous leverage, while also making judgment and verification more important than ever.",
  takeaways: [
    "The next generation of AI products will be defined by useful workflows, not impressive demos.",
    "Multimodal models are making computers more natural to interact with and more capable in the physical world.",
    "The best results still come from pairing AI speed with human taste, context, and oversight.",
  ],
}

function isYoutubeUrl(value: string) {
  try {
    const url = new URL(value)
    return ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"].includes(url.hostname)
  } catch {
    return false
  }
}

export default function HomePage() {
  const [url, setUrl] = useState("")
  const [depth, setDepth] = useState<Depth>("Standard")
  const [state, setState] = useState<ViewState>("empty")
  const [copied, setCopied] = useState(false)
  const [stage, setStage] = useState(0)

  const hasUrl = url.trim().length > 0
  const valid = useMemo(() => isYoutubeUrl(url.trim()), [url])

  useEffect(() => {
    if (!hasUrl) setState("empty")
    else if (valid) setState("preview")
    else setState("error")
  }, [hasUrl, valid])

  useEffect(() => {
    if (state !== "loading") return
    const timer = window.setInterval(() => setStage((current) => Math.min(current + 1, 2)), 900)
    const finish = window.setTimeout(() => setState("success"), 2900)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(finish)
    }
  }, [state])

  function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!valid) {
      setState("error")
      return
    }
    setStage(0)
    setState("loading")
  }

  function copyRecap() {
    void navigator.clipboard?.writeText(`${recap.overview}\n\nKey takeaways\n${recap.takeaways.map((item) => `• ${item}`).join("\n")}`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  function reset() {
    setUrl("")
    setState("empty")
    setStage(0)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="/" className="flex items-center gap-2.5 font-semibold tracking-tight" aria-label="YTRecap home">
          <span className="grid size-8 place-items-center rounded-[10px] bg-foreground text-background"><Play className="size-3.5 fill-current" /></span>
          <span>YTRecap</span>
        </a>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <a href="https://github.com" className="hidden rounded-md px-3 py-2 hover:bg-secondary hover:text-foreground sm:block">GitHub</a>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        {state !== "success" ? (
          <section className="mx-auto flex max-w-3xl flex-col items-center pb-14 pt-20 text-center sm:pt-28">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
              <Sparkles className="size-3.5 text-primary" /> Clear thinking, less scrolling
            </div>
            <h1 className="max-w-2xl text-balance text-4xl font-semibold leading-[1.06] tracking-[-0.045em] sm:text-6xl">Understand any YouTube video in minutes.</h1>
            <p className="mt-5 max-w-xl text-balance text-base leading-7 text-muted-foreground sm:text-lg">Paste a video and get the important ideas without watching the whole thing.</p>

            <form onSubmit={submit} className="mt-10 w-full text-left">
              <div className={`rounded-2xl border bg-card p-2 shadow-[0_18px_60px_-28px_hsl(var(--foreground)/.3)] transition-all ${state === "error" ? "border-destructive/50" : "focus-within:border-foreground/30 focus-within:shadow-[0_22px_70px_-24px_hsl(var(--foreground)/.24)]"}`}>
                <div className="flex items-center gap-3 px-3 py-2">
                  <Youtube className="size-5 shrink-0 text-[#ff0033]" aria-hidden />
                  <label htmlFor="video-url" className="sr-only">YouTube video URL</label>
                  <input id="video-url" value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) submit() }} placeholder="Paste a YouTube link..." className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground/65" />
                  {hasUrl && <button type="button" onClick={reset} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Clear URL">×</button>}
                  <Button type="submit" size="lg" className="hidden shrink-0 rounded-xl sm:inline-flex" disabled={!valid || state === "loading"} loading={state === "loading"}>Summarize <ArrowUpRight data-icon="inline-end" /></Button>
                </div>
                <div className="flex flex-col gap-3 border-t px-3 pb-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><span>Recap length</span><div className="flex rounded-lg bg-secondary p-0.5" role="group" aria-label="Recap length">{(["Quick", "Standard", "Detailed"] as Depth[]).map((item) => <button type="button" key={item} onClick={() => setDepth(item)} className={`rounded-md px-2.5 py-1.5 transition-colors ${depth === item ? "bg-card font-medium text-foreground shadow-sm" : "hover:text-foreground"}`}>{item}</button>)}</div></div>
                  <button type="button" onClick={() => { setUrl("https://www.youtube.com/watch?v=zjkBMFhNj_g"); setState("preview") }} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">Try an example <ArrowUpRight className="size-3.5" /></button>
                </div>
                <Button type="submit" className="mt-1 w-full rounded-xl sm:hidden" disabled={!valid || state === "loading"} loading={state === "loading"}>Summarize <ArrowUpRight data-icon="inline-end" /></Button>
              </div>
              {state === "error" && <p className="mt-3 flex items-center gap-2 px-2 text-sm text-destructive"><TriangleAlert className="size-4" /> Hmm, that doesn&apos;t look like a YouTube link.</p>}
            </form>

            {state === "preview" && <VideoPreview depth={depth} onSubmit={submit} />}
            {state === "loading" && <ProcessingState stage={stage} />}
          </section>
        ) : <RecapView depth={depth} copied={copied} onCopy={copyRecap} onReset={reset} />}

        {state !== "success" && <div className="mx-auto grid max-w-4xl gap-4 border-t pt-8 text-center text-xs text-muted-foreground sm:grid-cols-3 sm:text-left"><span className="flex items-center justify-center gap-2 sm:justify-start"><Clock3 className="size-3.5" /> No account required</span><span className="flex items-center justify-center gap-2 sm:justify-center"><FileText className="size-3.5" /> Concise, readable recaps</span><span className="flex items-center justify-center gap-2 sm:justify-end"><Link2 className="size-3.5" /> Your links stay private</span></div>}
      </main>
      <footer className="border-t px-5 py-6 text-center text-xs text-muted-foreground">YTRecap — a calmer way to catch up on video.</footer>
    </div>
  )
}

function VideoPreview({ depth, onSubmit }: { depth: Depth; onSubmit: () => void }) {
  return <div className="mt-4 flex items-center gap-3 rounded-xl border bg-card p-3 text-left animate-rise-in"><img src={sampleVideo.thumbnail} alt="" className="h-14 w-24 rounded-lg object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{sampleVideo.title}</p><p className="mt-1 text-xs text-muted-foreground">{sampleVideo.channel} · {sampleVideo.duration} · {depth} recap</p></div><button type="button" onClick={onSubmit} className="hidden shrink-0 rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background hover:opacity-90 sm:block">Summarize</button></div>
}

function ProcessingState({ stage }: { stage: number }) {
  const steps = ["Fetching transcript", "Understanding the video", "Writing your recap"]
  return <div className="mt-12 w-full max-w-sm text-left animate-rise-in"><div className="mb-5 flex items-center gap-3"><Loader2 className="size-5 animate-spin text-primary" /><div><p className="text-sm font-medium">Creating your recap…</p><p className="mt-1 text-xs text-muted-foreground">This usually takes less than a minute.</p></div></div><div className="flex flex-col gap-3 rounded-xl border bg-card p-4">{steps.map((step, index) => <div key={step} className="flex items-center gap-3 text-sm"><span className={`grid size-5 place-items-center rounded-full ${index < stage ? "bg-primary text-primary-foreground" : "border text-muted-foreground"}`}>{index < stage ? <Check className="size-3" /> : index === stage ? <span className="size-1.5 animate-pulse rounded-full bg-primary" /> : null}</span><span className={index === stage ? "text-foreground" : "text-muted-foreground"}>{step}</span></div>)}</div></div>
}

function RecapView({ depth, copied, onCopy, onReset }: { depth: Depth; copied: boolean; onCopy: () => void; onReset: () => void }) {
  return <section className="mx-auto max-w-3xl pb-10 pt-10 sm:pt-16"><button onClick={onReset} className="mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><RotateCcw className="size-4" /> Summarize another</button><div className="flex gap-4 border-b pb-7"><img src={sampleVideo.thumbnail} alt="" className="size-20 rounded-xl object-cover sm:size-28" /><div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="rounded-full bg-secondary px-2 py-1">{depth} recap</span><span>{sampleVideo.duration}</span></div><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{sampleVideo.title}</h1><p className="mt-2 text-sm text-muted-foreground">{sampleVideo.channel}</p></div></div><div className="flex items-center justify-between border-b py-4"><span className="text-sm text-muted-foreground">Your recap</span><div className="flex items-center gap-1"><button onClick={onCopy} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium hover:bg-secondary">{copied ? <Check className="size-3.5 text-primary" /> : <Clipboard className="size-3.5" />}{copied ? "Copied" : "Copy recap"}</button><a href="https://youtube.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium hover:bg-secondary">Open video <ExternalLink className="size-3.5" /></a></div></div><article className="prose prose-neutral mt-10 max-w-none dark:prose-invert"><h2>Overview</h2><p>{recap.overview}</p><h2>Key takeaways</h2><ul>{recap.takeaways.map((takeaway) => <li key={takeaway}>{takeaway}</li>)}</ul><h2>Detailed recap</h2><p>The conversation begins with a look at how quickly AI capabilities have moved from research labs into tools people use every day. Rather than treating the technology as a replacement for human work, the video frames it as a new interface for thinking, creating, and navigating information.</p><p>The central idea is that context will become the differentiator. Models can generate an answer quickly, but the quality of the result depends on the questions we ask, the sources we trust, and the decisions we make with it. That is why the most useful products will feel focused and dependable, not merely clever.</p><blockquote>AI gets more useful as it gets closer to the work people actually care about.</blockquote><p>By the end, the message is optimistic but measured: the tools are becoming more capable, and learning how to direct them well is becoming a durable skill.</p></article></section>
}
