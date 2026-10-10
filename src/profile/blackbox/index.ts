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
  return typeof json === "object" && json !== null && typeof (json as { m?: unknown }).m === "string";
}

// Evaluation order (assumed, only partly observed): command, arity, check format, check value, then the command.
function handleMessage(req: HttpRequest, ctx: Context<State>): HttpResponse {
  if (!isMessageBody(req.json)) {
    ctx.assumption("A-msg-body-shape", { note: "body without string field m; answered like an unknown command" });
    return fail(CATALOG.unknownCommand);
  }

  const fields = req.json.m.split(";");
  const command = (fields[0] ?? "").toUpperCase();
  if (command === "PING") return ok({ pong: true }, { rule: "ping" });

  const spec = COMMANDS[command];
  if (!spec) return fail(CATALOG.unknownCommand, { rule: "unknown-command" });
  if (fields.length !== spec.arity) return fail(CATALOG.invalidArity, { rule: "arity" });

  const check = fields[fields.length - 1] as string;
  if (!CHECK.test(check)) return fail(CATALOG.malformedCheck, { rule: "check-format" });

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
