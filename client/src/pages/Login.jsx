import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const aff = await login(email, password);
      navigate(aff.role === 'admin' ? '/admin' : '/');
    } catch (err) {
      setError(err.message || 'התחברות נכשלה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-xl font-bold text-white">
            C
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">כניסה לשותפים</h1>
          <p className="mt-1 text-sm text-slate-500">Clicker Affiliates</p>
        </div>
        <form onSubmit={onSubmit} className="card space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">אימייל</label>
            <input
              type="email"
              required
              dir="ltr"
              className="input text-left"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">סיסמה</label>
            <input
              type="password"
              required
              dir="ltr"
              className="input text-left"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'מתחבר…' : 'כניסה'}
          </button>
          <p className="text-center text-sm text-slate-500">
            אין לך חשבון?{' '}
            <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
              הרשמה
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
