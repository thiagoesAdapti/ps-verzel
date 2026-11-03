export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export type PageMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PaginatedResult<T, Summary = never> = {
  data: T;
  meta: PageMeta;
  summary?: Summary;
};

type ApiBody = {
  data?: unknown;
  meta?: PageMeta;
  summary?: unknown;
  error?: { code?: string; message?: string };
};

async function request(path: string, init?: RequestInit): Promise<ApiBody> {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  const body = await response.json().catch(() => ({})) as ApiBody;
  if (!response.ok) {
    throw new ApiError(
      body.error?.code ?? "INTERNAL_ERROR",
      body.error?.message ?? "Não foi possível concluir a operação.",
      response.status
    );
  }
  return body;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return (await request(path, init)).data as T;
}

export async function apiPage<T, Summary = never>(
  path: string,
  init?: RequestInit
): Promise<PaginatedResult<T, Summary>> {
  const body = await request(path, init);
  if (!body.meta) {
    throw new ApiError("INVALID_RESPONSE", "A resposta paginada não contém metadados.", 502);
  }
  return { data: body.data as T, meta: body.meta, summary: body.summary as Summary };
}

export const idempotencyKey = () => crypto.randomUUID();
