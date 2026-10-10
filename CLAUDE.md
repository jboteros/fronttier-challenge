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
- Never commit secrets. `TEAM_TOKEN` (and the personal black-box token) live in `.env` (gitignored) and in the deploy environment only. The replacement uses the **team** token.
- The replacement calls no model and no external service; it is a deterministic state machine with zero runtime dependencies.
- Log every request to the entrypoint with a request id, input, output, latency and errors, plus an audit line per state mutation and an `assumption_hit` whenever a default from the spec is used. JSON lines on stdout only; never log tokens.
- Do not add routes to the replacement for stats, debug or admin: every path other than `/health` and `/__reset` must answer like the original.
- No test suite for coverage. One smoke script (`scripts/smoke.sh`) hits the entrypoint with the brief's examples plus hostile inputs. Run it before every deploy and every validation.
- No auth beyond the contract, admin screens or UI polish unless the brief scores them.
- If you are guessing at an API or a behavior, say so and verify by running it. Do not invent.
- Build order: contract → happy path end to end → deploy → first validation → edge cases → quality. Never go more than about 45 minutes without a deployable `main`.
- Final validation and video come from a tagged known-good commit.

## Decision log
Append to `docs/DECISIONS.md` whenever choosing between real alternatives:
`HH:MM · decision · alternatives considered · why · what would make us revisit`
Keep it honest, including the things that went wrong.

## Stack and commands
- TypeScript on Node 20, zero runtime dependencies; Railway, one replica, built from the `Dockerfile`.
- Commands (`dev`, `smoke`, deploy, roll back) and env vars live in `README.md`; keep them there, not here.

## Repo map
```
src/core/              protocol-agnostic server
src/profile/blackbox/  service-specific rules (auth, catalog, commands, check function)
docs/design.md         systems design with the embedded Mermaid architecture diagram
docs/spec.md           service specification, generated from the log by scripts/build-spec.py
docs/INCIDENT.md       the 15:30 change to version 2
docs/DECISIONS.md      trade-off log
docs/execution-plan.md execution plan, with outcome versus plan
lab/experimentos.jsonl experiment log written by scripts/bb.sh (graded deliverable, rich format)
submission/            experiment log in the organizers' exact format
scripts/               bb.sh (the only way to talk to the original), smoke.sh, seq.sh, find-check.sh, probe-limit.sh, log-to-corpus.sh, build-spec.py
tests/corpus/          recorded sequences with the original's real responses (v2 current, v1 in v1/)
```

## Language
- Everything in this repo is written in English: code, comments, commits, docs, design doc, spec, experiment log hypotheses and conclusions.
- Exception: literal strings of the black box (error messages such as `control inválido`, `límite excedido`) are data and stay verbatim.
- Spoken material (video, pitch) is in whichever language the owner chooses at the time.
