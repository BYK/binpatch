---
title: binpatch
description: Ship binary updates that download a patch instead of the whole file. binpatch generates and applies bsdiff+zstd deltas — the same engine getsentry/cli uses to self-update.
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

<img
  src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/size-comparison.svg`}
  alt="Measured on getsentry/cli 0.29.0 to 0.39.0. The typical (median) patch is 4.0% the size of the full gzipped binary — 1.32 MB versus 31.38 MB, saving 96% per update. Range across 8 release pairs: 0.9% (small fixes) to 8.1% (big features)."
/>

## What you save

<CardGrid stagger>
  <Card title="Bandwidth" icon="cloud-download">
    Median **96% fewer bytes per update** across 8 real `getsentry/cli`
    releases. A 31&nbsp;MB gzipped full download becomes a 1.3&nbsp;MB patch
    on a typical release — and small bug-fix releases go as low as 0.9%.
  </Card>
  <Card title="Wall time" icon="rocket">
    On slow links the savings are dramatic. At 5&nbsp;Mbps the full
    download takes ~53&nbsp;s; the patch download + apply takes ~4&nbsp;s.
    At 25&nbsp;Mbps it's ~11&nbsp;s vs ~2&nbsp;s.
  </Card>
  <Card title="User patience" icon="heart">
    The fastest update is the one that finishes before the user opens
    Twitter. Patch downloads feel instantaneous on any link.
  </Card>
</CardGrid>

## When to reach for binpatch

<Tabs syncKey="binary-type">
  <TabItem label="Self-updating CLI" icon="terminal">
    The classic case: a `mycli update` command downloads and applies the
    next version. Especially good fits:

    - <img src="https://cdn.simpleicons.org/bun" alt="Bun" width="20" height="20" style="vertical-align:-4px;margin-right:6px" /> **[Bun](https://bun.com/docs/bundler/fullstack#single-file-executable)**
      (`bun build --compile`) — embed a JS/TS entry into a standalone
      executable.
    - <img src="https://cdn.simpleicons.org/deno" alt="Deno" width="20" height="20" style="vertical-align:-4px;margin-right:6px" /> **[Deno](https://docs.deno.com/runtime/reference/cli/compile/)**
      (`deno compile`) — Deno's equivalent.
    - <img src="https://cdn.simpleicons.org/nodedotjs" alt="Node.js" width="20" height="20" style="vertical-align:-4px;margin-right:6px" /> **[Node SEA](https://nodejs.org/api/single-executable-applications.html)**
      & **[Fossilize](https://github.com/GoogleChromeLabs/fossilize)** —
      freeze a Node runtime (or V8 snapshot) with your app's prepended
      scripts. `node --experimental-sea-config` + `node --build` for
      SEA.
    - <img src="https://cdn.simpleicons.org/npm" alt="pkg" width="20" height="20" style="vertical-align:-4px;margin-right:6px" /> **[pkg](https://yao-pkg.github.io/pkg/)** — ship your
      Node.js project as one self-contained binary. No runtime install,
      no npm, just run.

    Powers self-updates in production for shipped binaries you may already
    be using — including Sentry's own
    [getsentry/cli](https://github.com/getsentry/cli).
  </TabItem>
  <TabItem label="Electron / Tauri app" icon="laptop">
    Every auto-update today fetches the full `.dmg` / `.exe` / `.AppImage`.
    binpatch works the same way: ship a small patch alongside the full
    artifact, and your updater picks the patch when the old version is
    known.

    The wire format and discovery (`ghcrSource` / `githubReleaseSource`)
    are generic — point them at your updater's existing release channel.
  </TabItem>
  <TabItem label="Agent / daemon binary" icon="seti:robot">
    Long-running agents (deploy agents, observability daemons, ML
    inference runtimes) update in-place without a restart. The patch
    download is small enough to do opportunistically on every poll, and
    apply time is predictable (~3–8&nbsp;s per hop on the Sentry CLI
    binary).
  </TabItem>
  <TabItem label="Game / native updater" icon="star">
    Game launchers, native installers, anything that ships as a single
    artifact. As long as you can identify the user's installed version,
    binpatch can deliver a delta. Native binaries with lots of relocatable
    code compress especially well — sub-1% patches are common.
  </TabItem>
</Tabs>

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
Action. See the [GitHub Action page](/github-action/) for how an end-to-end
update flows through the system.

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
// result.destPath now holds the verified 1.3.4 binary; download was ~1 MB.
```
