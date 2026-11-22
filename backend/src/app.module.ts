import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { PostgresModule } from './modules/db/postgres/postgres.module';
import { MongodbModule } from './modules/db/mongodb/mongodb.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // Configuration module - loads .env file
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      cache: true,
    }),
    // Health checks
    TerminusModule,
    // Database modules
    PostgresModule,
    MongodbModule,
    // Health module with custom checks
    HealthModule,
  ],
})
export class AppModule {}