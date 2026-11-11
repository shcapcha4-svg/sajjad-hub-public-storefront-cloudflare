const xmlEscape = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[ch]));

export async function onRequest({ request, env }) {
  const origin = new URL(request.url).origin;
  try {
    const { results = [] } = await env.DB.prepare(
      "SELECT id, created_at FROM products WHERE is_active=1 AND COALESCE(is_deleted,0)=0 ORDER BY id DESC"
    ).all();
    const today = new Date().toISOString().slice(0, 10);
    const urls = [
      `<url><loc>${xmlEscape(origin)}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      ...results.map((product) => {
        const rawDate = String(product.created_at || "");
        const parsed = Date.parse(rawDate.includes("T") ? rawDate : rawDate.replace(" ", "T") + "Z");
        const lastmod = Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : today;
        return `<url><loc>${xmlEscape(origin)}/product/${encodeURIComponent(product.id)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`;
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
