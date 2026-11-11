const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const money = (value) => "৳" + Number(value || 0).toLocaleString("bn-BD");

export async function onRequest({ request, env, params }) {
  const id = String(params.id || "").trim();
  if (!/^\d{1,12}$/.test(id)) return new Response("পণ্য পাওয়া যায়নি", { status: 404 });
  try {
    const product = await env.DB.prepare(
      "SELECT id,name,description,price,offer_price,image_url,category,tag FROM products WHERE id=? AND is_active=1 AND COALESCE(is_deleted,0)=0 LIMIT 1"
    ).bind(Number(id)).first();
    if (!product) return new Response("পণ্য পাওয়া যায়নি", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

    const origin = new URL(request.url).origin;
    const canonical = `${origin}/product/${encodeURIComponent(product.id)}`;
    const title = `${product.name} | SajjadHub ডিজাইন`;
    const description = String(product.description || `${product.name} — SajjadHub-এর ${product.category || "ডিজিটাল"} ডিজাইন। অর্ডার ও পেমেন্ট যাচাইয়ের পর ডাউনলোড করুন।`).replace(/\s+/g, " ").slice(0, 300);
    const image = product.image_url ? `${origin}/api/media/${encodeURIComponent(product.image_url)}` : "";
    const offer = product.offer_price != null && Number(product.offer_price) >= 0 && Number(product.offer_price) < Number(product.price);
    const price = offer ? Number(product.offer_price) : Number(product.price);
    const tags = String(product.tag || "").split(",").map((tag) => tag.trim()).filter(Boolean);
    const schema = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description,
      category: product.category || "Digital design",
      sku: String(product.id),
      ...(image ? { image: [image] } : {}),
      offers: {
        "@type": "Offer",
        url: canonical,
        priceCurrency: "BDT",
        price: String(price),
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
      },
    };
    const html = `<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHTML(title)}</title>
<meta name="description" content="${escapeHTML(description)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${escapeHTML(canonical)}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="SajjadHub">
<meta property="og:title" content="${escapeHTML(title)}">
<meta property="og:description" content="${escapeHTML(description)}">
<meta property="og:url" content="${escapeHTML(canonical)}">
${image ? `<meta property="og:image" content="${escapeHTML(image)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>
<style>
*{box-sizing:border-box}body{margin:0;background:#f7f8fa;color:#172033;font-family:system-ui,-apple-system,"Noto Sans Bengali",sans-serif}.wrap{max-width:960px;margin:40px auto;padding:24px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;overflow:hidden;box-shadow:0 12px 35px #17203312}.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,.9fr);gap:28px;padding:28px;align-items:center}.photo{width:100%;max-height:440px;object-fit:contain;border-radius:16px;background:#f1f3f5}.eyebrow{color:#667085;font-size:12px;letter-spacing:.12em}.price{font-size:28px;font-weight:800;color:#101828}.old{font-size:18px;color:#98a2b3;text-decoration:line-through;margin-right:10px}.tags{display:flex;gap:8px;flex-wrap:wrap}.tags span{background:#f1f5f9;padding:5px 10px;border-radius:20px;font-size:13px}a.button{display:inline-block;background:#111827;color:white;text-decoration:none;padding:13px 20px;border-radius:12px;font-weight:700;margin-top:16px}.desc{line-height:1.8;color:#475467;white-space:pre-wrap}.foot{padding:0 28px 28px;color:#667085;font-size:13px}@media(max-width:680px){.wrap{margin:12px auto;padding:12px}.hero{grid-template-columns:1fr;padding:18px}}
</style>
</head>
<body><main class="wrap"><article class="card"><section class="hero">
<div>${image ? `<img class="photo" src="${escapeHTML(image)}" alt="${escapeHTML(product.name)}">` : ""}</div>
<div><span class="eyebrow">SAJJADHUB · DIGITAL DESIGN</span><h1>${escapeHTML(product.name)}</h1><p>${escapeHTML(product.category || "ডিজিটাল ডিজাইন")}</p>
<div class="price">${offer ? `<span class="old">${money(product.price)}</span>` : ""}${money(price)}</div>
${tags.length ? `<div class="tags">${tags.map((tag) => `<span>#${escapeHTML(tag)}</span>`).join("")}</div>` : ""}
<p class="desc">${escapeHTML(description)}</p>
<a class="button" href="/?product=${encodeURIComponent(product.id)}">SajjadHub-এ অর্ডার করুন</a>
</div></section><footer class="foot">পেমেন্ট যাচাই সম্পন্ন হলে ডিজিটাল ফাইল ডাউনলোড করা যাবে। <a href="/">SajjadHub হোমপেজ</a></footer></article></main></body></html>`;
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("PRODUCT_PAGE_ERROR", error);
    return new Response("সার্ভারে সমস্যা হয়েছে।", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
