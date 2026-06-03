# Agentic System Design Exploration Book

A book containing ideas, design/architectural patterns, and examples for building **agent-first system & harness** from real-word case studies.

## Stack

- **Framework:** Astro + Starlight
- **Diagrams:** `astro-mermaid` (mermaid code blocks in Markdown)
- **Deploy:** Netlify (static output, config in `netlify.toml`)
- **Package manager:** pnpm

## Content

- Pages live in `src/content/docs/`.
- The sidebar is configured **manually** in `astro.config.mjs` — when adding a new
  page, wire it into the `sidebar` array (no autogenerate).
- Content model — two layers:
  - **Case Studies (OSS)** (`oss/`) — the *raw input*: architecture walkthroughs of
    real open-source agent systems & harnesses. This leads the book.
  - **Concepts & Patterns** — *synthesized* knowledge distilled from the case
    studies. Added as the library grows; create its sidebar group + folder when the
    first synthesized page lands.
