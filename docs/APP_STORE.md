# App Store Connect listing — ROBOTAT

Every field App Store Connect asks for, filled in and ready to paste. Kept in the repo
rather than typed straight into the form because three of these fields must agree with
things that live in code — the privacy labels with
[`PrivacyInfo.xcprivacy`](../ios/App/App/PrivacyInfo.xcprivacy) and the privacy policy in
[`client/src/i18n/*.ts`](../client/src/i18n), the Support URL with a route that has to
actually exist, and the review notes with what the app genuinely does. When any of those
change, this file is the checklist for what to go and re-edit in the web form.

Character limits are Apple's, and the counts in brackets are the actual length of the
text as written. Apple counts UTF-16 code units, so an Arabic letter costs the same as a
Latin one.

Build: **1.0 (4)**. See [IOS.md](IOS.md) for how it was cut.

---

## 1. App Information

Set once, shared by every localization.

| Field | Value |
| --- | --- |
| Bundle ID | `com.nasl.robotat` |
| SKU | `robotat-ios-1` |
| Primary language | English (U.S.) |
| Additional localization | Arabic |
| Primary category | **Business** |
| Secondary category | Leave empty |
| Content rights | Does **not** contain, show, or access third-party content |
| Age rating | **4+** |

**On the primary language.** English is primary and Arabic is added alongside it, which
matches the app itself: `users.locale` defaults to `"en"` and the site falls back to
English. It is a listing-only choice and can be swapped later without a build. Do not
confuse it with the app's own language, which follows the device.

**Age rating questionnaire** — every question answers None / No. Two are worth reading
twice rather than clicking through:

- *Unrestricted web access* — **No**. The app bundles its interface and has no address
  bar or in-app browser. It does open `mailto:` and `wa.me` links, which hands off to
  another app and is not unrestricted access.
- *Medical or treatment information* — **No**. Crop health is not human health.

---

## 2. English listing

### Name — 30 max

```
ROBOTAT
```
[7]

### Subtitle — 30 max

```
Autonomous farm robots
```
[22]

### Promotional text — 170 max

Editable any time without a new build, so this is the field to change for a seasonal
push rather than resubmitting.

```
Book a free site assessment for your farm and track it from your phone. ROBOTAT's autonomous robots scout, spray, cultivate, and mow — from orchards to solar sites.
```
[164]

### Description — 4000 max

```
ROBOTAT builds and operates autonomous agricultural robots for orchards, row crops, protected agriculture, and solar sites across the region. This app is how farm operators arrange that work and follow it through.

BOOK A SITE ASSESSMENT
A ROBOTAT agronomy team walks your fields, defines scouting and treatment routes, and tailors a mission plan to your crop and your season. The assessment is free and carries no commitment. Booking takes about a minute — tell us where the land is, how large it is, and what you need — and we confirm by email and WhatsApp.

TRACK IT FROM YOUR PHONE
Every assessment you book appears on your dashboard with its current status, from received through scheduled to completed. When our operations team sets a date for your site visit, the app notifies you. No waiting on an email you might miss.

WHAT THE FLEET DOES
• Crop scouting and health — multispectral and visual imaging across every row, flagging disease, pests, and nutrient stress before the eye can see them
• Precision spraying — pesticide, herbicide, and fertilizer applied plant by plant, for less chemical use and less drift
• Irrigation and soil mapping — moisture, salinity, and topography mapped continuously, so irrigation runs by zone and by need rather than by schedule
• Yield estimation — counting, sizing, and ripeness assessed before harvest, so logistics and labour are planned on numbers
• Greenhouse and livestock monitoring — climate inside, condition and welfare checks outside
• Vegetation control on solar sites — panel rows kept clear without mowing crews and without herbicide

ONE ROBOT, EVERY ENVIRONMENT
The MAX T100 does not change — the attachment does. It drives orchard and vineyard rows from 0.9 to 2.4 m, works greenhouse aisles as narrow as 0.5 m, and manages vegetation across utility-scale solar sites.

SERVICES
Grass cutting, fertilizer and compost spraying, land cultivation, and predictive fleet maintenance — a full service wrapper around the platform, operated by NASL.

ARABIC AND ENGLISH
The entire app switches between Arabic and English, right-to-left layout included. Booking confirmations and status updates arrive in the language you chose.

YOUR ACCOUNT
Sign in to book assessments and follow them. You can delete your account, and the personal details attached to past assessments, at any time from the Account page inside the app.

ROBOTAT is operated by NASL. Questions: info@nasl-tech.com
```

### Keywords — 100 max

Comma-separated, no spaces — a space after a comma costs a character and buys nothing.
Nothing here repeats the name or subtitle, which Apple already indexes separately, so
"autonomous", "farm" and "robots" are deliberately absent.

```
agriculture,agritech,orchard,vineyard,crop,spraying,irrigation,greenhouse,harvest,solar,agronomy
```
[96]

### URLs

| Field | Value |
| --- | --- |
| Support URL | `https://www.robotat.sa/support` |
| Marketing URL | `https://www.robotat.sa` |
| Privacy policy URL | `https://www.robotat.sa/privacy` |

All three are `www` hosts. The apex `robotat.sa` does not resolve and is not meant to —
see [IOS.md](IOS.md) for why that is a deliberate DNS trade rather than a typo.

### Copyright

```
2026 NASL Technology Company
```

---

## 3. Arabic listing

Written in the voice already used in [`client/src/i18n/ar.ts`](../client/src/i18n/ar.ts)
rather than translated from the English above — including its convention of leaving
**ROBOTAT** in Latin script inside Arabic text and writing NASL as **نصل**.

### Name — 30 max

```
ROBOTAT
```
[7]

### Subtitle — 30 max

```
روبوتات زراعية ذاتية القيادة
```
[28]

### Promotional text — 170 max

```
احجز تقييماً مجانياً لموقع مزرعتك وتابعه من هاتفك. روبوتات ROBOTAT ذاتية القيادة تستكشف المحاصيل وترشّ وتحرث وتجزّ العشب — من البساتين إلى مواقع الطاقة الشمسية.
```
[160]

### Description — 4000 max

```
تصنع ROBOTAT روبوتات زراعية ذاتية القيادة وتشغّلها في البساتين والمحاصيل الحقلية والزراعة المحمية ومواقع الطاقة الشمسية في المنطقة. هذا التطبيق هو الطريقة التي يرتّب بها مشغّلو المزارع هذا العمل ويتابعونه.

احجز تقييماً للموقع
يزور فريق الهندسة الزراعية في ROBOTAT حقولك، ويحدّد مسارات الاستكشاف والمعالجة، ويصمّم خطة مهمة تناسب محصولك وموسمك. التقييم مجاني وبلا أي التزام. الحجز يستغرق دقيقة تقريباً — أخبرنا أين الأرض، وما مساحتها، وما الذي تحتاجه — ونؤكّد لك عبر البريد الإلكتروني وواتساب.

تابع الحجز من هاتفك
يظهر كل تقييم حجزته في لوحتك مع حالته الحالية، من الاستلام إلى الجدولة إلى الإنجاز. وحين يحدّد فريق العمليات موعد الزيارة، يصلك إشعار على هاتفك. لا انتظار لبريد قد يفوتك.

ماذا تفعل المنصّة
• استكشاف المحاصيل وصحّتها — تصوير متعدّد الأطياف وبصري لكل صف، يكشف الأمراض والآفات ونقص التغذية قبل أن تراها العين
• الرش الدقيق — مبيدات وأسمدة تُطبَّق نبتة نبتة، باستهلاك كيميائي أقل وانجراف أقل
• رسم خرائط الري والتربة — رطوبة وملوحة وتضاريس تُرصد باستمرار، فيجري الري حسب المنطقة والحاجة لا حسب جدول ثابت
• تقدير الإنتاج — عدّ وقياس وتقييم نضج قبل الحصاد، لتخطيط اللوجستيات والعمالة على أرقام
• مراقبة الصوبات والماشية — المناخ في الداخل، وفحص الحالة في الخارج
• التحكّم في الغطاء النباتي في مواقع الطاقة الشمسية — إبقاء صفوف الألواح نظيفة دون فرق قص ودون مبيدات أعشاب

روبوت واحد، وكل البيئات
لا يتغيّر MAX T100 — بل تتغيّر الملحقات. يسير بين صفوف البساتين والكروم من 0.9 إلى 2.4 متر، ويعمل في ممرات الصوبات الضيّقة حتى 0.5 متر، ويدير الغطاء النباتي في مواقع الطاقة الشمسية واسعة النطاق.

الخدمات
قص العشب، ورش الأسمدة والكمبوست، وحراثة الأرض، والصيانة التنبّؤية للأسطول — حزمة خدمات كاملة حول المنصّة، تشغّلها نصل.

بالعربية والإنجليزية
يتبدّل التطبيق بالكامل بين العربية والإنجليزية، بما في ذلك التخطيط من اليمين إلى اليسار. وتصلك تأكيدات الحجز وتحديثات الحالة باللغة التي اخترتها.

حسابك
سجّل الدخول لحجز التقييمات ومتابعتها. ويمكنك حذف حسابك، والبيانات الشخصية المرتبطة بالتقييمات السابقة، في أي وقت من صفحة الحساب داخل التطبيق.

ROBOTAT تشغّلها نصل. للاستفسارات: info@nasl-tech.com
```

### Keywords — 100 max

```
زراعة,مزرعة,روبوت,بستان,محاصيل,رش,ري,صوبة,حصاد,تقنية زراعية,شمسية,نخيل,مبيدات,استشعار
```
[85]

### URLs and copyright

Same as the English listing. The `/support` and `/privacy` pages both render in Arabic
when the app or browser is set to it, so one URL serves both localizations.

---

## 4. App Privacy

This is the section that must not drift. Three places describe what ROBOTAT collects, and
**the one Apple shows users is this one**:

1. these labels,
2. [`ios/App/App/PrivacyInfo.xcprivacy`](../ios/App/App/PrivacyInfo.xcprivacy),
3. `privacy.collect*` in [`en.ts`](../client/src/i18n/en.ts) / [`ar.ts`](../client/src/i18n/ar.ts),
   rendered by `Privacy.tsx`.

Answer **"Yes, we collect data from this app"**, then tick exactly these seven. Every one
is **linked to the user**, and **none** is used for tracking — so when App Store Connect
asks "is this data used for tracking purposes", the answer is **No** every time.

| Apple category | Data type | Purpose | Where it comes from |
| --- | --- | --- | --- |
| Contact Info | Name | App Functionality | `users.name`, `assessments.name` |
| Contact Info | Email Address | App Functionality | `users.email`, `assessments.email` |
| Contact Info | Phone Number | App Functionality | `assessments.phone` |
| Contact Info | Physical Address | App Functionality | `assessments.location` |
| User Content | Other User Content | App Functionality | `assessments.company` and the free-text notes |
| Identifiers | Device ID | App Functionality | `push_tokens.token` — the APNs token, stored against a user |
| Usage Data | Product Interaction | Analytics | `analytics_events` |

### Four judgment calls, so nobody re-litigates them under time pressure

**Location is deliberately not declared.** The farm address is typed by the user into a
text field. The app never links Core Location and requests no location permission, so
declaring Precise or Coarse Location would claim a capability it does not have. It is
declared as Physical Address instead.

**Product Interaction is linked, even though analytics is anonymous.** `visitor_id` is a
random client-generated value, but `analytics_events` also carries a nullable `user_id`,
so any event recorded while signed in is attributable to a person. "Not linked" would be
a false declaration on exactly those rows.

**Device ID covers the push token.** Apple's Device ID is "any device-level ID", and
`push_tokens.user_id` is `NOT NULL` with a foreign key to `users` — the token is stored
against an account, not on its own. It is App Functionality, not Analytics: it is only
ever addressed to, never measured. This was missing from the privacy manifest until
build 4 while the privacy policy had disclosed it since the table shipped.

**User ID is not declared.** `users.id` is an internal serial primary key that is never
shown to or collected from the user; account identity is the email address, which is
already declared above.

---

## 5. App Review Information

### Sign-in required — **Yes**

| Field | Value |
| --- | --- |
| Username | `appreview@robotat.sa` |
| Password | `S24Z-P6J5-RH5E-65MV` |

Created by `npm run demo:account` (see `script/demo-account.ts`), which exists because
three things have to be true at once and none of them happen by registering through the
public form:

- **The email is pre-verified.** `POST /api/assessments` returns 403 until
  `users.email_verified_at` is set, so an unverified account can sign in, see an empty
  dashboard, and do nothing else — which reads as a broken app, not a locked one.
- **The dashboard has history.** Three assessments, one per status (completed, scheduled,
  pending), so the list, the status pills and the counters all have something to show.
  This is also the Dashboard screenshot.
- **The booking allowance is intact.** Bookings are capped at 3 per account per rolling
  24 hours. The seeded rows are backdated 34, 9 and 2 days precisely so the reviewer
  starts with all three, rather than hitting a 429 on the first thing they try.

The account is an ordinary `customer`, not staff — a reviewer should see the customer
experience, not `/admin`. (`npm run dev:staff` mints staff accounts and is the wrong tool
here; it also refuses to run against production.) The seeded bookings appear in `/admin`
like any other, and each says in its message field that it is review demo data, so nobody
dispatches an agronomist to a farm that does not exist.

Verified against production on 2026-08-19: session login, bearer-token login (the path
the iOS build actually uses), and `GET /api/assessments` returning all three rows.

To rotate the password for a later submission, or to remove the account entirely:

```bash
npm run demo:account                                    # re-run: new password, bookings reset
npm run demo:account -- --delete appreview@robotat.sa   # remove it and its bookings
```

Both need `DATABASE_URL` pointed at production.

### Contact information

| Field | Value |
| --- | --- |
| Email | `info@nasl-tech.com` |
| Phone | *(a number that will actually be answered)* |

### Notes

Addresses Guideline 4.2 head-on, because a Capacitor app that opens on marketing content
invites exactly that rejection. Everything asserted here is true of the shipped binary.

```
ROBOTAT is the customer app for NASL, which builds and operates autonomous agricultural robots. Customers use it to book a free on-site assessment of their farm and to follow that assessment through to completion.

WHY THIS IS NOT A WEBSITE IN A WRAPPER (Guideline 4.2)

The interface is compiled into the app binary and shipped with it — the app is not a webview pointed at a URL, and it does not download its UI at runtime. It uses native iOS capabilities that a website cannot:

• Native push notifications over APNs. When our operations team schedules a customer's site visit or changes its status, that customer's device receives a push. This is the app's main reason to exist: the alternative is an email that gets missed.
• Credentials are stored in the iOS Keychain through a native secure-storage plugin, not in web storage, so a signed-in session survives relaunch.
• Full right-to-left Arabic layout alongside English, following the device language.

The app's core value is transactional, not editorial: an authenticated customer submits a site assessment request and tracks its status (received → scheduled → completed) on a dashboard tied to their account.

HOW TO TEST

1. The fleet and services pages are public and need no account.
2. Sign in with the credentials above.
3. The dashboard lists assessments already booked on this account, each with its status.
4. Tap "Book a site assessment" to submit a new one. It appears on the dashboard immediately. A confirmation is sent by email and WhatsApp — this is expected behaviour, not a leak.
5. Push notifications fire when staff change an assessment's status. We can trigger one on request during review.

ACCOUNT DELETION (Guideline 5.1.1(v))

In-app, at Dashboard → Account → Delete account. It requires the password again, deletes the account, and strips name, email, phone and notes from past assessment records.

OTHER

• No purchases, no subscriptions, no advertising, no third-party analytics or tracking SDKs.
• No user-generated content is visible to any other user.
• Email and WhatsApp buttons hand off to those apps by design; they are the contact channels this business actually runs on.
```

---

## 6. Version release and export compliance

| Field | Value |
| --- | --- |
| Version | `1.0` |
| Build | `4` |
| Release | **Manually release this version** — so the listing is not live the moment review passes |
| Export compliance | Not asked. `ITSAppUsesNonExemptEncryption = false` is already in `Info.plist` |

### Screenshots

`script/ios-screenshots.sh` writes the 6.9-inch set to `screenshots/ios-6.9/` at
1320×2868. The target is iPhone-only, so that one set covers the submission and Apple
scales it down; no iPad set is needed.

The Dashboard screenshot needs the reviewer demo account to exist first — an empty
dashboard is a poor shot, and it is the screen that best answers "what is this app for".
Re-run the script after creating the account.
