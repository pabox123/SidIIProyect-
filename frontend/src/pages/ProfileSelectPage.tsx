import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { ageLabel, date } from '../utils/format';
import { ErrorBox } from '../components/ui';
import type { Profile } from '../api/types';

export function ProfileSelectPage() {
  const { session, selectProfile, refreshMe } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refreshMe().catch((err) => setError(errorMessage(err)));
  }, [refreshMe]);

  if (session.kind !== 'client') return null;
  const { me } = session;

  const choose = (profile: Profile) => {
    if (!profile.isActive) return;
    selectProfile(profile);
    navigate('/');
  };

  return (
    <section className="profiles-page">
      <h1>¿Quién está viendo?</h1>
      <p className="muted">
        {me.fullName} ·{' '}
        {me.activeSubscription
          ? `Plan ${me.activeSubscription.planName} vigente hasta ${date(me.activeSubscription.endsAt)}`
          : 'Sin suscripción vigente: puede explorar el catálogo, pero no reproducir'}
      </p>
      {error && <ErrorBox message={error} />}
      <div className="profiles-grid">
        {me.profiles.map((p) => (
          <button
            key={p.profileId}
            className={`profile-tile ${p.isActive ? '' : 'disabled'}`}
            onClick={() => choose(p)}
            disabled={!p.isActive}
            title={p.isActive ? `Entrar como ${p.name}` : 'Perfil desactivado'}
          >
            <span className="avatar avatar-lg">{p.name.charAt(0)}</span>
            <strong>{p.name}</strong>
            <small>{p.isActive ? `Clasificación hasta ${ageLabel(p.maxAgeRating)}` : 'Desactivado'}</small>
          </button>
        ))}
      </div>
      {me.profiles.length === 0 && <p className="empty">La cuenta no tiene perfiles.</p>}
    </section>
  );
}
