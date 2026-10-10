# fronttier-challenge

Replacement for a legacy HTTP service with no source and no documentation (Frontier BOG/26, Challenge 2, "La caja negra"). The replacement must answer the same status and body as the original, errors included.

**Status:** the replacement is built and deployed on Railway (single always-on replica); it reproduces all 297 recorded v2 requests and the hidden-set run 1 of 3 was used. The service changed at 15:30 (version 2); see `docs/INCIDENT.md`.

## Documents

| Document | What it is |
|---|---|
| [`docs/design.md`](docs/design.md) | Systems design: constraints, architecture diagram, observability, decisions, failure modes, measurement and execution plan, current state |
| [`docs/spec.md`](docs/spec.md) | Service specification: 72 behaviors with evidence ids and confidence (generated from the log) |
| [`docs/INCIDENT.md`](docs/INCIDENT.md) | The 15:30 change to version 2: what changed, how it was found, what was left unproven |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Trade-off log |
| [`docs/execution-plan.md`](docs/execution-plan.md) | Execution plan, with the outcome versus plan at the top |
| [`submission/experimentos.jsonl`](submission/experimentos.jsonl) | The experiment log in the organizers' exact format (the file uploaded) |
| [`lab/experimentos.jsonl`](lab/experimentos.jsonl) | Experiment log: one line per request sent to the original, with the hypothesis behind it |
| [`CLAUDE.md`](CLAUDE.md) | Engineering rules for the AI agent working in this repo |

## Requirements

`bash`, `curl`, `jq`, `python3` (only for the check value in `seq.sh` and for `build-spec.py`). Node 20 or later for the replacement; TypeScript and `@types/node` are dev dependencies.

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

The default corpus is `tests/corpus/*.jsonl` (the v2 recording, cut from the experiment log). The version 1 recordings sit in `tests/corpus/v1/` and are expected to fail against the current service. Corpus lines are `{"seq","n","request","status","response"}` with optional `"method"` and `"path"` (default `POST /msg`). Expected values always come from the original's real responses, never from assumptions.

Helpers: `scripts/seq.sh` runs one sequence against the original with the check values computed; `scripts/find-check.sh` and `scripts/probe-limit.sh` were used to derive the check function and the transfer limit; `scripts/log-to-corpus.sh` cuts a corpus from the log (`scripts/log-to-corpus.sh lab/experimentos.jsonl 232 > tests/corpus/v2-recorded.jsonl`); `python3 -I scripts/build-spec.py` rebuilds `docs/spec.md` and `submission/experimentos.jsonl` and fails if a cited id does not exist.

## Run the replacement

```bash
npm install
cp .env.example .env        # set TEAM_TOKEN; PORT defaults to 8080
export $(grep -v '^#' .env | xargs)
npm run dev                 # tsc + node dist/main.js
```

Zero runtime dependencies (Node `http` only); `typescript` and `@types/node` are dev-only. The service-specific part lives in `src/profile/blackbox/`; `src/core/` knows nothing about the protocol. Signals (request, audit, error, assumption hits) are JSON lines on stdout.

## Deploy and roll back

The service runs on Railway as a single replica built from the `Dockerfile` (state lives in memory, so one instance only). Required variable: `TEAM_TOKEN`, the **team** token from the platform card (not the personal black-box token); `PORT` is injected by Railway.

- Deploy: push to `main`; Railway builds the `Dockerfile` and redeploys.
- Roll back: redeploy a previous deployment from the Railway dashboard (or `git revert` and push).
- Check: `curl -H "Authorization: Bearer $TEAM_TOKEN" https://fronttier-challenge-production.up.railway.app/health` answers `{"ok":true}`; then `scripts/smoke.sh` with `REPLACEMENT_URL` set.

## Layout

```
src/core/                 protocol-agnostic server: HTTP, body limits, state container, reset, logging
src/profile/blackbox/     everything specific to this service: auth, catalog, commands, check function
docs/                     design, spec, incident, decisions, execution plan
lab/experimentos.jsonl    experiment log written by bb.sh (rich: method, path, auth)
submission/               the log in the organizers' format
scripts/                  bb.sh, smoke.sh, seq.sh, find-check.sh, probe-limit.sh, log-to-corpus.sh, build-spec.py
tests/corpus/             recorded sequences (v2 current, v1 in v1/)
```
