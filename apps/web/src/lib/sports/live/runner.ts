import { cycleFailed, shouldExit, WORKER_NAME } from "./health.ts"
import { clip, type Fields, type Level } from "../log.ts"
import {
  idleSleepMs,
  isQuiet,
  MAX_SLEEP_MS,
  pollDelay,
  QUIET_REFRESH_MS,
} from "./plan.ts"
import type { LiveSlate } from "./store.ts"
import type { writeHeartbeat } from "./store.ts"
import { inQuietHours, msToNextSlot, QUIET_SLOT_MS } from "./slots.ts"
import { REPRICE } from "../reprice-config.ts"
import { runRepricePass, type PassResult } from "./reprice-pass.ts"
import { WATCH_POLL_MS } from "./watch-signal.ts"
import {
  newWorkerState,
  runTick,
  type TickResult,
  type WorkerDeps,
} from "./worker.ts"

export type RunnerIO = {
  lockDueMarkets(now: Date): Promise<number>
  nextStartAfter(now: Date): Promise<Date | null>
  nextTrackedStartAfter(now: Date): Promise<Date | null>
  pruneLiveQuotes(now: Date): Promise<number>
  writeHeartbeat: (input: Parameters<typeof writeHeartbeat>[1]) => Promise<void>
  watch?: { changed(): Promise<boolean> }
  clock?: () => number
  checkpoint?: string
  tick?: typeof runTick
  reprice?: typeof runRepricePass
}

/** One cycle shared by the Node process and alarm-driven host. All SQL and network effects are injected. */
export function createWorkerRunner(base: WorkerDeps, io: RunnerIO) {
  const clock = io.clock ?? Date.now
  const watch = io.watch
  const bookMode = base.bookMode ?? "strict"
  const out = (level: Level, ev: string, fields?: Fields) =>
    base.emit?.(level, ev, fields)
  let cached: { rows: LiveSlate; watched: boolean; at: number } | null = null
  let quiet = false
  const kickoffLocked = new Set<string>()
  const quietNow = (now: number) => isQuiet(cached, now, !!watch, kickoffLocked)
  const modeCycles = { watched: 0, unwatchedLoaded: 0, quiet: 0 }
  let lastModeLog = clock()
  const deps: WorkerDeps = {
    ...base,
    store: {
      loadSlate: async (now) => {
        if (quiet && cached) return cached.rows
        const rows = (await base.store.loadSlate(now)) as LiveSlate
        cached = { rows, watched: rows.watched ?? true, at: clock() }
        return rows
      },
      insertQuotes: async (rows) => {
        if (!quiet) await base.store.insertQuotes(rows)
      },
      upsertState: async (id, state) => {
        if (!quiet) await base.store.upsertState(id, state)
      },
    },
  }
  const state = newWorkerState()
  let failures = 0
  let lastPrune = 0
  let writtenSincePrune = 0
  let lastReport = 0
  let lastLock = 0
  let nextQuietWatchPoll = 0
  if (io.checkpoint) {
    if (io.checkpoint.length > 1_000_000)
      throw new Error("Worker checkpoint exceeds bound")
    const saved = JSON.parse(io.checkpoint, (_key, value) => {
      if (value?.$type === "Date") return new Date(value.value)
      if (value?.$type === "Map") return new Map(value.value)
      return value
    })
    if (saved.version !== 1) throw new Error("Unsupported worker checkpoint")
    cached = saved.cached
    quiet = saved.quiet === true
    for (const id of saved.kickoffLocked ?? []) kickoffLocked.add(id)
    failures = saved.failures
    lastPrune = saved.lastPrune
    writtenSincePrune = saved.writtenSincePrune
    lastLock = saved.lastLock
    Object.assign(state, saved.state)
    // Raw upstream caches can be megabytes and are safe to refetch after a restart.
    state.slow.clear()
    state.trigger = newWorkerState().trigger
    state.trigger.restore(saved.triggers)
  }
  return {
    state,
    checkpoint() {
      const value = JSON.stringify(
        {
          version: 1,
          cached,
          quiet,
          kickoffLocked: [...kickoffLocked],
          failures,
          lastPrune,
          writtenSincePrune,
          lastLock,
          state: { ...state, trigger: undefined, slow: new Map() },
          triggers: state.trigger.snapshot(),
        },
        function (key, value) {
          const original = this[key]
          if (original instanceof Date)
            return { $type: "Date", value: original.toISOString() }
          if (original instanceof Map)
            return { $type: "Map", value: [...original] }
          return value
        },
      )
      if (value.length > 1_000_000)
        throw new Error("Worker checkpoint exceeds bound")
      return value
    },
    wake() {
      cached = null
      state.reprice.nextListAt = 0
    },
    async step() {
      const started = clock()
      const now = new Date(clock())
      const wasQuiet = quiet
      quiet = quietNow(started)
      // A viewer arriving ends quiet mode at once (a request to the app, no database).
      if (quiet && watch && started >= nextQuietWatchPoll) {
        nextQuietWatchPoll = started + WATCH_POLL_MS
        if (await watch.changed()) {
          quiet = false
          cached = null
          state.reprice.nextListAt = 0
          out("info", "live.woken", { reason: "viewer", from: "quiet" })
        }
      }
      if (wasQuiet && !quiet) {
        // Quiet polling updates in-memory observations without persisting them. Resume must force a fresh DB snapshot.
        state.lastWrite.clear()
        state.lastState.clear()
      }
      if (cached)
        modeCycles[
          quiet ? "quiet" : cached.watched ? "watched" : "unwatchedLoaded"
        ]++
      if (clock() - lastModeLog >= 10 * 60_000) {
        // Why the database was (or was not) kept busy: cycles with a viewer, cycles on an open pick only, and cycles run in memory.
        out("info", "live.mode", {
          ...modeCycles,
          sinceMin: Math.round((clock() - lastModeLog) / 60_000),
        })
        modeCycles.watched = modeCycles.unwatchedLoaded = modeCycles.quiet = 0
        lastModeLog = clock()
      }
      let result: TickResult | null = null
      let threw = false
      try {
        result = await (io.tick ?? runTick)(deps, state, now)
      } catch (error) {
        threw = true
        state.stats.errors++
        // drizzle wraps the driver error ("Failed query: ..."); the Postgres message and code are on `cause`.
        const cause = (
          error as { cause?: { message?: string; code?: string } } | null
        )?.cause
        out("error", "live.cycle_failed", {
          error: clip(error),
          cause: cause
            ? clip(`${cause.code ?? ""} ${cause.message ?? ""}`)
            : undefined,
        })
      }
      const slate = result?.slate ?? 0
      const failed = cycleFailed({
        threw,
        slate,
        okCalls: result?.okCalls ?? 0,
        failCalls: result?.failCalls ?? 0,
        skippedBackoff: result?.skippedBackoff ?? 0,
      })
      failures = failed ? failures + 1 : 0
      if (!quiet) writtenSincePrune += result?.rowsWritten ?? 0
      // (repricing writes line versions, not live_quote rows, so it does not count towards pruning)

      // Pregame repricing: due every 30s while a game starts within 3 hours, once per shared quarter-hour slot otherwise. A failure here never
      // fails the live cycle (display) and never leaves a market half-repriced (each write is one transaction).
      let repriceNext = Number.POSITIVE_INFINITY
      let repriced: PassResult | null = null
      if (!threw && !quiet) {
        try {
          repriced = await (io.reprice ?? runRepricePass)(
            deps,
            state,
            new Date(clock()),
          )
          if (repriced)
            repriceNext =
              repriced.targets === 0
                ? Number.POSITIVE_INFINITY
                : repriced.nextPassMs
        } catch (error) {
          out("error", "live.reprice_failed", { error: clip(error) })
        }
      }

      // Kickoff locks. The publish and settle routes lock due markets too, but only hourly in quiet hours (live/slots.ts), and in-play
      // picks need a market locked at kickoff. While a game is on the slate the database is awake anyway: lock at most once a minute.
      if (slate > 0 && !quiet && clock() - lastLock >= 60_000) {
        lastLock = clock()
        try {
          const locked = await io.lockDueMarkets(new Date(clock()))
          if (locked) out("info", "live.locked", { locked })
          for (const g of cached?.rows ?? [])
            if (g.startsAt.getTime() <= clock()) kickoffLocked.add(g.id)
        } catch (error) {
          out("warn", "live.lock_failed", { error: clip(error) })
        }
      }

      // Idle: nothing live. Decide how long to sleep from the next scheduled start (one cheap query) and the next reprice pass.
      let delay = pollDelay(slate)
      if (!threw && slate === 0) {
        // Hourly sleeps (quiet hours only) need every tracked game to start beyond the repricing window plus an hour: the publish
        // guard trusts the announced wake time (sleepUntil) only while nothing it guards is that close.
        let hourly = false
        try {
          const now = new Date(clock())
          const next = await io.nextStartAfter(now)
          // Hourly only when no tracked game starts soon, watched or not (#328 narrowed nextStartAfter to watched or picked games).
          const tracked = inQuietHours(now.getTime())
            ? await io.nextTrackedStartAfter(now)
            : next
          hourly =
            !tracked ||
            tracked.getTime() - now.getTime() > REPRICE.windowMs + QUIET_SLOT_MS
          delay = idleSleepMs(
            now,
            next,
            hourly && inQuietHours(now.getTime())
              ? QUIET_SLOT_MS
              : MAX_SLEEP_MS,
          )
        } catch (error) {
          out("warn", "live.next_start_failed", { error: clip(error) })
        }
        delay = Math.min(delay, Math.max(10_000, repriceNext))
        // A long sleep wakes on the shared slot, so this worker's database reads share an awake period with the cron routes.
        if (delay >= 5 * 60_000)
          delay = Math.min(delay, msToNextSlot(clock(), hourly))
      }

      // Prune only if something was written since the last prune: an idle worker must not wake the database for nothing.
      if (
        !quiet &&
        writtenSincePrune > 0 &&
        clock() - lastPrune > 15 * 60_000
      ) {
        lastPrune = clock()
        try {
          const pruned = await io.pruneLiveQuotes(new Date(clock()))
          writtenSincePrune = 0
          out("info", "live.prune", { pruned })
        } catch (error) {
          out("warn", "live.prune_failed", { error: clip(error) })
        }
      }

      // Heartbeat for /api/sports/live/health (one tiny upsert per cycle). While quiet the previous one already announced the wake time.
      const goingQuiet = !quiet && quietNow(clock())
      const quietUntil = cached ? cached.at + QUIET_REFRESH_MS : 0
      if (!quiet)
        try {
          await io.writeHeartbeat({
            name: WORKER_NAME,
            at: new Date(clock()),
            ok: !failed,
            consecutiveFailures: failures,
            details: {
              slate,
              matched: result?.matched ?? 0,
              unmatched: (result?.unmatched ?? []).slice(0, 20),
              sources: result?.sources ?? {},
              reprice: repriced
                ? {
                    targets: repriced.targets,
                    matched: repriced.matched,
                    updated: repriced.updated,
                    frozen: repriced.frozen,
                    held: repriced.held,
                    skipped: repriced.skipped,
                  }
                : null,
              sleepUntil: new Date(
                goingQuiet ? quietUntil : clock() + delay,
              ).toISOString(),
              ...(goingQuiet ? { quiet: true } : {}),
              bookMode,
              ...(threw ? { lastError: "cycle threw (see logs)" } : {}),
            },
          })
        } catch (error) {
          out("warn", "live.heartbeat_failed", { error: clip(error) })
        }

      if (clock() - lastReport > 60_000 && slate > 0) {
        lastReport = clock()
        out("info", "live.report", {
          calls: state.stats.calls,
          rows: state.stats.rowsWritten,
          stateWrites: state.stats.stateWrites,
          errors: state.stats.errors,
          failures,
        })
      }

      // Bound per-game memory to the current slate. Source caches/backoffs have a fixed provider/sport keyspace.
      const keep = new Set(cached?.rows.map((g) => g.id) ?? [])
      for (const id of kickoffLocked)
        if (!keep.has(id)) kickoffLocked.delete(id)
      for (const map of [state.lastState, state.orientAt])
        for (const id of map.keys()) if (!keep.has(id)) map.delete(id)
      for (const key of state.lastWrite.keys())
        if (!keep.has(key.split("|")[0])) state.lastWrite.delete(key)
      for (const key of state.clocks.keys())
        if (!keep.has(key.split("|")[0])) state.clocks.delete(key)
      for (const key of state.clockLogAt.keys())
        if (!keep.has(key.split("|")[0])) state.clockLogAt.delete(key)
      for (const [id, at] of state.reprice.holdLogAt)
        if (clock() - at > 24 * 3600_000) state.reprice.holdLogAt.delete(id)
      while (state.reprice.holdLogAt.size > 1000)
        state.reprice.holdLogAt.delete(
          state.reprice.holdLogAt.keys().next().value!,
        )
      state.trigger.prune(keep)
      return {
        failed,
        fatal: shouldExit(failures),
        failures,
        slate,
        quiet,
        delayMs: Math.max(1_000, delay - (clock() - started)),
      }
    },
  }
}
