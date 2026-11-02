import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogToken, readCatalogToken, searchCatalog } from "../../src/modules/catalog/catalog.service.ts";

afterEach(() => vi.unstubAllGlobals());

describe("integração segura com a Open Library", () => {
  it("normaliza indisponibilidade externa como erro controlado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(searchCatalog(`indisponível-${randomUUID()}`)).rejects.toMatchObject({ code: "CATALOG_UNAVAILABLE", status: 503 });
  });

  it("normaliza resultados e limita os campos importados", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ docs: [{ key: "/works/OL1W", title: "Livro Externo", author_name: ["Autora"], first_publish_year: 2020, publisher: ["Editora"], cover_i: 123 }] }), { status: 200, headers: { "content-type": "application/json" } })));
    const result = await searchCatalog(`normalização-${randomUUID()}`);
    expect(result).toEqual([{ key: "/works/OL1W", title: "Livro Externo", authors: ["Autora"], publicationYear: 2020, publisher: "Editora", coverId: 123 }]);
  });

  it("vincula a seleção assinada ao leiloeiro e rejeita adulteração", () => {
    const owner = randomUUID();
    const book = { key: "/works/OL2W", title: "Livro Assinado", authors: ["Autor"], publicationYear: null, publisher: null, coverId: null };
    const token = createCatalogToken(book, owner);
    expect(readCatalogToken(token, owner)).toEqual(book);
    expect(() => readCatalogToken(token, randomUUID())).toThrow();
    expect(() => readCatalogToken(`${token.slice(0, -1)}x`, owner)).toThrow();
  });
});
