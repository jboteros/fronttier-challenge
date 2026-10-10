export function emit(kind: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), kind, ...fields }) + "\n");
}
