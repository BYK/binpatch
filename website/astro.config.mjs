import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// Allow base path override via env var for the site-deploy workflow's
// PR previews (`/_preview/pr-<n>/binpatch/`). Production serves from
// `/binpatch/` (subpath of the user's GitHub Pages domain).
const base = process.env.DOCS_BASE_PATH || "/binpatch/";

export default defineConfig({
  site: "https://byk.github.io",
  base,
  integrations: [
    starlight({
      title: "binpatch",
      description:
        "Reusable binary delta-update engine — TRDIFF10 apply, pluggable chain discovery, and a GitHub Action for end-to-end patch generation.",
      logo: {
        src: "./src/assets/logo.svg",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/BYK/binpatch",
        },
        { icon: "npm", label: "npm", href: "https://www.npmjs.com/package/binpatch" },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "" },
            { label: "Installation", slug: "installation" },
            { label: "Quickstart", slug: "getting-started" },
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "Wire Contract", slug: "wire-contract" },
            { label: "Architecture", slug: "architecture" },
            { label: "Security", slug: "security" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Applying patches", slug: "apply" },
            { label: "Discovering chains", slug: "discover" },
            { label: "Progress & events", slug: "progress" },
            { label: "Custom fetch / CA", slug: "custom-fetch" },
            { label: "Instrumentation hook", slug: "telemetry" },
          ],
        },
        {
          label: "CI Integration",
          items: [
            { label: "GitHub Action", slug: "github-action" },
            { label: "Library integration", slug: "ci-integration" },
          ],
        },
        {
          label: "Resources",
          items: [
            { label: "FAQ", slug: "faq" },
            { label: "Contributing", slug: "contributing" },
          ],
        },
      ],
      customCss: [],
    }),
  ],
});
