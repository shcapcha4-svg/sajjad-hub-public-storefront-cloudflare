const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

const enc = (value) => new TextEncoder().encode(value);

const b64u = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const unb64u = (value) =>
  Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (char) => char.charCodeAt(0)
  );

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return b64u(await crypto.subtle.sign("HMAC", key, enc(value)));
}

async function sessionCookie(secret) {
  const payload = b64u(
    enc(JSON.stringify({ admin: true, exp: Date.now() + 8 * 60 * 60 * 1000 }))
  );
  return `${payload}.${await sign(payload, secret)}`;
}

async function isAdmin(request, env) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/(?:^|; )sh_admin=([^;]+)/);

  if (!match || !env.SESSION_SECRET) return false;

  const [payload, signature] = match[1].split(".");
  if (!payload || !signature) return false;

  const expected = await sign(payload, env.SESSION_SECRET);
  if (signature !== expected) return false;

  try {
    const value = JSON.parse(
      new TextDecoder().decode(unb64u(payload))
    );
    return value.admin === true && value.exp > Date.now();
  } catch {
    return false;
  }
}

const cookie = (value, maxAge) =>
  `sh_admin=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

const customerCookie = (value, maxAge) =>
  `sh_customer=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

async function ensureCustomerTable(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS customer_accounts (id TEXT NOT NULL UNIQUE, email TEXT PRIMARY KEY COLLATE NOCASE, name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  const columns = await env.DB.prepare("PRAGMA table_info(customer_accounts)").all();
  if (!(columns.results || []).some((column) => column.name === "id")) await env.DB.prepare("ALTER TABLE customer_accounts ADD COLUMN id TEXT").run();
  const legacy = await env.DB.prepare("SELECT email FROM customer_accounts WHERE id IS NULL").all();
  for (const row of legacy.results || []) await env.DB.prepare("UPDATE customer_accounts SET id=? WHERE email=? AND id IS NULL").bind(id(), row.email).run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS customer_order_links (order_id INTEGER PRIMARY KEY, customer_id TEXT NOT NULL)").run();
}

async function passwordHash(password, saltHex) {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/.{2}/g).map((byte) => parseInt(byte, 16))) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  return { salt: hex(salt), hash: hex(bits) };
}

async function customerSessionCookie(customerId, secret) {
  const payload = b64u(enc(JSON.stringify({ customer: true, customerId, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 })));
  return `${payload}.${await sign(payload, secret)}`;
}

async function getCustomer(request, env) {
  const match = (request.headers.get("Cookie") || "").match(/(?:^|; )sh_customer=([^;]+)/);
  if (!match || !env.SESSION_SECRET) return null;
  const [payload, signature] = match[1].split(".");
  if (!payload || !signature || signature !== await sign(payload, env.SESSION_SECRET)) return null;
  try {
    const session = JSON.parse(new TextDecoder().decode(unb64u(payload)));
    if (session.customer !== true || session.exp <= Date.now()) return null;
    return await env.DB.prepare("SELECT id,email,name,created_at FROM customer_accounts WHERE id=? LIMIT 1").bind(String(session.customerId || "")).first();
  } catch { return null; }
}

const safeProduct = (row) => ({
  id: row.id,
  name: row.name,
  category: row.category,
  price: row.price,
  tag: "",
  description: row.description || "",
  fileType: "",
  bg: "#e5e7eb",
  ink: "#344054",
  title: "DESIGN",
  sub: "DIGITAL DESIGN",
  imageUrl: row.image_url ? `/api/media/${encodeURIComponent(row.image_url)}` : null,
  hasFile: !!row.file_url,
  active: !!row.is_active,
});

const id = () => crypto.randomUUID();

const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");

const awsEncode = (value) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );

async function hmac(key, value) {
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc(value))
  );
}

async function b2Request(env, method, key, body, contentType) {
  const {
    B2_BUCKET: bucket,
    B2_ENDPOINT: endpoint,
    B2_KEY_ID: keyId,
    B2_APPLICATION_KEY: applicationKey,
  } = env;

  if (!bucket || !endpoint || !keyId || !applicationKey) {
    throw new Error(
      "B2_BUCKET, B2_ENDPOINT, B2_KEY_ID ও B2_APPLICATION_KEY configure করা হয়নি।"
    );
  }

  const base = new URL(endpoint);
  const region = base.hostname.match(
    /^s3[.-]([^.]+)\.backblazeb2\.com$/
  )?.[1];

  if (base.protocol !== "https:" || !region) {
    throw new Error(
      "B2_ENDPOINT অবশ্যই সঠিক HTTPS Backblaze S3 endpoint হতে হবে।"
    );
  }

  const path = [
    base.pathname.replace(/\/+$/g, ""),
    awsEncode(bucket),
    ...key.split("/").map(awsEncode),
  ]
    .filter(Boolean)
    .join("/");

  const url = new URL(base);
  url.pathname = `/${path}`;

  const payloadHash = hex(
    await crypto.subtle.digest(
      "SHA-256",
      body || new Uint8Array()
    )
  );

  const amzDate = new Date()
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "");

  const headers = new Headers({
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  });

  if (contentType) headers.set("Content-Type", contentType);

  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalHeaders =
    `host:${url.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;

  const canonicalRequest = [
    method,
    url.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${amzDate.slice(0, 8)}/${region}/s3/aws4_request`;
  const requestHash = hex(
    await crypto.subtle.digest("SHA-256", enc(canonicalRequest))
  );

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    requestHash,
  ].join("\n");

  const rawKey = await crypto.subtle.importKey(
    "raw",
    enc(`AWS4${applicationKey}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const dateKey = await hmac(rawKey, amzDate.slice(0, 8));
  const regionKey = await crypto.subtle.importKey(
    "raw",
    dateKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const regionSecret = await hmac(regionKey, region);
  const regionSigningKey = await crypto.subtle.importKey(
    "raw",
    regionSecret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const serviceSecret = await hmac(regionSigningKey, "s3");
  const serviceSigningKey = await crypto.subtle.importKey(
    "raw",
    serviceSecret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signingSecret = await hmac(
    serviceSigningKey,
    "aws4_request"
  );

  const finalKey = await crypto.subtle.importKey(
    "raw",
    signingSecret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = hex(await hmac(finalKey, stringToSign));

  headers.set(
    "Authorization",
    `AWS4-HMAC-SHA256 Credential=${keyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  );


  return fetch(url, { method, headers });
}

async function putB2(env, key, file, contentType) {
  const body = new Uint8Array(await file.arrayBuffer());

  if (body.byteLength !== file.size) {
    throw new Error("আপলোডের ফাইলের আকার মেলেনি। আবার ফাইল নির্বাচন করুন।");
  }

  const { B2_BUCKET: bucket, B2_KEY_ID: keyId, B2_APPLICATION_KEY: applicationKey } = env;
  if (!bucket || !keyId || !applicationKey) {
    throw new Error("B2_BUCKET, B2_KEY_ID ও B2_APPLICATION_KEY configure করা হয়নি।");
  }

  // Authorize with the B2 Native API.
  const authResponse = await fetch(
    "https://api.backblazeb2.com/b2api/v4/b2_authorize_account",
    {
      headers: {
        Authorization: `Basic ${btoa(`${keyId}:${applicationKey}`)}`,
      },
    }
  );
  if (!authResponse.ok) {
    const detail = (await authResponse.text()).slice(0, 500);
    console.error("B2_AUTH_DIAG", JSON.stringify({
      status: authResponse.status,
      detail,
    }));
    throw new Error(`B2 authorization ব্যর্থ হয়েছে (${authResponse.status})। ${detail}`);
  }
  const auth = await authResponse.json();
  const storage = auth.apiInfo?.storageApi;
  const allowedBuckets = storage?.allowed?.buckets || [];
  const bucketInfo = allowedBuckets.find((item) => item.name === bucket);
  if (!storage?.apiUrl || !auth.authorizationToken || !bucketInfo?.id) {
    throw new Error("B2 authorization-এ নির্ধারিত bucket পাওয়া যায়নি।");
  }

  // Request a dedicated upload URL for this bucket.
  const uploadUrlResponse = await fetch(
    `${storage.apiUrl}/b2api/v4/b2_get_upload_url?bucketId=${encodeURIComponent(bucketInfo.id)}`,
    {
      headers: { Authorization: auth.authorizationToken },
    }
  );
  if (!uploadUrlResponse.ok) {
    const detail = (await uploadUrlResponse.text()).slice(0, 300);
    throw new Error(`B2 upload URL পাওয়া যায়নি (${uploadUrlResponse.status})। ${detail}`);
  }
  const uploadInfo = await uploadUrlResponse.json();

  const sha1 = hex(await crypto.subtle.digest("SHA-1", body));
  const uploadRequest = new Request(uploadInfo.uploadUrl, {
    method: "POST",
    headers: {
      Authorization: uploadInfo.authorizationToken,
      "X-Bz-File-Name": encodeURIComponent(key),
      "Content-Type": contentType || "b2/x-auto",
      "X-Bz-Content-Sha1": sha1,
    },
    // A TypedArray has a fixed length; Workers sets Content-Length automatically.
    body,
  });

  console.log("B2_NATIVE_UPLOAD_START", JSON.stringify({
    key,
    expectedBytes: body.byteLength,
    contentLength: uploadRequest.headers.get("content-length"),
    contentType: contentType || "b2/x-auto",
  }));

  const response = await fetch(uploadRequest);
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`B2 upload ব্যর্থ হয়েছে (${response.status})। ${detail}`);
  }

  const result = await response.json();
  if (result.contentLength !== body.byteLength || result.contentSha1 !== sha1) {
    throw new Error("B2-তে আপলোড সম্পন্ন হলেও ফাইলের আকার বা SHA-1 মেলেনি।");
  }
}
async function deleteB2(env, key) {
  const response = await b2Request(env, "DELETE", key);

  if (!response.ok) {
    throw new Error(`B2 delete ব্যর্থ হয়েছে (${response.status})।`);
  }
}

async function requireAdmin(request, env) {
  return isAdmin(request, env);
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean).slice(1);
  const route = parts.join("/");
  const method = request.method;

  try {
    if (route === "health" && method === "GET") {
      return json({ success: true, message: "Sajjadhub API online" });
    }

    if (route.startsWith("customer/")) {
      await ensureCustomerTable(env);
      if (!env.SESSION_SECRET) return json({ success: false, message: "সাইটের নিরাপত্তা সেটিংস প্রস্তুত নয়।" }, 503);

      if (route === "customer/register" && method === "POST") {
        const body = await request.json();
        const name = String(body.name || "").trim().slice(0, 120);
        const email = String(body.email || "").trim().slice(0, 254).toLowerCase();
        const password = String(body.password || "");
        if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 128) return json({ success: false, message: "নাম, সঠিক ইমেইল ও কমপক্ষে ৮ অক্ষরের পাসওয়ার্ড দিন।" }, 400);
        const exists = await env.DB.prepare("SELECT email FROM customer_accounts WHERE lower(email)=?").bind(email).first();
        if (exists) return json({ success: false, message: "এই ইমেইলে অ্যাকাউন্ট আছে। লগইন করুন।" }, 409);
        const pw = await passwordHash(password);
        const customerId = id();
        await env.DB.prepare("INSERT INTO customer_accounts(id,email,name,password_hash) VALUES(?,?,?,?)").bind(customerId, email, name, "pbkdf2$" + pw.salt + "$" + pw.hash).run();
        const session = await customerSessionCookie(customerId, env.SESSION_SECRET);
        return new Response(JSON.stringify({ success: true, customer: { email, name } }), { headers: { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": customerCookie(session, 2592000), "Cache-Control": "no-store" } });
      }

      if (route === "customer/login" && method === "POST") {
        const body = await request.json();
        const email = String(body.email || "").trim().slice(0, 254).toLowerCase();
        const password = String(body.password || "");
        const account = await env.DB.prepare("SELECT id,email,name,password_hash FROM customer_accounts WHERE lower(email)=? LIMIT 1").bind(email).first();
        if (!account) return json({ success: false, message: "ইমেইল বা পাসওয়ার্ড সঠিক নয়।" }, 401);
        const [algorithm, salt, storedHash] = String(account.password_hash).split("$");
        if (algorithm !== "pbkdf2" || !salt || !storedHash) return json({ success: false, message: "অ্যাকাউন্ট যাচাই করা যায়নি।" }, 401);
        const calculated = await passwordHash(password, salt);
        if (calculated.hash !== storedHash) return json({ success: false, message: "ইমেইল বা পাসওয়ার্ড সঠিক নয়।" }, 401);
        const session = await customerSessionCookie(account.id, env.SESSION_SECRET);
        return new Response(JSON.stringify({ success: true, customer: { email: account.email, name: account.name } }), { headers: { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": customerCookie(session, 2592000), "Cache-Control": "no-store" } });
      }

      if (route === "customer/logout" && method === "POST") return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json; charset=utf-8", "Set-Cookie": customerCookie("", 0), "Cache-Control": "no-store" } });

      if (route === "customer/me" && method === "GET") {
        const customer = await getCustomer(request, env);
        return json({ success: true, customer: customer ? { email: customer.email, name: customer.name } : null });
      }

      if (route === "customer/orders" && method === "GET") {
        const customer = await getCustomer(request, env);
        if (!customer) return json({ success: false, message: "অর্ডার দেখতে আগে লগইন করুন।" }, 401);
        const { results = [] } = await env.DB.prepare("SELECT o.id,o.total,o.status,o.created_at,oi.product_id,oi.product_name,oi.quantity,t.token FROM customer_order_links l JOIN orders o ON o.id=l.order_id JOIN order_items oi ON oi.order_id=o.id LEFT JOIN download_tokens t ON t.order_id=o.id AND t.product_id=oi.product_id WHERE l.customer_id=? ORDER BY datetime(o.created_at) DESC").bind(customer.id).all();
        const byOrder = new Map();
        for (const row of results) {
          if (!byOrder.has(row.id)) byOrder.set(row.id, { id: row.id, total: row.total, status: row.status, createdAt: row.created_at, items: [] });
          byOrder.get(row.id).items.push({ product_id: row.product_id, product_name: row.product_name, quantity: row.quantity, status: row.status, downloadUrl: row.status === "paid" && row.token ? `/api/download/${row.token}` : null });
        }
        return json({ success: true, orders: Array.from(byOrder.values()) });
      }
    }

    if (route === "products" && method === "GET") {
      const { results = [] } = await env.DB.prepare(
        "SELECT * FROM products WHERE is_active=1 ORDER BY created_at DESC"
      ).all();

      return json({
        success: true,
        products: results.map(safeProduct),
      });
    }

    // Public previews only. Private downloads are served through token URLs.
    if (route.startsWith("media/") && method === "GET") {
      const key = decodeURIComponent(parts.slice(1).join("/"));

      if (!key || !key.startsWith("previews/") || key.includes("..")) {
        return new Response("Not found", { status: 404 });
      }

      const object = await b2Request(env, "GET", key);

      if (object.status === 404) {
        return new Response("Not found", { status: 404 });
      }

      if (!object.ok) {
        throw new Error(`B2 download ব্যর্থ হয়েছে (${object.status})।`);
      }

      return new Response(object.body, {
        headers: {
          "Content-Type":
            object.headers.get("Content-Type") || "application/octet-stream",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    if (route.startsWith("download/") && method === "GET") {
      const token = decodeURIComponent(parts[1] || "");
      const row = await env.DB.prepare(
        "SELECT t.*, p.file_url AS file_key, p.name FROM download_tokens t JOIN products p ON p.id=t.product_id JOIN orders o ON o.id=t.order_id WHERE t.token=? AND o.status='paid'"
      )
        .bind(token)
        .first();

      if (!row || !row.file_key) {
        return new Response("ডাউনলোড লিংকটি অবৈধ।", { status: 404 });
      }

      const object = await b2Request(env, "GET", row.file_key);

      if (object.status === 404) {
        return new Response("ফাইল পাওয়া যায়নি।", { status: 404 });
      }

      if (!object.ok) {
        throw new Error(`B2 download ব্যর্থ হয়েছে (${object.status})।`);
      }

      return new Response(object.body, {
        headers: {
          "Content-Type":
            object.headers.get("Content-Type") || "application/octet-stream",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
            row.name || "design-file"
          )}`,
          "Cache-Control": "private, no-store",
        },
      });
    }    if (route === "checkout" && method === "POST") {
      await ensureCustomerTable(env);
      const customer = await getCustomer(request, env);
      if (!customer) return json({ success: false, message: "অর্ডার করতে আগে কাস্টমার অ্যাকাউন্টে লগইন করুন।" }, 401);
      const body = await request.json();
      const customerName = String(body.customerName || "").trim().slice(0, 120);
      const email = customer.email;
      const phone = String(body.phone || "").trim().slice(0, 30);
      const trx = String(body.trxId || "").trim().slice(0, 100);
      const items = Array.isArray(body.items) ? body.items : [];

      if (
        !customerName ||
        !/^\S+@\S+\.\S+$/.test(email) ||
        !/^01\d{9}$/.test(phone) ||
        trx.length < 4 ||
        !items.length ||
        items.length > 30
      ) {
        return json(
          {
            success: false,
            message: "নাম, ইমেইল, ১১ সংখ্যার ফোন, TrxID এবং পণ্য যাচাই করুন।",
          },
          400
        );
      }

      let total = 0;
      const valid = [];

      for (const item of items) {
        const product = await env.DB.prepare(
          "SELECT id, name, price FROM products WHERE id=? AND is_active=1"
        )
          .bind(String(item.id))
          .first();

        const quantity = Math.max(
          1,
          Math.min(20, Number(item.qty) || 1)
        );

        if (!product) {
          return json(
            {
              success: false,
              message: "একটি পণ্য আর পাওয়া যাচ্ছে না। পেজ রিফ্রেশ করুন।",
            },
            400
          );
        }

        total += product.price * quantity;
        valid.push({ product, quantity });
      }

      const first = valid[0].product;
      const inserted = await env.DB.prepare(
        "INSERT INTO orders(customer_name,phone,product_id,product_name,quantity,total_amount,payment_method,transaction_id,payment_status,customer_email) VALUES(?,?,?,?,?,?,?,?,?,?)"
      )
        .bind(customerName, phone, first.id, first.name, valid.reduce((sum, item) => sum + item.quantity, 0), total, "Nagad", trx, "pending", email)
        .run();
      const orderId = inserted.meta.last_row_id;
      await env.DB.prepare("INSERT INTO customer_order_links(order_id,customer_id) VALUES(?,?)").bind(orderId, customer.id).run();

      for (const item of valid) {
        await env.DB.prepare(
          "INSERT INTO order_items(order_id,product_id,product_name,unit_price,quantity) VALUES(?,?,?,?,?)"
        )
          .bind(
            orderId,
            item.product.id,
            item.product.name,
            item.product.price,
            item.quantity
          )
          .run();
      }

      return json({
        success: true,
        orderId,
        total,
        message:
          "অর্ডার জমা হয়েছে। পেমেন্ট যাচাই শেষে Admin Panel থেকে ডাউনলোড লিংক তৈরি করা যাবে।",
      });
    }

    if (route === "admin/login" && method === "POST") {
      const body = await request.json();

      if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
        return json(
          {
            success: false,
            message:
              "Cloudflare-এ ADMIN_PASSWORD ও SESSION_SECRET সেট করা হয়নি।",
          },
          503
        );
      }

      if (String(body.password || "") !== env.ADMIN_PASSWORD) {
        return json(
          { success: false, message: "পাসওয়ার্ড সঠিক নয়।" },
          401
        );
      }

      const value = await sessionCookie(env.SESSION_SECRET);

      return new Response(JSON.stringify({ success: true }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": cookie(value, 28800),
          "Cache-Control": "no-store",
        },
      });
    }

    if (route === "admin/logout" && method === "POST") {
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": cookie("", 0),
          "Cache-Control": "no-store",
        },
      });
    }

    if (route === "admin/me" && method === "GET") {
      return json({ success: await isAdmin(request, env) });
    }

    if (route.startsWith("admin/")) {
      if (!(await requireAdmin(request, env))) {
        return json(
          { success: false, message: "অনুমতি নেই। আবার লগইন করুন।" },
          401
        );
      }

      if (route === "admin/products" && method === "GET") {
        const { results = [] } = await env.DB.prepare(
          "SELECT * FROM products ORDER BY created_at DESC"
        ).all();

        return json({
          success: true,
          products: results.map(safeProduct),
        });
      }

      if (route === "admin/products" && method === "POST") {
        const form = await request.formData();
        const name = String(form.get("name") || "").trim();
        const category = String(form.get("category") || "").trim();
        const price = Number(form.get("price"));

        if (!name || !category || !Number.isFinite(price) || price < 0) {
          return json(
            { success: false, message: "নাম, ক্যাটাগরি ও সঠিক দাম দিন।" },
            400
          );
        }

        const image = form.get("image");
        const file = form.get("file");
        let imageKey = null;
        let fileKey = null;

        if (image instanceof File && image.size) {
          if (
            image.size > 8 * 1024 * 1024 ||
            !image.type.startsWith("image/")
          ) {
            return json(
              {
                success: false,
                message: "প্রিভিউ ছবি ৮ MB-এর মধ্যে হতে হবে।",
              },
              400
            );
          }

          imageKey = `previews/${id()}`;
          await putB2(env, imageKey, image, image.type);
        }

        if (file instanceof File && file.size) {
          if (file.size > 50 * 1024 * 1024) {
            return json(
              {
                success: false,
                message: "ডিজাইন ফাইল সর্বোচ্চ ৫০ MB হতে পারবে।",
              },
              400
            );
          }

          fileKey = `downloads/${id()}`;
          await putB2(
            env,
            fileKey,
            file,
            file.type || "application/octet-stream"
          );
        }

        const inserted = await env.DB.prepare(
          "INSERT INTO products(name,description,price,image_url,category,file_url,is_active) VALUES(?,?,?,?,?,?,1)"
        )
          .bind(name, String(form.get("description") || ""), Math.round(price), imageKey, category, fileKey)
          .run();

        return json({ success: true, id: inserted.meta.last_row_id });
      }      if (parts[1] === "products" && parts[2] && method === "PUT") {
        const productId = parts[2];
        const form = await request.formData();

        const old = await env.DB.prepare(
          "SELECT * FROM products WHERE id=?"
        )
          .bind(productId)
          .first();

        if (!old) {
          return json(
            { success: false, message: "পণ্য পাওয়া যায়নি।" },
            404
          );
        }

        const image = form.get("image");
        const file = form.get("file");
        let imageKey = old.image_url;
        let fileKey = old.file_url;

        if (image instanceof File && image.size) {
          if (
            image.size > 8 * 1024 * 1024 ||
            !image.type.startsWith("image/")
          ) {
            return json(
              {
                success: false,
                message: "প্রিভিউ ছবি ৮ MB-এর মধ্যে হতে হবে।",
              },
              400
            );
          }

          imageKey = `previews/${productId}/${id()}`;
          await putB2(env, imageKey, image, image.type);
        }

        if (file instanceof File && file.size) {
          if (file.size > 50 * 1024 * 1024) {
            return json(
              {
                success: false,
                message: "ডিজাইন ফাইল সর্বোচ্চ ৫০ MB হতে পারবে।",
              },
              400
            );
          }

          fileKey = `downloads/${productId}/${id()}`;
          await putB2(
            env,
            fileKey,
            file,
            file.type || "application/octet-stream"
          );
        }

        const value = (field, oldField = field) =>
          form.has(field) ? String(form.get(field)) : old[oldField];

        const price = form.has("price")
          ? Number(form.get("price"))
          : old.price;

        if (!Number.isFinite(price) || price < 0) {
          return json(
            { success: false, message: "দাম সঠিক নয়।" },
            400
          );
        }

        await env.DB.prepare(
          "UPDATE products SET name=?,category=?,price=?,description=?,image_url=?,file_url=?,is_active=1 WHERE id=?"
        )
          .bind(
            value("name"),
            value("category"),
            Math.round(price),
            value("description"),
            imageKey,
            fileKey,
            productId
          )
          .run();

        // Remove replaced objects after the database update succeeds.
        if (imageKey !== old.image_url && old.image_url) {
          // Keep the previous B2 object to prevent accidental data loss.
        }
        if (fileKey !== old.file_url && old.file_url) {
          // Keep the previous B2 object to prevent accidental data loss.
        }

        return json({ success: true });
      }

      if (parts[1] === "products" && parts[2] && method === "DELETE") {
  const productId = parts[2];

  const old = await env.DB.prepare(
    "SELECT image_url, file_url FROM products WHERE id=?"
  )
    .bind(productId)
    .first();

  if (!old) {
    return json(
      { success: false, message: "পণ্য পাওয়া যায়নি" },
      404
    );
  }

  // Safely hide the product from the storefront without deleting
  // its order history, download tokens, or any Backblaze files.
  await env.DB.prepare("UPDATE products SET is_active=0 WHERE id=?")
    .bind(productId)
    .run();

  return json({
    success: true,
    message: "ডিজাইনটি সাইট থেকে লুকানো হয়েছে। পুরোনো অর্ডার ও ফাইল সংরক্ষিত আছে।"
  });
}
      if (route === "admin/orders" && method === "GET") {
        const { results = [] } = await env.DB.prepare(
          "SELECT *, customer_email AS buyer_email, phone AS sender_phone, transaction_id AS trx_id, total_amount AS total, payment_status AS status FROM orders ORDER BY created_at DESC LIMIT 200"
        ).all();

        const orders = [];

        for (const order of results) {
          const { results: items = [] } = await env.DB.prepare(
            "SELECT * FROM order_items WHERE order_id=?"
          )
            .bind(order.id)
            .all();

          const { results: tokens = [] } = await env.DB.prepare(
            "SELECT t.token,t.product_id,p.name FROM download_tokens t JOIN products p ON p.id=t.product_id WHERE t.order_id=?"
          )
            .bind(order.id)
            .all();

          orders.push({
            ...order,
            items,
            downloads: tokens.map((token) => ({
              name: token.name,
              url: `/api/download/${token.token}`,
            })),
          });
        }

        return json({ success: true, orders });
      }

      if (parts[1] === "orders" && parts[2] && method === "PATCH") {
        const orderId = parts[2];
        const body = await request.json();
        const status = String(body.status || "");

        if (!["pending", "paid", "rejected"].includes(status)) {
          return json(
            { success: false, message: "স্ট্যাটাস সঠিক নয়।" },
            400
          );
        }

        const order = await env.DB.prepare(
          "SELECT id,payment_method FROM orders WHERE id=?"
        )
          .bind(orderId)
          .first();

        if (!order) {
          return json(
            { success: false, message: "অর্ডার পাওয়া যায়নি।" },
            404
          );
        }
        if (order.payment_method === "TEST MODE") {
          return json(
            { success: false, message: "ডেমো টেস্ট অর্ডারের পেমেন্ট স্ট্যাটাস পরিবর্তন করা যাবে না।" },
            400
          );
        }

        await env.DB.prepare(
          "UPDATE orders SET payment_status=?,verified_at=CASE WHEN ?='paid' THEN CURRENT_TIMESTAMP ELSE verified_at END WHERE id=?"
        )
          .bind(status, status, orderId)
          .run();

        if (status === "paid") {
          const { results: items = [] } = await env.DB.prepare(
            "SELECT oi.product_id,p.file_url AS file_key FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?"
          )
            .bind(orderId)
            .all();

          for (const item of items) {
            if (!item.file_key) continue;

            const exists = await env.DB.prepare(
              "SELECT token FROM download_tokens WHERE order_id=? AND product_id=?"
            )
              .bind(orderId, item.product_id)
              .first();

            if (!exists) {
              await env.DB.prepare(
                "INSERT INTO download_tokens(token,order_id,product_id) VALUES(?,?,?)"
              )
                .bind(
                  id().replaceAll("-", ""),
                  orderId,
                  item.product_id
                )
                .run();
            }
          }
        }

        return json({ success: true });
      }
    }
  } catch (error) {
    console.error("API ERROR:", error);
    return json(
      {
        success: false,
        message:
          error instanceof Error && error.message.startsWith("B2 upload ব্যর্থ হয়েছে")
            ? error.message
            : "সার্ভারে সমস্যা হয়েছে।",
        detail:
          env.ENVIRONMENT === "development"
            ? String(error)
            : undefined,
      },
      500
    );
  }
}