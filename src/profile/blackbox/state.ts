export interface Account {
  name: string;
  balance: number;
}

export interface Operation {
  id: string;
  kind: "DEPOSITO" | "TRANSFER";
  from?: string;
  to: string;
  amount: number;
  annulled: boolean;
}

export interface State {
  accounts: Map<string, Account>;
  operations: Map<string, Operation>;
  nextAccount: number;
  nextOperation: number;
}

export function initialState(): State {
  return { accounts: new Map(), operations: new Map(), nextAccount: 1, nextOperation: 1 };
}

const pad = (prefix: string, n: number) => `${prefix}-${String(n).padStart(4, "0")}`;
export const accountId = (n: number) => pad("AC", n);
export const operationId = (n: number) => pad("OP", n);
