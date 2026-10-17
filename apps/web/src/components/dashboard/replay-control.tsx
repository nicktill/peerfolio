"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useReducedMotion } from "motion/react"
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from "lucide-react"
import { cn } from "@web/lib/utils"
import { formatCurrency, formatDate, formatPercent } from "@web/lib/format"
import { plural } from "@web/lib/plural"
import { advance, buildFrames, clampIndex, gapPoints, nextIndex, nextSpeed, type ReplayFrame, type ReplayInput, type ReplaySpeed } from "@web/lib/replay"
import "./replay-control.css"

/** Fewer tracked days than this and a replay is just a few jumps, so it isn't offered. */
export const MIN_REPLAY_DAYS = 5

const chip =
  "inline-flex h-6 items-center justify-center gap-1 rounded-full border px-2.5 text-[11px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--pf-ring)]"
const chipOn = "border-input bg-secondary text-foreground"
const iconBtn =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:[box-shadow:var(--pf-ring)] disabled:pointer-events-none disabled:opacity-40"

const tone = (v: number) => (v >= 0 ? "text-gain-ink" : "text-loss-ink")

/**
 * Walks through the tracked days of the chart's range. The app only stores one value snapshot per
 * day, so this is a replay of value and return (deposits removed), not of what was held; the line
 * under the controls says so. The chart is told where the playhead is through `onDate` (the date of
 * the frame, or null when the replay is closed).
 */
export function ReplayControl({
  history,
  performance: returns,
  benchmark,
  benchmarkLabel,
  hidden,
  onDate,
}: ReplayInput & {
  /** Set while a benchmark is on: the readout then shows its return and the gap too. */
  benchmarkLabel: string | null
  hidden: boolean
  onDate: (date: string | null) => void
}) {
  const reduceMotion = Boolean(useReducedMotion())
  const frames = useMemo(() => buildFrames({ history, performance: returns, benchmark: benchmarkLabel ? benchmark : null }), [history, returns, benchmark, benchmarkLabel])
  const count = frames.length
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<ReplaySpeed>(1)
  const [announcement, setAnnouncement] = useState("")
  const position = useRef(0)

  const frame = frames[clampIndex(index, count)]
  // The playhead loop and the cleanup read these through refs so a re-render never restarts them.
  const onDateRef = useRef(onDate)
  onDateRef.current = onDate
  const framesRef = useRef(frames)
  framesRef.current = frames
  const shownDay = useRef(-1)

  const describe = useCallback(
    (f: ReplayFrame | undefined) => {
      if (!f) return ""
      const bits = [formatDate(f.date), hidden ? null : `net worth ${formatCurrency(f.value)}`, `return ${formatPercent(f.indexedReturnPercent)}`]
      if (benchmarkLabel && f.benchmarkReturnPercent != null) bits.push(`${benchmarkLabel} ${formatPercent(f.benchmarkReturnPercent)}`)
      return bits.filter(Boolean).join(", ")
    },
    [benchmarkLabel, hidden],
  )

  const goTo = useCallback(
    (i: number) => {
      const next = clampIndex(i, count)
      position.current = next
      shownDay.current = next
      setIndex(next)
      onDateRef.current(framesRef.current[next]?.date ?? null)
    },
    [count],
  )

  const pause = useCallback(
    (at?: number) => {
      setPlaying(false)
      setAnnouncement(describe(frames[clampIndex(at ?? Math.floor(position.current), count)]))
    },
    [count, describe, frames],
  )

  // The playhead: advanced by elapsed time, not by frame count, and only re-rendered when the day changes.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.25)
      last = now
      const step = advance(position.current, dt, speed, count)
      position.current = step.position
      const day = Math.floor(step.position)
      if (day !== shownDay.current) {
        shownDay.current = day
        setIndex(day)
        onDateRef.current(framesRef.current[day]?.date ?? null)
      }
      if (step.done) {
        setPlaying(false)
        setAnnouncement(describe(framesRef.current[count - 1]))
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, count, describe])

  // A hidden tab shouldn't keep running: pause, and stay paused when it comes back.
  useEffect(() => {
    if (!playing) return
    const onVisibility = () => {
      if (document.hidden) setPlaying(false)
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [playing])

  // Leaving the page or unmounting must release the chart's playhead.
  useEffect(() => () => onDateRef.current(null), [])

  if (count < MIN_REPLAY_DAYS) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Replay needs at least {MIN_REPLAY_DAYS} tracked days in this range; this one has {count}.
      </p>
    )
  }

  const start = () => {
    setOpen(true)
    setAnnouncement("")
    goTo(0)
    setPlaying(!reduceMotion)
  }
  const close = () => {
    setPlaying(false)
    setOpen(false)
    onDateRef.current(null)
  }
  const togglePlay = () => {
    if (playing) return pause()
    if (position.current >= count - 1) goTo(0)
    setPlaying(true)
  }
  const step = (dir: 1 | -1) => {
    setPlaying(false)
    const next = nextIndex(Math.floor(position.current), dir, count)
    goTo(next)
    setAnnouncement(describe(frames[next]))
  }

  if (!open || !frame) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/60 py-4">
        <span className="pf-eyebrow !text-[10px]">Replay</span>
        <button
          type="button"
          onClick={start}
          className="inline-flex h-8 items-center gap-2 rounded-full border border-input bg-secondary px-4 text-xs font-medium text-foreground transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:[box-shadow:var(--pf-ring)]"
          aria-label={`Replay ${plural(count, "tracked day")} of this range`}
        >
          <Play className="size-3 fill-current" aria-hidden />
          Play
        </button>
        <span className="text-xs text-muted-foreground">{plural(count, "tracked day")}</span>
      </div>
    )
  }

  const last = count - 1
  const gap = gapPoints(frame)
  const atEnd = index >= last

  return (
    <div className="mt-4 flex flex-col gap-2.5 border-t border-border/60 pb-4 pt-4" role="group" aria-label="Portfolio replay">
      <div className="flex items-center gap-1.5">
        <span className="pf-eyebrow !text-[10px] max-[420px]:sr-only">Replay</span>
        {reduceMotion ? null : (
          <button type="button" onClick={togglePlay} className={iconBtn} aria-label={playing ? "Pause replay" : atEnd ? "Replay from the start" : "Play replay"}>
            {playing ? <Pause className="size-3.5 fill-current" aria-hidden /> : <Play className="size-3.5 fill-current" aria-hidden />}
          </button>
        )}
        {reduceMotion ? (
          <>
            <button type="button" onClick={() => step(-1)} disabled={index <= 0} className={iconBtn} aria-label="Previous day">
              <ChevronLeft className="size-3.5" aria-hidden />
            </button>
            <button type="button" onClick={() => step(1)} disabled={atEnd} className={iconBtn} aria-label="Next day">
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => {
            goTo(0)
            setAnnouncement("")
            setPlaying(!reduceMotion)
          }}
          className={iconBtn}
          aria-label="Restart replay"
        >
          <RotateCcw className="size-3.5" aria-hidden />
        </button>
        {reduceMotion ? null : (
          <button type="button" onClick={() => setSpeed(nextSpeed(speed))} className={cn(chip, chipOn, "numeric w-9")} aria-label={`Playback speed ${speed}x. Change speed`}>
            {speed}x
          </button>
        )}
        <input
          type="range"
          className="pf-replay-range mx-1 flex-1"
          min={0}
          max={last}
          step={1}
          value={index}
          aria-label="Replay date"
          aria-valuetext={describe(frame)}
          onChange={(e) => {
            setPlaying(false)
            goTo(Number(e.target.value))
          }}
          // Announce where the scrub ended, not every day it passed.
          onPointerUp={() => setAnnouncement(describe(frames[clampIndex(index, count)]))}
          onKeyUp={() => setAnnouncement(describe(frames[clampIndex(index, count)]))}
        />
        <button type="button" onClick={close} className={iconBtn} aria-label="Close replay">
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      {/* The readout moves with the playhead, so it is not live: the status line below carries the announcements. */}
      <div className="flex min-h-[20px] flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs tabular-nums">
        <span className="numeric font-medium text-foreground">{formatDate(frame.date)}</span>
        {hidden ? null : <span className="numeric text-foreground">{formatCurrency(frame.value)}</span>}
        <span className={cn("numeric font-semibold", tone(frame.indexedReturnPercent))}>
          {benchmarkLabel ? "You " : "Return "}
          {formatPercent(frame.indexedReturnPercent)}
        </span>
        {benchmarkLabel ? (
          frame.benchmarkReturnPercent != null ? (
            <>
              <span className="numeric font-semibold text-foreground">
                {benchmarkLabel} {formatPercent(frame.benchmarkReturnPercent)}
              </span>
              {gap != null ? (
                <span className={cn("numeric font-semibold", tone(gap))}>
                  {gap >= 0 ? "Ahead" : "Behind"} by {Math.abs(gap).toFixed(2)} pts
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground">No {benchmarkLabel} close this day</span>
          )
        ) : null}
        {frame.dayChangePercent != null ? <span className={cn("numeric", tone(frame.dayChangePercent))}>Day {formatPercent(frame.dayChangePercent)}</span> : null}
        {frame.drawdownFromPeakPercent < -0.005 ? <span className="numeric text-muted-foreground">{formatPercent(frame.drawdownFromPeakPercent)} from peak</span> : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Replays {plural(count, "daily value snapshot")} from {formatDate(frames[0]!.date)} to {formatDate(frames[last]!.date)}. Returns have deposits removed. It shows value and
        return only, not what you held on each day.
      </p>

      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  )
}
