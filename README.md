# Rare Vision — متجر إلكتروني ثابت (HTML/CSS/JS فقط)

موقع متجر إلكتروني كامل بدون أي إطار عمل (Framework)، بحث فوري، سلة مشتريات محفوظة
في المتصفح، وإرسال الطلبات مباشرة كرسالة تيليجرام — كل ده جاهز للرفع على GitHub
ثم النشر مجاناً عبر Cloudflare Pages.

## 📁 هيكل الملفات

```
rare-vision/
├── index.html            الصفحة الرئيسية (بحث، شبكة منتجات، نافذة تفاصيل المنتج، سلة)
├── css/
│   └── style.css          كل التنسيقات، الألوان في أعلى الملف كمتغيرات CSS
├── js/
│   └── main.js             منطق الموقع: البحث، نافذة المنتج، السلة، الطلب عبر تيليجرام
├── data/
│   └── products.json       كتالوج المنتجات — يُحرَّر عبر لوحة Decap CMS، مش يدوي
├── admin/
│   ├── index.html          صفحة تشغيل Decap CMS (لا تحتاج تعديل)
│   └── config.yml          تعريف كل حقول إدخال المنتج وترتيبها
├── functions/
│   └── api/
│       ├── auth.js          Cloudflare Pages Function: بداية تسجيل الدخول عبر GitHub
│       └── callback.js      Cloudflare Pages Function: استكمال تسجيل الدخول
├── assets/
│   ├── hero-video.mp4      ضع هنا فيديو الخلفية (أنت تضيفه، غير موجود حالياً)
│   ├── hero-poster.jpg     صورة تظهر أثناء تحميل الفيديو (اختياري لكن مستحسن)
│   └── products/           صور المنتجات التي يرفعها المسؤول عبر لوحة الإدارة
└── README.md
```

## 🖥️ لوحة تحكم المنتجات (Decap CMS)

بدل ما تعدّل `data/products.json` يدوياً، عندك الآن لوحة تحكم كاملة على
`/admin` يقدر أي مسؤول يستخدمها من غير ما يلمس أي كود: يضيف منتج، يرفع
صور، يحدد المقاسات المتوفرة، يفعّل خصم بسعر مشطوب، يختار Badge زي
"Best Seller"، وغيرها — وكل تعديل بيتحفظ كـ commit على GitHub مباشرة.

**ترتيب إدخال بيانات كل منتج في اللوحة:**

1. **الفئة المستهدفة (Gender):** Men / Women / Unisex / Kids
2. **نوع المنتج (Product Type):** Sneakers / Jackets / T-Shirts / Watches / Hats / Accessories
3. **الماركة و SKU**
4. **السعر الحالي** (إلزامي) **والسعر قبل الخصم** (اختياري — لو موجود هيظهر مشطوب بجانب السعر)
5. **وصف قصير** لبطاقة المنتج، و**وصف كامل** (Rich Text) لصفحة التفاصيل
6. **صورة أساسية + معرض صور إضافي**
7. **مواصفات** (Key/Value): مثلاً Material: 100% Cotton
8. **Badges ترويجية:** Best Seller / New Arrival / Limited Edition
9. **التقييم** (رقم من 5) **وعدد المراجعات**
10. **المقاسات والمخزون** (اختياري تماماً — اتركه فاضي للمنتجات اللي مالهاش مقاسات
    زي الساعات والقبعات؛ لو المنتج له مقاسات، ضيف كل مقاس مع حالته In Stock/Out of Stock)

### ⚙️ إعداد تسجيل الدخول للوحة الإدارة (GitHub OAuth)

بما إن الموقع مستضاف على Cloudflare Pages مش Netlify، Decap CMS محتاج
"بوابة" بسيطة تتحقق من هوية المسؤول عبر GitHub قبل ما تسمح له يعدّل
الملفات. الملفين `functions/api/auth.js` و `functions/api/callback.js`
جاهزين لكده كـ **Cloudflare Pages Functions** (بينشروا تلقائياً مع باقي
الموقع، مفيش سيرفر منفصل تحتاج تشغّله).

اتبع الخطوات دي مرة واحدة بس:

1. **اعمل GitHub OAuth App:**
   - روح على `github.com/settings/developers` → **New OAuth App**.
   - **Homepage URL:** رابط موقعك (مثلاً `https://rare-vision.pages.dev`).
   - **Authorization callback URL:** نفس الرابط + `/api/callback`
     (مثلاً `https://rare-vision.pages.dev/api/callback`).
   - اضغط **Register application**، وسجّل الـ **Client ID**.
   - اضغط **Generate a new client secret** وسجّل الـ **Client Secret**
     فوراً (تيليجرام... قصدي GitHub هيوريهولك مرة واحدة بس).

2. **ضيف المتغيرات دي في Cloudflare Pages:**
   - من `dash.cloudflare.com` → مشروعك → **Settings** → **Environment variables**.
   - أضف `GITHUB_CLIENT_ID` بقيمة الـ Client ID.
   - أضف `GITHUB_CLIENT_SECRET` بقيمة الـ Client Secret، وحدد نوعه
     **Secret** (مش Plaintext) عشان ميبانش لحد.
   - اعمل **Save** ثم أعد نشر الموقع (Redeploy) عشان المتغيرات تتفعّل.

3. **عدّل `admin/config.yml`:**
   - غيّر `repo:` لاسم المستودع بتاعك (`username/rare-vision`).
   - غيّر `base_url:` لرابط موقعك الفعلي على Cloudflare Pages (أو الدومين
     المخصص لو عندك واحد).

4. افتح `https://your-site.pages.dev/admin`، اضغط **Login with GitHub**،
   ووافق على الصلاحيات — هتدخل لوحة التحكم مباشرة.

**تجربة محلية بدون إعداد OAuth:** شغّل `npx decap-server` في تيرمينال
منفصل (بيفتح على المنفذ 8081)، وبعدين افتح
`http://localhost:8080/admin/#/?backend=proxy` (مع تشغيل سيرفر الموقع
نفسه زي في قسم "التجربة محلياً" فوق). هتقدر تجرب إضافة/تعديل منتجات
والتغييرات هتتحفظ في `data/products.json` على جهازك مباشرة، من غير
GitHub خالص — مثالي للتجربة قبل رفع الموقع.

**عن Editorial Workflow:** الإعداد الحالي في `config.yml` يستخدم
`publish_mode: editorial_workflow`، يعني كل تعديل بيتحول لـ Pull Request
على GitHub بدل ما يتنشر فوراً (زي مراجعة قبل النشر). لو انت المسؤول
الوحيد وعايز التعديلات تتنشر فوراً من غير خطوة مراجعة، احذف السطر ده من
`config.yml`.


## ▶️ التجربة محلياً قبل الرفع

**مهم جداً:** الموقع يستخدم `fetch()` لتحميل `products.json`، وهذا **لا يعمل** لو فتحت
`index.html` مباشرة من الجهاز (`file://`). لازم تشغّله عبر سيرفر محلي بسيط:

```bash
# داخل مجلد rare-vision
python3 -m http.server 8080
# افتح المتصفح على http://localhost:8080
```

أو استخدم إضافة "Live Server" في VS Code. لما ترفعه على Cloudflare Pages أو GitHub
Pages هتلاقي المشكلة دي مش موجودة أصلاً لأنه هيتقدم عبر HTTP فعلي.

## 🛍️ تعديل المنتجات

**الطريقة الموصى بها:** استخدم لوحة الإدارة على `/admin` (شرحها فوق) —
مفيش داعي تلمس أي JSON يدوياً.

**تعديل يدوي (اختياري، للمطورين):** لو حابب تعدّل `data/products.json`
مباشرة، الشكل الحالي هو:

```json
{
  "products": [
    {
      "id": "unique-product-slug",
      "name": "Product Name",
      "gender": "Unisex",
      "productType": "Sneakers",
      "brand": "Brand Name",
      "sku": "RV-SNK-1024",
      "price": 129.99,
      "compareAtPrice": 179.99,
      "shortDescription": "One sentence for the product card.",
      "description": "Full **Markdown** text with\n\n- bullet\n- points",
      "image": "assets/products/main.jpg",
      "gallery": ["assets/products/alt-1.jpg", "assets/products/alt-2.jpg"],
      "specifications": [{ "label": "Material", "value": "100% Cotton" }],
      "badges": ["Best Seller", "New Arrival"],
      "averageRating": 4.7,
      "reviewCount": 328,
      "sizes": [{ "size": "9", "stockStatus": "In Stock" }],
      "inStock": true
    }
  ]
}
```

نقاط مهمة:
- `id`: فريد ولا يتغيّر بعد النشر — سلة المشتريات تعتمد عليه.
- `compareAtPrice`: احذفها أو خليها `null` لو المنتج مش عليه خصم.
- `sizes`: **اتركها مصفوفة فاضية `[]` أو احذفها تماماً** للمنتجات اللي
  مالهاش مقاسات (ساعات، قبعات، إكسسوارات) — الواجهة بتتفحّص طول المصفوفة
  دي وتُخفي كل واجهة اختيار المقاس تلقائياً لو فاضية.
- `inStock`: بيُستخدم بس لما `sizes` تكون فاضية؛ لو المنتج له مقاسات،
  حالة كل مقاس (`In Stock` / `Out of Stock`) هي اللي بتتحكم في التوفر.
- الصور حالياً (في بيانات العرض التجريبية) تستخدم خدمة placeholder
  (`placehold.co`) للمعاينة فقط. لو رفعت صور عبر لوحة الإدارة، هتتخزن
  تلقائياً في `assets/products/` ويتغيّر المسار في الـ JSON تلقائياً.

## 🎥 إضافة فيديو الـ Hero

ضع ملف فيديو باسم `hero-video.mp4` داخل مجلد `assets/`. الأبعاد المفضلة: أفقي
1920×1080 أو أكبر، ومدة قصيرة (10-20 ثانية) بحجم صغير (أقل من 8-10 ميجا) عشان
سرعة التحميل على الموبايل. مصادر فيديوهات مجانية: Pexels Videos، Coverr، Mixkit.

لو مش عايز فيديو، احذف وسم `<video>` من `index.html` والموقع هيعرض تدرّج لوني
(gradient) جاهز بدل الفيديو تلقائياً.

## 🤖 ربط بوت تيليجرام (لاستقبال الطلبات)

1. افتح تيليجرام وابحث عن **@BotFather**.
2. أرسل `/newbot` واتبع التعليمات (اسم البوت + username ينتهي بـ `bot`).
3. هيديك **Bot Token** شكله مثل: `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.
4. لمعرفة **Chat ID** بتاعك (اللي هتوصله الطلبات):
   - ابحث عن **@userinfobot** وابدأ محادثة معاه، هيديك الـ ID بتاعك مباشرة.
   - أو: ابعت أي رسالة للبوت الجديد بتاعك، بعدين افتح في المتصفح:
     `https://api.telegram.org/bot<TOKEN>/getUpdates`
     وهتلاقي `"chat":{"id": ...}` في الرد.
   - لو عايز الطلبات توصل لمجموعة (Group)، ضيف البوت للمجموعة والـ Chat ID
     هيبقى رقم سالب (مثلاً `-1001234567890`).
5. افتح `js/main.js` وعدّل أول سطرين في `CONFIG`:

```js
const CONFIG = {
  TELEGRAM_BOT_TOKEN: 'الصق التوكن هنا',
  TELEGRAM_CHAT_ID: 'الصق الـ Chat ID هنا',
  ...
};
```

بمجرد الحفظ، أي عميل يضغط "إرسال الطلب" هتوصلك رسالة فيها بيانات العميل
ومحتوى السلة والإجمالي مباشرة على تيليجرام.

### ⚠️ ملاحظة أمان مهمة

بما إن الموقع بالكامل Static (مفيش سيرفر خلفي)، الـ **Bot Token** بيكون موجود
داخل كود JavaScript اللي بيوصل لمتصفح أي زائر — أي حد يفتح "Developer Tools" أو
Network tab يقدر يشوفه. عملياً أقصى حاجة ممكن حد يعملها بيه إنه يبعت رسائل
بالبوت بتاعك (مش أكتر، مينفعش يوصل لحسابك أو بياناتك). لتقليل المخاطرة:

- اعمل بوت مخصص للموقع بس، من غير صلاحيات زيادة.
- لو عايز تخفي التوكن تماماً، نفس فكرة الـ `functions/api/` المستخدمة
  لتسجيل دخول لوحة الإدارة (شرحها فوق) ممكن تتوسّع بسهولة: أضف
  `functions/api/send-order.js` يستقبل بيانات الطلب من الموقع ويبعتها
  هو لتيليجرام بالتوكن (مخزّن كمتغير بيئة على Cloudflare، مش في كود
  الموقع). ده تحسين اختياري ومش شرط تعمله عشان الموقع يشتغل.

## ☁️ النشر على Cloudflare Pages عبر GitHub

1. اعمل مستودع جديد على GitHub وارفع كل ملفات مجلد `rare-vision` (بما فيها
   `index.html` في الجذر).
   ```bash
   git init
   git add .
   git commit -m "Rare Vision store"
   git branch -M main
   git remote add origin https://github.com/USERNAME/rare-vision.git
   git push -u origin main
   ```
2. ادخل على **dash.cloudflare.com** → **Workers & Pages** → **Create** →
   **Pages** → **Connect to Git**.
3. اختار المستودع اللي رفعته.
4. في إعدادات البناء (Build settings):
   - **Framework preset:** `None`
   - **Build command:** اتركه فاضي
   - **Build output directory:** `/` (أو `rare-vision` لو الملفات جوه مجلد
     فرعي بنفس الاسم داخل المستودع)
5. اضغط **Save and Deploy**. خلال ثواني هيديك رابط `.pages.dev` جاهز.
6. (اختياري) من تبويب **Custom domains** اربط الدومين بتاعك لو عندك واحد.
7. لا تنسَ إضافة `GITHUB_CLIENT_ID` و `GITHUB_CLIENT_SECRET` في
   **Settings → Environment variables** عشان لوحة الإدارة تشتغل (تفاصيل
   في قسم "لوحة تحكم المنتجات" فوق).

كل مرة تعمل `git push` على `main`، Cloudflare هينشر النسخة الجديدة تلقائياً.
مجلد `functions/` بيتكتشف وينشر تلقائياً كـ Cloudflare Pages Functions —
مفيش خطوة إضافية أو استضافة منفصلة مطلوبة له.

## 🎨 تخصيص الألوان والخطوط

كل الألوان معرّفة كمتغيرات في أول ملف `css/style.css` داخل `:root`، غيّر
القيم هناك (`--gold`, `--bg`, `--text`...) وهتتغير في كل الموقع تلقائياً.
الخطوط مستوردة من Google Fonts (Tajawal للعربي، Oswald للشعار والأرقام) —
تقدر تستبدلها بأي خط تاني من fonts.google.com بنفس الطريقة.

## ✅ ملخص المميزات المنفذة

- فيديو خلفية Autoplay/Muted/Loop في الـ Hero + زر "تسوق الآن".
- بحث فوري (Live Search) بدون إعادة تحميل، مع فلترة حسب نوع المنتج والفئة (Gender).
- **لوحة تحكم Decap CMS كاملة على `/admin`** — إضافة/تعديل/حذف منتجات
  بترتيب حقول منطقي (الفئة، النوع، الماركة، السعر، الوصف، الصور،
  المواصفات، الـ Badges، التقييمات، المقاسات) من غير لمس أي كود.
- تسجيل دخول آمن للوحة الإدارة عبر GitHub OAuth (Cloudflare Pages
  Functions جاهزة في `functions/api/`).
- **نافذة تفاصيل منتج (Quick View)** بمعرض صور قابل للتنقل، اختيار مقاس
  تفاعلي (المقاسات غير المتوفرة تظهر بخط مشطوب ومعطّلة)، عرض السعر مع
  شطب السعر الأصلي عند وجود خصم، مواصفات منظّمة، ونجوم تقييم.
- سلة مشتريات محفوظة في `localStorage` تراعي المقاس المختار كسطر منفصل
  لكل مقاس، مع لوحة جانبية وتحكم في الكميات.
- إتمام الطلب يجمع بيانات العميل + محتوى السلة (بما فيه المقاسات) ويبعتها لبوت تيليجرام عبر
  `fetch`، ثم يفرّغ السلة ويعرض رسالة شكر.
- تصميم متجاوب بالكامل (موبايل/تابلت/ديسكتوب) واتجاه RTL كامل للعربي.
