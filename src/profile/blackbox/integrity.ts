import type { Context } from "../../core/types";
import { KNOWN_INVALID, KNOWN_VALID } from "./known-checks";
import type { State } from "./state";

export type Verdict = "valid" | "invalid";

export function verifyCheck(payload: string, check: number, ctx: Context<State>): Verdict {
  const valid = KNOWN_VALID[payload];
  if (valid !== undefined) return valid === check ? "valid" : "invalid";
  if (KNOWN_INVALID[payload]?.includes(check)) return "invalid";

  ctx.assumption("A-check-function-unknown", { payload, check });
  return "valid";
}
