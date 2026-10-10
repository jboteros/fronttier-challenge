# Incident FR-0153: the provider deployed version 2 without notice

Opened 15:30 COT. The black box started answering as version 2; the ticket said 3 behaviors changed and the rest stayed as in version 1.

## How it was detected

The ticket opened at 15:30; the change was detected at about 17:15, when the replay below was run by hand. No unattended canary existed, so roughly 1h45m passed before it was seen.


The recorded version 1 sequences (`tests/corpus/v1/`, built from the experiment log) were replayed against the original through the gateway (`scripts/smoke.sh --original`, 92 requests). 34 of them differed. Every difference was classified; many were cascades of a single change (a rejected transfer shifts the following operation ids).

## What changed

| # | Behavior | Version 1 | Version 2 | Evidence in `lab/experimentos.jsonl` |
|---|---|---|---|---|
| 1 | Balance format | `{"saldo": 40000}` integer | `{"saldo": "400.00"}`: string with two decimals, amounts are cents | lines with conclusion "v2 change 1" |
| 2 | Transfer limit | 100000 accepted | Per-operation limit of 50000: 50000 accepted, 50001 rejected with `E506` (bisected, and two transfers of 50000 in a row are both accepted, so it is not cumulative) | lines with `limit probe` hypotheses |
| 3 | Not proven | | Candidates: amount validation (`E303`: digits only, greater than 0, no leading zero, at most 10 digits) and same-account transfers (`E304`) | Version 1 never exercised these, so they cannot be shown to be new |

Unchanged and confirmed on version 2: cancellation semantics (first cancel `ok:true`, second `ok:false "ya anulada"`, origin refunded, a cancelled deposit can leave a negative balance), the check function, id formats, error texts.

## What else the investigation found (not part of the 3)

- The control value is validated for any command before the command is known: `FOO;X;99` is `E202`, not `E301`.
- The full evaluation order is in `src/profile/blackbox/index.ts` and, for transfers, in `src/profile/blackbox/commands.ts`. Each adjacent pair was probed.
- A request-level error family E10x (`E100` invalid JSON, `E102` no `m`, `E103` no control, `E104` empty segment).

## What changed in the replacement

Only `src/profile/blackbox/` (profile): balance formatting, the limit constant, the E303/E304 rules, request-level order and the E10x errors. The core, gateway and replay tooling were not touched, which is the intended payoff of the core/profile split.

## What we would do with more time

- Establish whether E303 and E304 existed in version 1 by probing a version-1 recording of the same cases (not possible now: the original only serves version 2).
- Bisect the exact amount cap between 9,999,999,999 and 99,999,999,999 (a 10-digit cap is assumed).
- Probe how the original handles oversized bodies, other content types and non-ASCII control characters.
- Have the canary run unattended every 30 minutes, to detect a second change without a ticket.
