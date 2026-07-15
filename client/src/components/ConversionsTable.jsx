import StatusBadge from './StatusBadge.jsx';
import { money, dateTime } from '../format.js';

/**
 * Conversions table. When `admin` is true it shows the affiliate column and a
 * "mark paid" action button (onPay receives the conversion id).
 */
export default function ConversionsTable({ conversions, admin = false, onPay, payingId }) {
  if (!conversions?.length) {
    return <div className="card text-center text-sm text-slate-500">אין המרות להצגה עדיין.</div>;
  }

  return (
    <div className="card overflow-x-auto p-0">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">מס' הזמנה</th>
            {admin && <th className="px-4 py-3">שותף</th>}
            <th className="px-4 py-3">סכום רכישה</th>
            <th className="px-4 py-3">עמלה</th>
            <th className="px-4 py-3">סטטוס</th>
            <th className="px-4 py-3">תאריך</th>
            {admin && <th className="px-4 py-3">פעולה</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {conversions.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs" dir="ltr">{c.order_id}</td>
              {admin && (
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{c.affiliate_name}</div>
                  <div className="text-xs text-slate-400">{c.custom_ref_code}</div>
                </td>
              )}
              <td className="px-4 py-3">{money(c.purchase_amount)}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{money(c.commission_amount)}</td>
              <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-500">{dateTime(c.created_at)}</td>
              {admin && (
                <td className="px-4 py-3">
                  {c.status === 'paid' ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : (
                    <button
                      className="btn-secondary py-1 text-xs"
                      disabled={payingId === c.id}
                      onClick={() => onPay?.(c.id)}
                    >
                      {payingId === c.id ? '…' : 'סמן כשולם'}
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
