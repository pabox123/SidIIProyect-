import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthCheckResult } from '@nestjs/terminus';
import { PostgresHealthIndicator } from './postgres-health.indicator';
import { MongodbHealthIndicator } from './mongodb-health.indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly postgres: PostgresHealthIndicator,
    private readonly mongodb: MongodbHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  async check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.postgres.isHealthy('postgres'),
      () => this.mongodb.isHealthy('mongodb'),
    ]);
  }

  @Get('postgres')
  @HealthCheck()
  async checkPostgres(): Promise<HealthCheckResult> {
    return this.health.check([() => this.postgres.isHealthy('postgres')]);
  }

  @Get('mongodb')
  @HealthCheck()
  async checkMongodb(): Promise<HealthCheckResult> {
    return this.health.check([() => this.mongodb.isHealthy('mongodb')]);
  }
}