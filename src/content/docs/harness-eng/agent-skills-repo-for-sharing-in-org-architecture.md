---
title: "Architecture of a Shared Agent-Skills Repository"
---


> A design study of `openclaw/agent-skills`, written so the pattern can be
> reproduced inside another GitHub organization (e.g. RAMAAI).
>
> The concrete skills shipped here are incidental. What matters is the
> **structure**: how one repository becomes a single source of truth for
> agent workflows, and how those workflows are distributed, validated, and
> governed across many downstream repos.

---

## 1. Purpose & the core problem

Coding agents (Claude Code, Codex, OpenClaw, Pi, …) load *skills* — reusable,
named workflows described in a `SKILL.md` file. Without a shared source, every
repo ends up hand-copying long `SKILL.md` files, which then drift apart.

This repo solves exactly one problem:

```
Problem:  the same agent workflow ("review closeout", "remote validation")
          is needed in many repos, and copies drift.

Solution: write the workflow ONCE in a canonical repo, then
          install / symlink / vendor it everywhere else.
```

Three ideas carry the whole design:

1. **Single source of truth** — the canonical skill lives in exactly one place.
2. **Cheap distribution** — a tiny installer projects skills into whatever
   directory an agent reads from.
3. **A thin contract + a gate** — every skill obeys a minimal format, enforced
   by a validator and CI.

Everything below is an elaboration of those three ideas.

---

## 2. Repository layout

The real layout is deliberately flat and boring — that is a feature.

```
agent-skills/
├── README.md                  # human-facing: what, why, how to install
├── AGENTS.md                  # agent-facing: terse rules for editing skills
├── LICENSE                    # MIT
├── .gitignore
│
├── skills/                    # ← the source of truth (one folder per skill)
│   ├── agent-transcript/
│   │   ├── SKILL.md           # REQUIRED: the skill definition
│   │   └── scripts/           # optional: helper executables + tests
│   ├── autoreview/
│   │   ├── SKILL.md
│   │   └── scripts/           # autoreview, test-review-harness(.py/.ps1/.sh)
│   ├── crabbox/
│   │   └── SKILL.md           # a skill can be SKILL.md only
│   ├── handoff/
│   │   └── SKILL.md
│   └── session-viewer/
│       ├── SKILL.md
│       ├── scripts/           # session-viewer + .test.ts
│       ├── agents/            # optional: agent config (openai.yaml)
│       └── tsconfig.json
│
├── scripts/                   # ← repo tooling (NOT skills)
│   ├── install-skills         # distribution engine (Ruby)
│   ├── validate-skills        # contract enforcement (Ruby)
│   └── install-skills.test.rb # minitest for the installer
│
├── docs/assets/               # README banner image
└── .github/workflows/
    └── validate.yml           # CI gate
```

Two namespaces, cleanly separated:

- `skills/` — the **content** (the product).
- `scripts/` — the **machinery** that ships and checks that content.

There is **no manifest, registry file, or database**. The set of skills is
discovered by globbing `skills/*/SKILL.md`. The filesystem *is* the index.

---

## 3. The skill contract

### 3.1 Anatomy of a skill folder

```
skills/<name>/
├── SKILL.md        # required — the only thing that makes a folder a "skill"
├── scripts/        # optional — repeatable command logic (any language)
└── agents/         # optional — agent-runtime config (e.g. openai.yaml)
```

A folder counts as a skill **iff** it contains `SKILL.md`. That single rule is
what the installer and validator both key off of.

### 3.2 Frontmatter schema

Each `SKILL.md` opens with YAML frontmatter. The contract is intentionally tiny:

| Field         | Required | Role                                                          |
|---------------|----------|---------------------------------------------------------------|
| `name`        | yes      | Stable identifier; matches the folder name.                   |
| `description` | yes      | **Routing trigger** — when the agent should load this skill.  |
| `metadata`    | no       | Free-form map; e.g. `crabbox` carries `version: "2026-05-27"`.|

Real examples from the repo:

```yaml
---
name: autoreview
description: "Run a structured code review (Codex default, Claude optional) as a
  closeout check on a local or PR branch before commit or ship."
---
```

```yaml
---
name: crabbox
description: "Run OpenClaw remote validation on Linux, macOS, Windows, or WSL2 ..."
metadata:
  version: "2026-05-27"
---
```

The crucial design decision: **`description` is a trigger phrase, not
documentation.** It exists so the agent's router can decide *whether* to load
the skill. The operational detail lives in the body below the frontmatter. The
editing rules reinforce this — "keep descriptions short and useful for routing,"
"keep skill bodies operational rather than essay-like."

### 3.3 Why so thin

A minimal contract means:

- Almost zero friction to add a skill (make a folder, write `SKILL.md`).
- The validator can be ~50 lines.
- The format is agent-agnostic — nothing in it is Claude- or Codex-specific.

---

## 4. Distribution mechanism

The whole point is to get skills *out of this repo* and into the directory an
agent actually reads. That is the job of `scripts/install-skills` (Ruby, no
gems beyond the standard library).

### 4.1 What the installer does

1. **Discover** — glob `skills/*/SKILL.md`, take the folder names as the
   available set.
2. **Select** — install all skills, or just the ones named on the command line.
   Unknown names fail fast with the available list.
3. **Project** — for each selected skill, create a `symlink` or `copy` of
   `skills/<name>/` inside the target directory.

```
                 install-skills [--target DIR] [--mode symlink|copy] [names...]

  canonical repo                                    agent skill directory
  ─────────────                                     ─────────────────────
  skills/autoreview/  ──┐                       ┌─► ~/.agents/skills/autoreview
  skills/crabbox/     ──┼── discover ── select ─┼─► ~/.agents/skills/crabbox
  skills/handoff/     ──┘     (glob)             └─► (only what you asked for)
```

### 4.2 Target-agnostic

The installer does not know or care which agent consumes the output. The
default target is `~/.agents/skills`, but any directory works:

```sh
scripts/install-skills --target ~/.claude/skills autoreview   # Claude Code
scripts/install-skills --target ~/.codex/skills              # Codex
scripts/install-skills                                       # → ~/.agents/skills
```

This is *the* reason the design is portable: the repo defines skills; the
**target path** is what binds them to a particular agent runtime.

### 4.3 Symlink vs copy — the central tradeoff

```
  SYMLINK  (default — local development)
  ┌──────────────────────┐        ┌───────────────────────────┐
  │ ~/.claude/skills/     │  ───►  │ <repo>/skills/autoreview/  │
  │   autoreview ─────────┼─link──►│   SKILL.md  (live)         │
  └──────────────────────┘        └───────────────────────────┘
  Edit in the repo → agent sees it instantly. One source, zero drift.

  COPY  (portable / locked-down / air-gapped)
  ┌──────────────────────┐        ┌───────────────────────────┐
  │ ~/.agents/skills/     │        │ <repo>/skills/autoreview/  │
  │   autoreview          │ ◄─cp── │   SKILL.md                 │
  │   (independent files) │        └───────────────────────────┘
  └──────────────────────┘
  Snapshot in time. Survives the repo being absent. Can drift.
```

Rule of thumb baked into the README: **symlink for dev, copy for portability.**

### 4.4 Idempotent and safe

The installer is built to be re-run without surprises:

- `--list` — print available skills and exit.
- `--dry-run` — print every action (`would symlink …`, `remove …`) without
  touching the filesystem.
- skip-if-exists — refuses to clobber an existing target unless `--force`.
- `--force` — replaces an existing skill, **except** when the target's real
  path is the source itself (the `same_real_path?` guard) — it will not delete
  the canonical files by accident.

These guards are exercised by `scripts/install-skills.test.rb` (two minitest
cases: "force skips target that is source", "force copy replaces existing
symlink").

---

## 5. Source of truth vs. vendored snapshot

A subtle but important second tier. Most repos install/symlink the shared
skills. But some "flagship" repos must work for a contributor who *only cloned
that one repo* and never set up shared skills. Those repos may **vendor** a
snapshot.

```
        CANONICAL (this repo)                 DOWNSTREAM repos
        ─────────────────────                 ────────────────

        skills/autoreview/SKILL.md
              │
              │  (a) install / symlink   ┌─► dev machine: ~/.claude/skills/...
              ├──────────────────────────┤
              │                          └─► most repos: rely on installed copy
              │
              │  (b) vendored snapshot
              └──────────────────────────► flagship repo:
                       (after review)         .agents/skills/autoreview/
                                              (committed, zero-setup)
```

The governing discipline (from the README "Zero-Setup Repos" section):

- The vendored copy is a **distribution artifact, not the source of truth**.
- Edit the canonical skill here **first**; sync downstream **after review**.
- Keep the number of vendored copies small.
- Add **provenance and drift checks** when a repo vendors a snapshot.
- **Never hand-edit** a vendored copy.

This is the same mental model as a build artifact vs. source code: you change
the source and rebuild; you do not patch the binary.

---

## 6. Validation & CI

### 6.1 The contract gate — `scripts/validate-skills`

A ~50-line Ruby script that enforces section 3's contract:

```
for each skills/*/SKILL.md:
    ├─ must start with "---\n"          → else: missing YAML frontmatter
    ├─ must have a closing "---"        → else: unterminated frontmatter
    ├─ YAML must parse (safe_load)      → else: invalid YAML
    ├─ name must be a non-empty string  → else: missing name
    └─ description must be non-empty     → else: missing description

any error → print all errors, exit 1
otherwise → "validated N skills"
```

It collects *all* errors before exiting, so one run surfaces every problem.

### 6.2 The CI gate — `.github/workflows/validate.yml`

Runs on every pull request and on push to `main`. It provisions Node 22, Ruby
3.3, and Python 3.x, then runs a **polyglot** check matrix:

```
   PR / push to main
         │
         ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ 1. validate-skills                  (frontmatter contract)    │
   │ 2. ruby -c install-skills           (tooling syntax)          │
   │    ruby -c validate-skills                                    │
   │    ruby install-skills.test.rb      (installer behavior)      │
   │ 3. bash -n  ...test-review-harness  (shell helper syntax)     │
   │ 4. py_compile autoreview, harness   (python helper syntax)    │
   │ 5. node --check agent-transcript    (node helper syntax)      │
   │ 6. node --test  *.test.mjs, *.ts    (node/ts helper tests)    │
   └─────────────────────────────────────────────────────────────┘
         │
         ▼
   merge allowed only if all green
```

The insight: the repo tooling is one language (Ruby), but **skill helpers can
be in any language**, so CI syntax-checks/tests each language independently. The
contract gate guarantees skills are *loadable*; the per-language checks
guarantee their helpers are *runnable*.

---

## 7. Design principles distilled

| Principle                     | How it shows up here                                              |
|-------------------------------|-------------------------------------------------------------------|
| Single source of truth        | Canonical skill in `skills/<name>/`; everything else derives.     |
| Convention over configuration | A folder + `SKILL.md` *is* a skill. No registry to maintain.      |
| Filesystem as the index       | Discovery = `glob(skills/*/SKILL.md)`. No manifest to drift.      |
| Thin contract                 | Only `name` + `description` required; `description` is a router.  |
| Mechanism, not policy, in code| Installer is target-agnostic; *you* choose where skills land.     |
| Agent-agnostic                | Nothing Claude/Codex-specific; works for any agent that reads a dir.|
| Two-tier distribution         | Live install/symlink for dev; vendored snapshot for zero-setup.   |
| Governance as docs            | `AGENTS.md` + README "Editing Rules" encode the human rules.      |
| Polyglot helpers, single gate | Skills carry Ruby/Python/Node/Bash/PS helpers; CI checks each.    |
| Safety in tooling             | `--dry-run`, skip-if-exists, `same_real_path?` guard, tests.      |

---

## 8. Porting blueprint for RAMAAI

Goal: a `ramaai/agent-skills` repo that is the org's single source of truth for
shared agent workflows. The pattern transfers almost verbatim; below are the
decisions and the rollout.

### 8.1 Decisions to make first

| Decision           | Options                              | Recommendation for an org SaaS                          |
|--------------------|--------------------------------------|---------------------------------------------------------|
| Repo visibility    | public / **private (internal)**      | Private. This changes which "no private URL" rules apply.|
| Secrets policy     | strict / relaxed                     | Keep secrets, tokens, customer data **out** regardless. Private hostnames/internal URLs become *acceptable* but still document access requirements. |
| Target agent dirs  | `~/.claude/skills`, `~/.codex/skills`| Support whatever your engineers run; installer is already target-agnostic. |
| Distribution default| symlink vs copy                     | symlink for engineers' machines; copy/vendor for CI images and zero-setup repos. |
| Versioning         | none / `metadata.version` / git tags | Start with `metadata.version`; add release tags once skills stabilize. |

### 8.2 Minimal starter layout to reproduce

```
ramaai-agent-skills/
├── README.md                 # install instructions for RAMAAI engineers
├── AGENTS.md                 # terse editing rules (adapt from this repo)
├── skills/
│   └── <first-skill>/
│       └── SKILL.md          # name + description frontmatter
├── scripts/
│   ├── install-skills        # copy this repo's Ruby installer ~verbatim
│   └── validate-skills       # copy this repo's Ruby validator ~verbatim
└── .github/workflows/
    └── validate.yml          # contract gate + your helper languages
```

You can lift `install-skills` and `validate-skills` essentially unchanged — they
contain no OpenClaw-specific logic, only generic discover/select/project and
frontmatter-checking.

### 8.3 What to keep vs. adapt

**Keep as-is:**
- The `skills/<name>/SKILL.md` convention and the `name` + `description`
  contract.
- The target-agnostic installer with symlink/copy + `--dry-run`/`--list`/`--force`.
- The validator and the "collect all errors" behavior.
- The source-of-truth vs. vendored-snapshot discipline.
- "Repo-specific product skills stay in their own repo" — only put *general,
  reusable* workflows in the shared repo.

**Adapt:**
- Editing rules: a private org repo may reference internal hostnames/URLs, but
  should still forbid secrets and customer/PHI data. Add an SSO/access note.
- CI matrix: include only the helper languages RAMAAI actually uses, plus your
  org's standard lint/format gates.
- Add an **onboarding one-liner** to every consuming repo's `AGENTS.md`, e.g.:

  ```text
  Shared agent workflows: install or symlink
  https://github.com/ramaai/agent-skills for shared skills; do not vendor
  shared skills here unless this repo needs a zero-setup snapshot.
  ```

### 8.4 Rollout steps

```
1. Seed repo        → create ramaai/agent-skills with the starter layout.
2. Define contract  → write 1–2 real skills; lock the frontmatter schema.
3. Port installer   → copy install-skills; set default --target for your agents.
4. Port validator   → copy validate-skills; confirm it fails on a bad skill.
5. Add CI           → validate.yml: contract gate + your helper-language checks.
6. Onboard repos    → add the install/symlink one-liner to each repo's AGENTS.md.
7. (Optional) Vendor → for flagship repos, vendor .agents/skills/<name> snapshots
                       with a documented sync + drift-check step.
```

### 8.5 Optional enhancements beyond this repo

- **Versioning & releases** — populate `metadata.version`, and cut git tags so
  downstream vendored snapshots can record "synced from `vX.Y.Z`".
- **A `sync-snapshots` tool** — a script that copies canonical skills into the
  vendored `.agents/skills/<name>` of listed downstream repos and diffs them, so
  drift is detected in CI instead of by hand.
- **Provenance stamping** — when vendoring, write a small `PROVENANCE` file
  recording source commit/tag and sync date.
- **Catalog generation** — auto-generate the README "Included Skills" list from
  the `name`/`description` frontmatter so docs never drift from the skills.

---

## 9. Quick reference

### Command cheatsheet (this repo's installer/validator)

```sh
# Discover
scripts/install-skills --list

# Preview without changing anything
scripts/install-skills --dry-run

# Install all skills to the default target (~/.agents/skills)
scripts/install-skills

# Install selected skills only
scripts/install-skills autoreview crabbox

# Install to a specific agent's directory
scripts/install-skills --target ~/.claude/skills autoreview

# Use copies instead of live symlinks
scripts/install-skills --mode copy --target ~/.agents/skills

# Replace an already-installed skill
scripts/install-skills --force autoreview

# Validate the contract before committing
scripts/validate-skills
```

### Skill frontmatter template

```yaml
---
name: <kebab-case-name>            # matches the folder name
description: "<short trigger phrase: when should the agent load this skill>"
metadata:                          # optional
  version: "YYYY-MM-DD"            # optional
---

# <Skill Title>

<Operational, terse body. Steps the agent runs. Prefer calling helper scripts
under scripts/ for repeatable command logic. No essays, no secrets.>
```

### The one rule that holds it all together

> A folder under `skills/` with a valid `SKILL.md` *is* a shareable skill.
> Everything else — install, copy, vendor, validate, CI — is built on top of
> that single convention.
