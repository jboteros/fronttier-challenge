import http from "node:http";
import { emit } from "./log";
import type { Context, HttpRequest, HttpResponse, Profile } from "./types";

const MAX_BODY_BYTES = 1_000_000;
const LOG_INPUT_CHARS = 2_000;

function readBody(req: http.IncomingMessage): Promise<{ raw: string; tooLarge: boolean }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) tooLarge = true;
      else chunks.push(chunk);
    });
    req.on("end", () => resolve({ raw: Buffer.concat(chunks).toString("utf8"), tooLarge }));
    req.on("error", () => resolve({ raw: "", tooLarge }));
  });
}

function parseJson(raw: string): unknown {
  if (raw === "") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function createApp<S>(profile: Profile<S>): http.Server {
  let state = profile.initialState();
  let counter = 0;

  return http.createServer(async (incoming, outgoing) => {
    const id = ++counter;
    const started = process.hrtime.bigint();
    const url = new URL(incoming.url ?? "/", "http://local");
    const { raw, tooLarge } = await readBody(incoming);

    const headers: Record<string, string | undefined> = {};
    for (const [name, value] of Object.entries(incoming.headers)) {
      headers[name] = Array.isArray(value) ? value[0] : value;
    }
    const request: HttpRequest = {
      method: incoming.method ?? "GET",
      path: url.pathname,
      query: url.search,
      headers,
      rawBody: raw,
      json: parseJson(raw),
      tooLarge,
    };

    const ctx: Context<S> = {
      get state() {
        return state;
      },
      reset() {
        state = profile.initialState();
      },
      audit(event, data = {}) {
        emit("audit", { request_id: id, event, ...data });
      },
      assumption(assumptionId, data = {}) {
        emit("assumption_hit", { request_id: id, assumption: assumptionId, ...data });
      },
    };

    let response: HttpResponse;
    try {
      response = profile.handle(request, ctx);
    } catch (error) {
      emit("error", { request_id: id, stack: error instanceof Error ? error.stack : String(error) });
      ctx.assumption("A-internal-error");
      response = { status: 500, body: { error: "E500", mensaje: "error interno" } };
    }

    const payload = response.text ?? JSON.stringify(response.body ?? null);
    outgoing.writeHead(response.status, {
      "content-type": response.text === undefined ? "application/json" : "text/plain; charset=utf-8",
      "content-length": Buffer.byteLength(payload),
      "x-req": String(id),
    });
    outgoing.end(payload);

    const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
    emit("request", {
      request_id: id,
      method: request.method,
      path: request.path,
      input: raw.slice(0, LOG_INPUT_CHARS),
      status: response.status,
      response: response.text ?? response.body,
      latency_ms: Math.round(latencyMs * 100) / 100,
      ...response.meta,
    });
  });
}
