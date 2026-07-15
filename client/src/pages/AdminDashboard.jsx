import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api.js';
import Layout from '../components/Layout.jsx';
import KpiCard from '../components/KpiCard.jsx';
import ConversionsTable from '../components/ConversionsTable.jsx';
import SettingsPanel from '../components/SettingsPanel.jsx';
import AddConversionForm from '../components/AddConversionForm.jsx';
import RateEditor from '../components/RateEditor.jsx';
import { money } from '../format.js';

export default function AdminDashboard() {
  const [affiliates, setAffiliates] = useState([]);
  const [conversions, setConversions] = useState([]);
  const [settings, setSettings] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payingId, setPayingId] = useState(null);
  // Monotonic request id: ignore responses from superseded loads (e.g. rapid
  // status-filter changes) so we never render data for the wrong filter.
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    const myReq = ++reqIdRef.current;
    setError('');
    try {
      const [affRes, convRes, setRes] = await Promise.all([
        api.adminAffiliates(),
        api.adminConversions(statusFilter),
        api.adminSettings(),
      ]);
      if (myReq !== reqIdRef.current) return; // a newer load started; drop this
      setAffiliates(affRes.affiliates);
      setConversions(convRes.conversions);
      setSettings(setRes.settings);
    } catch (err) {
      if (myReq !== reqIdRef.current) return;
      setError(err.message || 'שגיאה בטעינת נתוני הניהול');
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function payConversion(id) {
    setPayingId(id);
    try {
      await api.adminPayConversion(id);
      await load();
    } catch (err) {
      setError(err.message || 'סימון התשלום נכשל');
    } finally {
      setPayingId(null);
    }
  }

  async function payAll(affiliateId) {
    if (!confirm('לסמן את כל העמלות הממתינות של שותף זה כ"שולם"?')) return;
    try {
      await api.adminPayAll(affiliateId);
      await load();
    } catch (err) {
      setError(err.message || 'הפעולה נכשלה');
    }
  }

  const totalPending = affiliates.reduce((s, a) => s + Number(a.pending_balance || 0), 0);
  const totalPaid = affiliates.reduce((s, a) => s + Number(a.total_paid || 0), 0);
  const totalClicks = affiliates.reduce((s, a) => s + Number(a.total_clicks || 0), 0);

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">לוח ניהול</h1>
        <p className="mt-1 text-sm text-slate-500">ניהול שותפים, המרות ותשלומים.</p>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="card text-center text-sm text-slate-500">טוען…</div>
      ) : error ? null : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <KpiCard label="שותפים פעילים" value={affiliates.length} accent="brand" />
            <KpiCard label="סך קליקים" value={totalClicks} accent="slate" />
            <KpiCard label="סך יתרה ממתינה" value={money(totalPending)} accent="amber" />
            <KpiCard label="סך ששולם (מצטבר)" value={money(totalPaid)} accent="emerald" />
          </div>

          {/* Settings */}
          {settings && <SettingsPanel settings={settings} onSaved={(s) => setSettings(s)} />}

          {/* Manual conversion entry */}
          <AddConversionForm affiliates={affiliates} onAdded={load} />

          {/* Affiliates table */}
          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">שותפים</h2>
            <div className="card overflow-x-auto p-0">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">שם</th>
                    <th className="px-4 py-3">אימייל</th>
                    <th className="px-4 py-3">קוד</th>
                    <th className="px-4 py-3">אחוז עמלה</th>
                    <th className="px-4 py-3">קליקים</th>
                    <th className="px-4 py-3">המרות</th>
                    <th className="px-4 py-3">יתרה ממתינה</th>
                    <th className="px-4 py-3">שולם</th>
                    <th className="px-4 py-3">פעולה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {affiliates.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{a.name}</td>
                      <td className="px-4 py-3 text-slate-500" dir="ltr">{a.email}</td>
                      <td className="px-4 py-3 font-mono text-xs" dir="ltr">{a.custom_ref_code}</td>
                      <td className="px-4 py-3">
                        <RateEditor
                          affiliate={a}
                          defaultRate={settings?.defaultCommissionRate}
                          onSaved={load}
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-600">{a.total_clicks}</td>
                      <td className="px-4 py-3">{a.total_conversions}</td>
                      <td className="px-4 py-3 font-medium text-amber-700">{money(a.pending_balance)}</td>
                      <td className="px-4 py-3 text-emerald-700">{money(a.total_paid)}</td>
                      <td className="px-4 py-3">
                        {Number(a.pending_balance) > 0 ? (
                          <button className="btn-secondary py-1 text-xs" onClick={() => payAll(a.id)}>
                            שלם הכל
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Conversions */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">כל ההמרות</h2>
              <select
                className="input w-auto"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">כל הסטטוסים</option>
                <option value="pending">ממתין</option>
                <option value="approved">אושר</option>
                <option value="paid">שולם</option>
              </select>
            </div>
            <ConversionsTable
              conversions={conversions}
              admin
              onPay={payConversion}
              payingId={payingId}
            />
          </section>
        </div>
      )}
    </Layout>
  );
}
