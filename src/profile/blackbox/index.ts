import type { Context, HttpRequest, HttpResponse, Profile } from "../../core/types";
import { CATALOG, type CatalogEntry } from "./catalog";
import { COMMANDS } from "./commands";
import { verifyCheck } from "./integrity";
import { initialState, type State } from "./state";

const CHECK = /^\d+$/;

function ok(body: unknown, meta?: Record<string, unknown>): HttpResponse {
  return { status: 200, body, meta };
}

function fail(entry: CatalogEntry, meta?: Record<string, unknown>): HttpResponse {
  return { status: entry.status, body: { error: entry.error, mensaje: entry.mensaje }, meta: { error_code: entry.error, ...meta } };
}

function isMessageBody(json: unknown): json is { m: string } {
  return typeof json === "object" && json !== null && !Array.isArray(json) && typeof (json as { m?: unknown }).m === "string";
}

// Order observed on v2: json (E100) -> m present (E102) -> control present (E103) -> empty segment (E104)
// -> control format (E201) -> command (E301) -> arity (E302) -> control value (E202) -> command rules.
// E201 before E302 is proven (CONSULTA;AC-0001 gives E201). Relative order of E104/E201/E301 is only partly probed.
function handleMessage(req: HttpRequest, ctx: Context<State>): HttpResponse {
  if (!req.jsonValid) return fail(CATALOG.invalidJson, { rule: "json" });
  if (!isMessageBody(req.json)) return fail(CATALOG.missingMessage, { rule: "m" });

  const fields = req.json.m.split(";");
  if (fields.length < 2) return fail(CATALOG.missingCheck, { rule: "control-present" });

  const command = (fields[0] ?? "").toUpperCase();
  const check = fields[fields.length - 1] as string;
  const spec = COMMANDS[command];
  const malformedCheck = !CHECK.test(check);
  if (fields.some((f) => f === "")) {
    if (malformedCheck || (!spec && command !== "PING")) ctx.assumption("A-validation-order", { stage: "empty-segment", note: "E104 assumed before E201 and E301" });
    return fail(CATALOG.emptySegment, { rule: "empty-segment" });
  }
  if (command === "PING") return ok({ pong: true }, { rule: "ping" });
  if (malformedCheck) {
    if (!spec) ctx.assumption("A-validation-order", { stage: "control-format", note: "E201 assumed before E301" });
    return fail(CATALOG.malformedCheck, { rule: "check-format" });
  }
  if (!spec) return fail(CATALOG.unknownCommand, { rule: "unknown-command" });
  if (fields.length !== spec.arity) return fail(CATALOG.invalidArity, { rule: "arity" });

  const args = fields.slice(1, -1);
  if (verifyCheck([command, ...args].join(";"), check, ctx) === "invalid") {
    return fail(CATALOG.invalidCheck, { rule: "check-value" });
  }
  return spec.run(args, ctx);
}

export function createBlackboxProfile(config: { teamToken: string }): Profile<State> {
  return {
    name: "blackbox",
    initialState,
    handle(req, ctx) {
      const route = `${req.method} ${req.path}`;
      const known = route === "GET /health" || route === "POST /__reset" || route === "POST /msg";

      if (req.headers["authorization"] !== `Bearer ${config.teamToken}`) {
        if (!known) ctx.assumption("A-auth-before-route", { note: "unauthenticated request to an unknown route answered 401" });
        return fail(CATALOG.unauthorized, { auth: "denied" });
      }

      switch (route) {
        case "GET /health":
          return ok({ ok: true });
        case "POST /__reset":
          ctx.reset();
          ctx.audit("reset");
          return ok({ ok: true });
        case "POST /msg":
          return handleMessage(req, ctx);
        default:
          return fail(CATALOG.unknownRoute);
      }
    },
  };
}
