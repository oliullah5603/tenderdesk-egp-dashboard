const FEEDS = [
  "https://pub-73034fb3150341c9b860d40d094b488f.r2.dev/tenders_active.json",
  "https://pub-73034fb3150341c9b860d40d094b488f.r2.dev/tenders_archived.json"
];

const FEED_CACHE = new Map();
const CACHE_TTL = 60_000;

async function getFeed(index) {
  const cached = FEED_CACHE.get(index);
  if (cached?.promise) return cached.promise;
  const promise = fetch(FEEDS[index], { headers: { accept: "application/json" }, signal: AbortSignal.timeout(45_000) })
    .then((response) => {
      if (!response.ok) throw new Error(`Public feed returned HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      FEED_CACHE.set(index, { data, expires: Date.now() + CACHE_TTL });
      return data;
    })
    .catch((error) => {
      if (cached?.data) return cached.data;
      FEED_CACHE.delete(index);
      throw error;
    })
    .finally(() => {
      const current = FEED_CACHE.get(index);
      if (current?.promise === promise) {
        const data = cached?.data || null;
        FEED_CACHE.set(index, { data, expires: cached?.expires || 0 });
      }
    });
  FEED_CACHE.set(index, { data: cached?.data || null, expires: cached?.expires || 0, promise });
  return promise;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const kind = req.query?.kind === "archived" ? "archived" : "active";
    const index = kind === "archived" ? 1 : 0;
    const cached = FEED_CACHE.get(index);
    if (cached?.data && cached.expires <= Date.now() && !cached.promise) void getFeed(index).catch(() => {});
    const data = cached?.data && cached.expires > Date.now() ? cached.data : await getFeed(index);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.setHeader("ETag", `W/\"${kind}-${Buffer.byteLength(JSON.stringify(data))}-${cached?.expires || Date.now()}\"`);
    res.status(200).json({ source: "e-GP public tender feed", kind, fetchedAt: new Date().toISOString(), data });
  } catch (error) {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    res.status(502).json({ error: "Unable to load the public tender feed" });
  }
};
