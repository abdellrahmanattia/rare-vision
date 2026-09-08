# Rare Vision — Premium E-Commerce Platform

A full storefront + custom admin dashboard built on plain HTML/CSS/JS (no
build step, no framework) with **Firebase** (Auth + Firestore + Storage) as
the backend, **Cloudflare Pages Functions** for the one thing that needs a
real secret (Telegram), and a **Google Apps Script** for automated email
sending. Deploys the same way it always did: push to GitHub, connect to
Cloudflare Pages, done.

This is a from-the-ground-up overhaul of the original static storefront:
Decap CMS is gone, the single-page product modal is gone, and in their
place is a real multi-page catalog, dynamic product pages with reviews,
guest order tracking, promo codes, marketing automation, and a custom
admin panel — all described in detail below.

---

## ⚠️ Before you deploy: what you MUST configure

Nothing here works out of the box — that's intentional (same philosophy as
the original project: no secrets get invented, no fake credentials get
shipped). You need to do these, **in this order**:

1. **Create a Firebase project** at [console.firebase.google.com](https://console.firebase.google.com) (the free Spark plan is enough to start).
2. **Register a Web App** inside it (Project settings → General → Your apps → `</>`) and copy the `firebaseConfig` object it gives you into **`js/firebase-init.js`** (top of the file, clearly marked).
3. **Enable Authentication** → Sign-in method → turn on **Email/Password**.
4. **Create a Firestore database** (Build → Firestore Database → Create database → production mode is fine).
5. **Publish the security rules**: open **`firestore.rules`** in this project, paste its contents into Firestore → Rules in the console, click Publish. Do the same with **`storage.rules`** under Storage → Rules (you'll also need Build → Storage → Get started once, to provision the bucket).
6. **Set your admin email** in TWO places (they must match exactly):
   - `js/firebase-init.js` → `export const ADMIN_EMAIL = '...'`
   - `firestore.rules` → the `isAdmin()` function's email string
   - `storage.rules` → both `request.auth.token.email == '...'` checks
   Re-publish the rules after editing them.
7. **Register that admin email as a normal account** — go to your deployed site's `register.html` and sign up with the exact address you set as `ADMIN_EMAIL`. Then visit `/admin/` and log in with it.
8. **Import your old catalog** — in the admin dashboard's Products tab, click **"Import legacy catalog"** once. This reads `data/products.json` (the file the original Decap CMS used to edit) and writes each product into Firestore, which is now the live catalog's source of truth. You can re-run it safely; it overwrites by product id.
9. **Telegram order notifications** (optional but recommended): create a bot with [@BotFather](https://t.me/BotFather), get your chat ID (see "Finding your Telegram Chat ID" below), then in your **Cloudflare Pages project → Settings → Environment variables**, add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` for both Production and Preview, and redeploy. Orders are always saved to Firestore regardless of whether this is configured — Telegram is just a convenience ping.
10. **Email automation** (optional): follow the setup instructions at the top of `google-apps-script/EmailAutomation.gs` (~10 minutes, no coding required — copy, paste, click a few buttons).
11. Everything else — Google Maps API key, hero video/poster, brand logo files — works exactly like before; see the relevant sections below.

If you skip a step, the affected feature fails **gracefully** (a console
warning, an empty section, or a friendly on-page message) rather than
crashing the whole site — but nothing will actually work end-to-end until
you've done all of the above.

---

## 📁 File structure

```
rare-vision/
├── index.html              Homepage: hero, New Arrivals, Best Sellers, brand
│                            marquee, category tiles. Header/footer/sign-in
│                            drawer/idle popup are injected by site-common.js.
├── shop.html                "Shop All" / category / search results gallery
├── product.html              Dynamic Product Detail Page — gallery, variants,
│                            size + notify-me, accordions, recommendations,
│                            full review engine (see Phase 3 & 5 below)
├── checkout.html             Checkout — now with an optional email field,
│                            Firestore-backed promo codes, dual-save orders
├── track-order.html           Guest/customer order tracking with a visual
│                            Pending → Shipped → Delivered tracker
├── register.html              Create Account (the shared sign-in drawer used
│                            everywhere else lives in js/site-common.js)
├── firestore.rules            The REAL security boundary — read this before
│                            you deploy. Deploy via Firebase Console → Rules.
├── storage.rules              Same, for Firebase Storage (review photos,
│                            product photos uploaded from the admin panel)
├── css/
│   └── style.css              All styling — original design tokens at the
│                            top, the v2 additions in a clearly labeled
│                            section near the bottom
├── js/
│   ├── firebase-init.js       Firebase config + ADMIN_EMAIL live here.
│   │                          Every other file imports Firebase from here.
│   ├── shared.js               CONFIG, formatters, cart storage, the tiny
│   │                          Markdown renderer, star-rating renderer
│   ├── site-common.js          Injects the header/footer/sign-in drawer/idle
│   │                          popup on every page and wires them up —
│   │                          the ONE place that markup lives now
│   ├── products-data.js        Every Firestore product query (New Arrivals,
│   │                          Best Sellers, recommendations, etc.)
│   ├── cart.js                 The cart drawer, shared by index/shop/product
│   ├── marketing.js             Idle-popup subscriber capture + the welcome
│   │                          email + restock-notification email builders
│   ├── main.js / shop.js / product.js / checkout.js / track-order.js / register.js
│   │                          Page-specific logic (see each file's header)
├── admin/
│   ├── index.html              Custom admin dashboard (replaces Decap CMS)
│   ├── css/admin.css
│   └── js/admin.js              Analytics, Products, Orders, Reviews, Promo
│                              Codes, Waitlist & Reports, Banner — all of it
├── functions/api/
│   └── send-order.js            The ONLY server code in this project: relays
│                              the Telegram order notification using a secret
│                              env var, so the bot token never ships to the
│                              browser (see Cloudflare setup below)
├── google-apps-script/
│   ├── EmailAutomation.gs       Hybrid email sender (Gmail + Brevo, 800/day
│   │                          combined cap with next-day rollover) — full
│   │                          setup instructions are in this file's header
│   └── appsscript.json          Manifest — grants the scopes the script needs
├── data/
│   └── products.json            Legacy seed file — read ONCE by the admin
│                              dashboard's "Import legacy catalog" button.
│                              Nothing on the live site reads this directly
│                              anymore; Firestore is the live catalog.
└── assets/
    ├── logos/rare-vision-logo.png   The eye logo, used in every header/footer
    ├── hero-video.mp4 / hero-poster.jpg   Add your own (not included)
    └── products/ , logos/*.svg      Same conventions as before (see below)
```

---

## What changed, phase by phase

**Phase 1 — Cleanup & architecture.** Decap CMS is fully removed
(`admin/config.yml` deleted, its GitHub OAuth Cloudflare Functions deleted).
The header now uses the actual eye logo image and a redesigned search bar
(category scope + input + gold submit button) matching the reference
product-page screenshots. Firebase (Firestore + Auth + Storage) is
initialized once in `js/firebase-init.js` and shared by every page.

**Phase 2 — Homepage & routing.** New Arrivals and Best Sellers are now
Firestore queries (`js/products-data.js`); Best Sellers respects a manual
`rank` field you can set per-product in the admin dashboard, falling back
to review count when unset. Clicking any category now navigates to
`shop.html?...` (a real filtered gallery page) instead of scrolling to an
in-page grid — and the category name is deliberately never shown on the
product page itself, per spec.

**Phase 3 — The dynamic product page.** `product.html` reads `?id=` and
renders everything from Firestore: a swipeable/draggable gallery that
switches per color variant, a fullscreen swipeable lightbox, the custom
text badge + Target Category badge, a size grid that shows **NOTIFY ME**
(→ a modal that writes to Firestore `waitlist`) for out-of-stock sizes and
**ADD TO BAG** otherwise, the four trust icons with the "Standard shipping"
line, four accordions (Delivery/Returns text is hardcoded to standard
e-commerce policy language), a Report modal (→ Firestore `reports`), and
the three recommendation rows (We Recommend / You might also like / Best
Seller in this Category) with the exact fallback priority the spec asked
for.

**Phase 4 — Checkout, orders, tracking.** The checkout email field uses the
exact placeholder text from the spec. Promo codes are looked up live from
Firestore `promo_codes` (percent-off or free-shipping). On submit, the
order is written to Firestore `orders` (`orderStatus: 'Pending'`) **first**
— that's the source of truth for tracking and review-unlocking — and a
Telegram notification is sent as a best-effort second step via the secure
Cloudflare Function. `track-order.html` looks orders up by email (or
automatically, if the shopper is logged in) and shows the visual tracker.

**Phase 5 — Reviews.** The Amazon-style summary (star bars, average,
count) and the review feed live on `product.html` alongside the product
info. The **Write a review** button redirects to login when signed out,
shows "Review unlocks automatically once the product is delivered" when
signed in but no matching Delivered order exists, and opens the 4-step
modal (stars → title/text → drag-and-drop photo upload to Firebase Storage
→ success) when unlocked. Submitted reviews land in `pending_reviews` for
admin approval before they go public.

**Phase 6 — Marketing automation.** A 2-minute idle timer (per browser
session) triggers the 15%-off popup; the email address is saved and a
branded HTML welcome email is enqueued into Firestore `email_queue`. The
hybrid Gmail (500/day) + Brevo (300/day) sender with an 800/day combined
cap and automatic next-day rollover is a Google Apps Script — see
`google-apps-script/EmailAutomation.gs` for why (short version: it can
authenticate to Firestore as your own Google account, for free, with a
built-in scheduler — no server needed).

**Phase 7 — Admin dashboard.** `/admin/` is a from-scratch dashboard gated
by `ADMIN_EMAIL`, with tabs for Analytics (active visitors, total sales,
waitlist/report counts), Products (full CRUD, per-color-variant image
galleries, a "Quick Inventory" one-click size toggle), Orders (status
dropdown — setting **Delivered** is what unlocks that customer's review
button), Reviews (approve/reject), Promo Codes, Waitlist & Reports
("Restock & Notify" flips the size back in stock and enqueues an email to
everyone waiting), and Banner (the site-wide announcement bar).

---

## Honest trade-offs (please read before you assume something is bulletproof)

This project is genuinely large, and a few pieces are deliberate,
documented simplifications rather than unlimited-budget enterprise
solutions. None of these are hidden — each is commented at the point it
matters in the code too:

- **Guest order tracking (`firestore.rules`, `orders` collection)**: to let
  a shopper look up their order by typing their email — with *no* backend
  server to broker that lookup — Firestore's rules allow reading any order
  document that has a `customerEmail` set. In practice this means a
  determined visitor who inspects network traffic could enumerate order
  data beyond just their own, the same trade-off many backend-less Firebase
  storefronts accept. If you want this fully locked down, the standard fix
  is a small server-side function (using a Firebase service account) that
  brokers the lookup instead of allowing direct client reads — happy to
  build that as a follow-up if you want it.
- **Promo code validation** happens via a direct Firestore read from the
  browser (same trade-off the original project's `DISCOUNT_CODES` had) —
  fine for a Cash-on-Delivery store where the Telegram message / Firestore
  order doc is your real source of truth, but not tamper-proof against a
  determined shopper editing the displayed total before submitting.
- **Product photos in the admin form** are entered as image URLs (with an
  optional one-click upload-to-Firebase-Storage button per color variant)
  rather than a full drag-and-drop media library — kept simple on purpose.
- Nothing here has been tested against a **live** Firebase project, Telegram
  bot, or Brevo/Gmail account, for the obvious reason that those need your
  real credentials. Every integration follows a well-established, standard
  pattern, and the code has been syntax-checked and cross-referenced
  end-to-end (every DOM id, every import path, every script tag was
  verified against its actual markup before delivery), but budget some time
  to click through each flow once you've plugged in your real config, the
  way you would with any new integration.

---

## Setting up Pin Location (Google Maps) — unchanged from before

Get a free key at [console.cloud.google.com](https://console.cloud.google.com),
enable the "Maps JavaScript API", and paste it into `GOOGLE_MAPS_API_KEY` in
`js/shared.js`. Without it, checkout simply hides the "Pin Location" button.

## Finding your Telegram Chat ID

Message your new bot once, then visit
`https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser — your
chat ID is the number at `result[0].message.chat.id`. Use a group's ID
(usually negative) if you want orders posted to a group instead of your DMs.

## Brand marquee logos & hero video — unchanged from before

Drop SVG/PNG files named to match the slugs in `js/main.js`'s
`BRAND_LOGOS` array into `assets/logos/` (e.g. `nike.svg`); any brand
without a matching file just falls back to a plain text label. Drop your
own `hero-video.mp4` (and optional `hero-poster.jpg`) into `assets/`.

## Adding a new admin

There's only ever one `ADMIN_EMAIL`. To hand off access to someone else,
change it in `js/firebase-init.js` **and** `firestore.rules` **and**
`storage.rules`, re-publish the rules, and have that person register with
the new address.
