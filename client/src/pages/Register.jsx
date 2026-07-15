import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', ref_code: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function update(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = { name: form.name, email: form.email, password: form.password };
      if (form.ref_code.trim()) payload.ref_code = form.ref_code.trim();
      await register(payload);
      navigate('/');
    } catch (err) {
      setError(err.message || 'ההרשמה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-xl font-bold text-white">
            C
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">הרשמת שותף חדש</h1>
          <p className="mt-1 text-sm text-slate-500">הצטרפו לתוכנית השותפים של Clicker</p>
        </div>
        <form onSubmit={onSubmit} className="card space-y-4">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">שם מלא</label>
            <input required className="input" value={form.name} onChange={update('name')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">אימייל</label>
            <input type="email" required dir="ltr" className="input text-left" value={form.email} onChange={update('email')} autoComplete="email" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">סיסמה</label>
            <input type="password" required minLength={8} dir="ltr" className="input text-left" value={form.password} onChange={update('password')} autoComplete="new-password" />
            <p className="mt-1 text-xs text-slate-400">לפחות 8 תווים</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              קוד הפניה מועדף <span className="text-slate-400">(אופציונלי)</span>
            </label>
            <input dir="ltr" className="input text-left font-mono uppercase" placeholder="למשל DAVID2024" value={form.ref_code} onChange={update('ref_code')} />
            <p className="mt-1 text-xs text-slate-400">אם תשאירו ריק — ניצור עבורכם קוד אוטומטי.</p>
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'נרשם…' : 'יצירת חשבון'}
          </button>
          <p className="text-center text-sm text-slate-500">
            כבר רשומים?{' '}
            <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
              כניסה
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
