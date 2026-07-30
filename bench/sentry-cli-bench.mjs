#!/usr/bin/env -S node --no-warnings
// SPDX-License-Identifier: MIT
//
// Reproducible benchmark: measure full gzipped download vs binpatch delta
// download for the real Sentry CLI (getsentry/cli) — Node SEA binaries.
//
// What it does:
//   1. Downloads `sentry-linux-x64.gz` for two adjacent released versions
//      from getsentry/cli's GitHub Releases.
//   2. Downloads the published `.patch` (binpatch TRDIFF10/bsdiff+zstd) for
//      the same pair — this is exactly what a self-updating binary would
//      pull, published by the upstream maintainer.
//   3. Measures: gzipped full size, patch size, gzipped decompress time,
//      binpatch apply time. SHA-256 verifies correctness.
//
// Run with:  node bench/sentry-cli-bench.mjs
// Requires:  Node >= 22 (uses node:zlib.gunzipSync), internet access,
//            binpatch's dist/ already built (`pnpm --filter binpack run build`
//            or `pnpm run build` at the repo root).

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

import { applyPatchChainInMemory } from "../dist/index.js";

const ORG = "getsentry";
const REPO = "cli";
const FROM = process.env.FROM ?? "0.38.0";
const TO = process.env.TO ?? "0.39.0";
const ASSET = "sentry-linux-x64";

const c = (s) => `\x1b[36m${s}\x1b[0m`;
const g = (s) => `\x1b[32m${s}\x1b[0m`;
const y = (s) => `\x1b[33m${s}\x1b[0m`;
const b = (s) => `\x1b[1m${s}\x1b[0m`;

const url = (version, asset, ext = "") =>
  `https://github.com/${ORG}/${REPO}/releases/download/${version}/${asset}${ext}`;

async function fetchTo(path, u) {
  const r = await fetch(u, { redirect: "follow" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${u}`);
  await writeFile(path, new Uint8Array(await r.arrayBuffer()));
}

console.log(b(`\n  getsentry/cli ${FROM} → ${TO} (${ASSET})\n`));

const t0 = performance.now();
await Promise.all([
  fetchTo(`${ASSET}-${TO}.gz`, url(TO, ASSET, ".gz")),
  fetchTo(`${ASSET}-${TO}.patch`, url(TO, ASSET, ".patch")),
  fetchTo(`${ASSET}-${FROM}.gz`, url(FROM, ASSET, ".gz")),
]);
console.log(c("  ✓ downloaded"));

const [gzBytes, patchBytes, oldGzBytes] = await Promise.all([
  readFile(`${ASSET}-${TO}.gz`),
  readFile(`${ASSET}-${TO}.patch`),
  readFile(`${ASSET}-${FROM}.gz`),
]);
// Decompress the old binary once so applyPatchChainInMemory sees raw bytes.
const oldRaw = gunzipSync(oldGzBytes);
await writeFile(`${ASSET}-${FROM}`, oldRaw);

console.log(
  `  full (gzipped)        ${y((gzBytes.length / 1024 / 1024).toFixed(2) + " MB")}  ` +
    `(${gzBytes.length.toLocaleString()} B)`,
);
console.log(
  `  patch (TRDIFF10)      ${g((patchBytes.length / 1024 / 1024).toFixed(2) + " MB")}  ` +
    `(${patchBytes.length.toLocaleString()} B)`,
);
console.log(
  `  raw decompressed      ${(oldRaw.length / 1024 / 1024).toFixed(2)} MB  ` +
    `(${oldRaw.length.toLocaleString()} B)`,
);
console.log(
  `  ratio (patch / full)  ${g(((patchBytes.length / gzBytes.length) * 100).toFixed(2) + "%")}`,
);

const dest = `${ASSET}-${TO}.applied`;
const tDecompressStart = performance.now();
const fullDecompressed = gunzipSync(gzBytes);
const tDecompress = performance.now() - tDecompressStart;

const tApplyStart = performance.now();
const sha = await applyPatchChainInMemory(
  `${ASSET}-${FROM}`,
  [patchBytes],
  dest,
  () => {},
);
const tApply = performance.now() - tApplyStart;

const appliedBytes = await readFile(dest);
const expectedSha = createHash("sha256").update(gunzipSync(gzBytes)).digest("hex");
const verified = sha === expectedSha;

console.log("");
console.log(`  gz decompress         ${y((tDecompress / 1000).toFixed(2) + " s")}`);
console.log(`  binpatch apply        ${g((tApply / 1000).toFixed(2) + " s")}`);
console.log(`  apply + sha verify    ${verified ? g("✓ ok") : y("✗ mismatch")}`);
console.log(
  `  applied sha-256       ${sha.slice(0, 16)}…  ${verified ? "" : `(expected ${expectedSha.slice(0, 16)}…)`}`,
);
console.log(b(`\n  total wall            ${((performance.now() - t0) / 1000).toFixed(2)} s\n`));

console.log(b("  emitted JSON (for graph generation):"));
const out = {
  from: FROM,
  to: TO,
  asset: ASSET,
  full: {
    raw: oldRaw.length,
    gzipped: gzBytes.length,
    decompressMs: Math.round(tDecompress),
  },
  patch: {
    bytes: patchBytes.length,
    applyMs: Math.round(tApply),
    verified,
  },
  ratio: patchBytes.length / gzBytes.length,
};
console.log(JSON.stringify(out, null, 2));

if (!verified) {
  spawnSync("rm", ["-f", dest]);
  process.exit(1);
}