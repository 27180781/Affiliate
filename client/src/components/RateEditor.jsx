import { useState } from 'react';
import { api } from '../api.js';
import { percent } from '../format.js';

// Inline editor for an affiliate's commission rate.
// Empty value = "use the global default".
export default function RateEditor({ affiliate, defaultRate, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(
    affiliate.commission_rate != null ? String(Number(affiliate.commission_rate) * 100) : ''
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setBusy(true);
    setErr('');
    try {
      let payload;
      if (value.trim() === '') {
        payload = { commission_rate: null };
      } else {
        const rate = Number(value) / 100;
        if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new Error('0–100');
        payload = { commission_rate: rate };
      }
      await api.adminUpdateAffiliate(affiliate.id, payload);
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setErr(e.message || 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    const custom = affiliate.commission_rate != null;
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs hover:bg-slate-100"
        onClick={() => setEditing(true)}
        title="לחצו לעריכה"
      >
        {custom ? (
          <span className="font-medium text-slate-800">{percent(affiliate.commission_rate)}</span>
        ) : (
          <span className="text-slate-400">ברירת מחדל ({percent(defaultRate)})</span>
        )}
        <span className="text-slate-300">✎</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1" dir="ltr">
      <input
        autoFocus
        type="number" min="0" max="100" step="0.5"
        className="input h-8 w-20 px-2 py-1 text-left text-xs"
        value={value}
        placeholder="def"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />
      <span className="text-xs text-slate-400">%</span>
      <button className="btn-primary h-8 px-2 py-1 text-xs" disabled={busy} onClick={save}>✓</button>
      <button className="btn-ghost h-8 px-2 py-1 text-xs" onClick={() => setEditing(false)}>✕</button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
