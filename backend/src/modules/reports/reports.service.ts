import { BadRequestException, Injectable } from '@nestjs/common';
import { PostgresService } from '../db/postgres/postgres.service';
import { MongodbService } from '../db/mongodb/mongodb.service';

export interface DateRange {
  from: Date;
  /** exclusivo */
  to: Date;
  label: { from: string; to: string };
}

const CONTENT_TYPE_LABEL: Record<string, string> = {
  movie: 'Película',
  series: 'Serie',
  documentary: 'Documental',
};

export function parseRange(from: string, to: string): DateRange {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestException('Fechas no válidas');
  }
  if (end < start) throw new BadRequestException('La fecha final no puede ser anterior a la inicial');
  end.setUTCDate(end.getUTCDate() + 1);
  return { from: start, to: end, label: { from, to } };
}

/** Fecha sin zona para comparar con columnas TIMESTAMP (sin zona) de PostgreSQL. */
const pgTimestamp = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

@Injectable()
export class ReportsService {
  constructor(
    private readonly pg: PostgresService,
    private readonly mongo: MongodbService,
  ) {}

  /**
   * Ingresos por plan (solo base relacional). Es la consulta a de M-05, que aprovecha
   * ix_payments_paidat con rangos selectivos. LEFT JOIN desde plans para que los planes
   * sin pagos en el rango aparezcan en cero.
   */
  async revenue(range: DateRange) {
    const { rows } = await this.pg.query(
      `SELECT p.planId, p.name, p.price,
              COUNT(r.subscriptionId)::int AS num_subscriptions,
              COALESCE(SUM(r.amount), 0)::numeric(14,2) AS total_revenue
         FROM plans p
         LEFT JOIN (
               SELECT s.planId, s.subscriptionId, pay.amount
                 FROM payments pay
                 JOIN subscriptions s ON s.subscriptionId = pay.subscriptionId
                WHERE pay.paidAt >= $1 AND pay.paidAt < $2
              ) r ON r.planId = p.planId
        GROUP BY p.planId, p.name, p.price
        ORDER BY total_revenue DESC, p.planId`,
      [pgTimestamp(range.from), pgTimestamp(range.to)],
    );
    const data = rows.map((r) => ({
      planId: r.planid,
      planName: r.name,
      planPrice: Number(r.price),
      subscriptions: r.num_subscriptions,
      totalRevenue: Number(r.total_revenue),
    }));
    return {
      range: range.label,
      rows: data,
      totals: {
        subscriptions: data.reduce((s, r) => s + r.subscriptions, 0),
        totalRevenue: data.reduce((s, r) => s + r.totalRevenue, 0),
      },
    };
  }

  /**
   * Consumo por plan y tipo de contenido (combina ambas bases):
   * - MongoDB (consulta 7, índice ix_watch_report): tiempo visto por planId y contentType.
   *   El planId es el que estaba vigente cuando empezó cada sesión.
   * - PostgreSQL: nombre de cada plan (no se duplica en Mongo).
   */
  async consumption(range: DateRange) {
    const [grouped, plans] = await Promise.all([
      this.mongo
        .getCollection('watch_activity')
        .aggregate([
          { $match: { startedAt: { $gte: range.from, $lt: range.to } } },
          {
            $group: {
              _id: { planId: '$planId', contentType: '$contentType' },
              totalSeconds: { $sum: '$watchedSeconds' },
              sessions: { $sum: 1 },
              completed: { $sum: { $cond: ['$completed', 1, 0] } },
              profiles: { $addToSet: '$profileId' },
            },
          },
          {
            $project: {
              _id: 0,
              planId: '$_id.planId',
              contentType: '$_id.contentType',
              totalSeconds: 1,
              sessions: 1,
              completed: 1,
              distinctProfiles: { $size: '$profiles' },
            },
          },
          { $sort: { planId: 1, contentType: 1 } },
        ])
        .toArray(),
      this.pg.query(`SELECT planId, name FROM plans ORDER BY planId`),
    ]);

    const planName = new Map<number, string>(plans.rows.map((p) => [p.planid, p.name]));
    const data = grouped.map((g: any) => ({
      planId: g.planId,
      planName: planName.get(g.planId) ?? `Plan ${g.planId} (no existe en PostgreSQL)`,
      contentType: g.contentType,
      contentTypeLabel: CONTENT_TYPE_LABEL[g.contentType] ?? g.contentType,
      sessions: g.sessions,
      completedSessions: g.completed,
      distinctProfiles: g.distinctProfiles,
      minutesWatched: Math.round((g.totalSeconds / 60) * 100) / 100,
    }));
    return {
      range: range.label,
      rows: data,
      totals: {
        sessions: data.reduce((s, r) => s + r.sessions, 0),
        minutesWatched: Math.round(data.reduce((s, r) => s + r.minutesWatched, 0) * 100) / 100,
      },
    };
  }
}
