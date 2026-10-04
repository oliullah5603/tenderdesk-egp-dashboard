import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const root = path.resolve("dist");
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const feedCache = new Map();
const feeds = [
  "https://pub-73034fb3150341c9b860d40d094b488f.r2.dev/tenders_active.json",
  "https://pub-73034fb3150341c9b860d40d094b488f.r2.dev/tenders_archived.json"
];
const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/cards.css", ["cards.css", "text/css; charset=utf-8"]],
  ["/cards.js", ["cards.js", "text/javascript; charset=utf-8"]],
  ["/auth.css", ["auth.css", "text/css; charset=utf-8"]],
  ["/auth.js", ["auth.js", "text/javascript; charset=utf-8"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml"]]
]);

const server = createServer(async (request, response) => {
  if (new URL(request.url, `http://${host}:${port}`).pathname === "/api/tenders" && request.method === "GET") {
    let sources;
    try {
      const url = new URL(request.url, `http://${host}:${port}`);
      const kind = url.searchParams.get("kind") === "archived" ? "archived" : "active";
      const index = kind === "archived" ? 1 : 0;
      let cached = feedCache.get(index);
      if (cached?.data && cached.expires <= Date.now()) {
        void fetch(feeds[index], { headers: { accept: "application/json" }, signal: AbortSignal.timeout(60_000) }).then(async res => {
          if (!res.ok) throw new Error(`Feed returned HTTP ${res.status}`);
          feedCache.set(index, { data: await res.json(), expires: Date.now() + 60_000 });
        }).catch(() => {});
      }
      if (cached?.data && cached.expires > Date.now()) {
        const body = JSON.stringify(cached.data);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60, stale-while-revalidate=300" });
        response.end(JSON.stringify({ source:"e-GP public tender feed", kind, fetchedAt:new Date(cached.expires-60_000).toISOString(), data:cached.data }));
        return;
      }
      sources = await fetch(feeds[index], {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(60_000)
      });
      if (!sources.ok || !sources.body) throw new Error(`Feed returned HTTP ${sources.status}`);
      const data = await sources.json();
      cached = { data, expires: Date.now() + 60_000 };
      feedCache.set(index, cached);
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60, stale-while-revalidate=300" });
      response.end(JSON.stringify({ source:"e-GP public tender feed", kind, fetchedAt:new Date().toISOString(), data }));
      return;
    } catch (error) {
      response.writeHead(502, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify({ error: "Unable to load the public tender feed", detail: String(error?.message || error) }));
      return;
    }

  }

  const asset = assets.get(new URL(request.url, `http://${host}:${port}`).pathname);
  if (!asset || (request.method !== "GET" && request.method !== "HEAD")) {
    response.writeHead(404).end("Not found");
    return;
  }
  const filename = path.join(root, asset[0]);
  try {
    const info = await stat(filename);
    response.writeHead(200, { "content-type": asset[1], "content-length": info.size, "cache-control": "no-cache" });
    if (request.method === "HEAD") response.end();
    else createReadStream(filename).pipe(response);
  } catch {
    response.writeHead(503).end("Build the site before starting the local server.");
  }
});

server.listen(port, host, () => {
  console.log(`Tenderdesk is running at http://${host}:${port}`);
});
