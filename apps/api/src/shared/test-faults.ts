export type TestFaultPoint = "bid.after_prepare" | "bid.after_database_commit";
export type ProcessTestFaultPoint = "settlement.before_commit";

const armedFaults = new Map<TestFaultPoint, number>();

export function armTestFault(point: TestFaultPoint, times = 1) {
  if (process.env.NODE_ENV !== "test") throw new Error("InjeÃ§Ã£o de falhas disponÃ­vel somente em testes.");
  armedFaults.set(point, times);
}

export function clearTestFaults() {
  armedFaults.clear();
}

export function hitTestFault(point: TestFaultPoint) {
  if (process.env.NODE_ENV !== "test") return;
  const remaining = armedFaults.get(point) ?? 0;
  if (remaining <= 0) return;
  if (remaining === 1) armedFaults.delete(point);
  else armedFaults.set(point, remaining - 1);
  throw new Error(`TEST_FAULT:${point}`);
}

export function hitProcessTestFault(point: ProcessTestFaultPoint) {
  if (process.env.NODE_ENV !== "test" || process.env.TEST_PROCESS_FAULT !== point) return;
  const requestedCode = Number(process.env.TEST_PROCESS_FAULT_EXIT_CODE ?? "86");
  process.exit(Number.isInteger(requestedCode) && requestedCode > 0 ? requestedCode : 86);
}

