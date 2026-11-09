# Sajjadhub Admin + D1 + Backblaze B2 সেটআপ

## এই সংস্করণে যা আছে
- আগের storefront ডিজাইন, search/filter, cart এবং product details রাখা হয়েছে।
- `/admin.html`-এ password-protected Admin Panel।
- ডিজাইন/প্রিভিউ ছবি upload, পণ্য edit ও remove।
- D1-এ product এবং order সংরক্ষণ।
- Backblaze B2-তে preview ও আসল downloadable file private storage।
- Admin order-এ Nagad TrxID যাচাই করে Paid/Reject করতে পারবেন; Paid হলে download link তৈরি হবে।

## Cloudflare-এ একবারের সেটআপ
তোমার বর্তমান Pages প্রজেক্ট GitHub-এর সঙ্গে যুক্ত, তাই ফাইল GitHub-এ push করলে Cloudflare স্বয়ংক্রিয়ভাবে deploy করবে। Dashboard-এর ZIP drag-and-drop দিয়ে Functions deploy হয় না; Functions-সহ এই সংস্করণ GitHub integration বা Wrangler দিয়ে deploy করতে হবে।

1. Cloudflare Dashboard → Storage & databases → D1 SQL Database → Create database। নাম দিন `sajjadhub-db`।
2. Backblaze B2-তে একটি private bucket তৈরি করুন। Bucket public করবেন না। ওই bucket-এর জন্য read, write ও delete অনুমতিসহ একটি Application Key তৈরি করুন; key ID, application key, bucket-এর নাম এবং S3 endpoint প্রস্তুত রাখুন। Endpoint-এর উদাহরণ `https://s3.us-west-004.backblazeb2.com`—আপনার bucket-এর region অনুযায়ী endpoint ব্যবহার করুন।
3. Workers & Pages → `sajjadhub` project → Settings → Bindings → Add → D1 database। Variable name দিন `DB`, তারপর `sajjadhub-db` নির্বাচন করুন।
4. Settings → Variables and Secrets-এ `B2_BUCKET`, `B2_ENDPOINT`, `B2_KEY_ID` এবং `B2_APPLICATION_KEY` নামে B2-এর মানগুলো Secret হিসেবে যোগ করুন। `B2_ENDPOINT`-এ আপনার bucket-এর region-এর S3 endpoint দিন, যেমন `https://s3.us-west-004.backblazeb2.com`।
5. একই জায়গায় `ADMIN_PASSWORD` নামে শক্তিশালী আলাদা admin password দিন এবং `SESSION_SECRET` নামে অন্তত 32 random অক্ষরের secret দিন। সবগুলো Secret হিসেবে রাখুন। এগুলো কাউকে পাঠাবেন না।
6. D1 → `sajjadhub-db` → Console-এ `migrations/0001_initial.sql` ফাইলের সম্পূর্ণ SQL একবার চালান।
7. এই ZIP extract করে প্রজেক্টের ফাইলগুলো তোমার VS Code-এর `Sajjadhub-public-storefront-cloudflare` ফোল্ডারের ভেতরে overwrite/merge করো। পুরোনো `functions/api/health.js` থাকলে নতুনটির সঙ্গে মিলিয়ে নাও।
8. VS Code Terminal-এ চালাও:
   - `git add .`
   - `git commit -m "Add Sajjadhub admin and database"`
   - `git push origin main`
9. Cloudflare Pages → `sajjadhub` → Deployments-এ নতুন deployment সফল হওয়া পর্যন্ত অপেক্ষা করো। Binding ও Secrets যোগ করার পর প্রয়োজন হলে নতুন deployment trigger করো।
10. `https://sajjadhub.pages.dev/api/health` খুলে API online দেখো। এরপর `https://sajjadhub.pages.dev/admin.html` থেকে লগইন করো।

## পণ্য আপলোড
Admin Panel → নতুন ডিজাইন আপলোড → নাম, ক্যাটাগরি, দাম, বিবরণ, প্রিভিউ ছবি এবং ক্রেতার আসল ডাউনলোড ফাইল দিন → সংরক্ষণ। Preview image সর্বোচ্চ 8 MB, download file সর্বোচ্চ 50 MB।

## অর্ডার ও পেমেন্ট
ক্রেতা checkout-এ ইমেইল, টাকা পাঠানো নম্বর ও Nagad TrxID জমা দিলে D1-এ Pending order হবে। Admin-কে Nagad লেনদেন নিজে যাচাই করে Paid করতে হবে। Paid হলে অর্ডারের জন্য download link তৈরি হবে; Admin Panel থেকে লিংক কপি করে ক্রেতাকে পাঠাতে হবে। এই সংস্করণ নিজে থেকে ইমেইল পাঠায় না এবং Nagad API দিয়ে পেমেন্ট যাচাই করে না।

## নিরাপত্তা ও গুরুত্বপূর্ণ নোট
- Backblaze B2 bucket public করবেন না; ফাইল API-এর মাধ্যমে privateভাবে পরিবেশন হয়।
- `ADMIN_PASSWORD` ও `SESSION_SECRET` কখনো HTML/JS-এ লিখবেন না।
- প্রথমবার লাইভ করার আগে নিজের একটি test product দিয়ে upload, edit, remove এবং test order করে নিন।
- Admin login cookie 8 ঘণ্টা কার্যকর থাকে।
- Paid করার আগে TrxID ও প্রাপ্ত টাকা ম্যানুয়ালি যাচাই করা বাধ্যতামূলক।
- কোনো payment gateway/API সংযুক্ত নেই। Nagad পেমেন্ট ম্যানুয়ালি যাচাই করতে হবে।
