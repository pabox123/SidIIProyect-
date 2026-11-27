import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { errorMessage } from '../api/client';
import { ErrorBox, InlineSpinner } from '../components/ui';

export function LoginPage() {
  const { session, loginClient, loginAdmin, register } = useAuth();
  const toast = useToast();
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

  const switchMode = (nextMode: 'client' | 'register' | 'admin') => {
    if (busy) return;
    setMode(nextMode);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
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
        toast('success', 'Sesión iniciada');
        navigate('/profiles');
      } else if (mode === 'register') {
        await register(fullName.trim(), email.trim(), password);
        toast('success', 'Cuenta creada correctamente');
        navigate('/account');
      } else {
        await loginAdmin(email.trim(), password);
        toast('success', 'Sesión de administrador iniciada');
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
            disabled={busy}
            onClick={() => switchMode('client')}
          >
            Clientes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'active' : ''}
            disabled={busy}
            onClick={() => switchMode('register')}
          >
            Crear cuenta
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'admin'}
            className={mode === 'admin' ? 'active' : ''}
            disabled={busy}
            onClick={() => switchMode('admin')}
          >
            Administradores
          </button>
        </div>
        {mode === 'register' && (
          <label>
            Nombre completo
            <input autoComplete="name" disabled={busy} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
        )}
        <label>
          Correo
          <input type="email" autoComplete="username" disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            disabled={busy}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {mode === 'register' && (
          <label>
            Confirmar contraseña
            <input type="password" autoComplete="new-password" disabled={busy} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
        )}
        {error && <ErrorBox message={error} />}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? (
            <>
              <InlineSpinner />
              {mode === 'register' ? 'Creando cuenta...' : 'Iniciando sesión...'}
            </>
          ) : mode === 'register' ? (
            'Crear cuenta'
          ) : (
            'Ingresar'
          )}
        </button>
      </form>
    </div>
  );
}
