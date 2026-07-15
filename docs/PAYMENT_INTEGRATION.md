# אינטגרציית התשלום (`pay.clicker.co.il`) עם ה-Webhook

זרימת המעקב מהקליק ועד לזיכוי:

1. משתמש מגיע דרך `https://site1.clicker.co.il/?ref=DEMO2024`.
   סקריפט המעקב כותב Cookie `clicker_affiliate=DEMO2024` על `.clicker.co.il`.
2. המשתמש גולש בין תתי-הדומיינים — ה-Cookie זמין בכולם.
3. בעמוד התשלום `pay.clicker.co.il`, בעת רכישה מוצלחת, שרת התשלום קורא את ה-Cookie
   ושולח Webhook לשרת השותפים.

## הקריאה

```http
POST https://affiliate.clicker.co.il/api/track-conversion
Content-Type: application/json
x-webhook-secret: <WEBHOOK_SECRET>

{
  "order_id": "ORD-10231",
  "purchase_amount": 349.90,
  "ref": "DEMO2024"
}
```

- `order_id` — מזהה ההזמנה הייחודי (חובה). משמש לאידמפוטנטיות.
- `purchase_amount` — סכום הרכישה (מספר, חובה).
- `ref` — ערך ה-Cookie `clicker_affiliate`. אפשר לשלוח גם בשם `clicker_affiliate` או `affiliate_ref`.

## קריאת ה-Cookie בצד שרת התשלום

### Node.js / Express (עם cookie-parser)
```js
app.post('/checkout/complete', async (req, res) => {
  const ref = req.cookies['clicker_affiliate'] || '';   // נקרא מהדומיין הראשי

  await fetch('https://affiliate.clicker.co.il/api/track-conversion', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': process.env.WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      order_id: order.id,
      purchase_amount: order.total,
      ref,
    }),
  });

  res.json({ ok: true });
});
```

### PHP
```php
$ref = $_COOKIE['clicker_affiliate'] ?? '';
$ch = curl_init('https://affiliate.clicker.co.il/api/track-conversion');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => [
    'Content-Type: application/json',
    'x-webhook-secret: ' . getenv('WEBHOOK_SECRET'),
  ],
  CURLOPT_POSTFIELDS => json_encode([
    'order_id'        => $order['id'],
    'purchase_amount' => $order['total'],
    'ref'             => $ref,
  ]),
  CURLOPT_RETURNTRANSFER => true,
]);
curl_exec($ch);
```

## תשובות אפשריות

| מצב | קוד | גוף |
|---|---|---|
| נרשמה המרה חדשה | `201` | `{ "matched": true, "duplicate": false, "conversion": {…} }` |
| `order_id` שכבר קיים | `200` | `{ "matched": true, "duplicate": true, "conversion": {…} }` |
| אין Cookie / `ref` ריק | `200` | `{ "matched": false, "reason": "no_ref" }` |
| `ref` לא מוכר / Cookie ישן | `200` | `{ "matched": false, "reason": "unknown_ref" }` |
| סוד Webhook שגוי | `401` | `{ "error": "Invalid webhook secret" }` |
| נתונים חסרים/לא תקינים | `400` | `{ "error": "…" }` |

> שימו לב: מצבי "לא מותאם" מחזירים `200` בכוונה, כדי ששרת התשלום לא ינסה שוב ושוב
> על מכירה אורגנית לגיטימית. רק שגיאות אמת (auth/validation) מחזירות 4xx.

## בדיקה מהירה (curl)

```bash
curl -X POST https://affiliate.clicker.co.il/api/track-conversion \
  -H 'Content-Type: application/json' \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -d '{"order_id":"TEST-1","purchase_amount":100,"ref":"DEMO2024"}'
# → { "matched": true, "duplicate": false, "conversion": { "commission_amount": 20, ... } }
```
