/**
 * Astro integration: generate Open Graph social-share images at build/dev
 * time, with content-hashed filenames so the URL changes whenever the
 * image does (CDN/validator caches bust automatically).
 *
 * The image is a 1200x630 PNG assembled from the project logo + headline
 * + tagline + CTA — the same shape Twitter/Facebook/LinkedIn unfurl previews.
 * See https://github.com/byk/loreai (integrations/favicon-assets.ts) for
 * the template this was adapted from.
 */
import type { AstroIntegration } from "astro";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OG_IMAGE_PREFIX = "og-image";
const OG_IMAGE_EXTENSION = "png";
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const OG_HEADLINE = "Patch only what moved";
const OG_TAGLINE = "Up to 96% smaller updates for any binary.";
const OG_CTA = "binpatch.p.byk.im";

// Background and text colors picked from the binpatch logo brand palette
// (the logo's dark variant uses #0b0d10 as the fill and #f7f5f0 as the
// "stitch" color). Tagline uses a cool gray that contrasts against the
// near-black background without competing with the headline.
const OG_BG_COLOR = "#0b0d10";
const OG_HEADLINE_COLOR = "#f7f5f0";
const OG_TAGLINE_COLOR = "#b8c0c4";
const OG_CTA_COLOR = "#2ec4b6"; // teal accent from the logo

// Path to the JSON sidecar that exposes the current hashed filename to
// Astro components as a normal TS module. Lives in src/ so Astro bundles
// it (no runtime fetch, no public-cache problem). Gitignored — regenerated
// on every build.
const OG_IMAGE_MANIFEST = "src/generated/og-image.json";
const OG_IMAGE_MANIFEST_DIR = "src/generated";

const LOGO_SOURCE = "src/assets/logo.svg";

/**
 * Hash the OG image and write it as og-image-{hash}.png into public/.
 * The hash is content-derived, so any change to the image produces a
 * new URL — no upstream cache (CDN, validator, scraper) can serve a
 * stale version of the wrong image.
 */
async function writeOgImage(publicDir: string, buf: Buffer): Promise<string> {
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 8);
  const file = `${OG_IMAGE_PREFIX}-${hash}.${OG_IMAGE_EXTENSION}`;
  await writeFile(resolve(publicDir, file), buf);
  return file;
}

async function generate(root: string): Promise<void> {
  const publicDir = resolve(root, "public");
  await mkdir(publicDir, { recursive: true });

  // 1. Load the logo SVG. The library logo is already on a dark
  //    background with brand colors, so we embed it directly — no
  //    recoloring needed.
  const logoRaw = await readFile(resolve(root, LOGO_SOURCE), "utf8");
  const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoRaw).toString("base64")}`;

  // 2. Compose the OG SVG. Layout (px from top):
  //    y=110   logo top (large, 200x200)
  //    y=400   headline baseline (large, bold)
  //    y=460   tagline baseline
  //    y=555   CTA baseline (teal accent)
  //    The logo sits above the headline, separated by a comfortable
  //    gap so the headline reads as the focal point. Headline is full
  //    width with no logo overlap.
  const padX = 90;
  const logoSize = 200;
  const headlineSize = 72;
  const taglineSize = 36;
  const ctaSize = 32;

  const logoY = 110;
  const headlineY = 410;
  const taglineY = 470;
  const ctaY = 555;

  const fullSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg"
         xmlns:xlink="http://www.w3.org/1999/xlink"
         width="${OG_WIDTH}" height="${OG_HEIGHT}">
      <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="${OG_BG_COLOR}" />
      <!-- Logo top-left. Wrapped in <g transform> because sharp's
           librsvg backend silently ignores x/y on <image> elements
           with data: URIs. We also set BOTH width and height
           explicitly: when only height is set, librsvg computes the
           proportional width from the source viewBox and centers the
           image horizontally. -->
      <g transform="translate(${padX}, ${logoY})">
        <image xlink:href="${logoDataUri}"
               width="${logoSize}" height="${logoSize}" />
      </g>
      <text x="${padX}" y="${headlineY}"
            font-family="Inter, Arial, Helvetica, sans-serif"
            font-size="${headlineSize}"
            font-weight="700"
            fill="${OG_HEADLINE_COLOR}">${OG_HEADLINE}</text>
      <text x="${padX}" y="${taglineY}"
            font-family="Inter, Arial, Helvetica, sans-serif"
            font-size="${taglineSize}"
            font-weight="400"
            fill="${OG_TAGLINE_COLOR}">${OG_TAGLINE}</text>
      <text x="${padX}" y="${ctaY}"
            font-family="Inter, Arial, Helvetica, sans-serif"
            font-size="${ctaSize}"
            font-weight="700"
            fill="${OG_CTA_COLOR}">${OG_CTA}</text>
    </svg>
  `);

  const ogBuffer = await sharp(fullSvg, { density: 384 })
    .resize(OG_WIDTH, OG_HEIGHT)
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();

  const ogFilename = await writeOgImage(publicDir, ogBuffer);

  // Write a JSON sidecar that exposes the current hashed filename to
  // Astro components as a normal TS module. Lives in src/ so Astro
  // bundles it (no runtime fetch, no public-cache problem). Gitignored
  // — regenerated on every build alongside the PNG itself.
  const generatedDir = resolve(root, OG_IMAGE_MANIFEST_DIR);
  await mkdir(generatedDir, { recursive: true });
  await writeFile(
    resolve(root, OG_IMAGE_MANIFEST),
    `${JSON.stringify({ filename: ogFilename }, null, 2)}\n`,
  );
}

export function socialAssets(): AstroIntegration {
  return {
    name: "social-assets",
    hooks: {
      "astro:config:setup": async ({ config }) => {
        await generate(fileURLToPath(config.root));
      },
    },
  };
}

/**
 * Eagerly generate the OG asset and return its hashed filename.
 * astro.config.mjs calls this at the top of the file so the Starlight
 * `head` array (which is evaluated synchronously at config-load time)
 * can reference the same hashed URL that the rest of the build uses.
 */
export async function generateAssetsEagerly(root: string): Promise<{ ogFilename: string }> {
  await generate(root);
  const { readFile } = await import("node:fs/promises");
  const manifest = JSON.parse(
    await readFile(resolve(root, OG_IMAGE_MANIFEST), "utf8"),
  );
  return { ogFilename: manifest.filename };
}
