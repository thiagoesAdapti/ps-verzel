import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "../../config/env.ts";
import { AppError } from "../../shared/errors.ts";

export type CatalogBook = { key: string; title: string; authors: string[]; publicationYear: number | null; publisher: string | null; coverId: number | null };
const bookSchema = z.object({ key: z.string().max(150), title: z.string().min(1).max(300), authors: z.array(z.string().max(120)).max(10), publicationYear: z.number().int().nullable(), publisher: z.string().max(250).nullable(), coverId: z.number().int().positive().nullable() });
const externalSchema = z.object({ docs: z.array(z.object({ key: z.string(), title: z.string(), author_name: z.array(z.string()).optional(), first_publish_year: z.number().int().optional(), publisher: z.array(z.string()).optional(), cover_i: z.number().int().optional() })) });
const cache = new Map<string, { expires: number; data: CatalogBook[] }>();
let lastRequest = 0;

function signature(value: string) { return createHmac("sha256", env.SESSION_SECRET).update(value).digest("base64url"); }
export function createCatalogToken(book: CatalogBook, userId: string) {
  const payload = Buffer.from(JSON.stringify({ book, userId, expiresAt: Date.now() + 30 * 60_000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function readCatalogToken(token: string, userId: string) {
  const [payload, received] = token.split(".");
  if (!payload || !received) throw new AppError("VALIDATION_ERROR", 422, "Seleção de livro inválida.");
  const expected = signature(payload);
  if (expected.length !== received.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(received))) throw new AppError("VALIDATION_ERROR", 422, "Seleção de livro inválida.");
  const decoded = z.object({ book: bookSchema, userId: z.uuid(), expiresAt: z.number() }).parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  if (decoded.userId !== userId || decoded.expiresAt < Date.now()) throw new AppError("VALIDATION_ERROR", 422, "A seleção do livro expirou. Pesquise novamente.");
  return decoded.book;
}

export async function searchCatalog(query: string) {
  const key = query.trim().toLowerCase();
  if (key.length < 2) throw new AppError("VALIDATION_ERROR", 422, "Informe ao menos dois caracteres.");
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;
  const wait = 1000 - (Date.now() - lastRequest);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequest = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const params = new URLSearchParams({ q: query, limit: "10", fields: "key,title,author_name,first_publish_year,publisher,cover_i" });
    const url = new URL(env.OPEN_LIBRARY_SEARCH_URL);
    url.search = params.toString();
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": `CasaDeLeiloes/1.0 (${env.OPEN_LIBRARY_CONTACT_EMAIL})` } });
    if (!response.ok) throw new Error(`Open Library ${response.status}`);
    const raw = externalSchema.parse(await response.json());
    const data = raw.docs.map((item) => ({ key: item.key, title: item.title, authors: item.author_name?.slice(0, 10) ?? ["Autor não informado"], publicationYear: item.first_publish_year ?? null, publisher: item.publisher?.[0] ?? null, coverId: item.cover_i ?? null }));
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: Date.now() + 15 * 60_000, data });
    return data;
  } catch { throw new AppError("CATALOG_UNAVAILABLE", 503, "A pesquisa de livros está temporariamente indisponível."); }
  finally { clearTimeout(timeout); }
}
