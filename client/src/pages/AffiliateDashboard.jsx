import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Layout from '../components/Layout.jsx';
import KpiCard from '../components/KpiCard.jsx';
import ReferralWidget from '../components/ReferralWidget.jsx';
import ConversionsTable from '../components/ConversionsTable.jsx';
import { money } from '../format.js';

export default function AffiliateDashboard() {
  const { affiliate } = useAuth();
  const [me, setMe] = useState(null);
  const [stats, setStats] = useState(null);
  const [conversions, setConversions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [meRes, statsRes, convRes] = await Promise.all([
          api.me(),
          api.stats(),
          api.myConversions(),
        ]);
        if (!active) return;
        setMe(meRes);
        setStats(statsRes);
        setConversions(convRes.conversions);
      } catch (err) {
        if (active) setError(err.message || 'שגיאה בטעינת הנתונים');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          שלום, {affiliate?.name?.split(' ')[0] || 'שותף'} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500">סקירת הביצועים שלך במבט מהיר.</p>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="card text-center text-sm text-slate-500">טוען…</div>
      ) : error ? null : (
        <div className="space-y-6">
          {me && <ReferralWidget link={me.referralLink} refCode={me.affiliate.custom_ref_code} />}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="סך קליקים" value={stats?.totalClicks ?? 0} accent="slate" />
            <KpiCard label="סך המרות" value={stats?.totalConversions ?? 0} accent="brand" />
            <KpiCard label="יתרה ממתינה" value={money(stats?.pendingBalance)} hint="טרם שולם" accent="amber" />
            <KpiCard label="סך ששולם" value={money(stats?.totalPaid)} hint="הועבר אליך" accent="emerald" />
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">המרות אחרונות</h2>
            <ConversionsTable conversions={conversions} />
          </div>
        </div>
      )}
    </Layout>
  );
}
