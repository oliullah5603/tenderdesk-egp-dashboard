const ORIGIN = "https://www.tenderbazar.com";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const id = String(req.query?.id || "");
  const token = String(req.query?.tp || "");
  if (!/^\d{4,12}$/.test(id) || !/^[A-Za-z0-9+/_=-]{8,180}$/.test(token)) {
    res.status(400).json({ error: "Invalid document reference" });
    return;
  }

  try {
    const detailUrl = new URL(`/Tender/Image/${id}`, ORIGIN);
    detailUrl.searchParams.set("tp", token);
    const detailResponse = await fetch(detailUrl, {
      headers: { accept: "text/html", "user-agent": "Infinico Tender BD public notice viewer/1.0" },
      signal: AbortSignal.timeout(20000),
    });
    if (!detailResponse.ok) throw new Error(`Notice page returned HTTP ${detailResponse.status}`);
    const html = await detailResponse.text();
    const imagePath = html.match(/<img\b[^>]*\bid=["']imgori["'][^>]*\bsrc=["']([^"']+)["']/i)?.[1]
      || html.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*\bid=["']imgori["']/i)?.[1];
    if (!imagePath) throw new Error("Original document image was not found");

    const imageUrl = new URL(imagePath, ORIGIN);
    if (imageUrl.origin !== ORIGIN || !/^\/Image\/\d+\/false$/.test(imageUrl.pathname)) {
      throw new Error("Unexpected document image location");
    }
    const imageResponse = await fetch(imageUrl, {
      headers: { accept: "image/*", "user-agent": "Infinico Tender BD public notice viewer/1.0" },
      signal: AbortSignal.timeout(20000),
    });
    if (!imageResponse.ok) throw new Error(`Document image returned HTTP ${imageResponse.status}`);
    const contentType = imageResponse.headers.get("content-type") || "application/octet-stream";
    if (!contentType.startsWith("image/")) throw new Error("The original document is not an image");
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    if (bytes.length > 12 * 1024 * 1024) throw new Error("Document image exceeds the display limit");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(bytes.length));
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(bytes);
  } catch {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "Unable to load this notice image" });
  }
};
