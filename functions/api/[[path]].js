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

const safeProduct = (row) => ({
  id: row.id,
  name: row.name,
  category: row.category,
  price: row.price,
  tag: row.tag || "",
  description: row.description || "",
  fileType: row.file_type || "",
  bg: row.bg || "#e5e7eb",
  ink: row.ink || "#344054",
  title: row.title || "DESIGN",
  sub: row.sub || "DIGITAL DESIGN",
  imageUrl: row.image_key
    ? `/api/media/${encodeURIComponent(row.image_key)}`
    : null,
  hasFile: !!row.file_key,
  active: !!row.active,
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

  const canonicalRequest = [
    method,
    url.pathname,
    "",
    `host:${url.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    "",
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

  return fetch(url, {
    method,
    headers,
    body: method === "PUT" ? body : undefined,
  });
}

async function putB2(env, key, file, contentType) {
  const body = await file.arrayBuffer();
  const response = await b2Request(env, "PUT", key, body, contentType);

  if (!response.ok) {
    throw new Error(`B2 upload ব্যর্থ হয়েছে (${response.status})।`);
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

    if (route === "products" && method === "GET") {
      const { results = [] } = await env.DB.prepare(
        "SELECT * FROM products WHERE active=1 ORDER BY created_at DESC"
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
        "SELECT t.*, p.file_key, p.name FROM download_tokens t JOIN products p ON p.id=t.product_id WHERE t.token=?"
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
      const body = await request.json();
      const email = String(body.email || "").trim().slice(0, 254);
      const phone = String(body.phone || "").trim().slice(0, 30);
      const trx = String(body.trxId || "").trim().slice(0, 100);
      const items = Array.isArray(body.items) ? body.items : [];

      if (
        !/^\S+@\S+\.\S+$/.test(email) ||
        !/^01\d{9}$/.test(phone) ||
        trx.length < 4 ||
        !items.length ||
        items.length > 30
      ) {
        return json(
          {
            success: false,
            message: "ইমেইল, ১১ সংখ্যার ফোন, TrxID এবং পণ্য যাচাই করুন।",
          },
          400
        );
      }

      let total = 0;
      const valid = [];

      for (const item of items) {
        const product = await env.DB.prepare(
          "SELECT id, name, price FROM products WHERE id=? AND active=1"
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

      const orderId =
        "SH" +
        Date.now().toString(36).toUpperCase() +
        crypto.randomUUID().slice(0, 4).toUpperCase();

      await env.DB.prepare(
        "INSERT INTO orders(id,buyer_email,sender_phone,trx_id,total) VALUES(?,?,?,?,?)"
      )
        .bind(orderId, email, phone, trx, total)
        .run();

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
        const productId = id();
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

        await env.DB.prepare(
          "INSERT INTO products(id,name,category,price,tag,description,file_type,bg,ink,title,sub,image_key,file_key,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1)"
        )
          .bind(
            productId,
            name,
            category,
            Math.round(price),
            String(form.get("tag") || ""),
            String(form.get("description") || ""),
            String(form.get("fileType") || ""),
            String(form.get("bg") || "#e5e7eb"),
            String(form.get("ink") || "#344054"),
            String(form.get("title") || "DESIGN"),
            String(form.get("sub") || "DIGITAL DESIGN"),
            imageKey,
            fileKey
          )
          .run();

        return json({ success: true, id: productId });
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
        let imageKey = old.image_key;
        let fileKey = old.file_key;

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
          "UPDATE products SET name=?,category=?,price=?,tag=?,description=?,file_type=?,bg=?,ink=?,title=?,sub=?,image_key=?,file_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=?"
        )
          .bind(
            value("name"),
            value("category"),
            Math.round(price),
            value("tag"),
            value("description"),
            value("fileType", "file_type"),
            value("bg"),
            value("ink"),
            value("title"),
            value("sub"),
            imageKey,
            fileKey,
            productId
          )
          .run();

        // Remove replaced objects after the database update succeeds.
        if (imageKey !== old.image_key && old.image_key) {
          await deleteB2(env, old.image_key);
        }
        if (fileKey !== old.file_key && old.file_key) {
          await deleteB2(env, old.file_key);
        }

        return json({ success: true });
      }

      if (parts[1] === "products" && parts[2] && method === "DELETE") {
  const productId = parts[2];

  const old = await env.DB.prepare(
    "SELECT image_key, file_key FROM products WHERE id=?"
  )
    .bind(productId)
    .first();

  if (!old) {
    return json(
      { success: false, message: "পণ্য পাওয়া যায়নি" },
      404
    );
  }

  const orderCount = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM order_items WHERE product_id=?"
  )
    .bind(productId)
    .first();

  const tokenCount = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM download_tokens WHERE product_id=?"
  )
    .bind(productId)
    .first();

  if (orderCount.total > 0 || tokenCount.total > 0) {
    return json(
      {
        success: false,
        message: "এই ডিজাইনের অর্ডার বা ডাউনলোড রেকর্ড আছে। এটি মুছে ফেলা যাবে না।"
      },
      409
    );
  }

  await env.DB.prepare(
    "DELETE FROM products WHERE id=?"
  )
    .bind(productId)
    .run();

  if (old.image_key) {
    await deleteB2(env, old.image_key);
  }

  if (old.file_key) {
    await deleteB2(env, old.file_key);
  }

  return json({ success: true });
}
        const productId = parts[2];

        const old = await env.DB.prepare(
          "SELECT image_key,file_key FROM products WHERE id=?"
        )
          .bind(productId)
          .first();

        if (!old) {
          return json(
            { success: false, message: "পণ্য পাওয়া যায়নি।" },
            404
          );
        }

        await env.DB.prepare("DELETE FROM products WHERE id=?")
          .bind(productId)
          .run();

        if (old.image_key) await deleteB2(env, old.image_key);
        if (old.file_key) await deleteB2(env, old.file_key);

        return json({ success: true });
      }

      if (route === "admin/orders" && method === "GET") {
        const { results = [] } = await env.DB.prepare(
          "SELECT * FROM orders ORDER BY created_at DESC LIMIT 200"
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
          "SELECT id FROM orders WHERE id=?"
        )
          .bind(orderId)
          .first();

        if (!order) {
          return json(
            { success: false, message: "অর্ডার পাওয়া যায়নি।" },
            404
          );
        }

        await env.DB.prepare(
          "UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?"
        )
          .bind(status, orderId)
          .run();

        if (status === "paid") {
          const { results: items = [] } = await env.DB.prepare(
            "SELECT oi.product_id,p.file_key FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?"
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


  catch (error) {
    console.error("API ERROR:", error);
    return json(
      {
        success: false,
        message: "সার্ভারে সমস্যা হয়েছে।",
        detail:
          env.ENVIRONMENT === "development"
            ? String(error)
            : undefined,
      },
      500
    );
  }
}