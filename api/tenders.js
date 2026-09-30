const FEEDS = [
  "https://pub-73034fb3150341c9b860d40d094b488f.r2.dev/tenders_active.json",
  "https://pub-73034fb3150341c9b860d40d094b488f.r2.dev/tenders_archived.json"
];

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const responses = await Promise.all(FEEDS.map((url) =>
      fetch(url, { headers: { accept: "application/json" } })
    ));

    const failed = responses.find((response) => !response.ok || !response.body);
    if (failed) {
      await Promise.all(responses.map((response) => response.body?.cancel().catch(() => {})));
      throw new Error(`Public feed returned HTTP ${failed.status}`);
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.write(`{"source":"e-GP public tender feed","fetchedAt":"${new Date().toISOString()}","active":`);

    for await (const chunk of responses[0].body) res.write(chunk);
    res.write(',"archived":');
    for await (const chunk of responses[1].body) res.write(chunk);
    res.end("}");
  } catch (error) {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    res.status(502).json({ error: "Unable to load the public tender feed" });
  }
};
