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



async function ensureNotificationTable(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS customer_notifications (id TEXT PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'info', target_email TEXT, target_order_id INTEGER, link_url TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, is_active INTEGER NOT NULL DEFAULT 1)").run();
  const columns = await env.DB.prepare("PRAGMA table_info(customer_notifications)").all();
  if (!(columns.results || []).some((column) => column.name === "target_order_id")) {
    try {
      await env.DB.prepare("ALTER TABLE customer_notifications ADD COLUMN target_order_id INTEGER").run();
    } catch (error) {
      const refreshed = await env.DB.prepare("PRAGMA table_info(customer_notifications)").all();
      if (!(refreshed.results || []).some((column) => column.name === "target_order_id")) throw error;
    }
  }
}

async function ensureDownloadHistoryTable(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS download_history (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL, order_id INTEGER NOT NULL, product_id TEXT NOT NULL, customer_name TEXT, customer_email TEXT, downloaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_download_history_downloaded_at ON download_history(downloaded_at)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_download_history_order_product ON download_history(order_id,product_id)").run();
}

async function ensureProductColumns(env) {
  const columns = [
    ["tag", "ALTER TABLE products ADD COLUMN tag TEXT NOT NULL DEFAULT ''"],
    ["offer_price", "ALTER TABLE products ADD COLUMN offer_price INTEGER"],
    ["is_deleted", "ALTER TABLE products ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0"],
    ["is_active", "ALTER TABLE products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1"],
    ["image_url", "ALTER TABLE products ADD COLUMN image_url TEXT"],
    ["file_url", "ALTER TABLE products ADD COLUMN file_url TEXT"],
  ];
  let { results = [] } = await env.DB.prepare("PRAGMA table_info(products)").all();
  const originalColumns = new Set(results.map((column) => column.name));
  for (const [name, sql] of columns) {
    if (results.some((column) => column.name === name)) continue;
    try { await env.DB.prepare(sql).run(); }
    catch (error) {
      const refreshed = await env.DB.prepare("PRAGMA table_info(products)").all();
      if (!(refreshed.results || []).some((column) => column.name === name)) throw error;
    }
    const refreshed = await env.DB.prepare("PRAGMA table_info(products)").all();
    results = refreshed.results || results;
  }

  // Older D1 databases used active/image_key/file_key. Preserve those values
  // when bringing the table up to the current admin API column names.
  if (originalColumns.has("active") && !originalColumns.has("is_active")) {
    await env.DB.prepare("UPDATE products SET is_active=COALESCE(active,1)").run();
  }
  if (originalColumns.has("image_key") && !originalColumns.has("image_url")) {
    await env.DB.prepare("UPDATE products SET image_url=image_key WHERE image_url IS NULL").run();
  }
  if (originalColumns.has("file_key") && !originalColumns.has("file_url")) {
    await env.DB.prepare("UPDATE products SET file_url=file_key WHERE file_url IS NULL").run();
  }
}

const safeProduct = (row) => ({
  id: row.id,
  name: row.name,
  category: row.category,
  price: row.price,
  offerPrice: row.offer_price == null ? null : Number(row.offer_price),
  tag: row.tag || "",
  description: row.description || "",
  fileType: "",
  bg: "#e5e7eb",
  ink: "#344054",
  title: "DESIGN",
  sub: "DIGITAL DESIGN",
  createdAt: row.created_at || null,
  imageUrl: row.image_url ? `/api/media/${encodeURIComponent(row.image_url)}` : null,
  hasFile: !!row.file_url,
  active: !!(row.is_active ?? row.active),
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

async function ensureCustomerTables(env) {
  if (!env.DB) throw new Error("CUSTOMER_DB_BINDING_MISSING");
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS customer_members (id TEXT PRIMARY KEY, username TEXT NOT NULL, username_normalized TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login_at TEXT, is_active INTEGER NOT NULL DEFAULT 1)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS customer_auth_attempts (username_normalized TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, window_started_at INTEGER NOT NULL, locked_until INTEGER NOT NULL DEFAULT 0)").run();
  const members = await env.DB.prepare("PRAGMA table_info(customer_members)").all();
  const required = ["id", "username", "username_normalized", "password_hash", "password_salt", "created_at", "last_login_at", "is_active"];
  const present = new Set((members.results || []).map((column) => column.name));
  if (required.some((name) => !present.has(name))) throw new Error("CUSTOMER_MEMBERS_SCHEMA_INVALID");
  const attempts = await env.DB.prepare("PRAGMA table_info(customer_auth_attempts)").all();
  const attemptColumns = new Set((attempts.results || []).map((column) => column.name));
  if (["username_normalized", "attempts", "window_started_at", "locked_until"].some((name) => !attemptColumns.has(name))) {
    throw new Error("CUSTOMER_AUTH_SCHEMA_INVALID");
  }
}
const memberCookie = (value, maxAge) => "sh_member="+value+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age="+maxAge;
async function createMemberSession(memberId, secret) { const payload=b64u(enc(JSON.stringify({memberId,exp:Date.now()+30*24*60*60*1000}))); return payload+"."+await sign(payload,secret); }
async function currentMember(request, env) {
  if(!env.SESSION_SECRET)return null; const header=request.headers.get("Cookie")||"",match=header.match(/(?:^|; )sh_member=([^;]+)/); if(!match)return null;
  const parts=match[1].split("."),payload=parts[0],signature=parts[1]; if(!payload||!signature)return null; const expected=await sign(payload,env.SESSION_SECRET);
  if(signature.length!==expected.length||![...signature].every((ch,i)=>ch===expected[i]))return null;
  try { const data=JSON.parse(new TextDecoder().decode(unb64u(payload))); if(!data.memberId||data.exp<=Date.now())return null; return await env.DB.prepare("SELECT id,username,created_at FROM customer_members WHERE id=? AND is_active=1").bind(data.memberId).first(); } catch { return null; }
}
async function passwordDigest(password,salt) { const key=await crypto.subtle.importKey("raw",enc(password),"PBKDF2",false,["deriveBits"]); const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:100000,hash:"SHA-256"},key,256); return hex(bits); }
function validUsername(value){return /^[A-Za-z0-9_.-]{3,24}$/.test(value);}
async function failedMemberLogin(env,username) { const now=Date.now(),old=await env.DB.prepare("SELECT attempts,window_started_at FROM customer_auth_attempts WHERE username_normalized=?").bind(username).first(); const fresh=!old||now-Number(old.window_started_at)>900000,attempts=fresh?1:Number(old.attempts)+1,window=fresh?now:Number(old.window_started_at),locked=attempts>=8?now+900000:0; await env.DB.prepare("INSERT INTO customer_auth_attempts(username_normalized,attempts,window_started_at,locked_until) VALUES(?,?,?,?) ON CONFLICT(username_normalized) DO UPDATE SET attempts=excluded.attempts,window_started_at=excluded.window_started_at,locked_until=excluded.locked_until").bind(username,attempts,window,locked).run(); }

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean).slice(1);
  const route = parts.join("/");
  const method = request.method;

  try {
    if (route === "notifications" && method === "GET") {
      await ensureNotificationTable(env);
      const email = String(url.searchParams.get("email") || "").trim().toLowerCase().slice(0, 254);
      const orderIdInput = String(url.searchParams.get("orderId") || "").trim().replace(/^#/, "");
      const orderIdValue = /^\d{1,12}$/.test(orderIdInput) ? Number(orderIdInput) : 0;
      const { results = [] } = await env.DB.prepare(
        "SELECT id,title,message,type,link_url,created_at FROM customer_notifications WHERE is_active=1 AND (target_email IS NULL OR target_email='' OR (lower(target_email)=? AND target_order_id=?)) ORDER BY created_at DESC, rowid DESC LIMIT 50"
      ).bind(email, orderIdValue).all();
      return json({ success: true, notifications: results });
    }


    if (route === "customers/me" && method === "GET") {
      if (!env.SESSION_SECRET) return json({ success: true, member: null, authUnavailable: true });
      await ensureCustomerTables(env);
      const member=await currentMember(request,env);
      return json({success:true,member:member?{username:member.username,createdAt:member.created_at}:null});
    }
    if (route === "customers/register" && method === "POST") {
      if (!env.SESSION_SECRET) return json({ success: false, message: "সদস্য অ্যাকাউন্ট ব্যবস্থা এখন প্রস্তুত নয়। সাইট পরিচালকের সঙ্গে যোগাযোগ করুন।" }, 503);
      await ensureCustomerTables(env);
      const body=await request.json(),username=String(body.username||"").trim(),normalized=username.toLowerCase(),password=String(body.password||"");
      if(!validUsername(username))return json({success:false,message:"ইউজারনেম ৩–২৪ অক্ষরের হতে হবে; ইংরেজি অক্ষর, সংখ্যা, ডট, হাইফেন বা আন্ডারস্কোর ব্যবহার করুন।"},400);
      if(password.length<8||password.length>128)return json({success:false,message:"পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।"},400);
      const existing=await env.DB.prepare("SELECT id FROM customer_members WHERE username_normalized=?").bind(normalized).first();
      if(existing)return json({success:false,message:"এই ইউজারনেমটি আগে থেকেই ব্যবহার করা হয়েছে।"},409);
      const salt=crypto.getRandomValues(new Uint8Array(16)),hash=await passwordDigest(password,salt),memberId=id();
      try{await env.DB.prepare("INSERT INTO customer_members(id,username,username_normalized,password_hash,password_salt) VALUES(?,?,?,?,?)").bind(memberId,username,normalized,hash,hex(salt)).run();}
      catch(error){const again=await env.DB.prepare("SELECT id FROM customer_members WHERE username_normalized=?").bind(normalized).first();if(again)return json({success:false,message:"এই ইউজারনেমটি আগে থেকেই ব্যবহার করা হয়েছে।"},409);throw error;}
      await env.DB.prepare("UPDATE customer_members SET last_login_at=CURRENT_TIMESTAMP WHERE id=?").bind(memberId).run();
      const session=await createMemberSession(memberId,env.SESSION_SECRET);
      return new Response(JSON.stringify({success:true,member:{username,createdAt:new Date().toISOString()}}),{headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Set-Cookie":memberCookie(session,2592000)}});
    }
    if (route === "customers/login" && method === "POST") {
      if (!env.SESSION_SECRET) return json({ success: false, message: "সদস্য লগইন ব্যবস্থা এখন প্রস্তুত নয়। সাইট পরিচালকের সঙ্গে যোগাযোগ করুন।" }, 503);
      await ensureCustomerTables(env);
      const body=await request.json(),normalized=String(body.username||"").trim().toLowerCase().slice(0,24),password=String(body.password||"");
      if(!normalized||!password)return json({success:false,message:"ইউজারনেম ও পাসওয়ার্ড লিখুন।"},400);
      const attempt=await env.DB.prepare("SELECT attempts,window_started_at,locked_until FROM customer_auth_attempts WHERE username_normalized=?").bind(normalized).first();
      if(attempt&&Number(attempt.locked_until)>Date.now())return json({success:false,message:"অনেকবার ভুল চেষ্টা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।"},429);
      const member=await env.DB.prepare("SELECT id,username,password_hash,password_salt FROM customer_members WHERE username_normalized=? AND is_active=1").bind(normalized).first();
      let valid=false;
      if(member&&password.length<=128){const salt=Uint8Array.from(member.password_salt.match(/.{2}/g).map(x=>parseInt(x,16)));const actual=await passwordDigest(password,salt);valid=actual.length===member.password_hash.length&&[...actual].every((ch,i)=>ch===member.password_hash[i]);}
      if(!valid){await failedMemberLogin(env,normalized);return json({success:false,message:"ইউজারনেম অথবা পাসওয়ার্ড সঠিক নয়।"},401);}
      await env.DB.prepare("DELETE FROM customer_auth_attempts WHERE username_normalized=?").bind(normalized).run();
      await env.DB.prepare("UPDATE customer_members SET last_login_at=CURRENT_TIMESTAMP WHERE id=?").bind(member.id).run();
      const session=await createMemberSession(member.id,env.SESSION_SECRET);
      return new Response(JSON.stringify({success:true,member:{username:member.username}}),{headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Set-Cookie":memberCookie(session,2592000)}});
    }
    if (route === "customers/logout" && method === "POST") {
      return new Response(JSON.stringify({success:true}),{headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Set-Cookie":memberCookie("",0)}});
    }

    if (route === "hero-designs" && method === "GET") {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS store_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
      const setting = await env.DB.prepare("SELECT setting_value FROM store_settings WHERE setting_key='hero_designs'").first();
      let designs = { firstId: "", secondId: "", firstImageKey: "", secondImageKey: "" };
      try { if (setting?.setting_value) designs = { ...designs, ...JSON.parse(setting.setting_value) }; } catch {}
      designs.firstImageUrl = designs.firstImageKey ? "/api/media/" + encodeURIComponent(designs.firstImageKey) : null;
      designs.secondImageUrl = designs.secondImageKey ? "/api/media/" + encodeURIComponent(designs.secondImageKey) : null;
      return json({ success: true, designs });
    }

    if (route === "health" && method === "GET") {
      return json({ success: true, message: "Sajjadhub API online" });
    }

    if (route === "products" && method === "GET") {
      await ensureProductColumns(env);
      const { results = [] } = await env.DB.prepare(
        "SELECT * FROM products WHERE is_active=1 AND COALESCE(is_deleted,0)=0 ORDER BY created_at DESC"
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
        "SELECT t.*, p.file_url AS file_key, p.name FROM download_tokens t JOIN products p ON p.id=t.product_id JOIN orders o ON o.id=t.order_id AND o.payment_status='paid' WHERE t.token=?"
      )
        .bind(token)
        .first();

      if (!row || !row.file_key) {
        return new Response("ডাউনলোড লিংকটি অবৈধ।", { status: 404 });
      }

      // Paid order-এর ডাউনলোড লিংক সক্রিয় থাকবে; বাটনের ২০ সেকেন্ডের UI reset
      // ডাউনলোড সম্পন্ন হওয়াকে বাধা দেবে না এবং প্রয়োজন হলে পুনরায় ডাউনলোড করা যাবে।
      const object = await b2Request(env, "GET", row.file_key);

      if (object.status === 404) {
        return new Response("ফাইল পাওয়া যায়নি।", { status: 404 });
      }

      if (!object.ok) {
        throw new Error(`B2 download ব্যর্থ হয়েছে (${object.status})।`);
      }

      await ensureDownloadHistoryTable(env);
      const buyer = await env.DB.prepare("SELECT customer_name,customer_email FROM orders WHERE id=?").bind(row.order_id).first();
      await env.DB.prepare("INSERT INTO download_history(token,order_id,product_id,customer_name,customer_email) VALUES(?,?,?,?,?)").bind(token,row.order_id,row.product_id,buyer?.customer_name||"",buyer?.customer_email||"").run();

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
    }    if (route === "my-orders" && method === "POST") {
      const body = await request.json();
      const orderIdInput = String(body.orderId || "").trim().replace(/^#/, "");
      const email = String(body.email || "").trim().slice(0, 254).toLowerCase();

      if (!/^\d{1,12}$/.test(orderIdInput) || !/^\S+@\S+\.\S+$/.test(email)) {
        return json(
          { success: false, message: "সঠিক অর্ডার নম্বর ও অর্ডারের সময় দেওয়া ইমেইল লিখুন।" },
          400
        );
      }

      const order = await env.DB.prepare(
        "SELECT id,customer_name,total_amount AS total,payment_status AS status,created_at FROM orders WHERE id=? AND lower(customer_email)=? LIMIT 1"
      )
        .bind(Number(orderIdInput), email)
        .first();

      if (!order) {
        return json(
          { success: false, message: "এই অর্ডার নম্বর ও ইমেইল দিয়ে কোনো অর্ডার পাওয়া যায়নি।" },
          404
        );
      }

      const { results: items = [] } = await env.DB.prepare(
        "SELECT product_id,product_name,quantity,unit_price FROM order_items WHERE order_id=?"
      )
        .bind(order.id)
        .all();

      let downloads = [];
      if (order.status === "paid") {
        // Repair missing download tokens for already-paid orders.
        // This also covers orders approved before a token was created.
        const { results: downloadableItems = [] } = await env.DB.prepare(
          "SELECT oi.product_id,p.file_url AS file_key FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=? AND p.file_url IS NOT NULL AND p.file_url<>''"
        )
          .bind(order.id)
          .all();

        for (const item of downloadableItems) {
          const existing = await env.DB.prepare(
            "SELECT token FROM download_tokens WHERE order_id=? AND product_id=?"
          )
            .bind(order.id, item.product_id)
            .first();

          if (!existing) {
            await env.DB.prepare(
              "INSERT INTO download_tokens(token,order_id,product_id) VALUES(?,?,?)"
            )
              .bind(id().replaceAll("-", ""), order.id, item.product_id)
              .run();
          }
        }

        const { results: tokensWithExpiry = [] } = await env.DB.prepare(
          "SELECT t.token,t.product_id,p.name FROM download_tokens t JOIN products p ON p.id=t.product_id WHERE t.order_id=? AND p.file_url IS NOT NULL AND p.file_url<>''"
        )
          .bind(order.id)
          .all();

        downloads = tokensWithExpiry.map((token) => ({
          productId: token.product_id,
          name: token.name,
          url: `/api/download/${token.token}`,
        }));
      }

      return json({
        success: true,
        order: {
          id: order.id,
          customerName: order.customer_name,
          total: order.total,
          status: order.status,
          createdAt: order.created_at,
          items,
          downloads,
        },
      });
    }

    if (route === "checkout" && method === "POST") {
      const body = await request.json();
      const customerName = String(body.customerName || "").trim().slice(0, 120);
      const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
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

      await ensureProductColumns(env);
      let total = 0;
      const valid = [];

      for (const item of items) {
        const product = await env.DB.prepare(
          "SELECT id, name, price, offer_price FROM products WHERE id=? AND is_active=1 AND COALESCE(is_deleted,0)=0"
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

        const payablePrice = product.offer_price != null && Number(product.offer_price) >= 0 && Number(product.offer_price) < Number(product.price) ? Number(product.offer_price) : Number(product.price);
        total += payablePrice * quantity;
        valid.push({ product: { ...product, payablePrice }, quantity });
      }

      const first = valid[0].product;
      const inserted = await env.DB.prepare(
        "INSERT INTO orders(customer_name,phone,product_id,product_name,quantity,total_amount,payment_method,transaction_id,payment_status,customer_email) VALUES(?,?,?,?,?,?,?,?,?,?)"
      )
        .bind(customerName, phone, first.id, first.name, valid.reduce((sum, item) => sum + item.quantity, 0), total, "Nagad", trx, "pending", email)
        .run();
      const orderId = inserted.meta.last_row_id;

      for (const item of valid) {
        await env.DB.prepare(
          "INSERT INTO order_items(order_id,product_id,product_name,unit_price,quantity) VALUES(?,?,?,?,?)"
        )
          .bind(
            orderId,
            item.product.id,
            item.product.name,
            item.product.payablePrice,
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

      if (route === "admin/downloads" && method === "GET") {
        await ensureDownloadHistoryTable(env);
        const params = new URL(request.url).searchParams;
        const from = params.get("from") || "";
        const to = params.get("to") || "";
        const search = (params.get("q") || "").trim().slice(0,120);
        const clauses = [];
        const values = [];
        if (from) { clauses.push("date(datetime(h.downloaded_at,'+6 hours'))>=?"); values.push(from); }
        if (to) { clauses.push("date(datetime(h.downloaded_at,'+6 hours'))<=?"); values.push(to); }
        if (search) {
          clauses.push("(lower(COALESCE(h.customer_name,'')) LIKE ? OR lower(COALESCE(h.customer_email,'')) LIKE ? OR lower(p.name) LIKE ? OR CAST(h.order_id AS TEXT) LIKE ?)");
          const q = '%'+search.toLowerCase()+'%'; values.push(q,q,q,q);
        }
        const where = clauses.length ? "WHERE "+clauses.join(" AND ") : "";
        const { results = [] } = await env.DB.prepare("SELECT h.id,h.order_id,h.product_id,h.customer_name,h.customer_email,h.downloaded_at,p.name AS product_name FROM download_history h JOIN products p ON p.id=h.product_id "+where+" ORDER BY h.downloaded_at DESC LIMIT 1000").bind(...values).all();
        return json({success:true,downloads:results.map(row=>({...row,product_url:"/product/"+encodeURIComponent(row.product_id)}))});
      }

      if (route === "admin/sales-summary" && method === "GET") {
        const paidFilter = "payment_status='paid' AND COALESCE(payment_method,'') <> 'TEST MODE'";
        const [totalsResult,dailyResult,weeklyResult,monthlyResult] = await Promise.all([
          env.DB.prepare(`SELECT COUNT(*) AS total_orders,COALESCE(SUM(total_amount),0) AS total_sales,
          SUM(CASE WHEN date(datetime(COALESCE(verified_at,created_at),'+6 hours'))=date('now','+6 hours') THEN 1 ELSE 0 END) AS today_orders,
          COALESCE(SUM(CASE WHEN date(datetime(COALESCE(verified_at,created_at),'+6 hours'))=date('now','+6 hours') THEN total_amount ELSE 0 END),0) AS today_sales,
          SUM(CASE WHEN date(datetime(COALESCE(verified_at,created_at),'+6 hours'))>=date('now','+6 hours','-' || ((CAST(strftime('%w',datetime('now','+6 hours')) AS INTEGER)+6)%7) || ' days') THEN 1 ELSE 0 END) AS week_orders,
          COALESCE(SUM(CASE WHEN date(datetime(COALESCE(verified_at,created_at),'+6 hours'))>=date('now','+6 hours','-' || ((CAST(strftime('%w',datetime('now','+6 hours')) AS INTEGER)+6)%7) || ' days') THEN total_amount ELSE 0 END),0) AS week_sales,
          SUM(CASE WHEN date(datetime(COALESCE(verified_at,created_at),'+6 hours'))>=date('now','+6 hours','start of month') THEN 1 ELSE 0 END) AS month_orders,
          COALESCE(SUM(CASE WHEN date(datetime(COALESCE(verified_at,created_at),'+6 hours'))>=date('now','+6 hours','start of month') THEN total_amount ELSE 0 END),0) AS month_sales
          FROM orders WHERE ${paidFilter}`).first(),
          env.DB.prepare(`SELECT date(datetime(COALESCE(verified_at,created_at),'+6 hours')) AS period,COUNT(*) AS orders,COALESCE(SUM(total_amount),0) AS sales FROM orders WHERE ${paidFilter} GROUP BY period ORDER BY period DESC`).all(),
          env.DB.prepare(`SELECT date(datetime(COALESCE(verified_at,created_at),'+6 hours'),'-' || ((CAST(strftime('%w',datetime(COALESCE(verified_at,created_at),'+6 hours')) AS INTEGER)+6)%7) || ' days') AS period,COUNT(*) AS orders,COALESCE(SUM(total_amount),0) AS sales FROM orders WHERE ${paidFilter} GROUP BY period ORDER BY period DESC`).all(),
          env.DB.prepare(`SELECT strftime('%Y-%m',datetime(COALESCE(verified_at,created_at),'+6 hours')) AS period,COUNT(*) AS orders,COALESCE(SUM(total_amount),0) AS sales FROM orders WHERE ${paidFilter} GROUP BY period ORDER BY period DESC`).all()
        ]);
        const totals=totalsResult||{};
        return json({success:true,allTime:{orders:Number(totals.total_orders||0),sales:Number(totals.total_sales||0)},today:{orders:Number(totals.today_orders||0),sales:Number(totals.today_sales||0)},thisWeek:{orders:Number(totals.week_orders||0),sales:Number(totals.week_sales||0)},thisMonth:{orders:Number(totals.month_orders||0),sales:Number(totals.month_sales||0)},daily:dailyResult.results||[],weekly:weeklyResult.results||[],monthly:monthlyResult.results||[]});
      }

      if (route === "admin/hero-designs" && method === "GET") {
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS store_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        const setting = await env.DB.prepare("SELECT setting_value FROM store_settings WHERE setting_key='hero_designs'").first();
        let designs = { firstId: "", secondId: "", firstImageKey: "", secondImageKey: "" };
        try { if (setting?.setting_value) designs = { ...designs, ...JSON.parse(setting.setting_value) }; } catch {}
        designs.firstImageUrl = designs.firstImageKey ? "/api/media/" + encodeURIComponent(designs.firstImageKey) : null;
        designs.secondImageUrl = designs.secondImageKey ? "/api/media/" + encodeURIComponent(designs.secondImageKey) : null;
        return json({ success: true, designs });
      }

      if (route === "admin/hero-designs" && method === "PUT") {
        const form = await request.formData();
        const firstId = String(form.get("firstId") || "").trim();
        const secondId = String(form.get("secondId") || "").trim();
        if (!firstId || !secondId || firstId === secondId) {
          return json({ success: false, message: "দুটি আলাদা সোর্স ডিজাইন নির্বাচন করুন।" }, 400);
        }
        const selected = await env.DB.prepare(
          "SELECT id FROM products WHERE id IN (?,?) AND is_active=1 AND COALESCE(is_deleted,0)=0 AND image_url IS NOT NULL"
        ).bind(firstId, secondId).all();
        if ((selected.results || []).length !== 2) {
          return json({ success: false, message: "নির্বাচিত দুটি সোর্স ডিজাইনই প্রকাশিত ও প্রিভিউ ছবি-সহ থাকতে হবে।" }, 400);
        }
        const setting = await env.DB.prepare("SELECT setting_value FROM store_settings WHERE setting_key='hero_designs'").first();
        let designs = { firstId: "", secondId: "", firstImageKey: "", secondImageKey: "" };
        try { if (setting?.setting_value) designs = { ...designs, ...JSON.parse(setting.setting_value) }; } catch {}
        const firstImage = form.get("firstImage");
        const secondImage = form.get("secondImage");
        const validateImage = (file) => {
          if (!(file instanceof File) || !file.size) return null;
          if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 2 * 1024 * 1024) {
            throw new Error("ছবি JPG, PNG, WEBP বা GIF হতে হবে এবং সর্বোচ্চ ২ MB হতে পারবে।");
          }
          return file;
        };
        const firstUpload = validateImage(firstImage);
        const secondUpload = validateImage(secondImage);
        if (!firstUpload && !designs.firstImageKey || !secondUpload && !designs.secondImageKey) {
          return json({ success: false, message: "প্রথমবার দুটি পোস্টারের আলাদা ছবি আপলোড করুন।" }, 400);
        }
        if (firstUpload) {
          designs.firstImageKey = "previews/hero/" + id();
          await putB2(env, designs.firstImageKey, firstUpload, firstUpload.type);
        }
        if (secondUpload) {
          designs.secondImageKey = "previews/hero/" + id();
          await putB2(env, designs.secondImageKey, secondUpload, secondUpload.type);
        }
        designs.firstId = firstId;
        designs.secondId = secondId;
        await env.DB.prepare("INSERT INTO store_settings(setting_key,setting_value,updated_at) VALUES('hero_designs',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP")
          .bind(JSON.stringify(designs)).run();
        return json({ success: true, designs: { firstId, secondId, firstImageUrl: "/api/media/" + encodeURIComponent(designs.firstImageKey), secondImageUrl: "/api/media/" + encodeURIComponent(designs.secondImageKey) }, message: "সোর্স ডিজাইন ও আলাদা পোস্টার ছবি সংরক্ষণ হয়েছে।" });
      }

      if (route === "admin/customers" && method === "GET") {
        await ensureCustomerTables(env);
        const [{results:members=[]},{results:totals=[]}] = await Promise.all([
          env.DB.prepare("SELECT id,username,created_at,last_login_at,is_active FROM customer_members ORDER BY created_at DESC LIMIT 500").all(),
          env.DB.prepare("SELECT COUNT(*) AS total FROM customer_members").all()
        ]);
        return json({success:true,total:Number(totals[0]?.total||0),members});
      }

      if (route.startsWith("admin/notifications")) {
        await ensureNotificationTable(env);

        if (route === "admin/notifications" && method === "GET") {
          const { results = [] } = await env.DB.prepare(
            "SELECT id,title,message,type,target_email,target_order_id,link_url,created_at,is_active FROM customer_notifications ORDER BY created_at DESC LIMIT 100"
          ).all();
          return json({ success: true, notifications: results });
        }

        if (route === "admin/notifications" && method === "POST") {
          const body = await request.json();
          const title = String(body.title || "").trim().slice(0, 120);
          const message = String(body.message || "").trim().slice(0, 1000);
          const type = String(body.type || "info");
          const targetEmail = String(body.targetEmail || "").trim().toLowerCase().slice(0, 254);
          const targetOrderIdInput = String(body.targetOrderId || "").trim().replace(/^#/, "");
          const targetOrderId = /^\d{1,12}$/.test(targetOrderIdInput) ? Number(targetOrderIdInput) : 0;
          const linkUrl = String(body.linkUrl || "").trim().slice(0, 500);
          if (!title || !message) return json({ success: false, message: "শিরোনাম ও বার্তা লিখুন।" }, 400);
          if (!["offer", "product", "order", "info"].includes(type)) return json({ success: false, message: "বার্তার ধরন সঠিক নয়।" }, 400);
          if (targetEmail && !/^\S+@\S+\.\S+$/.test(targetEmail)) return json({ success: false, message: "ক্রেতার ইমেইল সঠিক নয়।" }, 400);
          if (!!targetEmail !== !!targetOrderId) return json({ success: false, message: "ব্যক্তিগত বার্তার জন্য ক্রেতার ইমেইল ও অর্ডার নম্বর দুটিই দিন।" }, 400);
          if (targetEmail) {
            const customerOrder = await env.DB.prepare("SELECT id FROM orders WHERE id=? AND lower(customer_email)=? LIMIT 1").bind(targetOrderId, targetEmail).first();
            if (!customerOrder) return json({ success: false, message: "এই অর্ডার নম্বর ও ইমেইল মিলছে না।" }, 400);
          }
          if (linkUrl && !(linkUrl.startsWith("/") && !linkUrl.startsWith("//")) && !/^https:\/\//i.test(linkUrl)) return json({ success: false, message: "লিংকটি সঠিক নয়।" }, 400);
          const notificationId = id();
          await env.DB.prepare(
            "INSERT INTO customer_notifications(id,title,message,type,target_email,target_order_id,link_url) VALUES(?,?,?,?,?,?,?)"
          ).bind(notificationId, title, message, type, targetEmail || null, targetOrderId || null, linkUrl || null).run();
          return json({ success: true, id: notificationId });
        }

        if (parts[2] && method === "DELETE") {
          await env.DB.prepare("UPDATE customer_notifications SET is_active=0 WHERE id=?").bind(parts[2]).run();
          return json({ success: true });
        }
      }

      if (route === "admin/products" && method === "GET") {
        await ensureProductColumns(env);
        const { results = [] } = await env.DB.prepare(
          "SELECT * FROM products WHERE COALESCE(is_deleted,0)=0 ORDER BY created_at DESC"
        ).all();

        return json({
          success: true,
          products: results.map(safeProduct),
        });
      }

      if (route === "admin/products" && method === "POST") {
        await ensureProductColumns(env);
        const form = await request.formData();
        const name = String(form.get("name") || "").trim();
        const category = String(form.get("category") || "").trim();
        const tag = String(form.get("tag") || "").trim().slice(0, 300);
        const price = Number(form.get("price"));
        const offerRaw = String(form.get("offerPrice") || "").trim();
        const offerPrice = offerRaw === "" ? null : Number(offerRaw);

        if (!name || !category || !Number.isFinite(price) || price < 0 || (offerPrice !== null && (!Number.isFinite(offerPrice) || offerPrice < 0 || offerPrice >= price))) {
          return json(
            { success: false, message: "নাম, ক্যাটাগরি ও সঠিক দাম দিন। অফার মূল্য দিলে তা মূল দামের চেয়ে কম হতে হবে।" },
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
          "INSERT INTO products(name,description,price,image_url,category,file_url,is_active,tag,offer_price,is_deleted) VALUES(?,?,?,?,?,?,1,?,?,0)"
        )
          .bind(name, String(form.get("description") || ""), Math.round(price), imageKey, category, fileKey, tag, offerPrice === null ? null : Math.round(offerPrice))
          .run();

        return json({ success: true, id: inserted.meta.last_row_id });
      }      if (parts[1] === "products" && parts[2] && method === "PUT") {
        await ensureProductColumns(env);
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

        const price = form.has("price") ? Number(form.get("price")) : old.price;
        const offerRaw = form.has("offerPrice") ? String(form.get("offerPrice") || "").trim() : (old.offer_price == null ? "" : String(old.offer_price));
        const offerPrice = offerRaw === "" ? null : Number(offerRaw);

        if (!Number.isFinite(price) || price < 0 || (offerPrice !== null && (!Number.isFinite(offerPrice) || offerPrice < 0 || offerPrice >= price))) {
          return json(
            { success: false, message: "দাম সঠিক নয়। অফার মূল্য দিলে তা মূল দামের চেয়ে কম হতে হবে।" },
            400
          );
        }

        await env.DB.prepare(
          "UPDATE products SET name=?,category=?,price=?,description=?,image_url=?,file_url=?,is_active=1,tag=?,offer_price=? WHERE id=?"
        )
          .bind(
            value("name"),
            value("category"),
            Math.round(price),
            value("description"),
            imageKey,
            fileKey,
            value("tag", "tag"),
            offerPrice === null ? null : Math.round(offerPrice),
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

      if (parts[1] === "products" && parts[2] && parts[3] === "permanent-delete" && method === "POST") {
        const productId = parts[2];
        const old = await env.DB.prepare(
          "SELECT id, image_url, file_url FROM products WHERE id=?"
        ).bind(productId).first();

        if (!old) return json({ success: false, message: "পণ্য পাওয়া যায়নি।" }, 404);

        const orderRefs = await env.DB.prepare(
          "SELECT (SELECT COUNT(*) FROM order_items WHERE product_id=?) AS item_count, (SELECT COUNT(*) FROM orders WHERE product_id=?) AS order_count"
        ).bind(productId, productId).first();

        if (Number(orderRefs?.item_count || 0) > 0 || Number(orderRefs?.order_count || 0) > 0) {
          await env.DB.prepare("UPDATE products SET is_active=0, is_deleted=1 WHERE id=?").bind(productId).run();
          return json({ success: true, archived: true, message: "ডিজাইনটি অ্যাডমিন ও ওয়েবসাইট—দুই জায়গা থেকেই সরানো হয়েছে। পুরোনো অর্ডারের ডাউনলোড ঠিক রাখতে এর সংরক্ষিত কপি নিরাপদে রাখা হয়েছে।" });
        }

        await env.DB.batch([
          env.DB.prepare("DELETE FROM download_tokens WHERE product_id=?").bind(productId),
          env.DB.prepare("DELETE FROM products WHERE id=?").bind(productId)
        ]);

        const cleanup = await Promise.allSettled(
          [old.image_url, old.file_url].filter(Boolean).map((key) => deleteB2(env, key))
        );
        const failed = cleanup.some((item) => item.status === "rejected");

        return json({
          success: true,
          message: failed
            ? "ডিজাইনটি তালিকা থেকে স্থায়ীভাবে ডিলিট হয়েছে। তবে স্টোরেজের একটি ফাইল পরিষ্কার করা যায়নি।"
            : "ডিজাইন ও তার ছবি/ডাউনলোড ফাইল স্থায়ীভাবে ডিলিট হয়েছে।"
        });
      }

      if (parts[1] === "products" && parts[2] && parts[3] === "publish" && method === "POST") {
        await ensureProductColumns(env);
        const productId = parts[2];
        const result = await env.DB.prepare(
          "UPDATE products SET is_active=1, is_deleted=0 WHERE id=?"
        ).bind(productId).run();
        if (!result.meta?.changes) {
          const exists = await env.DB.prepare("SELECT id FROM products WHERE id=?").bind(productId).first();
          if (!exists) return json({ success: false, message: "পণ্য পাওয়া যায়নি।" }, 404);
        }
        return json({ success: true, message: "ডিজাইনটি আবার প্রকাশ করা হয়েছে।" });
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
          "SELECT id,payment_method,payment_status,customer_email FROM orders WHERE id=?"
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

          // Create a private customer notification only on the first approval.
          if (order.payment_status !== "paid" && order.customer_email) {
            await ensureNotificationTable(env);
            const notificationTitle = "আপনার ডিজাইন প্রস্তুত!";
            const notificationMessage = `আপনার অর্ডার #${orderId} অনুমোদিত হয়েছে। আপনার ডিজাইন এখন ডাউনলোডের জন্য প্রস্তুত। সাইটের “আমার অর্ডার” থেকে রসিদ নম্বর ও ইমেইল দিয়ে ডাউনলোড করুন।`;
            await env.DB.prepare(
              "INSERT INTO customer_notifications(id,title,message,type,target_email,target_order_id,link_url) VALUES(?,?,?,?,?,?,?)"
            )
              .bind(
                id(),
                notificationTitle,
                notificationMessage,
                "order",
                String(order.customer_email).trim().toLowerCase(),
                Number(orderId),
                "/"
              )
              .run();
          }
        }

        return json({ success: true });
      }
    }
  } catch (error) {
    console.error("API ERROR:", error);
    if (route.startsWith("customers/")) {
      if (!env.DB || error?.message === "CUSTOMER_DB_BINDING_MISSING") {
        return json({ success: false, message: "সদস্য ডাটাবেসের সংযোগ পাওয়া যাচ্ছে না। সাইট পরিচালকের কাছে DB সংযোগটি যাচাই করতে বলুন।" }, 503);
      }
      if (!env.SESSION_SECRET) {
        return json({ success: false, message: "সদস্য লগইন ব্যবস্থা এখন প্রস্তুত নয়। সাইট পরিচালকের SESSION_SECRET সেটিং যাচাই করা প্রয়োজন।" }, 503);
      }
      if (error?.message === "CUSTOMER_MEMBERS_SCHEMA_INVALID" || error?.message === "CUSTOMER_AUTH_SCHEMA_INVALID") {
        return json({ success: false, message: "সদস্য ডাটাবেসের কাঠামোতে সমস্যা হয়েছে। সাইট পরিচালকের সহায়তা প্রয়োজন।" }, 503);
      }
      const diagnostic = String(error?.message || "Unknown database error").replace(/[\\r\\n\\t]+/g, " ").slice(0, 220);
      console.error("CUSTOMER_ACCOUNT_DATABASE_FAILURE:", diagnostic);
      return json({ success: false, message: "সদস্য অ্যাকাউন্ট সেবায় ডাটাবেস ত্রুটি হয়েছে। সহায়তার জন্য এই ত্রুটি কোডটি জানান।", errorCode: "CUSTOMER_DB_ERROR", diagnostic }, 503);
    }
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