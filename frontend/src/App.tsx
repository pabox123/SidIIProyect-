import { Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Layout } from './components/Layout';
import { RequireAdmin, RequireClient } from './components/guards';
import { LoginPage } from './pages/LoginPage';
import { ProfileSelectPage } from './pages/ProfileSelectPage';
import { HomePage } from './pages/HomePage';
import { TitlePage } from './pages/TitlePage';
import { PlayerPage } from './pages/PlayerPage';
import { MyListPage } from './pages/MyListPage';
import { AccountPage } from './pages/AccountPage';
import { StatusPage } from './pages/StatusPage';
import { AdminCatalogPage } from './pages/admin/AdminCatalogPage';
import { AdminItemFormPage } from './pages/admin/AdminItemFormPage';
import { AdminReportsPage } from './pages/admin/AdminReportsPage';

function AdminHome() {
  const { session } = useAuth();
  if (session.kind !== 'admin') return <Navigate to="/login" replace />;
  return <Navigate to={session.admin.roles.includes('catalog_admin') ? '/admin/catalog' : '/admin/reports'} replace />;
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<RequireClient><HomePage /></RequireClient>} />
            <Route path="/profiles" element={<RequireClient requireProfile={false}><ProfileSelectPage /></RequireClient>} />
            <Route path="/title/:contentId" element={<RequireClient><TitlePage /></RequireClient>} />
            <Route path="/watch/:sessionId" element={<RequireClient><PlayerPage /></RequireClient>} />
            <Route path="/account" element={<RequireClient requireProfile={false}><AccountPage /></RequireClient>} />
            <Route path="/my-list" element={<RequireClient><MyListPage /></RequireClient>} />
            <Route path="/admin" element={<RequireAdmin><AdminHome /></RequireAdmin>} />
            <Route path="/admin/catalog" element={<RequireAdmin role="catalog_admin"><AdminCatalogPage /></RequireAdmin>} />
            <Route path="/admin/catalog/new" element={<RequireAdmin role="catalog_admin"><AdminItemFormPage /></RequireAdmin>} />
            <Route path="/admin/catalog/:contentId" element={<RequireAdmin role="catalog_admin"><AdminItemFormPage /></RequireAdmin>} />
            <Route path="/admin/reports" element={<RequireAdmin><AdminReportsPage /></RequireAdmin>} />
            <Route path="/status" element={<StatusPage />} />
            <Route path="*" element={<p className="empty">Página no encontrada.</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
