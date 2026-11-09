# Sajjadhub — Public Storefront

এটি Cloudflare Pages-এ প্রকাশের জন্য প্রস্তুত একটি static storefront package। ZIP extract করলে `index.html` সরাসরি মূল ফোল্ডারেই পাবেন।

## এই প্যাকেজে যা আছে
- Responsive storefront, product catalogue, search/category filter, cart এবং product details
- Nagad Send Money-এর ম্যানুয়াল নির্দেশনা (প্রকাশ্য নম্বর: `01951608000`)
- Admin Panel, admin login এবং browser-local admin upload code বাদ দেওয়া হয়েছে

## গুরুত্বপূর্ণ সীমাবদ্ধতা
- পণ্যগুলো বর্তমানে sample/demo listing; এগুলো আপনার আসল ডিজাইন নয়। প্রকাশের আগে `app.js`-এর `defaultProducts`-এ নিজের পণ্যের নাম, দাম, বিবরণ ও preview বসান।
- Checkout শুধু অর্ডারের বিবরণ ক্লিপবোর্ডে কপি করে। কোনো অর্ডার সার্ভারে পাঠানো বা সংরক্ষণ করা হয় না; ক্রেতাকে কপি করা তথ্য আপনার কাছে আলাদা মাধ্যমে পাঠাতে হবে।
- এই static site পেমেন্ট যাচাই করে না, স্বয়ংক্রিয় ডাউনলোড দেয় না এবং নিরাপদ Admin Panel নেই। TrxID/টাকা নিজে যাচাই না করে কোনো ফাইল দেবেন না।
- Nagad নম্বরটি সাইটে প্রকাশ্য থাকবে।
- কোনো paid service, paid domain বা paid add-on প্রয়োজন নেই এই static deployment-এর জন্য।

## Cloudflare Pages Direct Upload
1. Cloudflare Dashboard-এ Workers & Pages খুলুন।
2. Create application → Pages → Upload assets / Drag and drop your files নির্বাচন করুন (UI-তে নাম সামান্য ভিন্ন হতে পারে)।
3. একটি project name দিন, যেমন `sajjadhub` (নামটি available হতে হবে)।
4. ZIP extract করে যে ফোল্ডারে `index.html`, `app.js` ও `styles.css` আছে, সেই ফোল্ডারের contents upload করুন। এই ZIP-এ `index.html` ZIP root-এই আছে।
5. Deploy করুন। সফল হলে `https://<project-name>.pages.dev` ঠিকানায় সাইট পাওয়া যাবে।

## লোকালি পরীক্ষা
`index.html` ব্রাউজারে খুলুন। Google Fonts লোডের জন্য ইন্টারনেট লাগতে পারে।
