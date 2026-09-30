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
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 60, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`Upstream feed returned HTTP ${response.status}`);
  return response.json();
}

function list(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["data", "tenders", "items", "records", "results", "notices", "content"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (payload && typeof payload === "object") {
    const array = Object.values(payload).find(Array.isArray);
    if (array) return array;
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/tenders") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      try {
        const [activePayload, archivedPayload] = await Promise.all([
          readFeed(FEEDS.active),
          readFeed(FEEDS.archived)
        ]);
        const active = list(activePayload);
        const archived = list(archivedPayload);
        if (!active || !archived) throw new Error("Feed JSON did not contain a tender list");
        return json(
          { source: "e-GP public tender feed", fetchedAt: new Date().toISOString(), active, archived },
          200,
          "public, max-age=60, stale-while-revalidate=300"
        );
      } catch (error) {
        return json({ error: "Unable to load the public tender feed", detail: String(error?.message || error) }, 502);
      }
    }

    if (!env.ASSETS) return new Response("Static asset binding is not configured.", { status: 503 });
    return env.ASSETS.fetch(request);
  }
};
