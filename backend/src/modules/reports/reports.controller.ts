import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService, parseRange } from './reports.service';
import { ReportRangeDto } from './reports.dto';
import { AdminAuthGuard } from '../../common/auth/auth.guards';
import { AdminRoles } from '../../common/auth/auth.decorators';
import { toCsv } from '../../common/http/csv';

@Controller('admin/reports')
@UseGuards(AdminAuthGuard)
@AdminRoles('report_viewer', 'catalog_admin')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('revenue')
  async revenue(@Query() dto: ReportRangeDto, @Res({ passthrough: true }) res: Response) {
    const report = await this.reports.revenue(parseRange(dto.from, dto.to));
    if (dto.format !== 'csv') return report;
    return this.sendCsv(res, `ingresos_por_plan_${dto.from}_${dto.to}.csv`, [
      { key: 'planId', header: 'planId' },
      { key: 'planName', header: 'plan' },
      { key: 'planPrice', header: 'precio_plan' },
      { key: 'subscriptions', header: 'suscripciones_pagadas' },
      { key: 'totalRevenue', header: 'ingresos' },
    ], report.rows);
  }

  @Get('consumption')
  async consumption(@Query() dto: ReportRangeDto, @Res({ passthrough: true }) res: Response) {
    const report = await this.reports.consumption(parseRange(dto.from, dto.to));
    if (dto.format !== 'csv') return report;
    return this.sendCsv(res, `consumo_por_plan_y_tipo_${dto.from}_${dto.to}.csv`, [
      { key: 'planId', header: 'planId' },
      { key: 'planName', header: 'plan' },
      { key: 'contentType', header: 'tipo_contenido' },
      { key: 'sessions', header: 'sesiones' },
      { key: 'completedSessions', header: 'sesiones_completadas' },
      { key: 'distinctProfiles', header: 'perfiles_distintos' },
      { key: 'minutesWatched', header: 'minutos_vistos' },
    ], report.rows);
  }

  private sendCsv(res: Response, filename: string, columns: { key: string; header: string }[], rows: any[]) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return toCsv(columns, rows);
  }
}
