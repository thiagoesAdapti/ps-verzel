import { AppError } from "./errors.ts";

export function cents(value: unknown, min = 1n, max = 100_000_000n) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new AppError("VALIDATION_ERROR", 422, "Informe o valor em centavos inteiros.");
  }
  const parsed = BigInt(value);
  if (parsed < min || parsed > max) throw new AppError("VALIDATION_ERROR", 422, "Valor fora dos limites permitidos.");
  return parsed;
}

export const jsonMoney = (value: bigint | null | undefined) => value == null ? null : value.toString();

