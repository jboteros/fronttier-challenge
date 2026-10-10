#!/usr/bin/env python3
"""Builds docs/spec.md and submission/experimentos.jsonl from lab/experimentos.jsonl.

Every behavior carries evidence computed from the log, so the spec cannot cite a line that does not exist.
Confidence: confirmed (two or more distinct supporting lines), probable (one), assumed (none: the replacement's default).
Run: python3 -I scripts/build-spec.py
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
rows = [json.loads(l) for l in (ROOT / "lab/experimentos.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
V2 = 232  # last line recorded against version 1


def msg(r):
    q = r.get("request")
    m = q.get("m") if isinstance(q, dict) else None
    return m if isinstance(m, str) else ""


def err(r):
    x = r.get("response")
    return x.get("error") if isinstance(x, dict) else None


def ev(pred, n=3, v2_only=False, dedupe=True, oldest=False):
    """Up to n line ids matching pred, one per distinct request (unless dedupe=False), newest first (or oldest)."""
    seen, out = set(), []
    for r in sorted(rows, key=lambda r: r["id"] if oldest else -r["id"]):
        if v2_only and r["id"] <= V2:
            continue
        if not pred(r):
            continue
        key = (r.get("method"), r.get("path"), r.get("auth"), json.dumps(r.get("request"), sort_keys=True),
               r["hipotesis"] if r.get("auth") != "team-token" else "")
        if dedupe and key in seen:
            continue
        seen.add(key)
        out.append(r["id"])
        if len(out) == n:
            break
    return sorted(out)


def conf(ids, forced=None):
    if forced:
        return forced
    return "confirmed" if len(ids) >= 2 else ("probable" if ids else "assumed")


team = lambda r: r.get("auth") == "team-token"
cmd = lambda r: msg(r).split(";")[0].upper()
parts = lambda r: msg(r).split(";")
amount = lambda r: parts(r)[2] if cmd(r) == "DEPOSITO" and len(parts(r)) > 2 else (parts(r)[3] if cmd(r) == "TRANSFER" and len(parts(r)) > 3 else "")

def reject_then_ok():
    out, last, rejected, seg = [], None, None, 0
    for r in sorted(rows, key=lambda r: r["id"]):
        if r.get("path") == "/__reset" and r.get("auth") == "team-token":
            last, rejected = 0, None
            continue
        if r.get("auth") != "team-token" or cmd(r) not in ("DEPOSITO", "TRANSFER") or last is None:
            continue
        resp = r.get("response")
        if isinstance(resp, dict) and "operacionId" in resp:
            n = int(resp["operacionId"].split("-")[1])
            if rejected is not None and n == last + 1:
                out.append((rejected, r["id"]))
            last, rejected = n, None
        elif err(r) in ("E303", "E304", "E401", "E506", "E507"):
            rejected = r["id"]
    return [i for pair in out[-2:] for i in pair]


REJECT_THEN_OK = reject_then_ok()
B = []  # (section, id, text, evidence ids, forced confidence)


def add(sec, bid, text, pred=None, n=3, v2_only=False, forced=None, extra=(), dedupe=True):
    ids = ev(pred, n, v2_only, dedupe) if pred else []
    ids = sorted(set(ids) | set(extra))
    B.append((sec, bid, text, ids, conf(ids, forced)))


# 1. Input
S1 = "1. Input (Entrada)"
add(S1, "IN-01", "`POST /msg` takes a JSON body `{\"m\": \"<message>\"}` and answers JSON.", lambda r: team(r) and r["path"] == "/msg" and r["status"] in (200, 201))
add(S1, "IN-02", "`GET /health` with a valid token answers 200 `{\"ok\":true}`.", lambda r: team(r) and r["path"] == "/health" and r["status"] == 200)
add(S1, "IN-03", "`POST /__reset` with a valid token answers 200 `{\"ok\":true}` and returns the state to its initial value.", lambda r: team(r) and r["path"] == "/__reset" and r["status"] == 200, n=2)
add(S1, "IN-04", "Without a token, with an invalid token, with a non-Bearer scheme or with an empty Bearer, `/health` and `/msg` answer 401 `{\"error\":\"E001\",\"mensaje\":\"no autorizado\"}`.", lambda r: r["status"] == 401 and err(r) == "E001", n=5)
add(S1, "IN-05", "An unauthenticated request to an unknown route is assumed to answer 401 (authentication is checked before routing). Not probed.", forced="assumed")
add(S1, "IN-06", "With a valid token, an unknown path or a wrong method (`GET /msg`, `PUT /msg`, `GET /`, `GET /nope`) answers 404 `{\"error\":\"E404\",\"mensaje\":\"ruta desconocida\"}`.", lambda r: r["status"] == 404 and err(r) == "E404", n=4)
add(S1, "IN-07", "`POST /health` and `GET /__reset` are assumed to answer 404 like any other wrong method. Not probed.", forced="assumed")
add(S1, "IN-08", "A body that is not valid JSON answers 400 `{\"error\":\"E100\",\"mensaje\":\"json inválido\"}`.", lambda r: err(r) == "E100")
add(S1, "IN-09", "A JSON body without a string field `m` (`{}`, `{\"m\":1}`, `[]`, `{\"x\":...}`) answers 400 `{\"error\":\"E102\",\"mensaje\":\"falta m\"}`.", lambda r: err(r) == "E102", n=4)
add(S1, "IN-10", "An empty request body is assumed to answer E100 (an empty string is not valid JSON). Not probed.", forced="assumed")
add(S1, "IN-11", "Request size limits and query strings were not probed. The replacement ignores query strings and accepts bodies up to 1 MB.", forced="assumed")

# 2. Integrity
S2 = "2. Integrity (Integridad)"
add(S2, "IG-01", "A message is `COMMAND;arg;...;control`, fields separated by `;`. The last field is the control value.", lambda r: team(r) and cmd(r) == "DEPOSITO" and r["status"] == 200, n=2, v2_only=True)
add(S2, "IG-02", "A message with no `;` (empty `m`, bare `PING`) answers 400 `{\"error\":\"E103\",\"mensaje\":\"falta control\"}`.", lambda r: err(r) == "E103", n=3)
add(S2, "IG-03", "Any empty segment (`ALTA;;85`, a trailing `;`, `PING;`, `FOO;;1`) answers 400 `{\"error\":\"E104\",\"mensaje\":\"segmento vacío\"}`, before the control or the command are examined.", lambda r: err(r) == "E104", n=5)
add(S2, "IG-04", "A control that is not only digits (`5X`, `ZZ`) answers 400 `{\"error\":\"E201\",\"mensaje\":\"control mal formado\"}`, before the arity is examined.", lambda r: err(r) == "E201", n=4)
add(S2, "IG-05", "A numeric control with the wrong value answers 400 `{\"error\":\"E202\",\"mensaje\":\"control inválido\"}`, for any command, known or not, and before the arity is examined.", lambda r: err(r) == "E202" and (cmd(r) in ("FOO",) or r["hipotesis"].startswith("v2 request-level order") or r["id"] in (2,)), n=4)
add(S2, "IG-06", "Valid control = `(1 - 100 * N) mod 97`, where N is the number written by the uppercased `COMMAND;args` text: each digit is kept, each letter becomes its alphabet position (A=1..Z=26) in decimal, every other character is skipped. Checked over the whole log: all 326 requests the original accepted past the control check match the formula and none of the 153 requests it rejected with E202 does (0 contradictions); for `ALTA;A`, `ALTA;B` and `ALTA;AA` the candidates 0, 1, 2... were tried in order and every smaller value was rejected.", lambda r: r["hipotesis"].startswith("find valid check") and r["status"] in (200, 201), n=3, extra=ev(lambda r: r["hipotesis"].startswith("find valid check") and err(r) == "E202", 2, oldest=True))
add(S2, "IG-07", "Letter case and accents/spaces do not change the control: `ALTA;zoe`, `ALTA;José` and `ALTA;Ana Maria` use the formula with `é` and the space skipped.", lambda r: team(r) and cmd(r) == "ALTA" and r["status"] == 201 and len(parts(r)) > 1 and re.search(r"^[a-z]|é| ", parts(r)[1]), n=4)
add(S2, "IG-08", "The command name is case-insensitive (`CONSULTa;AC-0001` is `CONSULTA`).", lambda r: team(r) and re.match(r"^[A-Za-z]+$", cmd(r) and parts(r)[0]) and parts(r)[0] != parts(r)[0].upper() and r["status"] == 200, n=2)
add(S2, "IG-09", "`PING;<anything>` answers `{\"pong\":true}` without validating the control; `PING` needs exactly two fields (`PING;a;b` answers E302).", lambda r: team(r) and cmd(r) == "PING" and r["status"] in (200, 400) and (err(r) in (None, "E302")), n=4)
add(S2, "IG-10", "Evaluation order of a message: E100, E102, E103, E104, then (PING: arity, pong) then E201, E202, E301, E302, then the command's own rules.", lambda r: r["hipotesis"].startswith("v2 request-level order") or r["hipotesis"].startswith("v2 body shape"), n=6)

# 3. Commands
S3 = "3. Commands (Comandos)"
add(S3, "CM-01", "PING: `PING;control` answers 200 `{\"pong\":true}`; no state is read or changed.", lambda r: team(r) and cmd(r) == "PING" and r["status"] == 200, n=2)
add(S3, "CM-02", "ALTA: `ALTA;name;control` creates an account with balance 0 and answers 201 `{\"cuentaId\":\"AC-0001\"}`.", lambda r: team(r) and cmd(r) == "ALTA" and r["status"] == 201, n=3)
add(S3, "CM-03", "ALTA accepts names with spaces and accents, and duplicate names; each call creates a new id.", lambda r: team(r) and cmd(r) == "ALTA" and r["status"] == 201 and len(parts(r)) > 1 and ("é" in parts(r)[1] or " " in parts(r)[1]), n=2, extra=ev(lambda r: r["hipotesis"].startswith("v2 amount and id formats: ALTA;A") and r["status"] == 201, 2, dedupe=False))
add(S3, "CM-04", "ALTA with a wrong number of fields (`ALTA;Lucia;Gomez;11`) answers 400 `{\"error\":\"E302\",\"mensaje\":\"aridad inválida\"}`.", lambda r: err(r) == "E302" and cmd(r) == "ALTA", n=2)
add(S3, "CM-05", "CONSULTA: `CONSULTA;AC-0001;control` answers 200 `{\"cuenta_id\":\"AC-0001\",\"saldo\":\"1000.00\"}`; `saldo` is a string with two decimals (version 2).", lambda r: team(r) and cmd(r) == "CONSULTA" and isinstance(r.get("response"), dict) and isinstance(r["response"].get("saldo"), str), n=4)
add(S3, "CM-06", "CONSULTA of an unknown account answers 404 `{\"error\":\"E401\",\"mensaje\":\"cuenta inexistente\"}`; account ids are case sensitive (`ac-0001` is unknown).", lambda r: err(r) == "E401" and cmd(r) == "CONSULTA", n=3)
add(S3, "CM-07", "DEPOSITO: `DEPOSITO;account;amount;control` adds the amount (cents) to the account and answers 200 `{\"status\":\"recieved\",\"operacionId\":\"OP-0001\"}` (the typo `recieved` is part of the contract).", lambda r: team(r) and cmd(r) == "DEPOSITO" and r["status"] == 200 and len(amount(r)) <= 7, n=3, v2_only=True)
add(S3, "CM-08", "An amount must be digits only, start with 1-9, be greater than 0 and have at most 10 digits; otherwise 400 `{\"error\":\"E303\",\"mensaje\":\"monto inválido\"}` (`100.50`, `0`, `-5`, `1e3`, `007`, ` 5`, 11 digits).", lambda r: err(r) == "E303", n=8)
add(S3, "CM-09", "An amount of 10 digits (9999999999) is accepted. The exact cap between 10 and 11 digits is a 10-digit rule by inference; values from 10^10 to 10^11 were not individually probed.", lambda r: team(r) and cmd(r) == "DEPOSITO" and r["status"] == 200 and len(amount(r)) == 10, n=2)
add(S3, "CM-10", "TRANSFER: `TRANSFER;from;to;amount;control` moves the amount and answers 200 `{\"status\":\"recieved\",\"operacionId\":\"OP-0002\"}`.", lambda r: team(r) and cmd(r) == "TRANSFER" and r["status"] == 200, n=3, v2_only=True)
add(S3, "CM-11", "A transfer is limited to 50000 per operation (version 2): 50000 is accepted, 50001 and above answers 422 `{\"error\":\"E506\",\"mensaje\":\"límite excedido\"}`. Two transfers of 50000 in a row are both accepted, so the limit is not cumulative.", lambda r: team(r) and cmd(r) == "TRANSFER" and err(r) == "E506" and r["hipotesis"].startswith("limit probe"), n=2, extra=ev(lambda r: r["hipotesis"].startswith("limit probe 50000") and cmd(r) == "TRANSFER" and r["status"] == 200, 2, dedupe=False))
add(S3, "CM-12", "A transfer with origin equal to destination answers 400 `{\"error\":\"E304\",\"mensaje\":\"origen y destino iguales\"}`.", lambda r: err(r) == "E304", n=3)
add(S3, "CM-13", "A transfer above the origin's balance answers 422 `{\"error\":\"E507\",\"mensaje\":\"saldo insuficiente\"}`.", lambda r: err(r) == "E507", n=3)
add(S3, "CM-14", "Transfer rule order: amount E303, same account E304, unknown account E401, limit E506, balance E507. DEPOSITO: amount E303 before unknown account E401.", lambda r: r["hipotesis"].startswith("v2 validation order"), n=8)
add(S3, "CM-15", "ANULA: `ANULA;OP-0001;control` answers 200 `{\"ok\":true,\"anulada\":\"OP-0001\"}`; a second `ANULA` of the same operation answers 200 `{\"ok\":false,\"motivo\":\"ya anulada\"}`.", lambda r: team(r) and cmd(r) == "ANULA" and r["status"] == 200 and isinstance(r.get("response"), dict) and r["response"].get("ok") is True, n=2, v2_only=True, extra=ev(lambda r: team(r) and cmd(r) == "ANULA" and isinstance(r.get("response"), dict) and r["response"].get("ok") is False, 2, dedupe=False))
add(S3, "CM-16", "ANULA of an operation id that does not exist (or has different case) answers 404 `{\"error\":\"E402\",\"mensaje\":\"operación inexistente\"}`.", lambda r: err(r) == "E402", n=3)
add(S3, "CM-17", "An unknown command with a valid control answers 400 `{\"error\":\"E301\",\"mensaje\":\"comando desconocido \"}` (the message ends with a space).", lambda r: err(r) == "E301", n=3)

# 4. Memory between requests
S4 = "4. Memory between requests (Memoria entre requests)"
add(S4, "ME-01", "Account ids are sequential `AC-0001`, `AC-0002`... and operation ids sequential `OP-0001`... with independent counters; both restart after `__reset`.", lambda r: team(r) and cmd(r) in ("ALTA", "DEPOSITO", "TRANSFER") and r["status"] in (200, 201), n=6, v2_only=True)
add(S4, "ME-02", "A rejected operation (E303, E304, E401, E506, E507) does not consume an operation id: the next accepted operation takes the next number.", None, extra=REJECT_THEN_OK)
add(S4, "ME-03", "Balances are integers in cents, kept per account and visible through CONSULTA; DEPOSITO and TRANSFER change them immediately.", lambda r: team(r) and cmd(r) == "CONSULTA" and isinstance(r.get("response"), dict) and isinstance(r["response"].get("saldo"), str), n=3)
add(S4, "ME-04", "Cancelling a transfer returns the amount to the origin and removes it from the destination; cancelling a deposit removes it from the account. A balance can become negative (`\"-399.95\"`).", lambda r: r["hipotesis"].startswith("v2 anula on real ops") and cmd(r) in ("ANULA", "CONSULTA"), n=6, dedupe=False, extra=ev(lambda r: team(r) and cmd(r) == "CONSULTA" and isinstance(r.get("response"), dict) and str(r["response"].get("saldo", "")).startswith("-"), 1))
add(S4, "ME-05", "State is a single store for the token used; a second token has its own state (README). The replacement keeps one state; a different token is answered with the 401 of IN-04.", forced="assumed")

# 5. Errors
S5 = "5. Errors (Errores)"
ERR = [
    ("E001", 401, "no autorizado", "no or invalid token"),
    ("E100", 400, "json inválido", "body is not valid JSON"),
    ("E102", 400, "falta m", "JSON without a string field m"),
    ("E103", 400, "falta control", "message without ;"),
    ("E104", 400, "segmento vacío", "any empty segment"),
    ("E201", 400, "control mal formado", "control is not only digits"),
    ("E202", 400, "control inválido", "control value does not match"),
    ("E301", 400, "comando desconocido ", "unknown command (trailing space)"),
    ("E302", 400, "aridad inválida", "wrong number of fields"),
    ("E303", 400, "monto inválido", "amount rule"),
    ("E304", 400, "origen y destino iguales", "same account transfer"),
    ("E401", 404, "cuenta inexistente", "unknown account"),
    ("E402", 404, "operación inexistente", "unknown operation"),
    ("E404", 404, "ruta desconocida", "unknown route or method"),
    ("E506", 422, "límite excedido", "transfer above 50000"),
    ("E507", 422, "saldo insuficiente", "transfer above balance"),
]
for code, status, text, why in ERR:
    add(S5, f"ER-{code}", f"`{code}` is returned with status {status} and body `{{\"error\":\"{code}\",\"mensaje\":\"{text}\"}}`: {why}.", lambda r, code=code: err(r) == code, n=3)
add(S5, "ER-99", "Codes E101, E203-E299, E305+, E403+, E501-E505 and E508+ were never observed. An unhandled internal error answers 500 `{\"error\":\"E500\",\"mensaje\":\"error interno\"}` in the replacement (assumed, never observed on the original).", forced="assumed")

# 6. Changes during the day
S6 = "6. Changes during the day (Cambios durante el día)"
add(S6, "CH-01", "Version 2 (ticket FR-0153, 15:30): `saldo` changed from an integer (`40000`) to a string with two decimals (`\"400.00\"`); amounts are cents. Detected by replaying the version 1 recording.", lambda r: r["conclusion"].startswith("v2 change 1"), n=3)
add(S6, "CH-02", "Version 2: the per-operation transfer limit dropped from at least 100000 (accepted on version 1) to 50000. Detected by the replay (100000 now E506) and bisected to 50000/50001.", lambda r: r["conclusion"].startswith("v2 change 2: 100000"), n=1, extra=ev(lambda r: team(r) and cmd(r) == "TRANSFER" and amount(r) == "100000" and r["status"] == 200 and r["id"] <= V2, 1) + ev(lambda r: r["hipotesis"].startswith("limit probe") and err(r) == "E506", 2))
add(S6, "CH-03", "Candidate third change, not provable: amount validation E303 and same-account E304. Version 1 never exercised them, so they may not be new.", lambda r: err(r) == "E303", n=2, forced="probable", extra=ev(lambda r: err(r) == "E304", 1))
add(S6, "CH-04", "Unchanged in version 2: cancellation semantics, the control function, id formats and error texts.", lambda r: team(r) and cmd(r) in ("ANULA", "ALTA") and r["id"] > V2 and r["status"] in (200, 201), n=3)

# 7. Risks
S7 = "7. Risks (Riesgos)"
add(S7, "RK-01", "The control is a weak checksum (mod 97 of a derived number): it detects typos, not tampering, and any client can compute it. Close it with a keyed MAC.", lambda r: err(r) == "E202", n=2)
add(S7, "RK-02", "Validation order leaks information: an unknown command with a wrong control returns E202, and amount errors hide account existence. Return a uniform error for unauthorised or malformed input.", lambda r: r["hipotesis"].startswith("v2 request-level order") and err(r) == "E202", n=1, extra=ev(lambda r: r["hipotesis"].startswith("v2 validation order") and err(r) in ("E303", "E401"), 2))
add(S7, "RK-03", "Cancelling a deposit after the funds were spent leaves a negative balance. Reject the cancellation when the balance is insufficient, or model overdraft explicitly.", lambda r: team(r) and cmd(r) == "CONSULTA" and isinstance(r.get("response"), dict) and str(r["response"].get("saldo", "")).startswith("-"), n=2)
add(S7, "RK-04", "Amounts and balances change representation between versions (integer then string, cents), breaking clients silently. Version the API and keep types stable.", lambda r: r["conclusion"].startswith("v2 change 1"), n=2)
add(S7, "RK-05", "The typo `recieved` and the mixed `cuentaId` / `cuenta_id` keys are part of the contract; a new client should not copy them (fix behind a new version).", lambda r: team(r) and cmd(r) == "DEPOSITO" and r["status"] == 200, n=2)
add(S7, "RK-06", "State is per token and in memory: a restart or a second instance loses or splits accounts. Persist state and make operations idempotent.", forced="assumed")
add(S7, "RK-07", "Error texts are matched exactly (one has a trailing space); consumers should rely on codes only.", lambda r: err(r) == "E301", n=2)

# ---- spec.md
sections = []
for s in dict.fromkeys(b[0] for b in B):
    sections.append(s)
out = ["# Service specification: the black box (v2)", "",
       "Behavior of the service as observed through `lab/experimentos.jsonl` (evidence ids are line `id`s of that log). "
       "Confidence: **confirmed** (two or more supporting lines), **probable** (one line or inference), **assumed** "
       "(not probed; this is what the replacement does by default).", "",
       "Money is in cents; every request is `POST /msg {\"m\":\"...\"}` unless stated; all responses are JSON.", ""]
for s in sections:
    out += [f"## {s}", "", "| ID | Behavior | Evidence | Confidence |", "|---|---|---|---|"]
    for sec, bid, text, ids, c in B:
        if sec == s:
            out.append(f"| {bid} | {text.replace('|', '\\|')} | {', '.join(map(str, ids)) or '-'} | {c} |")
    out.append("")
(ROOT / "docs/spec.md").write_text("\n".join(out), encoding="utf-8")

# ---- validator
known = {r["id"] for r in rows}
bad = [(b[1], i) for b in B for i in b[3] if i not in known]
unsupported = [b[1] for b in B if b[4] in ("confirmed", "probable") and not b[3]]
assert not bad and not unsupported, (bad, unsupported)

# ---- submission log: organizers' fields only, one sequence per reset
seq, n = 0, 0
sub = []
for r in rows:
    if r.get("path") == "/__reset" and r.get("auth") == "team-token":
        seq += 1
    sub.append({"id": r["id"], "seq": f"s{seq}", "x_req": r["x_req"] if isinstance(r["x_req"], int) else None,
                "hipotesis": r["hipotesis"], "request": r["request"], "status": r["status"],
                "response": r["response"], "conclusion": r["conclusion"]})
(ROOT / "submission/experimentos.jsonl").write_text("\n".join(json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in sub) + "\n", encoding="utf-8")
count = {c: sum(1 for b in B if b[4] == c) for c in ("confirmed", "probable", "assumed")}
print("behaviors", len(B), count, "log lines", len(sub), "sequences", seq + 1)
