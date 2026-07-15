import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import AffiliateDashboard from './pages/AffiliateDashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';

function FullScreenLoader() {
  return (
    <div className="grid min-h-screen place-items-center text-sm text-slate-500">טוען…</div>
  );
}

/** Guards routes that need any logged-in user. */
function RequireAuth({ children }) {
  const { affiliate, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!affiliate) return <Navigate to="/login" replace />;
  return children;
}

/** Guards admin-only routes. */
function RequireAdmin({ children }) {
  const { affiliate, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!affiliate) return <Navigate to="/login" replace />;
  if (affiliate.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

/** Redirect already-authenticated users away from auth pages. */
function PublicOnly({ children }) {
  const { affiliate, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (affiliate) return <Navigate to={affiliate.role === 'admin' ? '/admin' : '/'} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AffiliateDashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminDashboard />
          </RequireAdmin>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
