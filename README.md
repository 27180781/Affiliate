# Clicker Affiliates — מערכת ניהול שותפים חוצת תתי-דומיינים

מערכת שותפים (Affiliate) מלאה עבור `clicker.co.il`. עוקבת אחרי הפניות בין תתי-דומיינים
(`site1.clicker.co.il`, `totach.caprover.clicker.co.il`, …) באמצעות **Cookie ברמת הדומיין הראשי**
(`domain=.clicker.co.il`), וקולטת המרות מ-`pay.clicker.co.il` דרך Webhook.

```
┌──────────────────────┐     ?ref=CODE      ┌──────────────────────┐
│  site1.clicker.co.il │ ─────────────────▶ │  clicker-affiliate.js│  (בכל <head>)
│  totach.caprover.…   │                    │  כותב Cookie:        │
└──────────────────────┘                    │  clicker_affiliate   │
                                            │  domain=.clicker.co.il│
                                            │  Secure; SameSite=Lax │
                                            │  Max-Age=30d          │
                                            └──────────┬───────────┘
                                                       │  (Cookie נשמר בכל הדומיין)
                                                       ▼
┌──────────────────────┐   POST /api/track-conversion   ┌──────────────────────┐
│   pay.clicker.co.il  │ ─────(x-webhook-secret)───────▶ │  Affiliate API       │
│   קורא את ה-Cookie    │   { order_id, purchase_amount,  │  (Node/Express)      │
│   ושולח בעת רכישה     │     ref }                       │  מחשב עמלה 20%       │
└──────────────────────┘                                 │  → טבלת conversions  │
                                                         └──────────┬───────────┘
                                                                    ▼
                                          ┌──────────────────────────────────────┐
                                          │  affiliate.clicker.co.il (React SPA)   │
                                          │  · לוח שותפים (KPI, קישור, המרות)      │
                                          │  · לוח מנהל (שותפים, המרות, "שולם")     │
                                          └──────────────────────────────────────┘
```

## מבנה הפרויקט

```
Affiliate/
├── captain-definition            # CapRover: אפליקציית ה-API (server/Dockerfile)
├── captain-definition-client     # CapRover: אפליקציית הדשבורד (client/Dockerfile)
├── docker-compose.yml            # סביבת פיתוח מקומית (db + api + web)
├── .env.example                  # כל משתני הסביבה
│
├── db/
│   ├── schema.sql                # טבלאות affiliates, conversions, clicks (+enum, אינדקסים)
│   └── seed.sql                  # נתוני דמו (admin + demo affiliate)
│
├── server/                       # Backend — Node.js + Express + PostgreSQL
│   ├── Dockerfile                # נבנה מ-root context (מכיל גם db/)
│   ├── package.json
│   └── src/
│       ├── index.js              # אפליקציית Express, CORS, rate-limit, health
│       ├── config.js             # קונפיגורציה מ-env
│       ├── db.js                 # pg pool + helper לטרנזקציות
│       ├── migrate.js            # מריץ schema.sql (+seed אופציונלי)
│       ├── auth.js               # JWT + middleware להרשאות
│       └── routes/
│           ├── auth.js           # /api/auth/register, /login
│           ├── affiliate.js      # /api/affiliate/me, /stats, /conversions
│           ├── admin.js          # /api/admin/affiliates, /conversions, pay
│           └── track.js          # /api/track-conversion (webhook), /track-click
│
├── tracking/
│   └── clicker-affiliate.js      # ★ סקריפט המעקב הגלובלי (Vanilla JS ל-<head>)
│
└── client/                       # Frontend — React (Vite) + Tailwind (RTL)
    ├── Dockerfile                # build → nginx; מזריק את סקריפט המעקב ל-/clicker-affiliate.js
    ├── default.conf.template     # nginx: SPA + proxy ל-/api
    └── src/
        ├── main.jsx / App.jsx    # ניתוב + הגנת ראוטים
        ├── api.js                # עטיפת fetch ל-API
        ├── context/AuthContext   # ניהול התחברות (JWT ב-localStorage)
        ├── pages/                # Login, Register, AffiliateDashboard, AdminDashboard
        └── components/           # KpiCard, ReferralWidget, ConversionsTable, …
```

## Tech Stack
- **Frontend:** React 18 (Vite), Tailwind CSS, React Router — עברית + RTL.
- **Backend:** Node.js 20 + Express, JWT auth, bcrypt.
- **DB:** PostgreSQL (SQL גולמי + `pg`, ללא ORM).
- **Deployment:** Docker, מוכן ל-CapRover (שתי אפליקציות).

---

## הרצה מקומית (הכי מהיר)

```bash
cp .env.example .env          # לא חובה לפיתוח מקומי עם compose
docker compose up --build
```

- דשבורד: <http://localhost:8080>
- API: <http://localhost:4000/api/health>
- נתוני דמו נזרעים אוטומטית:
  - מנהל: `admin@clicker.co.il` / `admin1234`
  - שותף: `demo@clicker.co.il` / `demo1234`

### הרצה ללא Docker (dev)

```bash
# 1) PostgreSQL מקומי, ואז:
cd server && npm install
export JWT_SECRET=dev WEBHOOK_SECRET=dev PGDATABASE=affiliate
npm run seed          # schema + demo data
npm run dev           # API על :4000

# 2) בטרמינל נפרד:
cd client && npm install && npm run dev   # דשבורד על :5173 (proxy ל-:4000)
```

---

## סקריפט המעקב הגלובלי

הדביקו בתוך ה-`<head>` של **כל** האתרים/תתי-הדומיינים (כולל `pay.clicker.co.il`):

```html
<script src="https://affiliate.clicker.co.il/clicker-affiliate.js" defer></script>
```

הסקריפט:
1. קורא `?ref=CODE` מכתובת ה-URL.
2. אם קיים — כותב Cookie בשם `clicker_affiliate` על `domain=.clicker.co.il`
   עם `Secure; SameSite=Lax; Path=/`, ותוקף לפי **מספר הימים שמוגדר בלוח המנהל** (ברירת מחדל 30).
3. (אופציונלי) שולח beacon ל-`/api/track-click` לצורך ספירת קליקים.

> הסקריפט מוגש **דינמית** מ-`/clicker-affiliate.js` (דרך ה-API), כך שכשמשנים את
> "ימי שמירת עוגייה" בהגדרות המנהל — הערך מתעדכן בכל האתרים אוטומטית, בלי לערוך מחדש את ההטמעה.

קונפיגורציה אופציונלית (site override, לפני טעינת הסקריפט): ראו את ההערות בראש
[`tracking/clicker-affiliate.js`](tracking/clicker-affiliate.js).

---

## אינטגרציית ה-Webhook (מ-`pay.clicker.co.il`)

לאחר חיוב מוצלח, שרת התשלום קורא את ה-Cookie ושולח:

```http
POST https://affiliate.clicker.co.il/api/track-conversion
Content-Type: application/json
x-webhook-secret: <WEBHOOK_SECRET>

{
  "order_id": "ORD-10231",
  "purchase_amount": 349.90,
  "ref": "DEMO2024"          // הערך מתוך ה-Cookie clicker_affiliate
}
```

- העמלה מחושבת אוטומטית (`COMMISSION_RATE`, ברירת מחדל 20%) ונרשמת כ-`pending`.
- **אידמפוטנטי**: `order_id` ייחודי — קריאה חוזרת לא תיצור זיכוי כפול.
- ללא `ref` (מכירה אורגנית) או `ref` לא מוכר → מוחזר `200 {"matched": false}` (לא שגיאה).

דוגמה מלאה: [`docs/PAYMENT_INTEGRATION.md`](docs/PAYMENT_INTEGRATION.md).

---

## פריסה ל-CapRover

שתי אפליקציות מאותו ריפו. פירוט מלא: [`docs/DEPLOY_CAPROVER.md`](docs/DEPLOY_CAPROVER.md).

1. **DB** — צרו אפליקציית PostgreSQL (One-Click App), למשל בשם `affiliate-db`.
2. **API** (`affiliate-api`) — Captain Definition Path: `./captain-definition`. הגדירו env
   (`JWT_SECRET`, `WEBHOOK_SECRET`, `PGHOST=srv-captain--affiliate-db`, …). הפעילו HTTPS.
   לאחר העלייה, צרו מנהל: `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run create-admin`
   (דרך *Exec* בקונטיינר) — אין חשבון מנהל מובנה.
3. **Web** (`affiliate-web`) — Captain Definition Path: `./captain-definition-client`,
   env `API_UPSTREAM=srv-captain--affiliate-api:4000`. חברו לדומיין `affiliate.clicker.co.il`.

---

## API — סקירה

| Method | Endpoint | הרשאה | תיאור |
|---|---|---|---|
| POST | `/api/auth/register` | — | הרשמת שותף |
| POST | `/api/auth/login` | — | התחברות (מחזיר JWT) |
| GET  | `/api/affiliate/me` | שותף | פרופיל + קישור הפניה |
| GET  | `/api/affiliate/stats` | שותף | KPI: קליקים, המרות, יתרה, ששולם |
| GET  | `/api/affiliate/conversions` | שותף | ההמרות של השותף |
| POST | `/api/track-conversion` | webhook secret | קליטת המרה מחיוב |
| POST | `/api/track-click` | — | ספירת קליק (מהסקריפט) |
| GET  | `/api/config` | — | קונפיג ציבורי (שם עוגייה, ימי תוקף) |
| GET  | `/clicker-affiliate.js` | — | סקריפט המעקב (דינמי, עם ימי העוגייה מההגדרות) |
| GET  | `/api/admin/affiliates` | מנהל | כל השותפים + יתרות + קליקים + אחוז |
| GET  | `/api/admin/conversions` | מנהל | כל ההמרות (סינון לפי סטטוס) |
| POST | `/api/admin/conversions` | מנהל | **הזנת רכישה ידנית** |
| POST | `/api/admin/conversions/:id/pay` | מנהל | סימון המרה כ"שולם" |
| POST | `/api/admin/affiliates/:id/pay-all` | מנהל | סימון כל היתרה כ"שולם" |
| PATCH | `/api/admin/affiliates/:id` | מנהל | עדכון **אחוז עמלה פר-שותף** / שם |
| GET  | `/api/admin/settings` | מנהל | הגדרות (אחוז ברירת מחדל, ימי עוגייה) |
| PUT  | `/api/admin/settings` | מנהל | עדכון ההגדרות |

## אבטחה — עקרונות מיושמים
- סיסמאות ב-**bcrypt**; JWT חתום; השוואת סוד ה-Webhook ב-**constant-time**.
- שאילתות **פרמטריות** בלבד (אין string-concat → אין SQL injection).
- **Rate limiting** על auth ועל שאר ה-API.
- CORS מוגבל ל-`*.clicker.co.il` בלבד.
- כתובות IP נשמרות **מוצפנות (hash)** בלבד בטבלת הקליקים.
- **סודות חובה בכל סביבה**: השרת לא יעלה ללא `JWT_SECRET` ו-`WEBHOOK_SECRET` (fail-closed).
  ל-dev מקומי בלבד אפשר `ALLOW_INSECURE_DEV_SECRETS=true`.
- **אין מנהל מובנה** — יוצרים מנהל עם `npm run create-admin` וסיסמה שאתם מספקים.
- אלגוריתם ה-JWT מוצמד ל-HS256 (מונע התקפות algorithm-confusion).
- אל תשתמשו בחשבונות הדמו בפרודקשן — הריצו migrate ללא `--seed`.
