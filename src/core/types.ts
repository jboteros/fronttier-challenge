export interface HttpRequest {
  method: string;
  path: string;
  query: string;
  headers: Record<string, string | undefined>;
  rawBody: string;
  json: unknown;
  jsonValid: boolean;
  tooLarge: boolean;
}

export interface HttpResponse {
  status: number;
  body?: unknown;
  text?: string;
  meta?: Record<string, unknown>;
}

export interface Context<S> {
  readonly state: S;
  reset(): void;
  audit(event: string, data?: Record<string, unknown>): void;
  assumption(id: string, data?: Record<string, unknown>): void;
}

export interface Profile<S> {
  name: string;
  initialState(): S;
  handle(req: HttpRequest, ctx: Context<S>): HttpResponse;
}
