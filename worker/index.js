const PAGE_ASSETS = ["index.html", "styles.css", "app.js", "cards.css", "cards.js", "favicon.svg"];
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
        const kind = url.searchParams.get("kind") === "archived" ? "archived" : "active";
        const response = await readFeed(FEEDS[kind]);
        return new Response(response.body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60, stale-while-revalidate=300", "x-feed-kind": kind } });
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
