# fronttier-challenge

Replacement for a legacy HTTP service with no source and no documentation (Frontier BOG/26, Challenge 2, "La caja negra"). The replacement must answer the same status and body as the original, errors included.

**Status:** exploration tooling is built; the replacement is not started. Sections marked `TODO` are filled in as pieces land.

## Documents

| Document | What it is |
|---|---|
| [`docs/design.md`](docs/design.md) | Systems design: constraints, architecture diagram, observability, decisions, failure modes, measurement and execution plan, current state |
| `docs/spec/` | Service specification (TODO) |
| [`lab/experimentos.jsonl`](lab/experimentos.jsonl) | Experiment log: one line per request sent to the original, with the hypothesis behind it |
| [`CLAUDE.md`](CLAUDE.md) | Engineering rules for the AI agent working in this repo |

## Requirements

`bash`, `curl`, `jq`. Node and TypeScript for the replacement (TODO: version).

## Configuration

Secrets live in your shell or a gitignored `.env`, never in the repo.

| Variable | Used by | Meaning |
|---|---|---|
| `BLACKBOX_URL` | `bb.sh`, `smoke.sh --original` | Base URL of the original service |
| `FRONTIER_BLACKBOX` | `bb.sh` | Your personal token for the original |
| `REPLACEMENT_URL` | `smoke.sh` | Base URL of the replacement (local or deployed) |
| `TEAM_TOKEN` | `smoke.sh` | Team token the replacement authenticates with |
| `BB_SEQ` | `bb.sh` | Sequence id written to the log (default `s0`); start each sequence with a reset |
| `BB_NOAUTH`, `BB_AUTH` | `bb.sh` | Send no `Authorization` header, or override its value |
| `BB_LOG`, `BB_BUDGET` | `bb.sh` | Log path (default `lab/experimentos.jsonl`) and daily request guard (default 7000) |

## Explore the original

`scripts/bb.sh` is the only way to talk to the original. It sends one request, prints it, appends a line to the experiment log and counts it against the daily budget (10 req/s, 8,000 req/day per token).

```bash
export BLACKBOX_URL=...            # original service
export FRONTIER_BLACKBOX=...       # your personal token
export BB_SEQ=s2

scripts/bb.sh "reset gives initial state" POST /__reset
scripts/bb.sh "PING ignores the check field" POST /msg '{"m":"PING;XX"}'
BB_NOAUTH=1 scripts/bb.sh "request without token" GET /health
```

Rate-limited responses (`X-Frontier-Infra: rate-limit`) are infrastructure, not service behavior: the script reports them and does not log them.

## Test

`scripts/smoke.sh` replays the recorded sequences in `tests/corpus/` (each preceded by `POST /__reset`) and compares status and body the way the evaluator does: JSON keys in any order, strings exact. Exit code is non-zero on any difference.

```bash
# Against the replacement
REPLACEMENT_URL=... TEAM_TOKEN=... scripts/smoke.sh

# Against the original (logged and budgeted through bb.sh): detects service changes
BLACKBOX_URL=... FRONTIER_BLACKBOX=... scripts/smoke.sh --original
```

Corpus lines are `{"seq","n","request","status","response"}` with optional `"method"` and `"path"` (default `POST /msg`). Expected values always come from the original's real responses, never from assumptions.

## Run the replacement

```bash
npm install
cp .env.example .env        # set TEAM_TOKEN; PORT defaults to 8080
export $(grep -v '^#' .env | xargs)
npm run dev                 # tsc + node dist/main.js
```

Zero runtime dependencies (Node `http` only); `typescript` and `@types/node` are dev-only. The service-specific part lives in `src/profile/blackbox/`; `src/core/` knows nothing about the protocol. Signals (request, audit, error, assumption hits) are JSON lines on stdout.

## Deploy and roll back

TODO: single always-on replica (state lives in memory), one command each for deploy and rollback, and the public URL.

## Layout

```
docs/design.md           systems design with the embedded architecture diagram
docs/spec/               service specification (TODO)
lab/experimentos.jsonl   experiment log written by bb.sh
scripts/bb.sh            logged gateway to the original
scripts/smoke.sh         replay and compare recorded sequences
tests/corpus/            recorded sequences (the oracle)
src/                     replacement (TODO)
```
