const xmlEscape = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[ch]));

const formatLastmod = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
};

export async function onRequest({ request, env }) {
  const origin = new URL(request.url).origin;
  try {
    // Support both the original schema ("active") and newer schemas
    // ("is_active") without changing or migrating the live database.
    const { results: columnRows = [] } = await env.DB.prepare(
      "PRAGMA table_info(products)"
    ).all();
    const columns = new Set(columnRows.map((column) => column.name));
    const activeColumn = columns.has("is_active")
      ? "is_active"
      : columns.has("active")
        ? "active"
        : null;

    if (!activeColumn) {
      throw new Error("Products table has no supported active-status column");
    }

    const deletedFilter = columns.has("is_deleted")
      ? " AND COALESCE(is_deleted,0)=0"
      : "";
    // Only use updated_at when the database actually has it. Never invent
    // modification dates from today's date or from the original creation date.
    const selectedColumns = columns.has("updated_at") ? "id, updated_at" : "id";
    const { results = [] } = await env.DB.prepare(
      `SELECT ${selectedColumns} FROM products WHERE ${activeColumn}=1${deletedFilter} ORDER BY id DESC`
    ).all();

    const staticPages = [
      "",
      "design-guide.html",
      "privacy-policy.html",
      "terms.html",
      "refund-policy.html",
      "contact.html",
    ];
    const urls = [
      ...staticPages.map((page) => `<url><loc>${xmlEscape(origin)}${page ? "/" + page : "/"}</loc></url>`),
      ...results.map((product) => {
        const lastmod = formatLastmod(product.updated_at);
        const loc = `${xmlEscape(origin)}/product/${encodeURIComponent(product.id)}`;
        return `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
      }),
    ];

    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("SITEMAP_ERROR", error);
    return new Response("Sitemap temporarily unavailable", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
