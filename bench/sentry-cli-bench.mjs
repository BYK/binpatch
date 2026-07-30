#!/usr/bin/env -S node --no-warnings
// SPDX-License-Identifier: MIT
//
// Reproducible benchmark: measure full gzipped download vs binpatch delta
// download for the real Sentry CLI (getsentry/cli) — Node SEA binaries.
//
// What it does:
//   1. Downloads `sentry-linux-x64.gz` and `sentry-linux-x64.patch` for a
//      series of adjacent released version pairs from getsentry/cli.
//   2. Each `.patch` is the published binpatch TRDIFF10/bsdiff+zstd — exactly
//      what a self-updating binary would pull.
//   3. Measures: gzipped full size, patch size, binpatch apply time, and
//      SHA-256-verifies that the applied patch matches the upstream binary.
//
// Default mode iterates 8 adjacent release pairs (0.29.0 → 0.39.0) and
// reports the per-pair ratio plus an aggregate (median, mean, min, max).
// Set FROM/TO env vars to benchmark a single pair instead.
//
// Run with:  node bench/sentry-cli-bench.mjs
// Requires:  Node >= 22 (uses node:zlib.gunzipSync), internet access,
//            binpatch's dist/ already built (`pnpm run build` at the repo root).

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

import { applyPatchChainInMemory } from "../dist/index.js";

const ORG = "getsentry";
const REPO = "cli";
const ASSET = "sentry-linux-x64";

const DEFAULT_PAIRS = [
  ["0.29.0", "0.30.0"],
  ["0.30.0", "0.31.0"],
  ["0.32.0", "0.33.0"],
  ["0.33.0", "0.34.0"],
  ["0.35.0", "0.36.0"],
  ["0.36.0", "0.37.0"],
  ["0.37.0", "0.38.0"],
  ["0.38.0", "0.39.0"],
];

const singleMode = process.env.FROM && process.env.TO;
const pairs = singleMode
  ? [[process.env.FROM, process.env.TO]]
  : DEFAULT_PAIRS.map(([from, to]) => [from, to]);

const c = (s) => `\x1b[36m${s}\x1b[0m`;
const g = (s) => `\x1b[32m${s}\x1b[0m`;
const y = (s) => `\x1b[33m${s}\x1b[0m`;
const b = (s) => `\x1b[1m${s}\x1b[0m`;

const url = (version, ext) =>
  `https://github.com/${ORG}/${REPO}/releases/download/${version}/${ASSET}${ext}`;

async function fetchTo(path, u) {
  const r = await fetch(u, { redirect: "follow" });
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  await writeFile(path, new Uint8Array(await r.arrayBuffer()));
}

async function measurePair(from, to) {
  const [gzBytes, patchBytes] = await Promise.all([
    readFile(`${ASSET}-${to}.gz`),
    readFile(`${ASSET}-${to}.patch`),
  ]);
  const oldGzBytes = await readFile(`${ASSET}-${from}.gz`);
  const oldRaw = gunzipSync(oldGzBytes);
  await writeFile(`${ASSET}-${from}`, oldRaw);

  const dest = `${ASSET}-${to}.applied`;
  const t0 = performance.now();
  const sha = await applyPatchChainInMemory(
    `${ASSET}-${from}`,
    [patchBytes],
    dest,
    () => {},
  );
  const applyMs = performance.now() - t0;

  // Verify by re-decompressing the published `.gz` and comparing SHAs.
  const upstreamSha = createHash("sha256").update(gunzipSync(gzBytes)).digest("hex");
  const verified = sha === upstreamSha;

  await writeFile(`${ASSET}-${from}.gz.sha`, `${upstreamSha}\n`);
  await writeFile(`${ASSET}-${to}.applied.sha`, `${sha}\n`);

  return {
    from,
    to,
    gzBytes: gzBytes.length,
    patchBytes: patchBytes.length,
    ratio: patchBytes.length / gzBytes.length,
    applyMs: Math.round(applyMs),
    verified,
  };
}

function fmtMb(b) {
  return (b / 1024 / 1024).toFixed(2);
}

function pct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

console.log(b(`\n  getsentry/cli — ${pairs.length} adjacent release pair(s)\n`));

const tTotal = performance.now();
const needsFetch = pairs.flatMap(([from, to]) => [
  fetchTo(`${ASSET}-${to}.gz`, url(to, ".gz")),
  fetchTo(`${ASSET}-${to}.patch`, url(to, ".patch")),
  fetchTo(`${ASSET}-${from}.gz`, url(from, ".gz")),
]);
await Promise.all(needsFetch);
console.log(c("  ✓ downloaded"));

const results = [];
for (const [from, to] of pairs) {
  try {
    const r = await measurePair(from, to);
    results.push(r);
    console.log(
      `  ${from} → ${to}   ` +
        `gz=${y(fmtMb(r.gzBytes) + " MB")}   ` +
        `patch=${g(fmtMb(r.patchBytes) + " MB")}   ` +
        `ratio=${g(pct(r.ratio))}   ` +
        `apply=${r.applyMs}ms   ` +
        `${r.verified ? g("✓") : y("✗")}`,
    );
  } catch (e) {
    console.log(`  ${from} → ${to}   ${y("SKIP")} (${e.message})`);
  }
}

const ratios = results.map((r) => r.ratio);
const sortRatios = [...ratios].sort((a, b) => a - b);
const median = sortRatios[Math.floor(sortRatios.length / 2)];
const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
const min = Math.min(...ratios);
const max = Math.max(...ratios);
const avgGz = results.reduce((a, r) => a + r.gzBytes, 0) / results.length;
const avgPatch = results.reduce((a, r) => a + r.patchBytes, 0) / results.length;

console.log(b(`\n  Summary across ${results.length} release pair(s)\n`));
console.log(`  median ratio        ${g(pct(median))}  (typical patch size)`);
console.log(`  mean ratio          ${g(pct(mean))}`);
console.log(`  range               ${y(pct(min))}  —  ${y(pct(max))}`);
console.log(`  avg gz full         ${y(fmtMb(avgGz) + " MB")}`);
console.log(`  avg patch           ${g(fmtMb(avgPatch) + " MB")}`);
console.log(`  total wall          ${((performance.now() - tTotal) / 1000).toFixed(2)} s\n`);

const out = {
  pairs: results,
  aggregate: {
    count: results.length,
    medianRatio: median,
    meanRatio: mean,
    minRatio: min,
    maxRatio: max,
    avgFullBytes: Math.round(avgGz),
    avgPatchBytes: Math.round(avgPatch),
  },
};
console.log(b("  emitted JSON (for graph generation):"));
console.log(JSON.stringify(out, null, 2));

const anyFailed = results.some((r) => !r.verified);
process.exit(anyFailed ? 1 : 0);