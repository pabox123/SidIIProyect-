import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService, parseRange } from './reports.service';
import { ReportRangeDto } from './reports.dto';
import { AdminAuthGuard } from '../../common/auth/auth.guards';
import { AdminRoles } from '../../common/auth/auth.decorators';
import { toCsv, formatNumber, formatMinutes, buildFilename } from '../../common/http/csv';

@Controller('admin/reports')
@UseGuards(AdminAuthGuard)
@AdminRoles('report_viewer', 'catalog_admin')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('revenue')
  async revenue(@Query() dto: ReportRangeDto, @Res({ passthrough: true }) res: Response) {
    const report = await this.reports.revenue(parseRange(dto.from, dto.to));
    if (dto.format !== 'csv') return report;
    const filename = buildFilename('informe_ingresos_por_plan', dto.from, dto.to);
    const rows = report.rows.map((r) => ({
      planId: r.planId,
      planName: r.planName,
      planPrice: formatNumber(r.planPrice),
      subscriptions: r.subscriptions,
      totalRevenue: formatNumber(r.totalRevenue),
    }));
    return this.sendCsv(res, filename, [
      { key: 'planId', header: 'Plan' },
      { key: 'planName', header: 'Plan' },
      { key: 'planPrice', header: 'Precio del plan (COP)' },
      { key: 'subscriptions', header: 'Suscripciones adquiridas' },
      { key: 'totalRevenue', header: 'Total recaudado (COP)' },
    ], rows);
  }

  @Get('consumption')
  async consumption(@Query() dto: ReportRangeDto, @Res({ passthrough: true }) res: Response) {
    const report = await this.reports.consumption(parseRange(dto.from, dto.to));
    if (dto.format !== 'csv') return report;
    const filename = buildFilename('informe_consumo_por_plan_y_tipo', dto.from, dto.to);
    const rows = report.rows.map((r) => ({
      planId: r.planId,
      planName: r.planName,
      contentType: r.contentTypeLabel,
      sessions: r.sessions,
      completedSessions: r.completedSessions,
      distinctProfiles: r.distinctProfiles,
      minutesWatched: formatMinutes(r.minutesWatched),
    }));
    return this.sendCsv(res, filename, [
      { key: 'planId', header: 'Plan' },
      { key: 'planName', header: 'Plan' },
      { key: 'contentType', header: 'Tipo de contenido' },
      { key: 'sessions', header: 'Sesiones' },
      { key: 'completedSessions', header: 'Sesiones completadas' },
      { key: 'distinctProfiles', header: 'Perfiles distintos' },
      { key: 'minutesWatched', header: 'Minutos visualizados' },
    ], rows);
  }

  private sendCsv(res: Response, filename: string, columns: { key: string; header: string }[], rows: any[]) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return toCsv(columns, rows);
  }
}
