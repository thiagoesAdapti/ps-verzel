import { createServer } from "node:http";

const port = Number(process.env.PORT ?? "3311");
const cover = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (request.method === "GET" && url.pathname === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"status":"ok"}');
    return;
  }
  if (request.method === "GET" && url.pathname === "/search.json") {
    const query = url.searchParams.get("q") ?? "";
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        docs: [
          {
            key: "/works/OL-E2E-1W",
            title: `Resultado E2E: ${query}`,
            author_name: ["Machado de Assis"],
            first_publish_year: 1899,
            publisher: ["Editora E2E"],
            cover_i: 12345
          }
        ]
      })
    );
    return;
  }
  if (
    request.method === "GET" &&
    url.pathname === "/covers/b/id/12345-L.jpg"
  ) {
    response.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": String(cover.length)
    });
    response.end(cover);
    return;
  }
  response.writeHead(404, { "Content-Type": "application/json" });
  response.end('{"error":"not_found"}');
});

server.listen(port, "127.0.0.1");
const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
