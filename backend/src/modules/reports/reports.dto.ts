import { IsIn, IsOptional, Matches } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Rango de fechas inclusivo (YYYY-MM-DD). Internamente se consulta [from, to + 1 día). */
export class ReportRangeDto {
  @Matches(DATE, { message: 'La fecha inicial debe tener formato AAAA-MM-DD' })
  from!: string;

  @Matches(DATE, { message: 'La fecha final debe tener formato AAAA-MM-DD' })
  to!: string;

  @IsOptional()
  @IsIn(['json', 'csv'])
  format: 'json' | 'csv' = 'json';
}
