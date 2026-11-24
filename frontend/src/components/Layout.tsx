import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ageLabel } from '../utils/format';

export function Layout() {
  const { session, activeProfile, logout } = useAuth();
  const navigate = useNavigate();

  const exit = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          🎬 CineConecta
        </NavLink>
        <nav className="nav">
          {session.kind === 'client' && activeProfile && (
            <>
              <NavLink to="/" end>
                Inicio
              </NavLink>
              <NavLink to="/my-list">Mi lista</NavLink>
            </>
          )}
          {session.kind === 'admin' && (
            <>
              {session.admin.roles.includes('catalog_admin') && <NavLink to="/admin/catalog">Catálogo</NavLink>}
              <NavLink to="/admin/reports">Informes</NavLink>
            </>
          )}
          <NavLink to="/status">Estado</NavLink>
        </nav>
        <div className="session">
          {session.kind === 'client' && (
            <>
              {activeProfile ? (
                <button className="profile-chip" onClick={() => navigate('/profiles')} title="Cambiar de perfil">
                  <span className="avatar">{activeProfile.name.charAt(0)}</span>
                  {activeProfile.name} <small>{ageLabel(activeProfile.maxAgeRating)}</small>
                </button>
              ) : (
                <span className="muted">{session.me.fullName}</span>
              )}
              <button className="btn btn-ghost btn-sm" onClick={exit}>
                Salir
              </button>
            </>
          )}
          {session.kind === 'admin' && (
            <>
              <span className="muted">🛠️ {session.admin.fullName}</span>
              <button className="btn btn-ghost btn-sm" onClick={exit}>
                Salir
              </button>
            </>
          )}
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
      <footer className="footer">CineConecta · Sistemas Intensivos en Datos II · Universidad Icesi</footer>
    </div>
  );
}
