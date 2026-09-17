---
title: Library integration
---

This page is for tool authors who want to wire `binpatch` into
their own upgrade pipeline — typically because they already have
discovery, telemetry, and packaging, and just want a fast, hardened
apply core.

## When to use binpatch as a library vs. the GitHub Action

| Use case | Pick |
|----------|------|
| You ship a CLI that self-updates | **Library** — call `resolveAndApply` from your binary's upgrade flow |
| You publish a binary from CI and want users to delta-upgrade | **Action + library** — Action publishes patches, library resolves and applies |
| You want to inspect or pre-validate patches before publishing | **Library** — call `parsePatchHeader` in CI to check `newSize` etc. |
| You write your own patch generator (not `bsdiff`) | **Library** — as long as your output is TRDIFF10, `applyPatchChainInMemory` consumes it |

## Minimal integration

```ts
import { resolveAndApply, ghcrSource, type ProgressEvent } from "binpatch";
import { readFile, writeFile, chmod, rename } from "node:fs/promises";

async function selfUpdate(currentVersion: string, targetVersion: string) {
  const source = ghcrSource({
    registry: "https://ghcr.io",
    repo: "your-org/your-cli",
    userAgent: "your-cli/1.2.3",
    binaryName: "your-cli-linux-x64",
    targetTag: (v) => `nightly-${v}`,
    compareVersions: semver.compare,
    fetch: yourCustomFetch,
  });

  const result = await resolveAndApply({
    source,
    currentVersion,
    targetVersion,
    oldPath: process.execPath,
    destPath: `${process.execPath}.new`,
    signal: AbortSignal.timeout(120_000),
    onProgress: (event: ProgressEvent) => {
      // ... your own progress UI ...
    },
  });

  if (!result) {
    // No chain usable — fall back to full download.
    const freshBin = await downloadFull(targetVersion);
    await installBinary(freshBin);
    return { status: "full-download" };
  }

  // Verify the SHA-256 against your expected value (from registry metadata).
  if (result.sha256 !== expectedSha256) {
    throw new Error(`SHA-256 mismatch: ${result.sha256}`);
  }

  // The result was already written to destPath by `resolveAndApply`.
  await installBinaryAt(process.execPath, `${process.execPath}.new`);
  return { status: "patched", chainLength: result.chainLength };
}

async function installBinaryAt(target: string, newPath: string) {
  await chmod(newPath, 0o755);
  // Atomic rename. On Windows this needs a different approach
  // (rename + cleanup-on-next-startup pattern).
  await rename(newPath, target);
}
```

## Wiring telemetry

Most library consumers have their own tracing system. Wire the
events to it:

```ts
import * as Sentry from "@sentry/node";
import { resolveAndApply, type ProgressEvent } from "binpatch";

await resolveAndApply({
  // ...
  onProgress: (event: ProgressEvent) => {
    // The library wraps your handler in try/catch, so this can throw
    // safely; but if you want telemetry attributes on each event,
    // start a span here and end it on the `done` event.
    Sentry.addBreadcrumb({
      category: "binpatch",
      level: "info",
      data: event,
    });
  },
  telemetry: {
    onResolved: ({ source }) => Sentry.setTag("delta.source", source),
    onUnavailable: (reason) => Sentry.setTag("delta.unavailable_reason", reason),
    onOfflineMiss: () => Sentry.captureMessage("offline cache miss"),
  },
});
```

For per-HTTP granularity (each OCI request wrapped in a span), pass
`instrument` to your source — see [Instrumentation](/telemetry/).
`startSpan` (Sentry) and `startActiveSpan` (OpenTelemetry) are
both compatible with the `InstrumentHook` shape.

## Cross-platform install

`process.execPath` differs per platform:

- **macOS / Linux**: a normal file. Atomic rename via `rename(2)`.
  On Linux, use `renameat2` with `RENAME_EXCHANGE` for true
  atomicity if you have it.
- **Windows**: the running executable can't be replaced while it's
  held open. Rename to `<name>.old`, install new as `<name>`, and
  leave the old file in place for cleanup on next run.

`binpatch` does not provide cross-platform install helpers —
that's consumer territory. The library's responsibility ends with
writing to `destPath` and returning a SHA-256 that you've verified.

## Restarting the process

After `installBinary`, the in-memory code path is still pointing at
the old binary on disk. You need to either:

- **Re-exec** — `process.execPath` + current args + `process.execve(...)`.
  Works on POSIX; needs `CreateProcess` + `ExitProcess` dance on
  Windows.
- **Exit and let the caller restart** — call `process.exit(0)` and
  trust the caller (a shell, a wrapper script, the user) to relaunch.

Most CLI tools pick exit-and-caller-restarts — simpler, more
debuggable.

## Caching

`resolveAndApply` accepts a `cache` field for on-disk patch
caching:

```ts
import { makeCache } from "binpatch";
import { join } from "node:path";
import { homedir } from "node:os";

const cacheRoot = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
const cache = makeCache(join(cacheRoot, "myapp", "patches"));

await resolveAndApply({
  // ...
  cache,
});
```

`makeCache` creates the directory with `mode: 0o700` (owner-only).
If your environment uses a different cache location (Windows: `%APPDATA%`,
macOS sandbox: `~/Library/Containers/<bundle>/Data/Library/Caches/...`),
pass the appropriate path.

## Multi-platform consumers

If your CLI ships binaries for multiple platforms, each platform
publishes its own patches with a per-platform layer title
(`<binaryName>.patch`). On the consumer side, pick the right layer
based on `process.platform` and `process.arch`:

```ts
const platformKey = `${process.platform}-${process.arch}`;
// or: `${process.platform}-${process.arch}${process.platform === "win32" ? ".exe" : ""}`
```

Then pass `binaryName: `${yourBinary}-${platformKey}`` to
`ghcrSource()`.

## Versioning

`binpatch` follows [semver](https://semver.org/). Major bumps happen
when:

- A `SourceStrategy` interface change breaks existing consumers.
- A wire format change requires a fresh apply core (rare — the
  TRDIFF10 format is stable).

Minor bumps happen when:

- A new source type is added (e.g. `s3Source()`).
- New instrumentation hook names are added.
- New event types are added (existing types remain stable).

Patch bumps happen for everything else (defensive guards, perf
improvements, bug fixes).

## Next

- [Wire Contract →](/wire-contract/) — exact file format
- [Security →](/security/) — verification, OOM guard, timeouts
- [Architecture →](/architecture/) — design decisions
