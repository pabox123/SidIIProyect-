import { FormEvent, useCallback, useEffect, useState } from 'react';
import { reportsApi } from '../../api/endpoints';
import { download, errorMessage } from '../../api/client';
import type { ConsumptionRow, Report, RevenueRow } from '../../api/types';
import { useToast } from '../../context/ToastContext';
import { Empty, ErrorBox, Spinner } from '../../components/ui';
import { isoDay, money, number } from '../../utils/format';

type Revenue = Report<RevenueRow, { subscriptions: number; totalRevenue: number }>;
type Consumption = Report<ConsumptionRow, { sessions: number; minutesWatched: number }>;

export function AdminReportsPage() {
  const toast = useToast();
  const today = new Date();
  const [from, setFrom] = useState(isoDay(new Date(today.getFullYear(), 0, 1)));
  const [to, setTo] = useState(isoDay(today));
  const [range, setRange] = useState({ from, to });
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [consumption, setConsumption] = useState<Consumption | null>(null);
  const [errors, setErrors] = useState<{ revenue?: string; consumption?: string }>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrors({});
    // Cada informe se carga por separado: si una base cae, el otro sigue funcionando
    const [r, c] = await Promise.allSettled([
      reportsApi.revenue(range.from, range.to),
      reportsApi.consumption(range.from, range.to),
    ]);
    setRevenue(r.status === 'fulfilled' ? r.value : null);
    setConsumption(c.status === 'fulfilled' ? c.value : null);
    setErrors({
      revenue: r.status === 'rejected' ? errorMessage(r.reason) : undefined,
      consumption: c.status === 'rejected' ? errorMessage(c.reason) : undefined,
    });
    setLoading(false);
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (to < from) {
      toast('error', 'La fecha final no puede ser anterior a la inicial');
      return;
    }
    setRange({ from, to });
  };

  const csv = async (kind: 'revenue' | 'consumption') => {
    try {
      await download(`/admin/reports/${kind}`, { ...range, format: 'csv' }, `${kind}.csv`);
    } catch (err) {
      toast('error', errorMessage(err));
    }
  };

  return (
    <section className="reports">
      <h1>Informes de administración</h1>
      <form className="filters" onSubmit={submit}>
        <label>
          Desde
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Hasta
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="btn btn-primary">Consultar</button>
        {loading && <Spinner label="Consultando..." />}
      </form>

      <article className="report">
        <header>
          <div>
            <h2>Ingresos por plan</h2>
            <p className="muted small">PostgreSQL · pagos aprobados con fecha de pago en el rango</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => csv('revenue')} disabled={!revenue}>
            ⬇ CSV
          </button>
        </header>
        {errors.revenue && <ErrorBox message={errors.revenue} onRetry={load} />}
        {revenue &&
          (revenue.rows.length === 0 ? (
            <Empty>Sin datos.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th className="num">Precio</th>
                  <th className="num">Suscripciones pagadas</th>
                  <th className="num">Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {revenue.rows.map((r) => (
                  <tr key={r.planId}>
                    <td>{r.planName}</td>
                    <td className="num">{money(r.planPrice)}</td>
                    <td className="num">{number(r.subscriptions)}</td>
                    <td className="num">{money(r.totalRevenue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td />
                  <td className="num">{number(revenue.totals.subscriptions)}</td>
                  <td className="num">{money(revenue.totals.totalRevenue)}</td>
                </tr>
              </tfoot>
            </table>
          ))}
      </article>

      <article className="report">
        <header>
          <div>
            <h2>Consumo por plan y tipo de contenido</h2>
            <p className="muted small">
              MongoDB (sesiones iniciadas en el rango, con el plan vigente en ese momento) + PostgreSQL (nombres de planes)
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => csv('consumption')} disabled={!consumption}>
            ⬇ CSV
          </button>
        </header>
        {errors.consumption && <ErrorBox message={errors.consumption} onRetry={load} />}
        {consumption &&
          (consumption.rows.length === 0 ? (
            <Empty>No hay sesiones de reproducción en el rango.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Tipo</th>
                  <th className="num">Sesiones</th>
                  <th className="num">Completadas</th>
                  <th className="num">Perfiles</th>
                  <th className="num">Minutos vistos</th>
                </tr>
              </thead>
              <tbody>
                {consumption.rows.map((r) => (
                  <tr key={`${r.planId}-${r.contentType}`}>
                    <td>{r.planName}</td>
                    <td>{r.contentTypeLabel}</td>
                    <td className="num">{number(r.sessions)}</td>
                    <td className="num">{number(r.completedSessions)}</td>
                    <td className="num">{number(r.distinctProfiles)}</td>
                    <td className="num">{number(r.minutesWatched)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td />
                  <td className="num">{number(consumption.totals.sessions)}</td>
                  <td />
                  <td />
                  <td className="num">{number(consumption.totals.minutesWatched)}</td>
                </tr>
              </tfoot>
            </table>
          ))}
      </article>
    </section>
  );
}
