# Sajjadhub Storefront + Admin

বাংলা সেটআপ নির্দেশনা: `SETUP-BN.md` পড়ুন। Cloudflare Pages Functions, D1 এবং private Backblaze B2 S3-compatible bucket প্রয়োজন। `B2_BUCKET`, `B2_ENDPOINT`, `B2_KEY_ID`, `B2_APPLICATION_KEY` এবং admin credentials Cloudflare Secrets-এ configure করতে হবে। এই প্রজেক্টটি GitHub-connected Pages deployment-এর মাধ্যমে deploy করার জন্য প্রস্তুত।

<!-- Trigger a fresh Preview deployment after environment binding changes. -->
Preview B2 configuration updated.

## Customer downloads
Customers can look up an order from the storefront using the order number shown on their receipt and the email address used at checkout. Download buttons are available only after an administrator verifies the payment and marks the order as paid.
