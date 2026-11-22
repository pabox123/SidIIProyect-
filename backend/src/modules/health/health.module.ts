import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PostgresHealthIndicator } from './postgres-health.indicator';
import { MongodbHealthIndicator } from './mongodb-health.indicator';
import { PostgresModule } from '../db/postgres/postgres.module';
import { MongodbModule } from '../db/mongodb/mongodb.module';

@Module({
  imports: [TerminusModule, PostgresModule, MongodbModule],
  controllers: [HealthController],
  providers: [PostgresHealthIndicator, MongodbHealthIndicator],
})
export class HealthModule {}