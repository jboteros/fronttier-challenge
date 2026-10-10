import type { Context } from "../../core/types";
import type { State } from "./state";

export type Verdict = "valid" | "invalid";

// Confirmed on the original: a space and "é" are skipped (ALTA;Ana Maria;44, ALTA;José;61 accepted).
const KNOWN_CHARSET = /^[A-Za-z0-9; é-]*$/;

// Fitted on 15 valid (payload, check) pairs from the original, zero mismatches:
//   N = digits of the uppercased payload "COMMAND;arg;..." with each letter replaced by its alphabet
//       position (A=1..Z=26) written in decimal; every other character is skipped.
//   check = (1 - 100 * N) mod 97
// Other characters (other accents, symbols) are assumed to be skipped the same way and logged as A-check-charset.
export function expectedCheck(payload: string): number {
  let digits = "";
  for (const ch of payload.toUpperCase()) {
    if (ch >= "0" && ch <= "9") digits += ch;
    else if (ch >= "A" && ch <= "Z") digits += String(ch.charCodeAt(0) - 64);
  }
  const n = BigInt(digits === "" ? "0" : digits);
  return Number(((1n - 100n * n) % 97n + 97n) % 97n);
}

export function verifyCheck(payload: string, rawCheck: string, ctx: Context<State>): Verdict {
  if (!KNOWN_CHARSET.test(payload)) ctx.assumption("A-check-charset", { payload });
  if (rawCheck.length > 2 && rawCheck.startsWith("0")) ctx.assumption("A-check-leading-zeros", { rawCheck });
  return expectedCheck(payload) === Number(rawCheck) ? "valid" : "invalid";
}
