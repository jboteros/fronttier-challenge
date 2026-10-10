# Service specification: the black box (v2)

Behavior of the service as observed through `lab/experimentos.jsonl` (evidence ids are line `id`s of that log). Confidence: **confirmed** (two or more supporting lines), **probable** (one line or inference), **assumed** (not probed; this is what the replacement does by default).

Money is in cents; every request is `POST /msg {"m":"..."}` unless stated; all responses are JSON.

## 1. Input (Entrada)

| ID | Behavior | Evidence | Confidence |
|---|---|---|---|
| IN-01 | `POST /msg` takes a JSON body `{"m": "<message>"}` and answers JSON. | 574, 575, 577 | confirmed |
| IN-02 | `GET /health` with a valid token answers 200 `{"ok":true}`. | 1 | probable |
| IN-03 | `POST /__reset` with a valid token answers 200 `{"ok":true}` and returns the state to its initial value. | 576 | probable |
| IN-04 | Without a token, with an invalid token, with a non-Bearer scheme or with an empty Bearer, `/health` and `/msg` answer 401 `{"error":"E001","mensaje":"no autorizado"}`. | 2, 5, 6, 7, 8 | confirmed |
| IN-05 | An unauthenticated request to an unknown route is assumed to answer 401 (authentication is checked before routing). Not probed. | - | assumed |
| IN-06 | With a valid token, an unknown path or a wrong method (`GET /msg`, `PUT /msg`, `GET /`, `GET /nope`) answers 404 `{"error":"E404","mensaje":"ruta desconocida"}`. | 256, 257, 258, 259 | confirmed |
| IN-07 | `POST /health` and `GET /__reset` are assumed to answer 404 like any other wrong method. Not probed. | - | assumed |
| IN-08 | A body that is not valid JSON answers 400 `{"error":"E100","mensaje":"json inválido"}`. | 547 | probable |
| IN-09 | A JSON body without a string field `m` (`{}`, `{"m":1}`, `[]`, `{"x":...}`) answers 400 `{"error":"E102","mensaje":"falta m"}`. | 548, 549, 551, 552 | confirmed |
| IN-10 | An empty request body is assumed to answer E100 (an empty string is not valid JSON). Not probed. | - | assumed |
| IN-11 | Request size limits and query strings were not probed. The replacement ignores query strings and accepts bodies up to 1 MB. | - | assumed |

## 2. Integrity (Integridad)

| ID | Behavior | Evidence | Confidence |
|---|---|---|---|
| IG-01 | A message is `COMMAND;arg;...;control`, fields separated by `;`. The last field is the control value. | 574, 575 | confirmed |
| IG-02 | A message with no `;` (empty `m`, bare `PING`) answers 400 `{"error":"E103","mensaje":"falta control"}`. | 550, 565 | confirmed |
| IG-03 | Any empty segment (`ALTA;;85`, a trailing `;`, `PING;`, `FOO;;1`) answers 400 `{"error":"E104","mensaje":"segmento vacío"}`, before the control or the command are examined. | 560, 561, 562, 563, 564 | confirmed |
| IG-04 | A control that is not only digits (`5X`, `ZZ`) answers 400 `{"error":"E201","mensaje":"control mal formado"}`, before the arity is examined. | 316, 554, 559, 567 | confirmed |
| IG-05 | A numeric control with the wrong value answers 400 `{"error":"E202","mensaje":"control inválido"}`, for any command, known or not, and before the arity is examined. | 557, 558 | confirmed |
| IG-06 | Valid control = `(1 - 100 * N) mod 97`, where N is the number written by the uppercased `COMMAND;args` text: each digit is kept, each letter becomes its alphabet position (A=1..Z=26) in decimal, every other character is skipped. Checked over the whole log: all 326 requests the original accepted past the control check match the formula and none of the 153 requests it rejected with E202 does (0 contradictions); for `ALTA;A`, `ALTA;B` and `ALTA;AA` the candidates 0, 1, 2... were tried in order and every smaller value was rejected. | 76, 77, 138, 198, 225 | confirmed |
| IG-07 | Letter case and accents/spaces do not change the control: `ALTA;zoe`, `ALTA;José` and `ALTA;Ana Maria` use the formula with `é` and the space skipped. | 324, 325, 326 | confirmed |
| IG-08 | The command name is case-insensitive (`CONSULTa;AC-0001` is `CONSULTA`). | 310 | probable |
| IG-09 | `PING;<anything>` answers `{"pong":true}` without validating the control; `PING` needs exactly two fields (`PING;a;b` answers E302). | 255, 301, 566 | confirmed |
| IG-10 | Evaluation order of a message: E100, E102, E103, E104, then (PING: arity, pong) then E201, E202, E301, E302, then the command's own rules. | 562, 563, 564, 565, 566, 567 | confirmed |

## 3. Commands (Comandos)

| ID | Behavior | Evidence | Confidence |
|---|---|---|---|
| CM-01 | PING: `PING;control` answers 200 `{"pong":true}`; no state is read or changed. | 255, 301 | confirmed |
| CM-02 | ALTA: `ALTA;name;control` creates an account with balance 0 and answers 201 `{"cuentaId":"AC-0001"}`. | 326, 527, 577 | confirmed |
| CM-03 | ALTA accepts names with spaces and accents, and duplicate names; each call creates a new id. | 325, 326, 537, 545 | confirmed |
| CM-04 | ALTA with a wrong number of fields (`ALTA;Lucia;Gomez;11`) answers 400 `{"error":"E302","mensaje":"aridad inválida"}`. | 319 | probable |
| CM-05 | CONSULTA: `CONSULTA;AC-0001;control` answers 200 `{"cuenta_id":"AC-0001","saldo":"1000.00"}`; `saldo` is a string with two decimals (version 2). | 310, 512, 546 | confirmed |
| CM-06 | CONSULTA of an unknown account answers 404 `{"error":"E401","mensaje":"cuenta inexistente"}`; account ids are case sensitive (`ac-0001` is unknown). | 314, 542 | confirmed |
| CM-07 | DEPOSITO: `DEPOSITO;account;amount;control` adds the amount (cents) to the account and answers 200 `{"status":"recieved","operacionId":"OP-0001"}` (the typo `recieved` is part of the contract). | 323, 500, 507 | confirmed |
| CM-08 | An amount must be digits only, start with 1-9, be greater than 0 and have at most 10 digits; otherwise 400 `{"error":"E303","mensaje":"monto inválido"}` (`100.50`, `0`, `-5`, `1e3`, `007`, ` 5`, 11 digits). | 533, 538, 539, 540, 541, 578, 579, 580 | confirmed |
| CM-09 | An amount of 10 digits (9999999999) is accepted. The exact cap between 10 and 11 digits is a 10-digit rule by inference; values from 10^10 to 10^11 were not individually probed. | 574, 575 | confirmed |
| CM-10 | TRANSFER: `TRANSFER;from;to;amount;control` moves the amount and answers 200 `{"status":"recieved","operacionId":"OP-0002"}`. | 486, 502, 508 | confirmed |
| CM-11 | A transfer is limited to 50000 per operation (version 2): 50000 is accepted, 50001 and above answers 422 `{"error":"E506","mensaje":"límite excedido"}`. Two transfers of 50000 in a row are both accepted, so the limit is not cumulative. | 476, 491, 501, 502 | confirmed |
| CM-12 | A transfer with origin equal to destination answers 400 `{"error":"E304","mensaje":"origen y destino iguales"}`. | 522, 529, 531 | confirmed |
| CM-13 | A transfer above the origin's balance answers 422 `{"error":"E507","mensaje":"saldo insuficiente"}`. | 315, 327, 535 | confirmed |
| CM-14 | Transfer rule order: amount E303, same account E304, unknown account E401, limit E506, balance E507. DEPOSITO: amount E303 before unknown account E401. | 528, 529, 530, 531, 532, 533, 534, 535 | confirmed |
| CM-15 | ANULA: `ANULA;OP-0001;control` answers 200 `{"ok":true,"anulada":"OP-0001"}`; a second `ANULA` of the same operation answers 200 `{"ok":false,"motivo":"ya anulada"}`. | 69, 509, 510, 513 | confirmed |
| CM-16 | ANULA of an operation id that does not exist (or has different case) answers 404 `{"error":"E402","mensaje":"operación inexistente"}`. | 313, 543 | confirmed |
| CM-17 | An unknown command with a valid control answers 400 `{"error":"E301","mensaje":"comando desconocido "}` (the message ends with a space). | 311 | probable |

## 4. Memory between requests (Memoria entre requests)

| ID | Behavior | Evidence | Confidence |
|---|---|---|---|
| ME-01 | Account ids are sequential `AC-0001`, `AC-0002`... and operation ids sequential `OP-0001`... with independent counters; both restart after `__reset`. | 571, 572, 573, 574, 575, 577 | confirmed |
| ME-02 | A rejected operation (E303, E304, E401, E506, E507) does not consume an operation id: the next accepted operation takes the next number. | 295, 297, 315, 317 | confirmed |
| ME-03 | Balances are integers in cents, kept per account and visible through CONSULTA; DEPOSITO and TRANSFER change them immediately. | 310, 512, 546 | confirmed |
| ME-04 | Cancelling a transfer returns the amount to the origin and removes it from the destination; cancelling a deposit removes it from the account. A balance can become negative (`"-399.95"`). | 329, 509, 510, 511, 512, 513, 514 | confirmed |
| ME-05 | State is a single store for the token used; a second token has its own state (README). The replacement keeps one state; a different token is answered with the 401 of IN-04. | - | assumed |

## 5. Errors (Errores)

| ID | Behavior | Evidence | Confidence |
|---|---|---|---|
| ER-E001 | `E001` is returned with status 401 and body `{"error":"E001","mensaje":"no autorizado"}`: no or invalid token. | 6, 7, 8 | confirmed |
| ER-E100 | `E100` is returned with status 400 and body `{"error":"E100","mensaje":"json inválido"}`: body is not valid JSON. | 547 | probable |
| ER-E102 | `E102` is returned with status 400 and body `{"error":"E102","mensaje":"falta m"}`: JSON without a string field m. | 549, 551, 552 | confirmed |
| ER-E103 | `E103` is returned with status 400 and body `{"error":"E103","mensaje":"falta control"}`: message without ;. | 550, 565 | confirmed |
| ER-E104 | `E104` is returned with status 400 and body `{"error":"E104","mensaje":"segmento vacío"}`: any empty segment. | 562, 563, 564 | confirmed |
| ER-E201 | `E201` is returned with status 400 and body `{"error":"E201","mensaje":"control mal formado"}`: control is not only digits. | 554, 559, 567 | confirmed |
| ER-E202 | `E202` is returned with status 400 and body `{"error":"E202","mensaje":"control inválido"}`: control value does not match. | 235, 557, 558 | confirmed |
| ER-E301 | `E301` is returned with status 400 and body `{"error":"E301","mensaje":"comando desconocido "}`: unknown command (trailing space). | 311 | probable |
| ER-E302 | `E302` is returned with status 400 and body `{"error":"E302","mensaje":"aridad inválida"}`: wrong number of fields. | 319, 566 | confirmed |
| ER-E303 | `E303` is returned with status 400 and body `{"error":"E303","mensaje":"monto inválido"}`: amount rule. | 578, 579, 580 | confirmed |
| ER-E304 | `E304` is returned with status 400 and body `{"error":"E304","mensaje":"origen y destino iguales"}`: same account transfer. | 522, 529, 531 | confirmed |
| ER-E401 | `E401` is returned with status 404 and body `{"error":"E401","mensaje":"cuenta inexistente"}`: unknown account. | 314, 534, 542 | confirmed |
| ER-E402 | `E402` is returned with status 404 and body `{"error":"E402","mensaje":"operación inexistente"}`: unknown operation. | 313, 543 | confirmed |
| ER-E404 | `E404` is returned with status 404 and body `{"error":"E404","mensaje":"ruta desconocida"}`: unknown route or method. | 257, 258, 259 | confirmed |
| ER-E506 | `E506` is returned with status 422 and body `{"error":"E506","mensaje":"límite excedido"}`: transfer above 50000. | 476, 491, 532 | confirmed |
| ER-E507 | `E507` is returned with status 422 and body `{"error":"E507","mensaje":"saldo insuficiente"}`: transfer above balance. | 315, 327, 535 | confirmed |
| ER-99 | Codes E101, E203-E299, E305+, E403+, E501-E505 and E508+ were never observed. An unhandled internal error answers 500 `{"error":"E500","mensaje":"error interno"}` in the replacement (assumed, never observed on the original). | - | assumed |

## 6. Changes during the day (Cambios durante el día)

| ID | Behavior | Evidence | Confidence |
|---|---|---|---|
| CH-01 | Version 2 (ticket FR-0153, 15:30): `saldo` changed from an integer (`40000`) to a string with two decimals (`"400.00"`); amounts are cents. Detected by replaying the version 1 recording. | 310, 512, 546 | confirmed |
| CH-02 | Version 2: the per-operation transfer limit dropped from at least 100000 (accepted on version 1) to 50000. Detected by the replay (100000 now E506) and bisected to 50000/50001. | 65, 309, 476, 491 | confirmed |
| CH-03 | Candidate third change, not provable: amount validation E303 and same-account E304. Version 1 never exercised them, so they may not be new. | 531, 579, 580 | probable |
| CH-04 | Unchanged in version 2: cancellation semantics, the control function, id formats and error texts. | 513, 527, 577 | confirmed |

## 7. Risks (Riesgos)

| ID | Behavior | Evidence | Confidence |
|---|---|---|---|
| RK-01 | The control is a weak checksum (mod 97 of a derived number): it detects typos, not tampering, and any client can compute it. Close it with a keyed MAC. | 557, 558 | confirmed |
| RK-02 | Validation order leaks information: an unknown command with a wrong control returns E202, and amount errors hide account existence. Return a uniform error for unauthorised or malformed input. | 533, 534, 558 | confirmed |
| RK-03 | Cancelling a deposit after the funds were spent leaves a negative balance. Reject the cancellation when the balance is insufficient, or model overdraft explicitly. | 329 | probable |
| RK-04 | Amounts and balances change representation between versions (integer then string, cents), breaking clients silently. Version the API and keep types stable. | 512, 546 | confirmed |
| RK-05 | The typo `recieved` and the mixed `cuentaId` / `cuenta_id` keys are part of the contract; a new client should not copy them (fix behind a new version). | 574, 575 | confirmed |
| RK-06 | State is per token and in memory: a restart or a second instance loses or splits accounts. Persist state and make operations idempotent. | - | assumed |
| RK-07 | Error texts are matched exactly (one has a trailing space); consumers should rely on codes only. | 311 | probable |
