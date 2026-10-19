import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const root = process.cwd();
const allowed = (p) =>
  p === "/index.html" ||
  p.startsWith("/public/") ||
  p.startsWith("/demo/") ||
  p === "/";
http
  .createServer(async (req, res) => {
    try {
      const p = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (
        !["GET", "HEAD"].includes(req.method) ||
        !allowed(p) ||
        p.includes("..") ||
        p.includes("\\")
      ) {
        res.writeHead(404);
        res.end();
        return;
      }
      const file = p === "/" ? "/public/index.html" : p;
      const data = await readFile(path.join(root, file));
      const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
      };
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(file)] || "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(Number(process.env.PORT || 4173), "127.0.0.1", () =>
    console.log(
      `API Change Review: http://127.0.0.1:${process.env.PORT || 4173}`,
    ),
  );
