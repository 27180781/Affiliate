import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout({ children }) {
  const { affiliate, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to={isAdmin ? '/admin' : '/'} className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 font-bold text-white">C</span>
            <span className="text-lg font-semibold text-slate-900">Clicker Affiliates</span>
          </Link>
          {affiliate && (
            <div className="flex items-center gap-3">
              <div className="hidden text-left sm:block">
                <div className="text-sm font-medium text-slate-800">{affiliate.name}</div>
                <div className="text-xs text-slate-400">{isAdmin ? 'מנהל מערכת' : affiliate.email}</div>
              </div>
              <button className="btn-ghost" onClick={handleLogout}>
                יציאה
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Clicker Affiliates · clicker.co.il
      </footer>
    </div>
  );
}
