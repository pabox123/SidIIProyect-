import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { ErrorBox } from '../components/ui';

export function LoginPage() {
  const { session, loginClient, loginAdmin, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'client' | 'register' | 'admin'>((location.state as any)?.admin ? 'admin' : 'client');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirm, setConfirm] = useState('');
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
    if (mode === 'register') {
      if (fullName.trim().length < 2) {
        setError('Ingrese su nombre completo');
        return;
      }
      if (password.length < 8) {
        setError('La contraseña debe tener al menos 8 caracteres');
        return;
      }
      if (password !== confirm) {
        setError('Las contraseñas no coinciden');
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === 'client') {
        await loginClient(email.trim(), password);
        navigate('/profiles');
      } else if (mode === 'register') {
        await register(fullName.trim(), email.trim(), password);
        navigate('/account');
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
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'active' : ''}
            onClick={() => setMode('register')}
          >
            Crear cuenta
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
        {mode === 'register' && (
          <label>
            Nombre completo
            <input autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
        )}
        <label>
          Correo
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {mode === 'register' && (
          <label>
            Confirmar contraseña
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
        )}
        {error && <ErrorBox message={error} />}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Procesando...' : mode === 'register' ? 'Crear cuenta' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
