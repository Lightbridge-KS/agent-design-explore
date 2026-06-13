Use this as a drop-in skeleton for a `docs/agent-friendly-cli.md` (or `CLI.md`)
contract in your own repo. Replace `<tool>` with your binary name, delete rows that
don't apply, and keep the section order — it doubles as a checklist.

### 1. State the audience and the boundary

> `<tool>` serves **humans, scripts, CI, and external agents** through one command
> surface. It is a thin client over the **public API** — no embedded LLM, no private
> backdoors. The same commands work against localhost and hosted servers.

- [ ] One contract for all four audiences (no separate "agent mode").
- [ ] No LLM runtime baked into the binary — intelligence lives in the caller.
- [ ] Only public, documented endpoints are used.

### 2. Deterministic configuration resolution

Document the precedence **explicitly** so a caller can always predict what wins:

```
1. command-line flags        (highest)
2. environment variables
3. user config file          (~/.config/<tool>/config.json)
4. built-in defaults         (lowest)
```

| Source | Example |
|--------|---------|
| Flag | `--server <url>`, `--token <token>` |
| Env | `<TOOL>_SERVER`, `<TOOL>_TOKEN` |
| Config file | `~/.config/<tool>/config.json` |

- [ ] Precedence is written down and tested.
- [ ] Secrets are scoped (a token bound to server A is not sent to server B).

### 3. Output discipline

- [ ] **stdout = data, stderr = diagnostics.** Never interleave.
- [ ] `--json` emits one JSON object per command; **streams** emit newline-delimited
      JSON (one event per line).
- [ ] `--plain` emits stable, line-oriented, single-field output for `cut`/`grep`.
- [ ] `--no-input` suppresses prompts; auto-enable it when stdin is not a TTY.
- [ ] `--verbose` sends extra diagnostics to **stderr**, never stdout.

```
# human         → "sent msg_01k... to #ops"
# --json        → {"message":{"id":"msg_01k...","channel_id":"chn_..."}}
# --json stream → one JSON event per line (NDJSON)
```

### 4. Composable input precedence

Let the body come from whichever source is convenient, in a fixed order:

```
1. positional argument
2. --body <text>
3. --file <path>
4. --stdin
```

- [ ] Piping works: `producer | <tool> send --stdin`.

### 5. Stable exit-code taxonomy

> Scripts and agents should **branch on exit codes, not error text.**

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Generic failure |
| 2 | Invalid usage / validation error |
| 3 | Auth required or failed |
| 4 | Resource not found |
| 5 | Permission denied |
| 10 | Network unavailable |
| 11 | Unexpected server response |

- [ ] Codes are documented, stable across releases, and covered by tests.

### 6. Durable streaming (if the tool tails events)

- [ ] Persist a cursor per (server, workspace, channel) under
      `~/.local/state/<tool>/cursors/`.
- [ ] On start: load cursor → fetch missed events `after_cursor` → connect WebSocket →
      persist cursor after each delivered event.
- [ ] Handle a `resync_required` signal by refetching state from scratch.

### 7. Copy-paste agent recipes

Ship at least these in the doc so an agent can pattern-match:

```sh
# one-shot, fully env-configured (no interactive state)
<TOOL>_SERVER=https://… <TOOL>_TOKEN=ses_… <tool> send --channel ops "release started"

# parse structured output
<tool> messages list --channel ops --json --no-input

# pipe content in
producer | <tool> reply <id> --stdin

# branch on exit code, not text
if <tool> status --json >/dev/null; then echo up; else echo "down ($?)"; fi
```
