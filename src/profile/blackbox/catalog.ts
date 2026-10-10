export interface CatalogEntry {
  status: number;
  error: string;
  mensaje: string;
}

// Observed on the original (lab/experimentos.jsonl and the morning examples). Texts are verbatim.
export const CATALOG = {
  unauthorized: { status: 401, error: "E001", mensaje: "no autorizado" },
  unknownRoute: { status: 404, error: "E404", mensaje: "ruta desconocida" },
  invalidJson: { status: 400, error: "E100", mensaje: "json inválido" },
  missingMessage: { status: 400, error: "E102", mensaje: "falta m" },
  missingCheck: { status: 400, error: "E103", mensaje: "falta control" },
  emptySegment: { status: 400, error: "E104", mensaje: "segmento vacío" },
  malformedCheck: { status: 400, error: "E201", mensaje: "control mal formado" },
  invalidCheck: { status: 400, error: "E202", mensaje: "control inválido" },
  unknownCommand: { status: 400, error: "E301", mensaje: "comando desconocido " },
  invalidArity: { status: 400, error: "E302", mensaje: "aridad inválida" },
  unknownAccount: { status: 404, error: "E401", mensaje: "cuenta inexistente" },
  limitExceeded: { status: 422, error: "E506", mensaje: "límite excedido" },
  insufficientBalance: { status: 422, error: "E507", mensaje: "saldo insuficiente" },
  invalidAmount: { status: 400, error: "E303", mensaje: "monto inválido" },
  sameAccount: { status: 400, error: "E304", mensaje: "origen y destino iguales" },
  unknownOperation: { status: 404, error: "E402", mensaje: "operación inexistente" },
} as const satisfies Record<string, CatalogEntry>;
