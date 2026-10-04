const SOURCE = "https://bppa.gov.bd/contract-award/contract-award-list.html";

function decodeHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/[\t\r\f ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function lines(cell) {
  return decodeHtml(cell).split("\n").map((value) => value.trim()).filter(Boolean);
}

function optionsFrom(html, name) {
  const select = html.match(new RegExp(`<select\\b[^>]*name=["']${name}["'][^>]*>([\\s\\S]*?)<\\/select>`, "i"));
  if (!select) return [];
  return [...select[1].matchAll(/<option\b[^>]*value=["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi)]
    .map(([, value, label]) => ({ value, label: decodeHtml(label) }))
    .filter((item) => item.value !== "0" && item.label);
}

function parseAwards(html) {
  const records = [];
  for (const [, body] of html.matchAll(/<tr\b[^>]*id=["']index_\d+["'][^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...body.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (cells.length < 8) continue;
    const ministry = lines(cells[1]);
    const reference = lines(cells[2]);
    const entity = lines(cells[3]);
    const supplier = lines(cells[6]);
    const detailPath = cells[1].match(/href=["']([^"']+)["']/i)?.[1] || "";
    records.push({
      serial: decodeHtml(cells[0]),
      ministry: ministry[0] || "",
      agency: ministry.slice(1).join(" · "),
      reference: reference[0] || "",
      title: reference.length > 2 ? reference[1] : reference.at(-1) || "",
      advertisementDate: reference.length > 2 ? reference.at(-1) : "",
      procuringEntity: entity[0] || "",
      procurementType: entity.at(-1) || "",
      district: decodeHtml(cells[4]),
      awardDate: decodeHtml(cells[5]),
      supplier: supplier[0] || "",
      supplierAddress: supplier.slice(1).join(" · "),
      contractValue: decodeHtml(cells[7]),
      detailUrl: detailPath ? new URL(detailPath, SOURCE).href : SOURCE,
    });
  }
  const resultText = decodeHtml(html.match(/<div\b[^>]*class=["'][^"']*pagination[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
  const total = Number(resultText.match(/\bof\s+([\d,]+)/i)?.[1]?.replace(/,/g, "")) || records.length;
  return { records, total };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const query = new URLSearchParams();
  const page = Math.max(0, Math.min(9999, Number.parseInt(req.query?.page || "0", 10) || 0));
  query.set("page", String(page));
  for (const key of ["procurementTypeId.id", "ministryId.id", "agencyId.id", "procurementMethodId.id", "viewResultBy"]) {
    const value = req.query?.[key];
    if (value && value !== "0") query.set(key, String(value).slice(0, 100));
  }

  try {
    const response = await fetch(`${SOURCE}?${query}`, {
      headers: { accept: "text/html", "user-agent": "Tenderdesk public-data viewer/1.0" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`BPPA returned HTTP ${response.status}`);
    const html = await response.text();
    const { records, total } = parseAwards(html);
    if (!records.length && !/\bof\s+[\d,]+/i.test(html)) throw new Error("BPPA returned an unrecognized award list");

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({
      source: SOURCE,
      fetchedAt: new Date().toISOString(),
      page,
      pageSize: records.length,
      total,
      records,
      filters: {
        natures: optionsFrom(html, "procurementTypeId.id"),
        ministries: optionsFrom(html, "ministryId.id"),
        methods: optionsFrom(html, "procurementMethodId.id"),
      },
    });
  } catch (error) {
    res.status(502).json({ error: "Unable to load contract awards from BPPA" });
  }
};
