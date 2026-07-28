# BinPatch logo brief

## What the logo must say

BinPatch is about **turning a giant binary download into a tiny patch**. The
core metaphor: two near-identical binary blobs, stitched together by a small
"patch" seam. The patch is the product.

## Current SVG (already in repo, `website/src/assets/logo.svg`)

Two rounded rectangles (teal = old binary, amber = new binary) with a white
"stitched seam" of 4 dots + dashes between them. It reads correctly but is
flat/low-detail. We want a richer raster version for the README hero, social
cards, and favicon.

## Prompt for Nano Banana / Google image generation

Use this verbatim (tune the style word in [brackets] to taste):

> A minimalist app-icon logo for a developer tool called "BinPatch".
> Concept: TWO chunky rounded-square "binary" blocks side by side — the left
> one in teal (#2EC4B6), the right one in amber (#FF9F1C) — representing the
> OLD and NEW versions of a compiled binary. Between them, a crisp white
> "patch seam": a vertical strip of 4 small stitches (dash-dot-dash-dot) like
> a software patch being sewn, connecting the two blocks. The seam is the
> focal point. Near-black background (#0B0D10), soft ambient glow. Flat
> vector-style [isometric / front-facing / 2.5D] with subtle long shadows,
> no text, no letters, centered composition, generous negative space.
> Clean, modern, GitHub-xcode-meets-Vercel aesthetic. High contrast,
> recognizable at 32x32.

### Negative prompts (what to avoid)
- No text, no "binpatch" wordmark in the image (keep the name as separate type)
- No generic "puzzle piece" or "git merge" clichés
- No gradients soup / cyberpunk neon
- No photographic realism — keep it icon-flat

## Where the result goes
1. `website/src/assets/logo-raster.png` — the generated 1024² master.
2. Favicon: `npx pwa-asset-generator` or just resize to 32/64/180/512.
3. README hero image (top of `README.md`).
4. Optionally a social preview (`og-image`) — Astro can generate via
   `astro-og-canvas` if desired later.

## Acceptance
- The two-block + seam metaphor is unmistakable at a glance.
- Amber/teal palette matches the site (`#FF9F1C`, `#2EC4B6`, `#0B0D10`).
- Looks good small (favicon) and large (README hero).
