---
title: "`mcp_excalidraw` — Agent Experience (AX) Analysis"
description: Auditing the CLI, 26 MCP tools, REST API, and agent skill against the seven AX principles — including two genuine agent-traps found in the code.
---

> Source: [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw) (v2.0.0) · Date: 2026-08-09 · Mode: Analyze · Interface: Hybrid (CLI + MCP server + REST API + agent skill)
>
> See also: [System & OOP Architecture](/oss/mcp-excalidraw-system-architecture/) · [Agentic Architecture](/oss/mcp-excalidraw-agentic-architecture/)

## Scorecard

| # | Principle | Grade | One-line verdict |
|---|-----------|-------|------------------|
| 1 | Self-documenting affordance | ⚠️ | Skill + CLI help are exemplary; MCP tool descriptions are uneven and `update_element` under-advertises what it accepts. |
| 2 | Context economy | ⚠️ | Perception outputs are token-frugal; mutation results echo full element JSON the agent already has. |
| 3 | Right abstraction | ✅ | Task-shaped verbs, auto-start kills the setup chain, agent-friendly element format — CLI's `apply` has no MCP twin, though. |
| 4 | Unambiguous contract | ⚠️ | Good enum discipline in key spots, but free-string fields where enums fit, and a silent typed-filter trap on `query_elements`. |
| 5 | Errors that teach | ✅ | Exit-code taxonomy (0/1/2/3/4) and errors that name the next move are a model for the genre. |
| 6 | Predictable & safe | ⚠️ | Strong guardrails (loopback, path jail, identity gate) but `clear_canvas` is ungated in MCP and unlabeled retries duplicate elements. |
| 7 | Composable & verifiable | ✅ | Custom readable ids as handles, read-after-write via describe/screenshot, strict stdout/stderr split. |

## 1. Overview

An agent uses this surface to draw, inspect, refine, and export Excalidraw diagrams on a live local canvas. Three transports drive the same state: the **CLI** (`npx -y mcp-excalidraw-server <command>` — the skill's preferred path), **26 MCP tools** over stdio, and a **REST API** (`server.ts`) as the raw substrate. The bundled skill (`skills/excalidraw-skill/SKILL.md`) is the onboarding layer that teaches interface selection, workflows, and the screenshot-verify loop.

**Representative call chain** (as the skill prescribes): trigger → `add` (batch JSON, canvas auto-starts) → `describe` (structured text: ids, positions, connections) → `screenshot` (pixels) → quality checklist → `update <id> --set '{...}'` → re-`screenshot` → `export --out docs/arch.excalidraw`. Every step is one call; no discover-then-fetch chains.

## 2. Findings by Principle

**What's already solid (P3, P5, P7).** The surface is shaped on tasks, not endpoints: `arrange align|distribute|group`, `snapshot save|restore`, `apply` multi-op patches, and auto-start removing the entire "is the server up?" preamble (`core/spawn.ts`). The element format is shaped for LLM emission — `"text"` on any shape, `"startElementId"`/`"endElementId"` on arrows, tolerant `points` and `fontFamily` forms — normalized identically for CLI and MCP (`core/normalize.ts`). Errors teach: exit codes `0/1/2/3/4` are documented in `--help` itself, and messages carry the next move (`"Start it with \`mcp-excalidraw-server start\`"`, `"Set EXCALIDRAW_EXPORT_DIR to change the allowed base directory"`, exit 4 → "open the canvas in a browser"). Composability is deliberate: agents mint their own readable ids (`"id": "auth-svc"`) and reuse them everywhere; `describe`/`get` give a read-after-write path; JSON on stdout, diagnostics on stderr (`cli/run.ts` conventions block).

### Principle 1 — Self-documenting affordance  [⚠️]

- **Evidence:** `update_element`'s advertised schema (`core/mcp-tools.ts:39-65`) lists only basic style/geometry fields, but the dispatcher accepts far more — `points`, `startElementId`/`endElementId`, `groupIds`, `locked`, `roundness`, `elbowed` (`ElementSchema.partial()` in `mcp-dispatch.ts:159`). `get_resource` is described only as "Get an Excalidraw resource" with an undescribed enum `['scene','library','theme','elements']`, where `library` and `elements` return the same thing (`mcp-dispatch.ts:255-265`). Contrast with the excellent `describe_scene`/`read_diagram_guide` descriptions, which say *when* to call them.
- **Impact on the loop:** the spec is the agent's only onboarding. An MCP-only agent (no skill installed) won't discover it can re-route an arrow via `update_element` with `startElementId` — it will delete and recreate instead (extra calls, new ids, broken references). `get_resource` invites a wasted exploratory call.
- **Fix:** advertise every accepted field in `update_element`'s schema; give `get_resource`'s enum per-value descriptions or fold `scene`/`theme` out (see P7 finding on their stale values). Bring `create_element`-quality "when & why" prose to the terse descriptions (`delete_element`, `query_elements`).

### Principle 2 — Context economy  [⚠️]

- **Evidence:** `create_element`, `update_element`, `batch_create_elements`, and `duplicate_elements` all return the **full pretty-printed JSON of every element** (`mcp-dispatch.ts:154, 184, 439, 571`) — server-enriched with `seed`, `versionNonce`, `startBinding` internals. A 30-element `batch_create_elements` call returns hundreds of lines restating what the agent just sent. `query_elements` has no `concise` mode or field selection either.
- **Impact on the loop:** every echoed token competes with reasoning. In the prescribed loop the agent immediately calls `describe`/`screenshot` anyway, so the echo is almost pure waste — and it double-spends on large diagrams, exactly when budget matters.
- **Fix:** return a compact confirmation (`created 30 elements: [ids...]`) by default with a `verbose: true` opt-in; add field selection or a `concise` flag to `query_elements`. The good patterns already exist in-repo: CLI `screenshot` prints a file path, `export_to_image` without `filePath` returns a length notice instead of base64 (`mcp-dispatch.ts:549`).

### Principle 3 — Right abstraction  [✅, one gap]

- **Evidence:** CLI `apply` takes `{"create":[...],"update":[...],"delete":[...]}` in one invocation (`cli/run.ts:20`); MCP has no equivalent — an MCP agent needs `batch_create_elements` + N× `update_element` + N× `delete_element`.
- **Impact on the loop:** a layout fix touching 6 elements costs one CLI call but eight MCP round-trips, each with the P2 echo tax.
- **Fix:** add an `apply_patch` MCP tool mirroring the CLI's semantics (the core logic already exists behind `commands/elements.ts`).

### Principle 4 — Unambiguous contract  [⚠️]

- **Evidence:** (a) `strokeStyle` is `type: 'string'` with values listed in prose ("solid, dashed, dotted") rather than an enum; same for `startArrowhead`/`endArrowhead` ("arrow, bar, dot, triangle, or null") (`mcp-tools.ts:24,32-33`). (b) The `query_elements` `filter` is an open object (`additionalProperties: true`); the dispatcher stringifies every value into query params (`mcp-dispatch.ts:220-222`) and the server compares with strict `===` against the parsed query string (`server.ts:496-498`) — so `filter: {locked: true}` compares `true === "true"` and **silently returns zero matches**. The CLI avoids this with typed client-side filters (`--filter locked=true` documented as "typed"); MCP hits it head-on.
- **Impact on the loop:** (a) enums shrink the space of what a probabilistic caller can pass; prose lists invite `"dash"`. (b) is worse than an error — a silent empty result reads as "no such elements", and the agent draws a false conclusion and moves on. Nothing teaches it otherwise.
- **Fix:** enum-ify the style fields (cheap, schema-only). For filters: coerce `"true"/"false"` and numeric strings server-side in `/api/elements/search`, or route MCP queries through the CLI's typed client-side filtering — and say in the `filter` description which types are supported.

### Principle 6 — Predictable & safe  [⚠️]

- **Evidence:** the guardrails are genuinely good — loopback-only bind + auto-start refusal for non-loopback URLs (`spawn.ts:103`), export path jail (`normalize.ts:6`), the `/health` identity gate refusing foreign services (`canvas-client.ts:298`), `stop` signaling only a self-reported pid. But: CLI `clear` requires `--yes` while MCP `clear_canvas` takes `{}` with no confirmation (`mcp-tools.ts:295-300`) and `restore_snapshot` clears the canvas before recreating — a mid-flight failure leaves it empty (honestly reported: `"canvas was cleared"`, `mcp-dispatch.ts:604`). Creates without a caller-supplied `id` are not retry-safe: a timeout-retry of `batch_create_elements` duplicates every element (server generates fresh ids, `server.ts:702`).
- **Impact on the loop:** agents hallucinate calls and retry on timeouts. One spurious `clear_canvas` destroys unexported work with zero friction; one retried batch produces the "element count doubling" mess the skill then has to teach cleanup for.
- **Fix (cheap first):** add a required `confirm: true` to `clear_canvas`; auto-snapshot (`_pre_clear`) before clearing; make restore write-then-swap instead of clear-then-write. For retries, honor caller ids as upserts (already the storage semantic — `elements.set(id, ...)` overwrites) and say so in the tool description: "pass stable ids to make creation retry-safe."

### Principle 7 — Composable & verifiable  [✅, one blemish]

- **Evidence (observation with fix):** `get_resource('scene')` and `get_resource('theme')` return `sceneState` defaults — `theme: 'light'`, `viewport {x:0,y:0,zoom:1}` — that nothing ever updates (`core/canvas-state.ts:17-22`); the browser's real theme/viewport never sync back.
- **Impact on the loop:** a verification read that returns confident, wrong state is worse than no read — an agent "verifying" the viewport will trust a fiction.
- **Fix:** either wire real state (frontend already syncs elements; add theme/viewport to the sync payload) or remove `scene`/`theme` from the enum until they're truthful.

## 3. Recommendations (ranked by leverage)

1. **Schema-only fixes (hours):** enum-ify `strokeStyle`/arrowheads; advertise the full `update_element` field set; document typed-filter support; add "retry-safe with stable ids" guidance to create tools. (P1, P4, P6)
2. **Fix the silent filter mismatch (small):** type-coerce filter values in `/api/elements/search`. Silent-wrong-answer bugs outrank every other class. (P4)
3. **Gate `clear_canvas` + auto-snapshot (small):** `confirm` param + `_pre_clear` snapshot; swap-based `restore_snapshot`. (P6)
4. **Compact mutation results (medium):** ids-only confirmations with `verbose` opt-in; `concise` mode for `query_elements`. (P2)
5. **`apply_patch` MCP tool (medium):** port the CLI's one-call multi-op patch. (P3)
6. **Truthful or absent `get_resource` state (medium):** sync real theme/viewport or drop those enum values. (P7)

```
✗ AGENT-HOSTILE   query_elements(filter: {locked: true})
                  → {"elements": [], "count": 0}          (silently wrong: "true" !== true)
                  batch_create_elements(30 elements)
                  → 400+ lines echoing seeds, nonces, bindings the agent never asked for

✓ AGENT-FRIENDLY  query_elements(filter: {locked: true})  # values coerced server-side
                  → 4 locked elements: [vpc-zone, db, cache, lb]
                  batch_create_elements(30 elements)
                  → "Created 30/30. ids: [lb, svc-a, ...]. Next: describe_scene or
                     get_canvas_screenshot to verify layout."
```

## 4. Open Questions & Notes

- The REST API is explicitly positioned as last-resort for agents (skill "Step 0"), so it was audited only where it shapes MCP/CLI behavior (filter comparison, export broker); a standalone REST-consumer AX pass (status codes, error bodies for LangChain-style callers) was not done.
- Whether MCP result echoes are ever *useful* (e.g., an agent wanting server-resolved arrow `points` without a follow-up call) is unmeasured — the `verbose` opt-in recommendation preserves that path rather than assuming.
- `skills/excalidraw-skill/evals/` may already test some of these loop behaviors; not examined.
- The frontend auto-sync race (browser overwrite-sync vs concurrent agent writes) has AX consequences documented in the skill's Error Recovery section, but the fix belongs to the sync protocol, not the agent surface — out of scope here.
