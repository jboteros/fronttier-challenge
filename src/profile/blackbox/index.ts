import type { Context, HttpRequest, HttpResponse, Profile } from "../../core/types";

// Every body here was observed on the original (see lab/experimentos.jsonl). Keep texts verbatim.
const CATALOG = {
  unauthorized: { status: 401, error: "E001", mensaje: "no autorizado" },
  unknownRoute: { status: 404, error: "E404", mensaje: "ruta desconocida" },
  unknownCommand: { status: 400, error: "E301", mensaje: "comando desconocido " },
} as const;

type CatalogEntry = (typeof CATALOG)[keyof typeof CATALOG];
type State = Record<string, never>;

function ok(body: unknown, meta?: Record<string, unknown>): HttpResponse {
  return { status: 200, body, meta };
}

function fail(entry: CatalogEntry, meta?: Record<string, unknown>): HttpResponse {
  return { status: entry.status, body: { error: entry.error, mensaje: entry.mensaje }, meta: { error_code: entry.error, ...meta } };
}

function isMessageBody(json: unknown): json is { m: string } {
  return typeof json === "object" && json !== null && typeof (json as { m?: unknown }).m === "string";
}

function handleMessage(req: HttpRequest, ctx: Context<State>): HttpResponse {
  if (!isMessageBody(req.json)) {
    ctx.assumption("A-msg-body-shape", { note: "body without string field m; answered like an unknown command" });
    return fail(CATALOG.unknownCommand);
  }
  const command = (req.json.m.split(";")[0] ?? "").toUpperCase();
  if (command === "PING") return ok({ pong: true }, { rule: "ping" });

  ctx.assumption("A-command-not-implemented", { command });
  return fail(CATALOG.unknownCommand, { rule: "unknown-command" });
}

export function createBlackboxProfile(config: { teamToken: string }): Profile<State> {
  return {
    name: "blackbox",
    initialState: () => ({}),
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
