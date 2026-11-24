import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { ErrorBox } from '../components/ui';

export function LoginPage() {
  const { session, loginClient, loginAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'client' | 'admin'>((location.state as any)?.admin ? 'admin' : 'client');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session.kind === 'client') return <Navigate to="/profiles" replace />;
  if (session.kind === 'admin') return <Navigate to="/admin" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Ingrese su correo y contraseña');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'client') {
        await loginClient(email.trim(), password);
        navigate('/profiles');
      } else {
        await loginAdmin(email.trim(), password);
        navigate('/admin');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit} noValidate>
        <h1>🎬 CineConecta</h1>
        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'client'}
            className={mode === 'client' ? 'active' : ''}
            onClick={() => setMode('client')}
          >
            Clientes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'admin'}
            className={mode === 'admin' ? 'active' : ''}
            onClick={() => setMode('admin')}
          >
            Administradores
          </button>
        </div>
        <label>
          Correo
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <ErrorBox message={error} />}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
