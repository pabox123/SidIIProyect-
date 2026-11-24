import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { AdminRole } from '../api/types';
import { Spinner } from './ui';

/** Cliente autenticado (y, si requireProfile, con perfil activo seleccionado). */
export function RequireClient({ children, requireProfile = true }: { children: ReactNode; requireProfile?: boolean }) {
  const { session, loading, activeProfile } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (session.kind === 'admin') return <Navigate to="/admin" replace />;
  if (session.kind !== 'client') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (requireProfile && !activeProfile) return <Navigate to="/profiles" replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children, role }: { children: ReactNode; role?: AdminRole }) {
  const { session, loading } = useAuth();
  if (loading) return <Spinner />;
  if (session.kind !== 'admin') return <Navigate to="/login" replace state={{ admin: true }} />;
  if (role && !session.admin.roles.includes(role)) {
    return <p className="error-box">Su usuario no tiene el rol {role} necesario para esta sección.</p>;
  }
  return <>{children}</>;
}
