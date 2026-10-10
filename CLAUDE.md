# CLAUDE.md — Frontier Hackathon BOG/26 - Public

Frontier hackathon, Bogotá, Sat 10 Oct 2026. One day, one submission. This file holds the project's engineering rules; it is safe to publish.

## Deliverables
- Systems design, closes 12:00: one-page design doc (pdf or link) + architecture diagram (image, pdf or link).
- Execution, closes 20:00:
  - Public repo URL.
  - Entrypoint public URL, reachable from 20:00 until the end of demo day, with `GET /health` and the team token (the token never goes in the repo).
  - Video of at most 2 minutes (public link).
  - Service specification and experiment log (format in the material's README).
- Demo day, before the turn: pitch material (slides, pdf or link), optional.

## Engineering principles
1. **The entrypoint is the product.** The hidden eval set runs against it on every validation. Never break its contract. A thin slice that is deployed and validating beats a rich one that is not.
2. **The evals are hidden, so generalize.** Do not tune to the examples in the brief. Always return a valid output shape, handle empty, malformed and oversized input, and respect timeouts. Fix the class of failure, never the single case; no hardcoded answers.
3. **The code matches `docs/design.md`.** If the implementation diverges, update the doc and log why. Never drift silently.
4. **Boring and legible over clever.** Every real trade-off gets a line in `docs/DECISIONS.md`.
5. **Easy to change.** Config over hardcoded values, one module per concern, deploy and rollback are one command each.

## Rules
- Do not add a dependency, an external service or any new moving part without asking first.
- Small commits whose messages say why. `main` is always deployable. After each passing validation, tag the commit `good-HHMM`.
- Never commit secrets. `OPENROUTER_API_KEY` lives in `.env` (gitignored) and in the deploy environment only.
- If the solution calls a model: OpenRouter only, through a single wrapper module. Model id comes from config; the wrapper owns the timeout, retry with backoff, a fallback model, and a log of latency, tokens and cost per call.
- Log every request to the entrypoint with a request id, input, output, latency and errors, plus an audit line per state mutation and an `assumption_hit` whenever a default from the spec is used. JSON lines on stdout only; never log tokens.
- Do not add routes to the replacement for stats, debug or admin: every path other than `/health` and `/__reset` must answer like the original.
- No test suite for coverage. One smoke script (`scripts/smoke.sh`) hits the entrypoint with the brief's examples plus hostile inputs. Run it before every deploy and every validation.
- No auretth, admin screens or UI polish unless the brief scores them.
- If you are guessing at an API or a behavior, say so and verify by running it. Do not invent.
- Build order: contract → happy path end to end → deploy → first validation → edge cases → quality. Never go more than about 45 minutes without a deployable `main`.
- Final validation and video come from a tagged known-good commit.

## Decision log
Append to `docs/DECISIONS.md` whenever choosing between real alternatives:
`HH:MM · decision · alternatives considered · why · what would make us revisit`
Keep it honest, including the things that went wrong.

## Stack and commands — CONFIRM AT 10:30
- Default: TypeScript on Node, unless the brief dictates otherwise
- Deploy target: TODO (needs a stable public URL by 13:30)
- Model: TODO (via OpenRouter)
- Commands (`dev`, `smoke`, `deploy`, `rollback`) and env vars live in `README.md`; keep them there, not here.

## Repo map
```
docs/design.md         one-page design doc with the embedded Mermaid architecture diagram: problem and constraints, architecture, data flow, key trade-offs, failure modes, what we cut
docs/DECISIONS.md      trade-off log
docs/INCIDENT.md       incident response: what happened, what changed, why, what we would do with more time
scripts/smoke.sh       pre-deploy and pre-validation check: replays tests/corpus against the replacement (or the original with --original)
tests/corpus/*.jsonl   recorded sequences with the original's real responses (the oracle)
scripts/bb.sh          the only way to talk to the original: logs every request with its hypothesis
lab/experimentos.jsonl experiment log (graded deliverable), written by bb.sh
src/                   application code
```
