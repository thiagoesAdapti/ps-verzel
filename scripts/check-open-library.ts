import { searchCatalog } from "../apps/api/src/modules/catalog/catalog.service.ts";

const startedAt = Date.now();
const results = await searchCatalog("Machado de Assis");
if (results.length === 0) throw new Error("A Open Library respondeu sem resultados para a consulta de verificacao.");
if (!results.every((book) => book.key && book.title && Array.isArray(book.authors))) throw new Error("A resposta real da Open Library nao foi normalizada corretamente.");
console.log(`[external] Open Library real verificada: ${results.length} resultados normalizados em ${Date.now() - startedAt} ms.`);
