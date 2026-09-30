import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { once } from "node:events";

const root = path.resolve("dist");
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);
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
  ["/favicon.svg", ["favicon.svg", "image/svg+xml"]]
]);

const server = createServer(async (request, response) => {
  if (request.url === "/api/tenders" && request.method === "GET") {
    let sources;
    try {
      sources = await Promise.all(feeds.map((url) => fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(60_000)
      })));
      const failed = sources.find((source) => !source.ok || !source.body);
      if (failed) throw new Error(`Feed returned HTTP ${failed.status}`);
    } catch (error) {
      response.writeHead(502, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify({ error: "Unable to load the public tender feed", detail: String(error?.message || error) }));
      return;
    }

    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60, stale-while-revalidate=300"
    });
    response.write(`{"source":"e-GP public tender feed","fetchedAt":"${new Date().toISOString()}","active":`);
    for (let index = 0; index < sources.length; index++) {
      if (index) response.write(',"archived":');
      for await (const chunk of Readable.fromWeb(sources[index].body)) {
        if (!response.write(chunk)) await once(response, "drain");
      }
    }
    response.end("}");
    return;
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
