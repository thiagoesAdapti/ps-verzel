export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export const assert = (
  condition: unknown,
  code: string,
  status: number,
  message: string
): asserts condition => {
  if (!condition) throw new AppError(code, status, message);
};
