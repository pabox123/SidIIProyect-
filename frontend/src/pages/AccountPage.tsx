import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { accountApi } from '../api/endpoints';
import { errorMessage } from '../api/client';
import type { AccountProfiles, AccountSubscriptions, Plan } from '../api/types';
import { Badge, ErrorBox, Spinner } from '../components/ui';
import { ageLabel, date, money } from '../utils/format';

/**
 * Cuenta del titular (E-04 en el backend): suscripciones y pagos, contratación de plan
 * con pago simulado y administración de perfiles. Las reglas (suscripción vigente,
 * máximo de perfiles, períodos superpuestos) las valida PostgreSQL; aquí se muestran
 * los mensajes de rechazo tal como los devuelve el servidor.
 */
export function AccountPage() {
  const { refreshMe } = useAuth();
  const toast = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<AccountSubscriptions | null>(null);
  const [profiles, setProfiles] = useState<AccountProfiles | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectPayment, setRejectPayment] = useState(false);
  const [name, setName] = useState('');
  const [rating, setRating] = useState(18);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, s, pr] = await Promise.all([accountApi.plans(), accountApi.subscriptions(), accountApi.profiles()]);
      setPlans(p);
      setSubs(s);
      setProfiles(pr);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      toast('success', success);
      await Promise.all([load(), refreshMe()]);
    } catch (err) {
      // Rechazos del servidor: suscripción vigente, exceso de perfiles, pago rechazado...
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const createProfile = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setActionError('Escriba el nombre del perfil');
      return;
    }
    run(async () => {
      await accountApi.createProfile(name.trim(), rating);
      setName('');
    }, 'Perfil creado');
  };

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!subs || !profiles) return <Spinner />;

  const active = subs.activeSubscription;

  return (
    <section className="account-page">
      <h1>Mi cuenta</h1>
      {actionError && <ErrorBox message={actionError} />}

      <article className="report">
        <header>
          <h2>Suscripción</h2>
          {active ? <Badge tone="success">Vigente</Badge> : <Badge tone="warning">Sin suscripción vigente</Badge>}
        </header>
        {active ? (
          <p>
            Plan <strong>{active.planName}</strong> ({money(active.planPrice)}, hasta {active.maxProfiles} perfiles
            activos), del {date(active.startsAt)} al {date(active.endsAt)}.
          </p>
        ) : (
          <>
            <p className="muted">Elija un plan. La suscripción dura 30 días y el pago es simulado.</p>
            <div className="plans">
              {plans.map((plan) => (
                <div key={plan.planId} className="plan-card">
                  <h3>{plan.name}</h3>
                  <p className="plan-price">{money(plan.price)}</p>
                  <p className="muted small">Hasta {plan.maxProfiles} perfil{plan.maxProfiles === 1 ? '' : 'es'} activos</p>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() =>
                      run(() => accountApi.subscribe(plan.planId, !rejectPayment), `Plan ${plan.name} contratado`)
                    }
                  >
                    Contratar
                  </button>
                </div>
              ))}
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={rejectPayment} onChange={(e) => setRejectPayment(e.target.checked)} />
              Simular pago rechazado
            </label>
          </>
        )}
      </article>

      <article className="report">
        <header>
          <h2>Perfiles</h2>
          <span className="muted small">
            {profiles.activeCount} activos
            {profiles.hasActiveSubscription ? ` de ${profiles.maxProfiles} permitidos` : ''}
          </span>
        </header>
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Clasificación</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {profiles.profiles.map((p) => (
              <tr key={p.profileId}>
                <td>{p.name}</td>
                <td>Hasta {ageLabel(p.maxAgeRating)}</td>
                <td>{p.isActive ? <Badge tone="success">Activo</Badge> : <Badge>Desactivado</Badge>}</td>
                <td className="row-actions">
                  <button
                    className={`btn btn-sm ${p.isActive ? 'btn-danger' : 'btn-ghost'}`}
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => accountApi.setProfileActive(p.profileId, !p.isActive),
                        p.isActive ? 'Perfil desactivado' : 'Perfil activado',
                      )
                    }
                  >
                    {p.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {profiles.profiles.length === 0 && <p className="empty">Todavía no tiene perfiles.</p>}
        <form className="filters" onSubmit={createProfile}>
          <label>
            Nombre del perfil
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </label>
          <label>
            Clasificación máxima
            <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
              {[0, 7, 12, 16, 18].map((r) => (
                <option key={r} value={r}>
                  {ageLabel(r)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" disabled={busy}>
            + Crear perfil
          </button>
        </form>
      </article>

      <article className="report">
        <header>
          <h2>Historial de suscripciones y pagos</h2>
        </header>
        {subs.subscriptions.length === 0 ? (
          <p className="empty">Sin suscripciones.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th>Pago</th>
                <th>Referencia</th>
                <th className="num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {subs.subscriptions.map((s) => (
                <tr key={s.subscriptionId}>
                  <td>
                    {s.planName} {s.isActive && <Badge tone="success">Vigente</Badge>}
                  </td>
                  <td>{date(s.startsAt)}</td>
                  <td>{date(s.endsAt)}</td>
                  <td>{date(s.payment.paidAt)}</td>
                  <td>
                    <code>{s.payment.reference}</code>
                  </td>
                  <td className="num">{money(s.payment.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </section>
  );
}
