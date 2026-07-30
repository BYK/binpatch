---
title: binpatch
description: Ship binary updates that download a patch instead of the whole file. binpatch generates and applies TRDIFF10 (bsdiff+zstd) deltas — the same engine getsentry/cli uses to self-update.
template: splash
hero:
  tagline: Every binary update re-downloads the whole file. Patch only what moved — Electron apps, CLIs, agents, anything that's a single-file artifact.
  actions:
    - text: Get Started
      link: /installation/
      icon: right-arrow
    - text: View on GitHub
      link: https://github.com/BYK/binpatch
      icon: external
      variant: minimal
---

import { Card, CardGrid, Tabs, TabItem } from "@astrojs/starlight/components";

## The download size that doesn't scale

You ship a 100&nbsp;MB Electron app, a 50&nbsp;MB CLI, a 200&nbsp;MB game updater —
whatever it is, your users download **the whole thing every time you push a
release**. A bug fix that touched a few hundred kilobytes costs them another
full download. Over a fleet, that's terabytes of redundant transfer and minutes
of waiting for bytes that didn't move.

A binary delta (compressed [bsdiff](https://www.daemonology.net/bsdiff/))
captures just the difference between the old and new builds — typically
**0.05–0.1%** of the full size for typical small releases. Here's what that
looks like for a real update of a real binary:

![Download comparison: 31.83 MB full gzipped binary vs 2.58 MB binpatch patch — 8.1% of the original, 92% saved per update. Measured on getsentry/cli 0.38.0 → 0.39.0 (sentry-linux-x64).](/size-comparison.svg)

The numbers above are from [`bench/sentry-cli-bench.mjs`](https://github.com/BYK/binpatch/blob/main/bench/sentry-cli-bench.mjs)
— it downloads two adjacent Sentry CLI releases from
[getsentry/cli](https://github.com/getsentry/cli), applies the published patch,
and verifies the SHA-256 of the reconstructed binary. Run it yourself any time.

## The catch: deltas need two halves

A patch is useless without both:

1. **Generate** — produce the patch from `old → new` in CI, and publish it
   somewhere your users can find it.
2. **Apply** — discover the right patch(es) for the user's installed version,
   download them, and reconstruct the new binary safely (integrity checks,
   size caps, progress).

And if the user is **several versions behind**, they don't get a single patch —
they get a *chain* of patches. binpatch chains them automatically, downloads
them **in parallel**, applies each hop **in order**, verifies the cumulative
SHA-256, and falls back to a full download if any hop is missing or malformed.

Most projects hand-roll one half and skip the other. `binpatch` gives you
**both**, as a small MIT-licensed TypeScript library plus a drop-in GitHub
Action.

## What you save

<CardGrid stagger>
  <Card title="Bandwidth" icon="cloud-download">
    ~92% fewer bytes per update for typical small releases. A 32&nbsp;MB
    full download becomes a 2.5&nbsp;MB patch — and that 92% holds whether
    you ship 5&nbsp;MB of diff or 50&nbsp;MB.
  </Card>
  <Card title="Wall time" icon="rocket">
    On slow links the savings are dramatic. At 5&nbsp;Mbps the full
    download takes ~53&nbsp;s; the patch download + apply takes ~4&nbsp;s.
    At 25&nbsp;Mbps it's ~11&nbsp;s vs ~2&nbsp;s.
  </Card>
  <Card title="CI minutes" icon="seti:config">
    bsdiff is CPU-bound on the old binary, but it runs once per release
    per platform. A 110&nbsp;MB binary diffs in under 10&nbsp;s on a
    GitHub-hosted runner — well below free-tier limits.
  </Card>
  <Card title="User patience" icon="heart">
    The fastest update is the one that finishes before the user opens
    Twitter. Patch downloads feel instantaneous on any link.
  </Card>
</CardGrid>

## How an update flows

![How an update flows: CI produces a patch from the old binary and publishes it to a registry; the user's binary downloads it (in parallel with any chain hops) and applies it to reconstruct the new binary.](/flow.svg)

The user downloads kilobytes instead of megabytes. Your CI does the heavy
lifting once.

## When to reach for binpatch

<Tabs syncKey="binary-type">
  <TabItem label="Self-updating CLI" icon="terminal">
    The classic case: a `mycli update` command downloads and applies the
    next version. Especially good fits:

    - **[Bun](https://bun.com/docs/bundler/fullstack#single-file-executable)
      (`bun build --compile`)** — embed a JS/TS entry into a standalone
      executable.
    - **[Deno](https://docs.deno.com/runtime/reference/cli/compile/)
      (`deno compile`)** — Deno's equivalent.
    - **[Node SEA](https://nodejs.org/api/single-executable-applications.html)**
      (`node --experimental-sea-config` + `node --build`) — freeze a Node
      binary with your app's prepended scripts.
    - **[yao-pkg / @yao-pkg/pkg](https://yao-pkg.github.io/pkg/)** — ship
      a virtual filesystem as a Node fork.
    - **[Fossilize](https://github.com/GoogleChromeLabs/fossilize)** for
      native code with an embedded V8 snapshot.

    Powers self-updates in production for shipped CLI binaries you may
    already be using — including Sentry's own
    [getsentry/cli](https://github.com/getsentry/cli).
  </TabItem>
  <TabItem label="Electron / Tauri app" icon="laptop">
    Every auto-update today fetches the full `.dmg` / `.exe` / `.AppImage`.
    If your unpacked app is 80–200&nbsp;MB, that's a lot of redundant
    transfer per release. binpatch works the same way: ship a TRDIFF10
    patch alongside the full artifact, and your updater picks the patch
    when the old version is known.

    The wire format and discovery (`ghcrSource` / `githubReleaseSource`)
    are generic — point them at your updater's existing release channel.
  </TabItem>
  <TabItem label="Agent / daemon binary" icon="seti:robot">
    Long-running agents (deploy agents, observability daemons, ML
    inference runtimes) update in-place without a restart. The patch
    download is small enough to do opportunistically on every poll, and
    apply time is predictable (~6&nbsp;s per hop on the Sentry CLI
    binary).
  </TabItem>
  <TabItem label="Game / native updater" icon="star">
    Game launchers, native installers, anything that ships as a single
    artifact. As long as you can identify the user's installed version,
    binpatch can deliver a delta. Native binaries with lots of relocatable
    code compress especially well — sub-1% patches are common.
  </TabItem>
</Tabs>

**Skip it when:** updates are source-level (use `git`, `npm update`); your
binary is tiny enough that the wire overhead isn't worth it; or you can't
ship the *old* binary alongside the *new* one for the diff to be computed
in CI.

## Get started

```bash
npm install binpatch
```

Then **both**: generate patches from CI with the
[GitHub Action](/github-action/) (so nightly builds push to GHCR and
stable releases push to GitHub Releases), *and* wire
[`resolveAndApply`](/getting-started/) into your binary's update command
to discover and apply them.

```ts
import { resolveAndApply } from "binpatch";

const result = await resolveAndApply({
  currentVersion: "1.2.0",
  targetVersion: "1.3.4",
  source: ghcrSource({ repo: "myorg/mycli" }),
});
// result.destPath now holds the verified 1.3.4 binary; download was ~70 KB.
```