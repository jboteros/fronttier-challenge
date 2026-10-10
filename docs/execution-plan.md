# Execution plan

Written 12:24 COT. Execution closes 20:00. A change to the challenge is expected around 15:00, so the implementation is split into a service-agnostic core and a replaceable service profile.

## 1. Deliverables and how each is secured

| Field (platform) | What | Gate before submitting | Planned |
|---|---|---|---|
| Repo, public URL | This repository | No secrets (`git grep` scan), README runs from a clean clone | Submit 13:30 to learn if it validates; final 19:45 |
| Entrypoint, URL + **validate** | Deployed replacement. **3 hidden-set runs in total** | `scripts/smoke.sh` passes 100% against the deployed URL | Runs at 14:00, 17:00 and 19:15 (section 5) |
| Video, 2 min, public link | Problem, approach, evidence, honest limits | Recorded from a tagged commit | Script 18:30, record 19:30, submit 19:45 |
| Service specification, file ≤ 25 MB | `docs/spec.md` | Every behavior cites existing log ids, validator passes | Skeleton 13:30 (format check), final 19:45 |
| Experiment log, file ≤ 25 MB | `lab/experimentos.jsonl` | Valid JSONL, organizers' fields present | First upload 13:30 (our extra fields `method`, `path`, `auth` may be rejected; strip with `jq 'del(.method,.path,.auth)'` if so) |

Fields that fail validation are not marked as delivered, so formats are tested early, not at 19:45. Whether a field can be resubmitted is unknown: confirm on the first submit.

**Hosting constraint**: the entrypoint must be on a real host, never a laptop or tunnel; the final hidden-set run happens during the debrief and again after 20:00. One always-on replica (state is in memory). Candidates: Railway or Fly.io. Decision at 12:40.

## 2. Architecture for change: core versus profile

Rule: nothing specific to this service lives outside `src/profile/` and `tests/corpus/`.

| Generic (survives the 15:00 change) | Service-specific (replaced if it changes) |
|---|---|
| HTTP server, body reading, size and time guards (`src/core/`) | Protocol parsing, integrity check, commands (`src/profile/`) |
| Single-process state container and reset hook | State shape, counters, limits |
| Request, error and audit logging, `assumption_hit` | Error catalog (codes, statuses, messages) and evaluation order |
| Ordered-rule engine and catalog helper | Auth failure responses and unknown-route responses |
| `scripts/bb.sh`, `scripts/smoke.sh`, probe battery | Corpus content |

The boundary is one function: `profile.handle(request, state) → response`. The core never inspects bodies or messages. `PROFILE` env var selects the profile.

Reusable exploration, so the same work can be repeated on a changed service in minutes:
- `scripts/probe.sh <battery.txt>`: runs a file of probes through `bb.sh` (auth variants, methods, unknown routes, body shapes, empty and oversized input). About 60 requests.
- Check-function and error-order probes are scripted the same way, as batteries, not typed by hand.

Limits of this approach: if the new challenge is not an HTTP request/response service, only the lab tooling and logging transfer. No plugin system, config language or framework: a profile is a TypeScript module.

## 3. Phases

| Time | Phase | Exit criterion |
|---|---|---|
| 12:25–12:45 | Setup | Hosting and dependencies decided. Scaffold: `package.json`, `tsconfig`, `Dockerfile`, `.env.example`. Core serves `/health` (200 with token, 401 without, as observed) and `/__reset` |
| 12:45–13:30 | Thin slice (A) | Profile covers `PING ALTA CONSULTA DEPOSITO TRANSFER ANULA` with the 6 error codes seen; `smoke.sh` 20/20 locally; deployed; deployed `smoke.sh` 20/20 |
| 12:45–13:30 | Check function (B), in parallel | Valid check found for 5+ messages with single-character variations, function fitted or documented as unknown |
| 13:30–14:00 | Format gate | Repo, log and spec skeleton submitted; validation run 1 |
| 14:00–15:00 | Behavior mapping | Error evaluation order, amount edge cases, limit semantics, cancellation effects, ids past `AC-9999`; spec rows added as confirmed |
| 15:00 | **Change** | See section 4 |
| 15:00–16:30 | Adaptation | Smoke 100% on the new corpus, deployed |
| 16:30–17:30 | Validation run 2, gap closing | Replay loop on assumption hits; fixes as classes |
| 17:30–19:00 | Long tail and spec | Spec sections complete, every row with evidence |
| 19:00 | Freeze | Fixes only; no refactors, no new dependencies |
| 19:15 | Validation run 3 | Tagged commit; if it passes, nothing else changes |
| 19:30–19:45 | Video, final uploads | All five fields green |
| 20:00 | Official run | Last on-time entrypoint is evaluated |

Budget (8,000 req/day, 75 used): check function 1,000, commands and errors 2,300, state 1,400, surface and change battery 300, canary and baseline 700, validation replay 500, reserve for the change 1,500. Total about 7,700.

## 4. Runbook for the 15:00 change

1. **Read and classify** (5 min): same service modified, same family of service, or new contract and constraints. Paste it into the session; no code before the plan.
2. **Measure the difference**: `scripts/smoke.sh --original` (about 21 requests) on the old corpus. Every FAIL is a changed behavior.
3. **Re-map the surface**: `scripts/probe.sh` battery on the new target (about 60 requests), then the check-function and error-order batteries only if the diff points there.
4. **Change the profile only**. If the core needs a change, that is a design smell: record it in `docs/DECISIONS.md`.
5. **Rebuild the corpus** from the new log, deploy, `smoke.sh` 100% against the deployed URL, then validation run 2.
6. **Record**: `docs/INCIDENT.md` (what happened, what changed, why, what we would do with more time) and the spec section "Changes during the day".

## 5. Validation runs (3 only)

| Run | When | Entry gate | Purpose |
|---|---|---|---|
| 1 | 14:00 | Deployed smoke 100% on the corpus | Catch contract, hosting and format problems; first pass count |
| 2 | 17:00 | Change absorbed, smoke 100% | Find failing classes through the request log and replay loop |
| 3 | 19:15 | Frozen, tagged commit | Last confirmation; the 20:00 official run uses the same build |

A run is never spent to "see what happens". Before each one, the local suite is green and the request log is verified to be recording.

## 6. Dependencies and decisions pending

| Item | Proposal | Needs your go |
|---|---|---|
| Runtime dependencies | None: Node `http` module only | Yes |
| Dev dependencies | `typescript`, `@types/node` (compile with `tsc`; Node here is 20) | Yes |
| Hosting | Railway or Fly.io, Dockerfile, one replica, no sleeping | Yes: pick one |
| Spec format | One file `docs/spec.md` with the 7 sections (no tree, simpler to upload) | Yes |
| Spoken language of the video | English or Spanish | Yes |

## 7. Risks

| Risk | Early signal | Response |
|---|---|---|
| Check function not derived | Fitting fails by 13:30 | Fallback: known-check table plus accept any numeric check, documented as assumption; keep probing in the background |
| The change invalidates the profile | Smoke FAILs at 15:00 | Runbook above; reserve budget; core untouched |
| Only 3 validation runs | A run fails on something trivial | Local suite and `/health` check before every run |
| Host restarts and loses state | Unexpected counter values | Reset semantics are initial state; check `/health` before each run |
| Budget exhausted | Counter above 6,500 | Stop broad probing; only targeted probes |
| Platform rejects log format | First upload fails | Strip extra fields; keep the rich copy locally |

## 8. Cut order when behind

Unlikely edge cases, then spec polish, then canary frequency. Never: the entrypoint contract, the experiment log, or the truthfulness of the spec.
