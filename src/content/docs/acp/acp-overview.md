---
title: "Agent Client Protocol (ACP) — Overview"
description: How the four ACP chapters fit together — the protocol in sixty seconds, the codegen pipeline from Rust types to every SDK, a reading order by role, and the caveats that carry across all four.
---

Four chapters on the [Agent Client Protocol](https://agentclientprotocol.com) — the JSON-RPC
contract that decouples code editors from coding agents, the way LSP decoupled editors from
language servers. Read from source at `agent-client-protocol` @ `9e6f550`, `python-sdk` @
`ce23c4a`, `typescript-sdk` @ `5dac09a`, and `claude-agent-acp` @ `c3ff343` on 2026-08-29.

| Chapter | Lens | Read it when you want to know… |
|--------|------|--------------------------------|
| [System & OOP Architecture](/acp/acp-system-architecture/) | **Inside-out** — how it is built | How the Rust schema crate, the schema generator, and the Python SDK runtime fit together; the cross-repo codegen pipeline; the SDK's object model and patterns; how a prompt turn actually executes |
| [User-Facing API & UX/DX](/acp/acp-surface-architecture/) | **Outside-in** — how it is used | The full ACP v1 method catalog and capability surface; **both SDKs' public APIs side by side**; onboarding paths for agent authors, client authors, and SDK authors; the error and cancellation contracts; naming conventions and AX |
| [Extension Points & Vertical Surfaces](/acp/acp-extension-points/) | **Forward-looking** — how far it bends | The seven extension seams, from `_meta` to a new capability namespace; what v2's open enums unlock; the proxy-chain and MCP-over-ACP RFDs; which verticals ACP already serves and what a new one would need |
| [Building a Real Agent](/acp/acp-agent-implementation/) | **Ground-level** — what shipping one costs | What a production ACP agent actually looks like: the three translations an adapter performs, fourteen real extensions and how they negotiate, the operational traps, and enterprise/self-hosted model routing |

**Reading order by role.**

| You are… | Start here |
|----------|------------|
| New to ACP | [User-Facing API & UX/DX](/acp/acp-surface-architecture/) — the cheat sheet alone orients you |
| Building an agent | [Building a Real Agent](/acp/acp-agent-implementation/), then UX/DX §2.5 for the SDK you picked |
| Extending the protocol | [Extension Points](/acp/acp-extension-points/), then the case study's §4 inventory |
| Working on the spec or an SDK | [System & OOP Architecture](/acp/acp-system-architecture/) |

## The 60-second version

ACP is JSON-RPC 2.0 between a **Client** (your editor) and an **Agent** (a coding agent the
editor spawns as a subprocess). Both sides call each other: the Agent streams progress via
`session/update` notifications and asks the Client for permission, file access, and terminals.

```
Rust types (SSOT)  →  schemars  →  schema.json + meta.json  →  GitHub release
                                                                    │
                        ┌───────────────────────────────────────────┴───────────┐
       datamodel-code-generator ▼                       @hey-api/openapi-ts ▼
          python-sdk: schema.py + meta.py         typescript-sdk: types + zod + guards
                                                                    │
                                                     claude-agent-acp (agent) ▼
```

The spec repo's Rust types are the single source of truth for the wire format; every SDK is
generated downstream from the JSON Schema artifacts attached to `schema-v*` releases. CI in the
spec repo enforces that the generated files never drift from their source types.

## Caveats carried across the reports

- Four of the ecosystem's repos were read. The Rust **runtime** crate (`rust-sdk`), the
  Kotlin/Java SDKs, JetBrains' AIR client, and the agent `registry` are referenced but were not
  available — claims about them are marked as such.
- **The implementations are at different points.** TypeScript tracks `schema-v1.21.0` *and*
  `schema-v2.0.0-alpha.3`, and is the only one with a v2 surface. Python is pinned to
  `schema-v1.19.0`, v1-only. `claude-agent-acp` pins the TypeScript SDK at 1.3.0 and hardcodes
  `protocolVersion: 1`. Both SDKs generate from the **unstable** schema, so neither method catalog
  is a list of *supported* methods.
- Protocol v2 changes the surface substantially (prompt lifecycle, upsert semantics, removal of
  the Client filesystem/terminal APIs). All reports flag where v1 statements will not carry over.
- **Extensions are outrunning governance.** `claude-agent-acp` ships fourteen extensions —
  steering, goals, async tasks, subagent sessions among them — and none has an RFD.

Each chapter ends with an **Open Questions** section listing what the source could not settle.
