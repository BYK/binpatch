# Changelog

All notable changes to `binpatch` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **`applyReaderToFile` now closes the output fd synchronously.** Previously,
  the function used `fs.createWriteStream` and awaited `writer.end()`. Node
  resolves the `end` callback on the `'finish'` event (data flushed) but the
  underlying fd can still be held at the kernel level after the callback
  fires. On Linux, a subsequent `spawn` (which calls `execve`) of the output
  file then fails with `ETXTBSY` ("text file busy") — the `fs.writeFile`
  pattern closes the fd synchronously before returning, which is why the
  bug only surfaced after a delta fallback to full-download. Replaced with
  `fs.openSync` + `fs.writeSync` + `fs.closeSync`. See the [Security →
  /security/#output-fd-release](/security/#output-fd-release) page for the
  new guarantee.

### Documentation

- Clarified that the OCI patch manifest's `from-version` annotation is a
  **chain pointer, not a content hash**. `applyPatchChainInMemory` verifies
  only the final output SHA; it cannot detect a publish-pipeline bug where
  the annotation claims one source but the patch bytes were generated from
  a different source. **The publish pipeline MUST guarantee the annotation
  matches the actual patch source** — recomputing `PREV_TAG` independently
  in two CI jobs (e.g. a generate job and a publish job) is a bug. See
  [Security → /security/#from-version-annotation-trust](/security/#from-version-annotation-trust).
- Documented the synchronous output-fd release guarantee so consumers
  know they can `spawn` the apply output without racing ETXTBSY.
- Reposition homepage to lead with "any binary" framing (Electron apps, CLIs,
  agents, game updaters) instead of CLI-only. Hero now features a measured
  download comparison chart for getsentry/cli 0.29.0 → 0.39.0 (8 adjacent
  release pairs, sentry-linux-x64). The typical (median) patch is 4.0%
  the size of the full gzipped binary — 1.32 MB vs 31.38 MB, 96% saved per
  update. Range across the 8 pairs: 0.9% (small fixes) to 8.1% (big
  features).
- Add "View as Markdown" link in the page footer. Each page now exposes its
  raw markdown source at `/<slug>.md` — implemented via a Starlight
  component override and an Astro API endpoint, both base-path aware so
  PR previews keep working.

## [0.3.1] - 2026-07-27

- Guard chain discovery against malformed/incomparable version tags (no longer
  throws when a nightly patch tag has an unparseable semver).

## [0.3.0] - 2026-07-25

- Add `InstrumentHook` so consumers can wrap every HTTP call (for telemetry /
  tracing) without losing per-request granularity.
- Bump to minor (additive) — no breaking changes.

## [0.2.0] - 2026-07-24

- Add injectable `fetch` to `OciClient` / `ghcrSource` so consumers can supply a
  custom fetch implementation (custom CA / proxy / test injection).
- Bump to minor (additive) — no breaking changes.

## [0.1.0] - 2026-07-23

- Initial release: reusable binary delta-update engine.
  - `bspatch` core (BSDIFF-style patch application, memory + streaming).
  - Chain discovery from GHCR (nightly) and GitHub Releases (stable).
  - Patch cache with SHA-256 verification.
  - Composite GitHub Action (`packages/binpatch/action`) for delta-patch
    generate + publish.
