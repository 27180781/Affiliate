import { useState } from 'react';
import { api } from '../api.js';

// Admin settings: default commission % (applies when an affiliate has no
// per-affiliate override) and cookie retention days.
export default function SettingsPanel({ settings, onSaved }) {
  const [pct, setPct] = useState(() => (Number(settings.defaultCommissionRate) * 100).toString());
  const [days, setDays] = useState(() => String(settings.cookieDays));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      const rate = Number(pct) / 100;
      const d = parseInt(days, 10);
      if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new Error('אחוז עמלה חייב להיות בין 0 ל-100');
      if (!Number.isInteger(d) || d < 1 || d > 730) throw new Error('ימי שמירת עוגייה: מספר שלם בין 1 ל-730');
      const { settings: updated } = await api.adminUpdateSettings({
        default_commission_rate: rate,
        cookie_days: d,
      });
      setMsg('ההגדרות נשמרו');
      onSaved?.(updated);
    } catch (e2) {
      setErr(e2.message || 'שמירה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="card">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">הגדרות מערכת</h2>
      {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {msg && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">אחוז עמלה ברירת מחדל</label>
          <div className="relative">
            <input
              type="number" min="0" max="100" step="0.5" dir="ltr"
              className="input text-left pl-7"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">%</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">חל על שותפים ללא אחוז מותאם אישית.</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">ימי שמירת עוגייה</label>
          <input
            type="number" min="1" max="730" step="1" dir="ltr"
            className="input text-left"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400">משך תוקף ה-Cookie של ההפניה (בימים).</p>
        </div>
        <div className="flex items-end">
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'שומר…' : 'שמירת הגדרות'}
          </button>
        </div>
      </div>
    </form>
  );
}
