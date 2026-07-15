# פריסה ל-CapRover

הריפו מכיל **שתי אפליקציות** שנבנות מאותו monorepo:
`affiliate-api` (Backend) ו-`affiliate-web` (Frontend). שתיהן נבנות עם **build context של שורש הריפו**
כדי ש-`server` יוכל לצרוב את קבצי ה-SQL וש-`client` יוכל לצרוב את סקריפט המעקב.

## 1. מסד נתונים — PostgreSQL

ב-CapRover → *Apps* → *One-Click Apps/Databases* → **PostgreSQL**.
- שם אפליקציה: `affiliate-db`
- הגדירו סיסמה וסכמה (`POSTGRES_DB=affiliate`).
- השם הפנימי לגישה מאפליקציות אחרות: `srv-captain--affiliate-db`.

## 2. אפליקציית ה-API (`affiliate-api`)

1. צרו אפליקציה חדשה בשם `affiliate-api`.
2. *App Configs* → **Environment Variables**:
   ```
   NODE_ENV=production
   PORT=4000
   PGHOST=srv-captain--affiliate-db
   PGPORT=5432
   PGUSER=postgres
   PGPASSWORD=<הסיסמה שהגדרתם>
   PGDATABASE=affiliate
   JWT_SECRET=<openssl rand -hex 32>
   WEBHOOK_SECRET=<openssl rand -hex 32>
   COMMISSION_RATE=0.20
   ROOT_DOMAIN=clicker.co.il
   CORS_ORIGINS=https://affiliate.clicker.co.il
   ```
3. *App Configs* → **Container HTTP Port** = `4000`.
4. **Deploy** → לשונית *Deployment*:
   - שיטת git/GitHub או `caprover deploy` מהמחשב.
   - חשוב: **Captain Definition Relative Path** = `./captain-definition`.
5. אפשרו **HTTPS** ואם רוצים חשיפה חיצונית חברו דומיין, למשל `affiliate-api.clicker.co.il`.
   > ה-Webhook מ-`pay.clicker.co.il` צריך גישה חיצונית ל-`/api/track-conversion`,
   > אז וודאו שהדומיין הזה זמין וב-HTTPS.

ה-`CMD` בקונטיינר מריץ `migrate` אוטומטית לפני ההפעלה, כך שהסכמה נוצרת בעליית האפליקציה
(ללא seed וללא מנהל — fail-closed).

**יצירת חשבון מנהל** (חובה, אין ברירת מחדל): דרך *App* → *Deployment* → **Exec** בקונטיינר:
```bash
ADMIN_EMAIL=you@clicker.co.il ADMIN_PASSWORD='<סיסמה חזקה>' npm run create-admin
```
לזריעת נתוני דמו (לא לפרודקשן) הריצו `node src/migrate.js --seed` דרך *Exec*.

## 3. אפליקציית הדשבורד (`affiliate-web`)

1. צרו אפליקציה בשם `affiliate-web`.
2. **Environment Variables**:
   ```
   API_UPSTREAM=srv-captain--affiliate-api:4000
   ```
   > הדשבורד קורא ל-`/api` דרך אותו origin, ו-nginx עושה proxy פנימי ל-API —
   > כך נמנעים מ-CORS ומצורך בכתובת API בזמן build.
3. **Container HTTP Port** = `80`.
4. **Deploy** → **Captain Definition Relative Path** = `./captain-definition-client`.
5. חברו את הדומיין הראשי של הדשבורד: **`affiliate.clicker.co.il`**, ואפשרו HTTPS.

> אם תעדיפו לארח את הדשבורד וה-API בדומיינים נפרדים ללא proxy, בנו את ה-web עם
> `VITE_API_URL=https://affiliate-api.clicker.co.il` (build arg) — אך ה-proxy הוא ברירת המחדל המומלצת.

## 4. הגשת סקריפט המעקב

לאחר פריסת ה-web, הסקריפט זמין בכתובת:
```
https://affiliate.clicker.co.il/clicker-affiliate.js
```
הטמיעו אותו ב-`<head>` של כל תתי-הדומיינים (כולל אתר התשלום).

## פריסה מהמחשב (CLI) — תמצית

```bash
npm i -g caprover
caprover login

# API (Captain Definition = ./captain-definition)
caprover deploy -a affiliate-api

# Web (מצביע לקובץ ה-client)
caprover deploy -a affiliate-web --captainDefinitionFilePath ./captain-definition-client
```

## בדיקת בריאות
```bash
curl https://affiliate-api.clicker.co.il/api/health
# { "ok": true, ... }
```
