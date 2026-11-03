// Local, read-only preview. Only four public prototype assets are served.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml"]],
]);
const server = createServer(async (req, res) => {
  if (
    req.headers.host !== "127.0.0.1:4321" &&
    req.headers.host !== "localhost:4321"
  ) {
    res.writeHead(403);
    res.end();
    return;
  }
  const item = files.get((req.url ?? "").split("?")[0]);
  if (!item || !["GET", "HEAD"].includes(req.method)) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const data = await readFile(new URL(item[0], import.meta.url));
    res.writeHead(200, {
      "Content-Type": item[1],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(500);
    res.end("Nie można otworzyć podglądu.");
  }
});
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? "Port podglądu 4321 jest zajęty. Nie zamknięto żadnego procesu."
      : error.message,
  );
  process.exitCode = 1;
});
server.listen(4321, "127.0.0.1", () =>
  console.log("Podgląd projektu: http://127.0.0.1:4321"),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => server.close());
