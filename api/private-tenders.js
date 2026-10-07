const SOURCE = "https://www.tenderbazar.com/";

function decodeHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:div|p|li|tr)>/gi, "\n")
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

function fieldFromRow(block, label) {
  for (const [, row] of block.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (cells.length < 3) continue;
    if (decodeHtml(cells[0]).replace(/\s+/g, " ").replace(/:$/, "").trim().toLowerCase() !== label.toLowerCase()) continue;
    return decodeHtml(cells.slice(2).join(" "));
  }
  return "";
}

function classifyOrganization(name) {
  const value = String(name || "");
  if (/\b(ministry|office of|department|directorate|division|government|govt\.?|upazila|district|executive engineer|city corporation|pourashava|public works|commissioner)\b/i.test(value)) {
    return "public";
  }
  if (/\b(private|pvt\.?|limited|ltd\.?|company|companies|group|industries|enterprise|university|ngo|mfi|bank|insurance|foundation|association|hospital|clinic|microfinance)\b/i.test(value)) {
    return "likely-private";
  }
  return "review";
}

function cleanDate(value) {
  const match = String(value || "").match(/\b(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{2,4})\b/);
  if (!match) return "";
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  return `${match[1].padStart(2, "0")}-${match[2]}-${year}`;
}

function cleanDeadline(value) {
  const date = cleanDate(value);
  if (!date) return String(value || "").trim();
  const time = String(value || "").match(/\bat\s+(\d{1,2}:\d{2})(?:\s*(AM|PM))?\b/i);
  return time ? `${date} ${time[1]}${time[2] ? ` ${time[2].toUpperCase()}` : ""}` : `${date} 23:59`;
}

function parseFeatured(html) {
  const starts = [...html.matchAll(/<div\b[^>]*class=["'][^"']*\blist_row\b[^"']*["'][^>]*>/gi)];
  const records = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index].index;
    const end = starts[index + 1]?.index ?? html.indexOf("</div>\n</div>", start);
    const block = html.slice(start, end > start ? end : html.length);
    const titleLink = block.match(/<a\b[^>]*href=["'](\/Tender\/(\d+)(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!titleLink) continue;
    const detailUrl = new URL(`/Tender/${titleLink[2]}`, SOURCE).href;
    const noticeImagePath = block.match(/<a\b[^>]*class=["'][^"']*list_details[^"']*["'][^>]*href=["']([^"']*\/Tender\/Image\/[^"']+)["']/i)?.[1] || "";
    const tenderIdText = fieldFromRow(block, "Tender ID");
    const place = tenderIdText.match(/Procuring Place\s*:\s*([^\n]+)/i)?.[1]?.trim() || "Bangladesh";
    const inviter = fieldFromRow(block, "Inviter");
    const publishedRaw = fieldFromRow(block, "Published On");
    const deadlineRaw = fieldFromRow(block, "Closed On");
    const documentPrice = fieldFromRow(block, "Doc. Price");
    const securityAmount = fieldFromRow(block, "Security Amt.");
    const tenderNumber = tenderIdText.match(/\b\d{8,}\b/)?.[0] || "";
    const inviterType = classifyOrganization(inviter);
    const sources = [...publishedRaw.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1].trim());
    const imageUrl = noticeImagePath ? new URL(noticeImagePath, SOURCE).href : "";
    records.push({
      id: tenderNumber || titleLink[2],
      sourceRecordId: titleLink[2],
      tenderReference: tenderNumber,
      title: decodeHtml(titleLink[3]),
      organization: inviter || "Organization not listed",
      organizationMatch: inviterType,
      category: fieldFromRow(block, "Type") || "Tender notice",
      publicationDate: cleanDate(publishedRaw),
      publicationSources: [...new Set(sources)],
      deadline: cleanDeadline(deadlineRaw),
      deadlineText: deadlineRaw,
      district: place,
      documentPrice,
      securityAmount,
      sourceUrl: detailUrl,
      documentUrl: imageUrl,
      sourceName: "TenderBazar",
      status: "pending_verification",
      eligibility: "Open the original TenderBazar notice to review complete requirements and submission instructions.",
    });
  }
  return records;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const response = await fetch(SOURCE, {
      headers: { accept: "text/html", "user-agent": "Infinico Tender BD public listing viewer/1.0" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`TenderBazar returned HTTP ${response.status}`);
    const html = await response.text();
    const records = parseFeatured(html);
    if (!records.length) throw new Error("TenderBazar returned no recognizable featured notices");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
    res.status(200).json({ source: SOURCE, scope: "public_featured_notices", fetchedAt: new Date().toISOString(), records });
  } catch {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "Unable to load TenderBazar public featured notices" });
  }
};
