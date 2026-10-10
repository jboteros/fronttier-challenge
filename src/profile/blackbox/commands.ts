import type { Context, HttpResponse } from "../../core/types";
import { ASSUMED, CATALOG, type CatalogEntry } from "./catalog";
import { accountId, operationId, type Operation, type State } from "./state";

// v2: 40000 is accepted and 100000 is rejected. Exact bound pending scripts/probe-limit.sh; 99999 is the least change.
const TRANSFER_LIMIT = 99_999;
const AMOUNT = /^\d+$/;

export interface CommandSpec {
  arity: number; // fields including command and check
  run(args: string[], ctx: Context<State>): HttpResponse;
}

// v2: balances are kept in cents and shown as a string with two decimals ("400.00", "-399.95").
function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function ok(status: number, body: unknown, rule: string): HttpResponse {
  return { status, body, meta: { rule } };
}

function fail(entry: CatalogEntry, rule?: string): HttpResponse {
  return { status: entry.status, body: { error: entry.error, mensaje: entry.mensaje }, meta: { error_code: entry.error, rule } };
}

function recorded(op: Operation, ctx: Context<State>): HttpResponse {
  ctx.state.operations.set(op.id, op);
  ctx.audit(op.kind.toLowerCase(), { operation: op.id, from: op.from, to: op.to, amount: op.amount });
  return ok(200, { status: "recieved", operacionId: op.id }, op.kind.toLowerCase());
}

function nextOperationId(ctx: Context<State>): string {
  return operationId(ctx.state.nextOperation++);
}

function parseAmount(raw: string | undefined, ctx: Context<State>): number | undefined {
  if (raw !== undefined && AMOUNT.test(raw)) return Number(raw);
  ctx.assumption("A-amount-invalid", { raw });
  return undefined;
}

export const COMMANDS: Record<string, CommandSpec> = {
  ALTA: {
    arity: 3,
    run([name], ctx) {
      const id = accountId(ctx.state.nextAccount++);
      ctx.state.accounts.set(id, { name: name ?? "", balance: 0 });
      ctx.audit("account_created", { account: id });
      return ok(201, { cuentaId: id }, "alta");
    },
  },
  CONSULTA: {
    arity: 3,
    run([id], ctx) {
      const account = ctx.state.accounts.get(id ?? "");
      if (!account) return fail(CATALOG.unknownAccount, "consulta");
      return ok(200, { cuenta_id: id, saldo: formatCents(account.balance) }, "consulta");
    },
  },
  DEPOSITO: {
    arity: 4,
    run([id, rawAmount], ctx) {
      const account = ctx.state.accounts.get(id ?? "");
      if (!account) return fail(CATALOG.unknownAccount, "deposito");
      const amount = parseAmount(rawAmount, ctx);
      if (amount === undefined) return fail(ASSUMED.invalidAmount, "deposito");
      account.balance += amount;
      return recorded({ id: nextOperationId(ctx), kind: "DEPOSITO", to: id as string, amount, annulled: false }, ctx);
    },
  },
  TRANSFER: {
    arity: 5,
    run([from, to, rawAmount], ctx) {
      const origin = ctx.state.accounts.get(from ?? "");
      const target = ctx.state.accounts.get(to ?? "");
      if (!origin || !target) return fail(CATALOG.unknownAccount, "transfer");
      const amount = parseAmount(rawAmount, ctx);
      if (amount === undefined) return fail(ASSUMED.invalidAmount, "transfer");
      if (from === to) ctx.assumption("A-transfer-same-account");
      if (amount > TRANSFER_LIMIT) {
        ctx.assumption("A-transfer-limit", { amount, limit: TRANSFER_LIMIT, note: "per-operation limit assumed, cumulative not excluded" });
        return fail(CATALOG.limitExceeded, "transfer");
      }
      if (origin.balance < amount) return fail(CATALOG.insufficientBalance, "transfer");
      origin.balance -= amount;
      target.balance += amount;
      return recorded({ id: nextOperationId(ctx), kind: "TRANSFER", from: from as string, to: to as string, amount, annulled: false }, ctx);
    },
  },
  ANULA: {
    arity: 3,
    run([id], ctx) {
      const operation = ctx.state.operations.get(id ?? "");
      if (!operation) return fail(CATALOG.unknownOperation, "anula");
      if (operation.annulled) return ok(200, { ok: false, motivo: "ya anulada" }, "anula");

      operation.annulled = true;
      const target = ctx.state.accounts.get(operation.to);
      if (target) target.balance -= operation.amount;
      if (operation.from) {
        ctx.assumption("A-anula-origin-refund", { operation: operation.id, note: "origin refund not observed on the original" });
        const origin = ctx.state.accounts.get(operation.from);
        if (origin) origin.balance += operation.amount;
      }
      ctx.audit("annulled", { operation: operation.id });
      return ok(200, { ok: true, anulada: operation.id }, "anula");
    },
  },
};
