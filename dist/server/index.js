const PAGE_ASSETS = ["index.html", "styles.css", "app.js", "favicon.svg"];
const FEEDS = {
  active: "https://pub-73034fb3150341c9b860d40d094b488f.r2.dev/tenders_active.json",
  archived: "https://pub-73034fb3150341c9b860d40d094b488f.r2.dev/tenders_archived.json"
};

function json(body, status = 200, cacheControl = "no-store") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cacheControl }
  });
}

async function readFeed(url) {
  const response = await fetch(url, { headers: { accept: "application/json" }, cf: { cacheTtl: 60, cacheEverything: true } });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`Feed returned HTTP ${response.status}`);
  }
  return response;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/tenders") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      try {
        const [active, archived] = await Promise.all([readFeed(FEEDS.active), readFeed(FEEDS.archived)]);
        const encoder = new TextEncoder();
        const readers = [active.body.getReader(), archived.body.getReader()];
        const stream = new ReadableStream({
          async start(controller) {
            try {
              controller.enqueue(encoder.encode(`{"source":"e-GP public tender feed","fetchedAt":"${new Date().toISOString()}","active":`));
              for (let i = 0; i < readers.length; i++) {
                if (i) controller.enqueue(encoder.encode(',"archived":'));
                while (true) {
                  const { done, value } = await readers[i].read();
                  if (done) break;
                  controller.enqueue(value);
                }
              }
              controller.enqueue(encoder.encode("}"));
              controller.close();
            } catch (error) {
              await Promise.all(readers.map((reader) => reader.cancel(error).catch(() => {})));
              controller.error(error);
            }
          },
          async cancel(reason) {
            await Promise.all(readers.map((reader) => reader.cancel(reason).catch(() => {})));
          }
        });
        return new Response(stream, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60, stale-while-revalidate=300" } });
      } catch (error) {
        return json({ error: "Unable to load the public tender feed", detail: String(error?.message || error) }, 502);
      }
    }

    if (!env.ASSETS) return new Response("Static assets are unavailable.", { status: 503 });
    const assetPath = url.pathname === "/" ? "/index.html" : url.pathname;
    if (!PAGE_ASSETS.includes(assetPath.slice(1))) return new Response("Not found", { status: 404 });
    return env.ASSETS.fetch(new Request(new URL(assetPath, url), request));
  }
};
