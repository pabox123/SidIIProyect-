import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { PostgresService } from '../db/postgres/postgres.service';

@Injectable()
export class PostgresHealthIndicator extends HealthIndicator {
  constructor(private readonly postgresService: PostgresService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const result = await this.postgresService.healthCheck();

    if (result.status === 'up') {
      return this.getStatus(key, true, {
        latency: `${result.latency}ms`,
        pool: this.postgresService.getPoolStats(),
      });
    }

    throw new HealthCheckError(
      'PostgreSQL health check failed',
      this.getStatus(key, false, { error: result.error }),
    );
  }
}