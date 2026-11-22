import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { MongodbService } from '../db/mongodb/mongodb.service';

@Injectable()
export class MongodbHealthIndicator extends HealthIndicator {
  constructor(private readonly mongodbService: MongodbService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const result = await this.mongodbService.healthCheck();

    if (result.status === 'up') {
      return this.getStatus(key, true, {
        latency: `${result.latency}ms`,
        collections: result.collections,
        connectionState: this.mongodbService.getConnectionState(),
      });
    }

    throw new HealthCheckError(
      'MongoDB health check failed',
      this.getStatus(key, false, { error: result.error }),
    );
  }
}