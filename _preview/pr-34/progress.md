---
title: Progress & events
---

The library never renders progress. It emits structured lifecycle
events; consumers plug in any indicator (stderr bar, spinner,
notification, log line), or none. No handler → silent.

## `ProgressEvent` shape

```ts
type ProgressPhase = "resolve" | "apply" | "verify";

type ProgressEvent =
  | { type: "phase"; phase: ProgressPhase }
  | { type: "bytes"; phase: ProgressPhase; written: number; total: number | null }
  | { type: "done"; phase: ProgressPhase };
```

Emitted during `resolveAndApply`:

```
{ type: "phase", phase: "resolve" }
{ type: "phase", phase: "apply" }
{ type: "bytes", phase: "apply", written: 0, total: 930000000 }
{ type: "bytes", phase: "apply", written: 310000000, total: 930000000 }
{ type: "bytes", phase: "apply", written: 620000000, total: 930000000 }
{ type: "bytes", phase: "apply", written: 930000000, total: 930000000 }
{ type: "done", phase: "apply" }
{ type: "phase", phase: "verify" }
{ type: "done", phase: "verify" }
```

`bytes` events are cumulative within a phase. `total` is `null` for
phases where the total isn't known ahead of time (e.g. the registry
decompressed size for full downloads).

## Handler

```ts
import { resolveAndApply, type ProgressEvent } from "binpatch";

await resolveAndApply({
  /* ... */
  onProgress: (event: ProgressEvent) => {
    switch (event.type) {
      case "phase":
        console.log(`→ ${event.phase}`);
        break;
      case "bytes":
        if (event.total !== null) {
          const pct = ((event.written / event.total) * 100).toFixed(0);
          console.log(`  ${event.phase}: ${pct}%`);
        } else {
          console.log(`  ${event.phase}: ${event.written} bytes`);
        }
        break;
      case "done":
        console.log(`✓ ${event.phase}`);
        break;
    }
  },
});
```

## Safe-by-default handler wrapping

`binpatch` wraps your handler in a `try/catch` so a misbehaving
consumer can never abort the underlying operation:

```ts
import { safeProgress, type ProgressHandler } from "binpatch";

const myHandler: ProgressHandler = (event) => { /* ... */ };
const safe = safeProgress(myHandler); // throws are swallowed

await resolveAndApply({ /* ... */, onProgress: safe });
```

This is automatic when you pass `onProgress` to `resolveAndApply` —
you only need `safeProgress` if you're re-wrapping your handler for
some reason (e.g. multiple downstream consumers).

Progress is **cosmetic and must never abort the operation it
decorates**. If you want to cancel the operation, pass an
`AbortSignal` instead — see [Custom fetch / CA](/custom-fetch/).

## Display patterns

### Simple stderr bar (TTY only)

```ts
import { resolveAndApply } from "binpatch";

await resolveAndApply({
  /* ... */
  onProgress: (event) => {
    if (event.type !== "bytes") return;
    const { phase, written, total } = event;
    if (total === null) {
      process.stderr.write(`\r${phase}: ${written} bytes`);
      return;
    }
    const frac = Math.min(written / total, 1);
    const barWidth = 16;
    const filled = Math.round(frac * barWidth);
    const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
    const pct = (frac * 100).toFixed(0);
    process.stderr.write(`\r${phase} [${bar}] ${pct}%`);
  },
});
```

### Multi-hop apply total

For a multi-hop chain, `event.total` for the `apply` phase is the
**sum of `newSize` across all hops**. A 3-hop chain of 100 MB
binaries will report `total: 300 MB`. Display this as a percentage
of the final binary size, not bytes — most users want "how far
along?" not "how much data has the apply read?".

```ts
case "bytes":
  if (event.phase === "apply" && event.total !== null) {
    const frac = Math.min(event.written / event.total, 1);
    console.log(`Applying [${"█".repeat(Math.round(frac * 16))}] ${(frac * 100).toFixed(0)}%`);
  }
```

## Phase semantics

| Phase | Meaning | `total` known? |
|-------|---------|----------------|
| `resolve` | Looking up chain in registry (manifest fetches, tag listing) | No |
| `apply` | Fetching + applying the patches to the old binary | Yes (sum of `newSize` across hops) |
| `verify` | SHA-256 check on the final output | No |

Note: `ProgressPhase` in `src/events.ts` lists `"download"` as a
reserved value, but the library does not currently emit it — patch
downloads happen inside `apply` today. Don't rely on it appearing in
your handler.

## Why events, not spans

`binpatch` emits events, not OpenTelemetry / Sentry / StatsD spans,
because span shape varies wildly between consumers. Sentry wants
`withTracingSpan(name, op, fn)` per HTTP call; OTel wants
`startActiveSpan(name, fn)`; StatsD wants `timing(name, ms)`.

Consumers wire the events into their own tracing — see
[Instrumentation](/telemetry/) for the per-HTTP hook.

## Next

- [Instrumentation →](/telemetry/) — wrap each HTTP call in your own span
- [Discovering chains →](/discover/) — `SourceStrategy` details
