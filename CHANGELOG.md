# Changelog

All notable changes to `binpatch` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Documentation

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
