import { useState } from 'react';
import { api } from '../api.js';

// Manual conversion entry — lets an admin record a purchase when there is no
// automated payment webhook (uses the affiliate's effective commission rate).
export default function AddConversionForm({ affiliates, onAdded }) {
  const [affiliateId, setAffiliateId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      if (!affiliateId) throw new Error('בחרו שותף');
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt < 0) throw new Error('סכום רכישה לא תקין');
      const res = await api.adminAddConversion({
        affiliate_id: affiliateId,
        order_id: orderId.trim(),
        purchase_amount: amt,
      });
      setMsg(res.duplicate ? 'הזמנה קיימת — לא נוספה שוב' : 'ההמרה נוספה בהצלחה');
      setOrderId('');
      setAmount('');
      onAdded?.();
    } catch (e2) {
      setErr(e2.message || 'הוספת ההמרה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <h2 className="mb-1 text-lg font-semibold text-slate-900">הזנת רכישה ידנית</h2>
      <p className="mb-3 text-sm text-slate-500">
        לרישום רכישה שלא הגיעה דרך ה-Webhook האוטומטי. העמלה תחושב לפי אחוז השותף.
      </p>
      {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {msg && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">שותף</label>
          <select className="input" value={affiliateId} onChange={(e) => setAffiliateId(e.target.value)}>
            <option value="">— בחרו שותף —</option>
            {affiliates.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.custom_ref_code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">מס' הזמנה</label>
          <input dir="ltr" className="input text-left" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="ORD-123" required />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">סכום רכישה (₪)</label>
          <input type="number" min="0" step="0.01" dir="ltr" className="input text-left" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
      </div>
      <div className="mt-4">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'מוסיף…' : 'הוספת המרה'}
        </button>
      </div>
    </form>
  );
}
