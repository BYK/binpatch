---
title: Instrumentation hook
---

The library wraps each HTTP call inside a configurable
`instrument` hook so you can attach your own tracing without
modifying library internals.

## Why a hook?

Per-HTTP instrumentation is consumer-specific:

- Sentry wants `withTracingSpan("http.client", op, fn)` with span
  attributes (`http.url`, `http.status_code`).
- OTel wants `startActiveSpan(name, fn)` with attributes on the
  current span.
- StatsD wants `timing("ghcr.manifest_fetch", ms, attrs)`.
- Some consumers want per-fetch retries logged.

The library emits the events; consumers wire them up.

## `InstrumentHook` shape

```ts
type InstrumentHook = <T>(
  name: string,
  fn: () => Promise<T>,
) => Promise<T>;
```

The hook takes a step name (e.g. `"fetch-target-manifest"`) and a
function that performs the HTTP call; it must return the same
result (success or rejection). The library calls it as
`await instrument("step-name", () => client.fetchManifest(...))`.

## Wiring it in

```ts
import { ghcrSource } from "binpatch";
// `withTracing` is *your* telemetry module — the library doesn't ship one.
// Wrap each instrumented step however your SDK expects.
import { withTracing } from "/telemetry.js";

const instrument: InstrumentHook = (name, fn) =>
  withTracing(name, "http.client", fn);

const source = ghcrSource({
  // ...
  instrument,
});
```

Sentry consumers typically re-export `withTracingSpan` from their
telemetry module; the library doesn't take a dependency on
`@sentry/node`.

## What gets wrapped

### `ghcrSource`

| Step name | What it wraps |
|-----------|---------------|
| `ghcr-token` | `getAnonymousToken` (POST to `/token`) |
| `fetch-target-manifest` | Manifest fetch for the target tag |
| `list-patch-tags` | Tag listing for the patch namespace |
| `fetch-chain-manifest` | Per-tag manifest fetch (in chain resolution loop) |
| `download-patch` | Per-patch blob fetch (in chain download loop) |

### `githubReleaseSource`

| Step name | What it wraps |
|-----------|---------------|
| `fetch-releases` | `GET /repos/.../releases` |
| `download-patch` | Per-patch asset download (in chain download loop) |

Each name is stable across versions. Add new names with care —
consumers may have dashboards keyed on them.

## Default behavior

If you don't pass `instrument`, the library calls the wrapped
function directly. No instrumentation, no extra latency.

## A complete Sentry example

```ts
import * as Sentry from "@sentry/node";
import { ghcrSource } from "binpatch";

const instrument: InstrumentHook = (name, fn) =>
  Sentry.startSpan({ name, op: "http.client" }, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: 1, message: "ok" }); // OK
      return result;
    } catch (e) {
      span.setStatus({ code: 2, message: (e as Error).message }); // ERROR
      throw e;
    }
  });

const source = ghcrSource({
  registry: "https://ghcr.io",
  repo: "your-org/your-app",
  binaryName: "myapp",
  targetTag: (v) => `nightly-${v}`,
  compareVersions: semver.compare,
  instrument,
});
```

## A complete OpenTelemetry example

```ts
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { ghcrSource } from "binpatch";

const tracer = trace.getTracer("binpatch");
const instrument: InstrumentHook = (name, fn) =>
  tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (e) {
      span.recordException(e as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
      throw e;
    } finally {
      span.end();
    }
  });

const source = ghcrSource({ /* ..., */ instrument });
```

## Invariants

- The library always awaits the result of `instrument(...)`.
  Even if your hook is async-only, the library's flow is correct.
- The hook must NOT mutate the wrapped function's return value.
  Return it as-is on success, re-throw on error.
- The hook runs once per step, not once per byte. The library does
  not wrap the apply loop in `instrument` — only the HTTP steps
  inside discovery.
- The hook name is informational. The library does not depend on
  any specific naming — feel free to rename in your consumer if
  your tracing system expects different conventions.

## Next

- [Progress & events →](/progress/) — `ProgressEvent` lifecycle
- [Discovering chains →](/discover/) — `SourceStrategy` interface
