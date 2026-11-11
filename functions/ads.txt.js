const PUBLISHER_ID_PATTERN = /^pub-\\d{16}$/;

export async function onRequest({ env }) {
  const publisherId = String(env.ADSENSE_PUBLISHER_ID || "").trim();

  if (!PUBLISHER_ID_PATTERN.test(publisherId)) {
    return new Response("AdSense publisher ID is not configured.\n", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return new Response(
    `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\\n`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
